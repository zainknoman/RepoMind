export const isTextFile = (file) => file?.text === true;
export const estimateTokens = (text) => Math.max(0, Math.ceil(String(text || '').length / 4));

export const languageFor = (ext) =>
  ({
    '.js': 'JavaScript',
    '.jsx': 'JavaScript JSX',
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript TSX',
    '.vue': 'Vue',
    '.py': 'Python',
    '.java': 'Java',
    '.kt': 'Kotlin',
    '.go': 'Go',
    '.rs': 'Rust',
    '.php': 'PHP',
    '.cs': 'C#',
    '.cpp': 'C++',
    '.c': 'C',
    '.h': 'C/C++ Header',
    '.html': 'HTML',
    '.css': 'CSS',
    '.scss': 'SCSS',
    '.json': 'JSON',
    '.md': 'Markdown',
    '.sql': 'SQL',
    '.sh': 'Shell',
    '.bat': 'Batch',
    '.ps1': 'PowerShell',
    '.xml': 'XML',
    '.yaml': 'YAML',
    '.yml': 'YAML',
    '.b': 'Temenos BASIC',
  })[ext] || 'Text';

import { parse } from '@babel/parser';
import { parseBasic, routineName } from './temenosBasic';
import { analysisCoverage } from './coverage';

const BABEL_PLUGINS = [
  'jsx',
  'typescript',
  'classProperties',
  'classPrivateProperties',
  'classPrivateMethods',
  'decorators-legacy',
  'dynamicImport',
  'optionalChaining',
  'nullishCoalescingOperator',
  'topLevelAwait',
  'objectRestSpread',
];

const BABEL_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);

const SKIP_KEYS = new Set(['loc', 'start', 'end', 'tokens', 'comments', 'errors']);

// `ancestors` is one shared stack (pushed/popped as the walk descends), so visitors that keep it
// must copy it.
function walk(node, visitor, parent = null, ancestors = []) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visitor, parent, ancestors);
    return;
  }
  if (node.type) {
    visitor(node, parent, ancestors);
    ancestors.push(node);
  }
  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) continue;
    const value = node[key];
    if (value && typeof value === 'object') walk(value, visitor, node, ancestors);
  }
  if (node.type) ancestors.pop();
}

/** Returns a function mapping a character offset to its 1-based line number. */
function lineLocator(content) {
  const starts = [0];
  for (let i = content.indexOf('\n'); i !== -1; i = content.indexOf('\n', i + 1))
    starts.push(i + 1);
  return (offset) => {
    let lo = 0,
      hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

const lineOf = (node) => node?.loc?.start?.line || 1;
const columnOf = (node) => (node?.loc?.start?.column || 0) + 1;
const keyOf = (path, name, kind, line) => [path, name, kind, line].join('|');

function unique(items, keyFn = (x) => JSON.stringify(x)) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function propertyName(node) {
  if (!node) return '';
  if (node.type === 'Identifier' || node.type === 'PrivateName')
    return node.name || node.id?.name || '';
  if (node.type === 'StringLiteral' || node.type === 'NumericLiteral') return String(node.value);
  return '';
}

function getBindingNames(pattern) {
  const names = [];
  walk(pattern, (node) => {
    if (node.type === 'Identifier') names.push(node.name);
  });
  return unique(names);
}

function addImportBindings(node) {
  return (node.specifiers || [])
    .map((spec) => {
      if (spec.type === 'ImportSpecifier')
        return {
          local: spec.local?.name || '',
          imported: propertyName(spec.imported),
          kind: 'named',
        };
      if (spec.type === 'ImportDefaultSpecifier')
        return {
          local: spec.local?.name || '',
          imported: 'default',
          kind: 'default',
        };
      if (spec.type === 'ImportNamespaceSpecifier')
        return {
          local: spec.local?.name || '',
          imported: '*',
          kind: 'namespace',
        };
      return null;
    })
    .filter(Boolean);
}

const literalText = (node) =>
  node?.type === 'StringLiteral'
    ? node.value
    : node?.type === 'TemplateLiteral' && !node.expressions.length
      ? node.quasis[0]?.value.cooked || ''
      : null;

/** The module named by `import('x')` or `require('x')`, or null for any other node. */
function dynamicModule(node) {
  if (node?.type === 'ImportExpression') return literalText(node.source);
  if (node?.type !== 'CallExpression') return null;
  const { callee } = node;
  if (callee.type === 'Import' || (callee.type === 'Identifier' && callee.name === 'require'))
    return literalText(node.arguments[0]);
  return null;
}

/** Bindings of `const x = require('m')` (the module's default) or `const { a, b: c } = …`. */
function requireBindings(parent) {
  if (parent?.type !== 'VariableDeclarator') return [];
  if (parent.id.type === 'Identifier')
    return [{ local: parent.id.name, imported: 'default', kind: 'default' }];
  if (parent.id.type !== 'ObjectPattern') return [];
  return parent.id.properties
    .filter((p) => p.type === 'ObjectProperty' && p.value.type === 'Identifier')
    .map((p) => ({ local: p.value.name, imported: propertyName(p.key), kind: 'named' }));
}

const isModuleExports = (node) =>
  node?.type === 'MemberExpression' &&
  !node.computed &&
  node.object.type === 'Identifier' &&
  node.object.name === 'module' &&
  node.property.name === 'exports';

const FUNCTION_NODES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'ClassMethod',
  'ClassPrivateMethod',
  'ObjectMethod',
]);

/** The identifiers a binding pattern declares (not default values or type annotations). */
function patternIdentifiers(pattern, out = []) {
  if (!pattern) return out;
  if (pattern.type === 'Identifier') out.push(pattern);
  else if (pattern.type === 'AssignmentPattern') patternIdentifiers(pattern.left, out);
  else if (pattern.type === 'RestElement') patternIdentifiers(pattern.argument, out);
  else if (pattern.type === 'TSParameterProperty') patternIdentifiers(pattern.parameter, out);
  else if (pattern.type === 'ArrayPattern')
    for (const element of pattern.elements) patternIdentifiers(element, out);
  else if (pattern.type === 'ObjectPattern')
    for (const property of pattern.properties)
      patternIdentifiers(property.type === 'RestElement' ? property.argument : property.value, out);
  return out;
}

// Nodes that open a scope for resolving references. Block scopes are not modelled: a let/const is
// treated as visible in its whole enclosing function.
const SCOPE_NODES = new Set([
  'Program',
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'ClassMethod',
  'ClassPrivateMethod',
  'ObjectMethod',
]);

function parseJavaScript(content, file) {
  const ast = parse(content, {
    sourceType: 'unambiguous',
    plugins: BABEL_PLUGINS,
    errorRecovery: true,
  });

  const symbols = [];
  const imports = [];
  const exports = [];
  const references = [];
  const declaredNames = new Set();
  // Parameters, destructured, catch and type-parameter bindings: not symbols, but a reference to
  // one of them is local, and it shadows any outer name. `bindingStarts` marks their declarations.
  const localBindings = [];
  const bindingStarts = new Set();
  const addBindings = (pattern, scope) => {
    for (const id of patternIdentifiers(pattern)) {
      localBindings.push({ name: id.name, scopeStart: scope.start, scopeEnd: scope.end });
      bindingStarts.add(id.start);
    }
  };
  let ancestorsOfNode = [];

  // A symbol declared inside a function records that function's source range as its scope;
  // top-level symbols have none and are visible in the whole file.
  const addSymbol = (name, kind, node, extra = {}) => {
    if (!name) return;
    const scope = ancestorsOfNode.findLast((x) => SCOPE_NODES.has(x.type));
    const symbol = {
      name,
      kind,
      line: lineOf(node),
      column: columnOf(node),
      endLine: node.loc?.end.line,
      path: file.path,
      ...(scope && scope.type !== 'Program'
        ? { scopeStart: scope.start, scopeEnd: scope.end }
        : {}),
      ...extra,
    };
    symbols.push(symbol);
    declaredNames.add(name);
    return symbol;
  };

  walk(ast, (node, parent, ancestors) => {
    ancestorsOfNode = ancestors;
    const line = lineOf(node);

    if (node.type === 'ImportDeclaration') {
      imports.push({
        module: node.source?.value || '',
        line,
        column: columnOf(node),
        kind: 'import',
        bindings: addImportBindings(node),
        sideEffect: !(node.specifiers || []).length,
      });
      return;
    }

    if (node.type === 'ExportAllDeclaration') {
      const source = node.source?.value || '';
      exports.push({ name: '*', line, column: columnOf(node), kind: 're-export', source });
      // A re-export depends on its source like an import does.
      imports.push({
        module: source,
        line,
        column: columnOf(node),
        kind: 'import',
        bindings: [],
        reexport: true,
      });
    } else if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration') {
      const declaration = node.declaration;
      const source = node.source?.value;
      if (declaration?.id?.name) {
        exports.push({
          name: declaration.id.name,
          line,
          column: columnOf(node),
          kind: node.type === 'ExportDefaultDeclaration' ? 'default' : 'export',
        });
      } else if (declaration?.type === 'Identifier') {
        // export default someName;
        exports.push({
          name: 'default',
          local: declaration.name,
          line,
          column: columnOf(node),
          kind: 'default',
        });
      } else {
        for (const spec of node.specifiers || []) {
          exports.push({
            name: propertyName(spec.exported) || propertyName(spec.local),
            local: propertyName(spec.local),
            line,
            column: columnOf(spec),
            kind: node.type === 'ExportDefaultDeclaration' ? 'default' : 'export',
            ...(source ? { source } : {}),
          });
        }
        if (source)
          imports.push({
            module: source,
            line,
            column: columnOf(node),
            kind: 'import',
            bindings: (node.specifiers || []).map((spec) => ({
              local: propertyName(spec.exported) || propertyName(spec.local),
              imported: propertyName(spec.local),
              kind: 're-export',
            })),
            reexport: true,
          });
      }
    }

    if (node.type === 'CallExpression' || node.type === 'ImportExpression') {
      const module = dynamicModule(node);
      if (module !== null) {
        const required = node.type === 'CallExpression' && node.callee.type === 'Identifier';
        // const { a } = require('m'): `a` is declared here, not used.
        if (required && parent?.type === 'VariableDeclarator')
          for (const id of patternIdentifiers(parent.id)) bindingStarts.add(id.start);
        imports.push({
          module,
          line,
          column: columnOf(node),
          kind: 'import',
          bindings: required ? requireBindings(parent) : [],
          ...(required ? { require: true } : { dynamic: true }),
        });
      }
    }

    // module.exports = someName;
    if (
      node.type === 'AssignmentExpression' &&
      isModuleExports(node.left) &&
      node.right.type === 'Identifier'
    )
      exports.push({
        name: 'default',
        local: node.right.name,
        line,
        column: columnOf(node),
        kind: 'default',
      });

    if (node.type === 'FunctionDeclaration' && node.id?.name)
      addSymbol(node.id.name, 'function', node);
    if (node.type === 'ClassDeclaration' && node.id?.name) addSymbol(node.id.name, 'class', node);
    if (node.type === 'TSInterfaceDeclaration' && node.id?.name)
      addSymbol(node.id.name, 'interface', node);
    if (node.type === 'TSTypeAliasDeclaration' && node.id?.name)
      addSymbol(node.id.name, 'type', node);

    if (FUNCTION_NODES.has(node.type)) for (const param of node.params) addBindings(param, node);
    if (node.type === 'CatchClause' && node.param) addBindings(node.param, node);
    if (node.type === 'TSTypeParameterDeclaration' && parent)
      for (const param of node.params) {
        localBindings.push({
          name: param.name?.name || param.name,
          scopeStart: parent.start,
          scopeEnd: parent.end,
        });
      }
    if (
      node.type === 'VariableDeclarator' &&
      node.id &&
      node.id.type !== 'Identifier' &&
      dynamicModule(node.init) === null
    ) {
      // const { a, b } = value; (require() destructuring is an import binding instead)
      const scope = ancestors.findLast((x) => SCOPE_NODES.has(x.type)) || ast;
      addBindings(node.id, scope);
    }

    if (node.type === 'VariableDeclarator' && node.id) {
      const names = getBindingNames(node.id);
      const init = node.init;
      for (const name of names) {
        if (init?.type === 'ArrowFunctionExpression' || init?.type === 'FunctionExpression') {
          addSymbol(name, 'function', node, {
            functionKind: init.type === 'ArrowFunctionExpression' ? 'arrow' : 'expression',
          });
        } else if (node.id.type === 'Identifier' && dynamicModule(init) === null) {
          // `const x = require('./x')` binds an import, not a variable of this file.
          addSymbol(name, 'variable', node);
        }
      }
    }

    if (
      (node.type === 'ClassMethod' ||
        node.type === 'ClassPrivateMethod' ||
        node.type === 'ObjectMethod' ||
        node.type === 'ClassProperty') &&
      node.key
    ) {
      const name = propertyName(node.key);
      if (
        name &&
        (node.type !== 'ClassProperty' ||
          node.value?.type === 'FunctionExpression' ||
          node.value?.type === 'ArrowFunctionExpression')
      ) {
        const ownerNode = ancestors.findLast(
          (x) => x.type === 'ClassDeclaration' || x.type === 'ClassExpression',
        );
        const owner = ownerNode?.id?.name || null;
        addSymbol(name, 'method', node, { parent: owner });
      }
    }
  });

  const symbolLines = new Set(symbols.map((s) => `${s.line}:${s.column}:${s.name}`));

  walk(ast, (node, parent) => {
    if (node.type !== 'Identifier') return;
    const line = lineOf(node);
    const column = columnOf(node);
    const marker = `${line}:${column}:${node.name}`;
    if (symbolLines.has(marker)) return;
    if (bindingStarts.has(node.start)) return;

    const p = parent;
    if (!p) return;
    const isPropertyKey =
      (p.type === 'MemberExpression' && p.property === node && !p.computed) ||
      (p.type === 'OptionalMemberExpression' && p.property === node && !p.computed) ||
      (p.type === 'ObjectProperty' && p.key === node && !p.computed) ||
      (p.type === 'ObjectMethod' && p.key === node && !p.computed) ||
      (p.type === 'ClassMethod' && p.key === node && !p.computed) ||
      (p.type === 'ClassProperty' && p.key === node && !p.computed) ||
      (p.type === 'LabeledStatement' && p.label === node);
    if (isPropertyKey) return;

    const isDeclaration =
      (p.type === 'VariableDeclarator' && p.id === node) ||
      (p.type.endsWith('Declaration') && p.id === node) ||
      (p.type === 'FunctionDeclaration' && p.id === node) ||
      (p.type === 'ClassDeclaration' && p.id === node) ||
      p.type === 'ImportSpecifier' ||
      p.type === 'ImportDefaultSpecifier' ||
      p.type === 'ImportNamespaceSpecifier' ||
      (p.type === 'RestElement' && p.argument === node);
    if (isDeclaration) return;
    // Names in export statements (export { a }, export default a, module.exports = a) are what a
    // file exports, resolved through its exports, not usages.
    const isExportName =
      p.type === 'ExportSpecifier' ||
      p.type === 'ExportNamespaceSpecifier' ||
      p.type === 'ExportDefaultSpecifier' ||
      (p.type === 'ExportDefaultDeclaration' && p.declaration === node) ||
      (p.type === 'AssignmentExpression' && p.right === node && isModuleExports(p.left));
    if (isExportName) return;

    references.push({
      name: node.name,
      line,
      column,
      offset: node.start,
      kind: 'identifier',
    });
  });

  return {
    ...fileSummary(file, content),
    parser: 'babel-ast',
    symbols: unique(symbols, (s) => keyOf(file.path, s.name, s.kind, s.line)),
    imports: unique(imports, (i) => `${i.module}|${i.line}`),
    exports: unique(exports, (e) => `${e.name}|${e.line}|${e.kind}`),
    references: unique(references, (r) => `${r.name}|${r.line}|${r.column}`),
    localBindings,
    parseErrors: (ast.errors || []).map((error) => ({
      message: error.message,
      line: error.loc?.line || 1,
    })),
  };
}

const symbolPatterns = [
  [/\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g, 'function'],
  [
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g,
    'function',
  ],
  [/\bclass\s+([A-Za-z_$][\w$]*)/g, 'class'],
  [/\binterface\s+([A-Za-z_$][\w$]*)/g, 'interface'],
  [/\btype\s+([A-Za-z_$][\w$]*)\s*=/g, 'type'],
  [/\b(?:def|async\s+def)\s+([A-Za-z_][\w]*)/g, 'function'],
];

const importPatterns = [
  /^\s*import\s+(.+?)\s+from\s+['"](.+?)['"]/gm,
  /^\s*import\s+['"](.+?)['"]/gm,
  /^\s*(?:const|let|var)\s+.+?=\s*require\(\s*['"](.+?)['"]\s*\)/gm,
];

const exportPattern =
  /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;

function fileSummary(file, content) {
  return {
    path: file.path,
    language: languageFor(file.ext),
    extension: file.ext,
    lines: content.split(/\r?\n/).length,
    bytes: new Blob([content]).size,
    tokens: estimateTokens(content),
  };
}

function fallbackAnalyzeSource(file, content) {
  const symbols = [],
    imports = [],
    exports = [];
  const lineAt = lineLocator(content);
  for (const [pattern, kind] of symbolPatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)))
      symbols.push({
        name: match[1],
        kind,
        line: lineAt(match.index),
        column: 1,
      });
  }
  for (const pattern of importPatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)))
      imports.push({
        module: match[2] || match[1],
        line: lineAt(match.index),
        column: 1,
        kind: 'import',
        bindings: [],
      });
  }
  exportPattern.lastIndex = 0;
  let match;
  while ((match = exportPattern.exec(content)))
    exports.push({
      name: match[1],
      line: lineAt(match.index),
      kind: 'export',
    });
  return {
    ...fileSummary(file, content),
    symbols: unique(symbols),
    imports: unique(imports),
    exports: unique(exports),
    references: [],
    parser: 'pattern',
    parseErrors: [],
  };
}

export function analyzeSource(file, content) {
  if (file.ext === '.b') return { ...fileSummary(file, content), ...parseBasic(file, content) };
  if (!BABEL_EXTENSIONS.has(file.ext)) return fallbackAnalyzeSource(file, content);
  try {
    return parseJavaScript(content, file);
  } catch (error) {
    return {
      ...fallbackAnalyzeSource(file, content),
      parser: 'fallback',
      parseErrors: [{ message: error.message, line: error.loc?.line || 1 }],
    };
  }
}

function candidatePaths(path) {
  const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
  const exts = [
    '.js',
    '.jsx',
    '.ts',
    '.tsx',
    '.vue',
    '.py',
    '.java',
    '.kt',
    '.go',
    '.rs',
    '.php',
    '.cs',
    '.json',
  ];
  return unique([
    normalized,
    ...exts.map((ext) => normalized + ext),
    ...exts.map((ext) => normalized + '/index' + ext),
  ]);
}

function resolveImport(fromPath, module, fileMap) {
  if (!module?.startsWith('.')) return null;
  const base = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/') + 1) : '';
  const target = (base + module).replace(/\\/g, '/');
  const normalized = [];
  for (const part of target.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') normalized.pop();
    else normalized.push(part);
  }
  for (const candidate of candidatePaths(normalized.join('/')))
    if (fileMap.has(candidate)) return candidate;
  return null;
}

function frameworkSignals(files) {
  const names = new Set(files.map((f) => f.path.split('/').pop()));
  const packages = new Set();
  const add = (name, evidence) => ({ name, evidence });
  const result = [];
  if (names.has('package.json')) result.push(add('Node.js', 'package.json'));
  if (files.some((f) => f.ext === '.vue')) result.push(add('Vue', '*.vue files'));
  if (files.some((f) => f.ext === '.tsx') || files.some((f) => f.ext === '.jsx'))
    result.push(add('React', 'JSX/TSX files'));
  if (files.some((f) => f.ext === '.py')) result.push(add('Python', 'Python files'));
  if (files.some((f) => f.ext === '.java')) result.push(add('Java', 'Java files'));
  if (files.some((f) => f.ext === '.kt')) result.push(add('Kotlin', 'Kotlin files'));
  if (files.some((f) => f.ext === '.go')) result.push(add('Go', 'Go files'));
  const basic = files.filter((f) => f.ext === '.b').length;
  if (basic) result.push(add('Temenos T24 / Transact', `${basic} BASIC sources`));
  return { frameworks: result, packages: [...packages] };
}

const cancelled = () => new DOMException('Indexing cancelled', 'AbortError');

// Names every JS runtime provides; a reference to one is neither a repository symbol nor unresolved.
const JS_GLOBALS = new Set([
  'require',
  'module',
  'exports',
  '__dirname',
  '__filename',
  'console',
  'window',
  'document',
  'navigator',
  'location',
  'globalThis',
  'self',
  'process',
  'Buffer',
  'JSON',
  'Math',
  'Object',
  'Array',
  'String',
  'Number',
  'Boolean',
  'Symbol',
  'BigInt',
  'Date',
  'RegExp',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'Promise',
  'Proxy',
  'Reflect',
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'Intl',
  'URL',
  'URLSearchParams',
  'fetch',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'queueMicrotask',
  'structuredClone',
  'undefined',
  'NaN',
  'Infinity',
  'isNaN',
  'isFinite',
  'parseInt',
  'parseFloat',
  'encodeURIComponent',
  'decodeURIComponent',
]);

/**
 * How far a reference's link can be trusted. An import binding or an enclosing declaration names
 * its target (several targets: a namespace import or duplicate declarations); a match on a
 * top-level name in another file is a guess.
 */
export function referenceConfidence(resolution, targets) {
  if (!targets || resolution === 'unresolved') return 'none';
  if (resolution === 'name-match') return 'low';
  return targets === 1 ? 'high' : 'medium';
}

/**
 * Of one file's same-name declarations, those a reference at `offset` can see: the ones in the
 * innermost scope that contains it. Without an offset (pattern-parsed files) all qualify.
 */
function visibleAt(symbols, offset) {
  if (offset === undefined) return symbols;
  let innermost = -1;
  const visible = [];
  for (const symbol of symbols) {
    const start = symbol.scopeStart ?? -1;
    if (start >= 0 && (offset < start || offset > symbol.scopeEnd)) continue;
    if (start > innermost) {
      innermost = start;
      visible.length = 0;
    }
    if (start === innermost) visible.push(symbol);
  }
  return visible.length === symbols.length ? symbols : visible;
}

/** Start of the innermost local-binding scope containing `offset`, or -1. */
function innermostBinding(bindings, offset) {
  if (!bindings || offset === undefined) return -1;
  let start = -1;
  for (const b of bindings)
    if (offset >= b.scopeStart && offset <= b.scopeEnd && b.scopeStart > start)
      start = b.scopeStart;
  return start;
}

function groupBy(items, keyFn) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

/**
 * BASIC routines and inserts share one global namespace: CALL X and $INSERT X name a routine, not a
 * path. CALLJ names a Java class. Returns `(kind, module) => path | null` for those imports.
 */
function namedImportResolver(files) {
  const routines = new Map();
  const javaClasses = new Map();
  for (const file of files) {
    if (file.ext === '.b') {
      const name = routineName(file.name || file.path.split('/').pop());
      if (!routines.has(name)) routines.set(name, file.path);
    } else if (file.ext === '.java') {
      const maven = /(?:^|\/)src\/(?:main|test)\/java\/(.+)\.java$/.exec(file.path);
      if (maven) javaClasses.set(maven[1].replace(/\//g, '.'), file.path);
      else javaClasses.set(file.path.replace(/\.java$/, '').replace(/\//g, '.'), file.path);
    }
  }
  return (kind, module) => {
    if (kind === 'call' || kind === 'insert') return routines.get(module) || null;
    if (kind === 'callj') {
      if (javaClasses.has(module)) return javaClasses.get(module);
      // A path that is not a Maven layout: match the package path at the end.
      const suffix = '/' + module.replace(/\./g, '/') + '.java';
      for (const [, path] of javaClasses) if (('/' + path).endsWith(suffix)) return path;
    }
    return null;
  };
}

/**
 * Builds the repository index. A file that carries a previous `analysis` (an entry of an earlier
 * index's `files`, reused because the file is unchanged) is not read or parsed again; every
 * cross-file link is always recomputed.
 */
export async function buildRepositoryIndex(project, options = {}) {
  const { signal, onProgress } = options;
  if (!project) return null;
  const files = project.files.filter(isTextFile);
  const fileMap = new Map(files.map((file) => [file.path, file]));
  const resolveNamed = namedImportResolver(files);
  const index = {
    repository: project.name,
    generatedAt: new Date().toISOString(),
    files: [],
    symbols: [],
    imports: [],
    exports: [],
    references: [],
    dependencies: [],
    externalDependencies: [],
    unresolvedImports: [],
    languages: {},
    project: frameworkSignals(files),
    stats: {
      files: files.length,
      lines: 0,
      bytes: 0,
      tokens: 0,
      symbols: 0,
      imports: 0,
      exports: 0,
      references: 0,
      resolvedReferences: 0,
      unresolvedReferences: 0,
      internalEdges: 0,
      externalImports: 0,
      reusedFiles: 0,
      externalReferences: 0,
      localReferences: 0,
      globalReferences: 0,
      referenceConfidence: { high: 0, medium: 0, low: 0, none: 0 },
    },
  };
  // file::local names bound by imports that do not resolve inside the repository. A reference to
  // one of them names a package (or a missing file), never a same-name repository symbol.
  const externalLocals = new Set();

  for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
    if (signal?.aborted) throw cancelled();
    const file = files[fileIndex];
    // Progress is throttled: one message per file floods the main thread on large repositories.
    if (fileIndex % 25 === 0 || fileIndex === files.length - 1)
      onProgress?.({
        phase: 'analyze',
        current: fileIndex + 1,
        total: files.length,
        path: file.path,
        reused: index.stats.reusedFiles,
      });
    let analysis = file.analysis;
    if (analysis) index.stats.reusedFiles++;
    else {
      const raw = await file.handle.getFile();
      analysis = analyzeSource(file, await raw.text());
      // Kept so the next build can tell whether this file changed.
      analysis.size = raw.size;
      analysis.modified = raw.lastModified;
    }
    index.files.push(analysis);
    index.stats.lines += analysis.lines;
    index.stats.bytes += analysis.bytes;
    index.stats.tokens += analysis.tokens;
    index.stats.symbols += analysis.symbols.length;
    index.stats.imports += analysis.imports.length;
    index.stats.exports += analysis.exports.length;
    index.stats.references += analysis.references?.length || 0;
    index.languages[analysis.language] = (index.languages[analysis.language] || 0) + 1;
    for (const s of analysis.symbols) index.symbols.push({ ...s, path: file.path });
    for (const e of analysis.exports) index.exports.push({ ...e, path: file.path });

    for (const item of analysis.imports) {
      const target =
        item.kind === 'import'
          ? resolveImport(file.path, item.module, fileMap)
          : resolveNamed(item.kind, item.module);
      const edge = {
        from: file.path,
        to: target,
        module: item.module,
        kind: item.kind,
        line: item.line,
        bindings: item.bindings || [],
      };
      index.imports.push(edge);
      if (target) {
        index.dependencies.push(edge);
        index.stats.internalEdges++;
      } else {
        if (item.module.startsWith('.'))
          // A relative import names a file in this repository: missing, not external.
          index.unresolvedImports.push(edge);
        else {
          index.externalDependencies.push(edge);
          index.stats.externalImports++;
        }
        for (const binding of edge.bindings) externalLocals.add(`${file.path}::${binding.local}`);
      }
    }
  }

  onProgress?.({ phase: 'resolve', current: files.length, total: files.length, path: null });
  // A definition key (path|name|kind|line) is unique within the index, so symbols are linked
  // directly and compared by their precomputed key.
  for (const symbol of index.symbols) {
    symbol.definitionKey = keyOf(symbol.path, symbol.name, symbol.kind, symbol.line);
    symbol.references = [];
    symbol.importedBy = [];
  }
  // Every lookup below goes through these maps; scanning the symbol list per reference is what made
  // indexing quadratic. Their groups hold distinct symbols and are shared, read-only, by every
  // reference that resolves to them. Only top-level symbols can be imported or matched by name from
  // another file; a function's locals are only visible inside it.
  const topLevel = index.symbols.filter((s) => s.scopeStart === undefined);
  const topLevelByName = groupBy(topLevel, (s) => s.name);
  const topLevelByPath = groupBy(topLevel, (s) => s.path);
  const topLevelByPathName = groupBy(topLevel, (s) => `${s.path}::${s.name}`);
  const symbolsByPathName = groupBy(index.symbols, (s) => `${s.path}::${s.name}`);
  const exportsByPath = groupBy(index.exports, (e) => e.path);
  const symbolKey = (s) => s.definitionKey;
  const none = [];

  if (signal?.aborted) throw cancelled();
  // The symbols a file provides under an exported name, following `export … from` and
  // `export * from` into the files that define them. `seen` stops re-export cycles.
  const resolveExported = (path, name, seen = new Set()) => {
    const visit = `${path}::${name}`;
    if (seen.has(visit)) return none;
    seen.add(visit);
    const exports = exportsByPath.get(path) || none;
    const through = (e, exported) => {
      const target = resolveImport(path, e.source, fileMap);
      return target ? resolveExported(target, exported, seen) : none;
    };
    const own = (e) => topLevelByPathName.get(`${path}::${e.local || e.name}`) || none;
    if (name === '*') {
      const local = exports.filter((e) => e.kind !== 're-export' && !e.source).flatMap(own);
      return local.length ? unique(local, symbolKey) : topLevelByPath.get(path) || none;
    }
    const named = exports.filter((e) =>
      name === 'default' ? e.kind === 'default' : e.kind === 'export' && e.name === name,
    );
    if (named.length)
      return unique(
        named.flatMap((e) => (e.source ? through(e, e.local || e.name) : own(e))),
        symbolKey,
      );
    if (name === 'default') return none;
    const star = exports.filter((e) => e.kind === 're-export').flatMap((e) => through(e, name));
    if (star.length) return unique(star, symbolKey);
    // No export names it (e.g. a file parsed by patterns): a top-level symbol of that name.
    return topLevelByPathName.get(visit) || none;
  };

  const importBindings = [];
  for (const edge of index.dependencies) {
    for (const binding of edge.bindings || []) {
      const candidates = resolveExported(edge.to, binding.imported);
      importBindings.push({
        from: edge.from,
        to: edge.to,
        local: binding.local,
        imported: binding.imported,
        kind: binding.kind,
        line: edge.line,
        resolvedSymbols: candidates,
      });
    }
  }

  // The first binding of a local name wins, as before.
  const bindingByFileLocal = new Map();
  for (const binding of importBindings) {
    const key = `${binding.from}::${binding.local}`;
    if (!bindingByFileLocal.has(key)) bindingByFileLocal.set(key, binding);
  }

  for (const file of index.files) {
    if (signal?.aborted) throw cancelled();
    const bindingsByName = file.localBindings?.length
      ? groupBy(file.localBindings, (b) => b.name)
      : null;
    for (const ref of file.references || []) {
      const local = `${file.path}::${ref.name}`;
      const bindingScope = innermostBinding(bindingsByName?.get(ref.name), ref.offset);
      if (bindingScope >= 0) {
        // A parameter or destructured name shadows imports and outer declarations; only a
        // declaration in the same or an inner function beats it.
        const declared = visibleAt(symbolsByPathName.get(local) || none, ref.offset);
        if (!declared.length || (declared[0].scopeStart ?? -1) < bindingScope) {
          index.stats.localReferences++;
          continue;
        }
      }
      const binding = bindingByFileLocal.get(local);
      let resolution = 'import';
      let resolved = binding?.resolvedSymbols || none;
      if (!binding && externalLocals.has(local)) {
        index.stats.externalReferences++;
        continue;
      }
      if (!resolved.length) {
        resolution = 'local';
        resolved = visibleAt(symbolsByPathName.get(local) || none, ref.offset);
      }
      if (!resolved.length && ref.kind === 'identifier' && JS_GLOBALS.has(ref.name)) {
        index.stats.globalReferences++;
        continue;
      }
      if (!resolved.length) {
        resolution = 'name-match';
        resolved = topLevelByName.get(ref.name) || none;
      }
      // A BASIC CALL to a routine outside the repository (a core API such as F.READ) is already an
      // external dependency; as a reference it would only swell the unresolved count.
      if (!resolved.length && ref.kind === 'call') continue;
      if (!resolved.length) resolution = 'unresolved';
      const reference = {
        from: file.path,
        name: ref.name,
        line: ref.line,
        column: ref.column,
        resolvedSymbols: resolved,
        resolution,
        confidence: referenceConfidence(resolution, resolved.length),
      };
      index.references.push(reference);
      index.stats.referenceConfidence[reference.confidence]++;
      if (reference.resolvedSymbols.length) index.stats.resolvedReferences++;
      else index.stats.unresolvedReferences++;
    }
  }

  onProgress?.({ phase: 'finalize', current: files.length, total: files.length, path: null });
  index.importBindings = importBindings;
  // Walking the links once keeps each symbol's lists in index order, exactly as filtering did.
  for (const reference of index.references)
    for (const symbol of reference.resolvedSymbols) symbol.references.push(reference);
  for (const binding of importBindings)
    for (const symbol of binding.resolvedSymbols) symbol.importedBy.push(binding);
  index.coverage = analysisCoverage(index);

  return index;
}

export function findDefinition(index, name, path = null) {
  const list = (index?.symbols || []).filter((s) => s.name === name && (!path || s.path === path));
  return list[0] || null;
}

export function getSymbolDetails(index, symbolOrKey) {
  if (!index || !symbolOrKey) return null;
  const symbol =
    typeof symbolOrKey === 'string'
      ? index.symbols.find((s) => s.definitionKey === symbolOrKey)
      : symbolOrKey;
  if (!symbol) return null;
  return {
    symbol,
    references: symbol.references || [],
    importedBy: symbol.importedBy || [],
    methods:
      symbol.kind === 'class'
        ? index.symbols.filter(
            (s) => s.path === symbol.path && s.parent === symbol.name && s.kind === 'method',
          )
        : [],
    exports: index.exports.filter(
      (e) => e.path === symbol.path && (e.name === symbol.name || e.local === symbol.name),
    ),
    dependencies: findDependencies(index, symbol.path),
    dependents: findDependents(index, symbol.path),
  };
}

export function findSymbolReferences(index, symbol) {
  const key = typeof symbol === 'string' ? symbol : symbol?.definitionKey;
  if (!key) return [];
  return (index?.references || []).filter((r) =>
    r.resolvedSymbols.some((s) => keyOf(s.path, s.name, s.kind, s.line) === key),
  );
}

export function findImportedBy(index, symbol) {
  const key = typeof symbol === 'string' ? symbol : symbol?.definitionKey;
  if (!key) return [];
  return (index?.importBindings || []).filter((r) =>
    r.resolvedSymbols.some((s) => keyOf(s.path, s.name, s.kind, s.line) === key),
  );
}

export function findDependents(index, path) {
  return unique(
    (index?.dependencies || []).filter((edge) => edge.to === path).map((edge) => edge.from),
  );
}

export function findDependencies(index, path) {
  return unique(
    (index?.dependencies || []).filter((edge) => edge.from === path).map((edge) => edge.to),
  );
}

export function detectCycles(index) {
  const graph = new Map();
  for (const edge of index?.dependencies || []) {
    if (!graph.has(edge.from)) graph.set(edge.from, []);
    graph.get(edge.from).push(edge.to);
  }
  const cycles = [],
    visiting = new Set(),
    visited = new Set(),
    stack = [];
  function visit(node) {
    if (visiting.has(node)) {
      const start = stack.indexOf(node);
      if (start >= 0) {
        const cycle = [...stack.slice(start), node];
        const signature = [...cycle].sort().join('|');
        if (!cycles.some((x) => [...x].sort().join('|') === signature)) cycles.push(cycle);
      }
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    stack.push(node);
    for (const next of graph.get(node) || []) visit(next);
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  }
  for (const node of graph.keys()) visit(node);
  return cycles;
}

export function attachFileHandles(index, project) {
  if (!index) return index;
  index._fileHandles = new Map(project.files.filter(isTextFile).map((file) => [file.path, file]));

  const symbolByKey = new Map(
    (index.symbols || []).map((symbol) => [
      symbol.definitionKey || keyOf(symbol.path, symbol.name, symbol.kind, symbol.line),
      symbol,
    ]),
  );
  // References that resolve to the same symbols share one array; keep them shared.
  const resolved = new Map();
  const resolveSymbols = (value) => {
    if (!value) return [];
    if (!resolved.has(value))
      resolved.set(
        value,
        value
          .map((item) => (typeof item === 'object' ? item : symbolByKey.get(item) || null))
          .filter(Boolean),
      );
    return resolved.get(value);
  };

  // A fresh index links symbols to reference objects; a cached snapshot links them by position.
  const oldReferences = index.references || [];
  const oldBindings = index.importBindings || [];
  const referencePosition = new Map(oldReferences.map((item, i) => [item, i]));
  const bindingPosition = new Map(oldBindings.map((item, i) => [item, i]));
  index.references = oldReferences.map((reference) => ({
    ...reference,
    resolvedSymbols: resolveSymbols(reference.resolvedSymbols),
  }));
  index.importBindings = oldBindings.map((binding) => ({
    ...binding,
    resolvedSymbols: resolveSymbols(binding.resolvedSymbols),
  }));
  const relink = (items, position, list) =>
    (items || [])
      .map((item) => list[typeof item === 'number' ? item : position.get(item)])
      .filter(Boolean);

  for (const symbol of index.symbols || []) {
    symbol.definitionKey =
      symbol.definitionKey || keyOf(symbol.path, symbol.name, symbol.kind, symbol.line);
    symbol.references = relink(symbol.references, referencePosition, index.references);
    symbol.importedBy = relink(symbol.importedBy, bindingPosition, index.importBindings);
  }

  return index;
}

export function summarizeIndex(index) {
  if (!index) return null;
  return {
    ...index.stats,
    languages: Object.entries(index.languages).sort((a, b) => b[1] - a[1]),
    cycles: detectCycles(index),
  };
}
