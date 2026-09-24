export const TEXT_EXTENSIONS = new Set([
  '.js','.jsx','.ts','.tsx','.vue','.py','.java','.kt','.go','.rs','.php','.cs',
  '.cpp','.c','.h','.html','.css','.scss','.json','.md','.txt','.xml','.yaml',
  '.yml','.sql','.sh','.bat','.ps1','.env'
]);

export const IGNORE_DIRS = new Set([
  '.git','node_modules','dist','build','.venv','venv','__pycache__','.idea','.vscode',
  'coverage','.next','.nuxt','.turbo','.cache'
]);

export const isTextFile = file => file?.text === true;
export const estimateTokens = text => Math.max(0, Math.ceil(String(text || '').length / 4));

export const languageFor = ext => ({
  '.js':'JavaScript','.jsx':'JavaScript JSX','.ts':'TypeScript','.tsx':'TypeScript TSX',
  '.vue':'Vue','.py':'Python','.java':'Java','.kt':'Kotlin','.go':'Go','.rs':'Rust',
  '.php':'PHP','.cs':'C#','.cpp':'C++','.c':'C','.h':'C/C++ Header','.html':'HTML',
  '.css':'CSS','.scss':'SCSS','.json':'JSON','.md':'Markdown','.sql':'SQL',
  '.sh':'Shell','.bat':'Batch','.ps1':'PowerShell','.xml':'XML','.yaml':'YAML','.yml':'YAML'
}[ext] || 'Text');

import { parse } from '@babel/parser';

const BABEL_PLUGINS = [
  'jsx','typescript','classProperties','classPrivateProperties','classPrivateMethods',
  'decorators-legacy','dynamicImport','optionalChaining','nullishCoalescingOperator',
  'topLevelAwait','objectRestSpread'
];

const BABEL_EXTENSIONS = new Set(['.js','.jsx','.ts','.tsx']);

function walk(node, visitor, parent = null, ancestors = []) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach(child => walk(child, visitor, parent, ancestors));
    return;
  }
  if (node.type) visitor(node, parent, ancestors);
  const nextAncestors = node.type ? [...ancestors, node] : ancestors;
  for (const key of Object.keys(node)) {
    if (['loc','start','end','tokens','comments','errors'].includes(key)) continue;
    const value = node[key];
    if (value && typeof value === 'object') walk(value, visitor, node, nextAncestors);
  }
}

const lineOf = node => node?.loc?.start?.line || 1;
const columnOf = node => (node?.loc?.start?.column || 0) + 1;
const keyOf = (path,name,kind,line) => [path,name,kind,line].join('|');

function unique(items, keyFn = x => JSON.stringify(x)) {
  const seen = new Set();
  return items.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function propertyName(node) {
  if (!node) return '';
  if (node.type === 'Identifier' || node.type === 'PrivateName') return node.name || node.id?.name || '';
  if (node.type === 'StringLiteral' || node.type === 'NumericLiteral') return String(node.value);
  return '';
}

function getBindingNames(pattern) {
  const names = [];
  walk(pattern, node => {
    if (node.type === 'Identifier') names.push(node.name);
  });
  return unique(names);
}

function addImportBindings(node) {
  return (node.specifiers || []).map(spec => {
    if (spec.type === 'ImportSpecifier') return {
      local: spec.local?.name || '',
      imported: propertyName(spec.imported),
      kind: 'named'
    };
    if (spec.type === 'ImportDefaultSpecifier') return {
      local: spec.local?.name || '',
      imported: 'default',
      kind: 'default'
    };
    if (spec.type === 'ImportNamespaceSpecifier') return {
      local: spec.local?.name || '',
      imported: '*',
      kind: 'namespace'
    };
    return null;
  }).filter(Boolean);
}

function parseJavaScript(content, file) {
  const ast = parse(content, {
    sourceType: 'unambiguous',
    plugins: BABEL_PLUGINS,
    errorRecovery: true
  });

  const symbols = [];
  const imports = [];
  const exports = [];
  const references = [];
  const scopes = [];
  const declaredNames = new Set();

  const addSymbol = (name, kind, node, extra = {}) => {
    if (!name) return;
    const symbol = {
      name, kind, line: lineOf(node), column: columnOf(node),
      path: file.path, ...extra
    };
    symbols.push(symbol);
    declaredNames.add(name);
    return symbol;
  };

  walk(ast, (node, parent, ancestors) => {
    const line = lineOf(node);

    if (node.type === 'ImportDeclaration') {
      imports.push({
        module: node.source?.value || '',
        line,
        column: columnOf(node),
        kind: 'import',
        bindings: addImportBindings(node),
        sideEffect: !(node.specifiers || []).length
      });
      return;
    }

    if (node.type === 'ExportAllDeclaration') {
      exports.push({ name: '*', line, column: columnOf(node), kind: 're-export', source: node.source?.value || '' });
    } else if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration') {
      const declaration = node.declaration;
      if (declaration?.id?.name) {
        exports.push({
          name: declaration.id.name, line, column: columnOf(node),
          kind: node.type === 'ExportDefaultDeclaration' ? 'default' : 'export'
        });
      } else {
        for (const spec of node.specifiers || []) {
          exports.push({
            name: propertyName(spec.exported) || propertyName(spec.local),
            local: propertyName(spec.local),
            line, column: columnOf(spec),
            kind: node.type === 'ExportDefaultDeclaration' ? 'default' : 'export'
          });
        }
      }
    }

    if (node.type === 'FunctionDeclaration' && node.id?.name) addSymbol(node.id.name, 'function', node);
    if (node.type === 'ClassDeclaration' && node.id?.name) addSymbol(node.id.name, 'class', node);
    if (node.type === 'TSInterfaceDeclaration' && node.id?.name) addSymbol(node.id.name, 'interface', node);
    if (node.type === 'TSTypeAliasDeclaration' && node.id?.name) addSymbol(node.id.name, 'type', node);

    if (node.type === 'VariableDeclarator' && node.id) {
      const names = getBindingNames(node.id);
      const init = node.init;
      for (const name of names) {
        if (init?.type === 'ArrowFunctionExpression' || init?.type === 'FunctionExpression') {
          addSymbol(name, 'function', node, { functionKind: init.type === 'ArrowFunctionExpression' ? 'arrow' : 'expression' });
        } else if (node.id.type === 'Identifier') {
          addSymbol(name, 'variable', node);
        }
      }
    }

    if ((node.type === 'ClassMethod' || node.type === 'ClassPrivateMethod' || node.type === 'ObjectMethod' || node.type === 'ClassProperty') && node.key) {
      const name = propertyName(node.key);
      if (name && (node.type !== 'ClassProperty' || node.value?.type === 'FunctionExpression' || node.value?.type === 'ArrowFunctionExpression')) {
        const ownerNode = [...(ancestors || [])].reverse().find(x => x.type === 'ClassDeclaration' || x.type === 'ClassExpression');
        const owner = ownerNode?.id?.name || null;
        addSymbol(name, 'method', node, { parent: owner });
      }
    }
  });

  const symbolLines = new Set(symbols.map(s => `${s.line}:${s.column}:${s.name}`));
  const importLines = new Set(imports.map(i => i.line));
  const exportLines = new Set(exports.map(e => e.line));

  walk(ast, (node, parent) => {
    if (node.type !== 'Identifier') return;
    const line = lineOf(node);
    const column = columnOf(node);
    const marker = `${line}:${column}:${node.name}`;
    if (symbolLines.has(marker) || importLines.has(line) || exportLines.has(line)) return;

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
      (p.type === 'ImportSpecifier') ||
      (p.type === 'ImportDefaultSpecifier') ||
      (p.type === 'ImportNamespaceSpecifier') ||
      (p.type === 'RestElement' && p.argument === node);
    if (isDeclaration) return;

    references.push({
      name: node.name, line, column,
      kind: 'identifier'
    });
  });

  return {
    ...fallbackAnalyzeSource(file, content),
    parser: 'babel-ast',
    symbols: unique(symbols, s => keyOf(file.path,s.name,s.kind,s.line)),
    imports: unique(imports, i => `${i.module}|${i.line}`),
    exports: unique(exports, e => `${e.name}|${e.line}|${e.kind}`),
    references: unique(references, r => `${r.name}|${r.line}|${r.column}`),
    parseErrors: (ast.errors || []).map(error => ({ message: error.message, line: error.loc?.line || 1 }))
  };
}

const symbolPatterns = [
  [/\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,'function'],
  [/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g,'function'],
  [/\bclass\s+([A-Za-z_$][\w$]*)/g,'class'],
  [/\binterface\s+([A-Za-z_$][\w$]*)/g,'interface'],
  [/\btype\s+([A-Za-z_$][\w$]*)\s*=/g,'type'],
  [/\b(?:def|async\s+def)\s+([A-Za-z_][\w]*)/g,'function']
];

const importPatterns = [
  /^\s*import\s+(.+?)\s+from\s+['"](.+?)['"]/gm,
  /^\s*import\s+['"](.+?)['"]/gm,
  /^\s*(?:const|let|var)\s+.+?=\s*require\(\s*['"](.+?)['"]\s*\)/gm
];

const exportPattern = /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;

function fallbackAnalyzeSource(file, content) {
  const symbols = [], imports = [], exports = [];
  for (const [pattern, kind] of symbolPatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content))) symbols.push({ name: match[1], kind, line: content.slice(0, match.index).split(/\r?\n/).length, column: 1 });
  }
  for (const pattern of importPatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content))) imports.push({ module: match[2] || match[1], line: content.slice(0, match.index).split(/\r?\n/).length, column: 1, kind: 'import', bindings: [] });
  }
  exportPattern.lastIndex = 0;
  let match;
  while ((match = exportPattern.exec(content))) exports.push({ name: match[1], line: content.slice(0, match.index).split(/\r?\n/).length, kind: 'export' });
  return {
    path: file.path, language: languageFor(file.ext), extension: file.ext,
    lines: content.split(/\r?\n/).length, bytes: new Blob([content]).size,
    tokens: estimateTokens(content), symbols: unique(symbols), imports: unique(imports),
    exports: unique(exports), references: [], parser: 'pattern', parseErrors: []
  };
}

export function analyzeSource(file, content) {
  const fallback = fallbackAnalyzeSource(file, content);
  if (!BABEL_EXTENSIONS.has(file.ext)) return fallback;
  try { return parseJavaScript(content, file); }
  catch (error) {
    return { ...fallback, parser: 'fallback', parseErrors: [{ message: error.message, line: error.loc?.line || 1 }] };
  }
}

function candidatePaths(path) {
  const normalized = path.replace(/\\/g,'/').replace(/^\.\//,'');
  const exts = ['.js','.jsx','.ts','.tsx','.vue','.py','.java','.kt','.go','.rs','.php','.cs','.json'];
  return unique([
    normalized, ...exts.map(ext => normalized + ext),
    ...exts.map(ext => normalized + '/index' + ext)
  ]);
}

function resolveImport(fromPath, module, fileMap) {
  if (!module?.startsWith('.')) return null;
  const base = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/') + 1) : '';
  const target = (base + module).replace(/\\/g,'/');
  const normalized = [];
  for (const part of target.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') normalized.pop(); else normalized.push(part);
  }
  for (const candidate of candidatePaths(normalized.join('/'))) if (fileMap.has(candidate)) return candidate;
  return null;
}

function frameworkSignals(files) {
  const names = new Set(files.map(f => f.path.split('/').pop()));
  const packages = new Set();
  const add = (name, evidence) => ({ name, evidence });
  const result = [];
  if (names.has('package.json')) result.push(add('Node.js', 'package.json'));
  if (files.some(f => f.ext === '.vue')) result.push(add('Vue', '*.vue files'));
  if (files.some(f => f.ext === '.tsx') || files.some(f => f.ext === '.jsx')) result.push(add('React', 'JSX/TSX files'));
  if (files.some(f => f.ext === '.py')) result.push(add('Python', 'Python files'));
  if (files.some(f => f.ext === '.java')) result.push(add('Java', 'Java files'));
  if (files.some(f => f.ext === '.kt')) result.push(add('Kotlin', 'Kotlin files'));
  if (files.some(f => f.ext === '.go')) result.push(add('Go', 'Go files'));
  return { frameworks: result, packages: [...packages] };
}

export async function buildRepositoryIndex(project, options = {}) {
  const { signal, onProgress } = options;
  if (!project) return null;
  const files = project.files.filter(isTextFile);
  const fileMap = new Map(files.map(file => [file.path, file]));
  const index = {
    repository: project.name, generatedAt: new Date().toISOString(),
    files: [], symbols: [], imports: [], exports: [], references: [],
    dependencies: [], externalDependencies: [], unresolvedImports: [],
    symbolMap: {}, languages: {}, project: frameworkSignals(files),
    stats: {
      files: files.length, lines: 0, bytes: 0, tokens: 0, symbols: 0, imports: 0,
      exports: 0, references: 0, resolvedReferences: 0, unresolvedReferences: 0,
      internalEdges: 0, externalImports: 0
    }
  };

  for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
    if (signal?.aborted) throw new DOMException('Indexing cancelled', 'AbortError');
    const file = files[fileIndex];
    const content = await (await file.handle.getFile()).text();
    onProgress?.({ phase: 'analyze', current: fileIndex + 1, total: files.length, path: file.path });
    const analysis = analyzeSource(file, content);
    index.files.push(analysis);
    index.stats.lines += analysis.lines;
    index.stats.bytes += analysis.bytes;
    index.stats.tokens += analysis.tokens;
    index.stats.symbols += analysis.symbols.length;
    index.stats.imports += analysis.imports.length;
    index.stats.exports += analysis.exports.length;
    index.stats.references += analysis.references?.length || 0;
    index.languages[analysis.language] = (index.languages[analysis.language] || 0) + 1;
    index.symbols.push(...analysis.symbols.map(s => ({ ...s, path: file.path })));
    index.exports.push(...analysis.exports.map(e => ({ ...e, path: file.path })));

    for (const item of analysis.imports) {
      const target = resolveImport(file.path, item.module, fileMap);
      const edge = { from: file.path, to: target, module: item.module, line: item.line, bindings: item.bindings || [] };
      index.imports.push(edge);
      if (target) {
        index.dependencies.push(edge);
        index.stats.internalEdges++;
      } else {
        index.externalDependencies.push(edge);
        index.stats.externalImports++;
        if (item.module.startsWith('.')) index.unresolvedImports.push(edge);
      }
    }
  }

  onProgress?.({ phase: 'resolve', current: files.length, total: files.length, path: null });
  const definitions = new Map();
  for (const symbol of index.symbols) {
    const key = `${symbol.path}::${symbol.name}`;
    if (!definitions.has(key)) definitions.set(key, []);
    definitions.get(key).push(symbol);
    const publicKey = `${symbol.name}`;
    if (!index.symbolMap[publicKey]) index.symbolMap[publicKey] = [];
    index.symbolMap[publicKey].push(symbol);
  }

  if (signal?.aborted) throw new DOMException('Indexing cancelled', 'AbortError');
  const importBindings = [];
  for (const edge of index.dependencies) {
    for (const binding of edge.bindings || []) {
      const targetExports = index.exports.filter(e => e.path === edge.to && (
        binding.imported === '*' ||
        binding.imported === 'default' ||
        e.name === binding.imported ||
        e.local === binding.imported
      ));
      const candidates = targetExports.length
        ? targetExports.flatMap(e => index.symbols.filter(s => s.path === edge.to && (s.name === (e.local || e.name))))
        : index.symbols.filter(s => s.path === edge.to && (binding.imported === '*' || s.name === binding.imported));
      importBindings.push({
        from: edge.from, to: edge.to, local: binding.local,
        imported: binding.imported, kind: binding.kind, line: edge.line,
        resolvedSymbols: unique(candidates, s => keyOf(s.path,s.name,s.kind,s.line))
      });
    }
  }

  const symbolByPathName = new Map();
  for (const symbol of index.symbols) {
    const key = `${symbol.path}::${symbol.name}`;
    if (!symbolByPathName.has(key)) symbolByPathName.set(key, []);
    symbolByPathName.get(key).push(symbol);
  }

  for (const file of index.files) {
    if (signal?.aborted) throw new DOMException('Indexing cancelled', 'AbortError');
    const importsForFile = importBindings.filter(x => x.from === file.path);
    for (const ref of file.references || []) {
      let resolved = [];
      const local = importsForFile.find(x => x.local === ref.name);
      if (local) {
        resolved = local.resolvedSymbols;
      }
      if (!resolved.length) {
        resolved = index.symbols.filter(s => s.path === file.path && s.name === ref.name);
      }
      if (!resolved.length) {
        resolved = index.symbolMap[ref.name] || [];
      }
      const reference = {
        from: file.path, name: ref.name, line: ref.line, column: ref.column,
        resolvedSymbols: unique(resolved, s => keyOf(s.path,s.name,s.kind,s.line))
      };
      index.references.push(reference);
      if (reference.resolvedSymbols.length) index.stats.resolvedReferences++;
      else index.stats.unresolvedReferences++;
    }
  }

  onProgress?.({ phase: 'finalize', current: files.length, total: files.length, path: null });
  index.importBindings = importBindings;
  for (const symbol of index.symbols) {
    symbol.references = index.references.filter(r => r.resolvedSymbols.some(s => keyOf(s.path,s.name,s.kind,s.line) === keyOf(symbol.path,symbol.name,symbol.kind,symbol.line)));
    symbol.importedBy = index.importBindings.filter(i => i.resolvedSymbols.some(s => keyOf(s.path,s.name,s.kind,s.line) === keyOf(symbol.path,symbol.name,symbol.kind,symbol.line)));
    symbol.definitionKey = keyOf(symbol.path,symbol.name,symbol.kind,symbol.line);
  }

  return index;
}

export function findDefinition(index, name, path = null) {
  const list = (index?.symbols || []).filter(s => s.name === name && (!path || s.path === path));
  return list[0] || null;
}

export function getSymbolDetails(index, symbolOrKey) {
  if (!index || !symbolOrKey) return null;
  const symbol = typeof symbolOrKey === 'string'
    ? index.symbols.find(s => s.definitionKey === symbolOrKey)
    : symbolOrKey;
  if (!symbol) return null;
  return {
    symbol,
    references: symbol.references || [],
    importedBy: symbol.importedBy || [],
    methods: symbol.kind === 'class'
      ? index.symbols.filter(s => s.path === symbol.path && s.parent === symbol.name && s.kind === 'method')
      : [],
    exports: index.exports.filter(e => e.path === symbol.path && (e.name === symbol.name || e.local === symbol.name)),
    dependencies: findDependencies(index, symbol.path),
    dependents: findDependents(index, symbol.path)
  };
}

export function findSymbolReferences(index, symbol) {
  const key = typeof symbol === 'string' ? symbol : symbol?.definitionKey;
  if (!key) return [];
  return (index?.references || []).filter(r => r.resolvedSymbols.some(s => keyOf(s.path,s.name,s.kind,s.line) === key));
}

export function findImportedBy(index, symbol) {
  const key = typeof symbol === 'string' ? symbol : symbol?.definitionKey;
  if (!key) return [];
  return (index?.importBindings || []).filter(r => r.resolvedSymbols.some(s => keyOf(s.path,s.name,s.kind,s.line) === key));
}

export function findDependents(index, path) {
  return unique((index?.dependencies || []).filter(edge => edge.to === path).map(edge => edge.from));
}

export function findDependencies(index, path) {
  return unique((index?.dependencies || []).filter(edge => edge.from === path).map(edge => edge.to));
}

export function detectCycles(index) {
  const graph = new Map();
  for (const edge of index?.dependencies || []) {
    if (!graph.has(edge.from)) graph.set(edge.from, []);
    graph.get(edge.from).push(edge.to);
  }
  const cycles = [], visiting = new Set(), visited = new Set(), stack = [];
  function visit(node) {
    if (visiting.has(node)) {
      const start = stack.indexOf(node);
      if (start >= 0) {
        const cycle = [...stack.slice(start), node];
        const signature = [...cycle].sort().join('|');
        if (!cycles.some(x => [...x].sort().join('|') === signature)) cycles.push(cycle);
      }
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node); stack.push(node);
    for (const next of graph.get(node) || []) visit(next);
    stack.pop(); visiting.delete(node); visited.add(node);
  }
  for (const node of graph.keys()) visit(node);
  return cycles;
}

export function getArchitecture(index) {
  if (!index) return null;
  const incoming = new Map(), outgoing = new Map();
  for (const edge of index.dependencies) {
    outgoing.set(edge.from, (outgoing.get(edge.from) || 0) + 1);
    incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
  }
  return [...index.files].map(file => ({
    path: file.path, language: file.language,
    dependencies: outgoing.get(file.path) || 0,
    dependents: incoming.get(file.path) || 0,
    tokens: file.tokens, symbols: file.symbols.length
  })).sort((a,b) => (b.dependencies + b.dependents) - (a.dependencies + a.dependents));
}

export async function buildContext(index, files, options = {}) {
  const selected = new Set(files);
  const expanded = new Set(selected);
  if (options.includeDependencies || options.includeDependents) {
    for (const path of [...selected]) {
      if (options.includeDependencies) findDependencies(index, path).forEach(x => expanded.add(x));
      if (options.includeDependents) findDependents(index, path).forEach(x => expanded.add(x));
    }
  }
  const chunks = [];
  let tokens = 0;
  for (const item of index?.files || []) {
    if (!expanded.has(item.path)) continue;
    const source = index._fileHandles?.get(item.path);
    if (!source) continue;
    const content = await (await source.handle.getFile()).text();
    tokens += estimateTokens(content);
    chunks.push(options.includeMetadata
      ? `## ${item.path}\nLanguage: ${item.language}\nLines: ${item.lines}\nSymbols: ${item.symbols.length}\n\n${content}`
      : `/* --- Start of file: ${item.path} --- */\n${content}\n/* --- End of file: ${item.path} --- */`);
  }
  return { content: chunks.join('\n\n'), tokens, files: [...expanded] };
}

export function attachFileHandles(index, project) {
  if (!index) return index;
  index._fileHandles = new Map(project.files.filter(isTextFile).map(file => [file.path, file]));

  const symbolByKey = new Map((index.symbols || []).map(symbol => [
    symbol.definitionKey || keyOf(symbol.path, symbol.name, symbol.kind, symbol.line), symbol
  ]));
  const resolveSymbols = value => (value || []).map(item => {
    if (typeof item === 'object') return item;
    return symbolByKey.get(item) || null;
  }).filter(Boolean);

  index.references = (index.references || []).map(reference => ({
    ...reference,
    resolvedSymbols: resolveSymbols(reference.resolvedSymbols)
  }));
  index.importBindings = (index.importBindings || []).map(binding => ({
    ...binding,
    resolvedSymbols: resolveSymbols(binding.resolvedSymbols)
  }));

  for (const symbol of index.symbols || []) {
    const key = symbol.definitionKey || keyOf(symbol.path, symbol.name, symbol.kind, symbol.line);
    symbol.definitionKey = key;
    symbol.references = (symbol.references || []).map(item => {
      const reference = typeof item === 'object' && item.from
        ? (index.references || []).find(candidate => candidate.from === item.from && candidate.name === item.name && candidate.line === item.line && candidate.column === item.column)
        : (index.references || []).find(candidate => candidate.definitionKey === item);
      return reference || null;
    }).filter(Boolean);
    symbol.importedBy = (symbol.importedBy || []).map(item => {
      const binding = typeof item === 'object' && item.from
        ? (index.importBindings || []).find(candidate => candidate.from === item.from && candidate.local === item.local && candidate.line === item.line && candidate.to === item.to)
        : (index.importBindings || []).find(candidate => candidate.definitionKey === item);
      return binding || null;
    }).filter(Boolean);
  }

  return index;
}

export function summarizeIndex(index) {
  if (!index) return null;
  return {
    ...index.stats,
    languages: Object.entries(index.languages).sort((a,b) => b[1] - a[1]),
    cycles: detectCycles(index)
  };
}