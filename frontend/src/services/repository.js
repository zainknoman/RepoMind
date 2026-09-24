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

const symbolPatterns = [
  [/\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,'function'],
  [/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g,'arrow'],
  [/\bclass\s+([A-Za-z_$][\w$]*)/g,'class'],
  [/\binterface\s+([A-Za-z_$][\w$]*)/g,'interface'],
  [/\btype\s+([A-Za-z_$][\w$]*)\s*=/g,'type'],
  [/\b(?:def|async\s+def)\s+([A-Za-z_][\w]*)/g,'function'],
  [/\b(?:public|private|protected|static|final|abstract|synchronized|native|default|\s)*class\s+([A-Za-z_$][\w$]*)/g,'class']
];

const importPatterns = [
  /^\s*import\s+(.+?)\s+from\s+['"](.+?)['"]/gm,
  /^\s*import\s+['"](.+?)['"]/gm,
  /^\s*(?:const|let|var)\s+.+?=\s*require\(\s*['"](.+?)['"]\s*\)/gm,
  /^\s*from\s+(.+?)\s+import\s+/gm,
  /^\s*import\s+([A-Za-z_][\w.]*)/gm
];

const exportPattern = /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;

function lineNumber(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function addSymbolMatches(content, symbols) {
  for (const [pattern, kind] of symbolPatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content))) {
      symbols.push({ name: match[1], kind, line: lineNumber(content, match.index) });
      if (match.index === pattern.lastIndex) pattern.lastIndex++;
    }
  }
}

function addImportMatches(content, imports) {
  for (const pattern of importPatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content))) {
      const module = match[2] || match[1];
      if (!module) continue;
      imports.push({ module, line: lineNumber(content, match.index), binding: match[1] || '' });
      if (match.index === pattern.lastIndex) pattern.lastIndex++;
    }
  }
}

function addExportMatches(content, exports) {
  exportPattern.lastIndex = 0;
  let match;
  while ((match = exportPattern.exec(content))) {
    exports.push({ name: match[1], line: lineNumber(content, match.index) });
    if (match.index === exportPattern.lastIndex) exportPattern.lastIndex++;
  }
}


import { parse } from '@babel/parser';

const BABEL_PLUGINS = [
  'jsx','typescript','classProperties','classPrivateProperties','classPrivateMethods',
  'decorators-legacy','dynamicImport','optionalChaining','nullishCoalescingOperator',
  'topLevelAwait','objectRestSpread'
];

function walk(node, visitor, parent = null) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach(child => walk(child, visitor, parent));
    return;
  }
  if (node.type) visitor(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'tokens' || key === 'comments') continue;
    const value = node[key];
    if (value && typeof value === 'object') walk(value, visitor, node);
  }
}

function locLine(node) {
  return node?.loc?.start?.line || 1;
}

function pushUnique(items, item) {
  const key = JSON.stringify(item);
  if (!items.some(existing => JSON.stringify(existing) === key)) items.push(item);
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

  walk(ast, (node, parent) => {
    const line = locLine(node);

    if (node.type === 'ImportDeclaration') {
      imports.push({
        module: node.source?.value || '',
        line,
        kind: 'import',
        bindings: node.specifiers?.map(spec => spec.local?.name).filter(Boolean) || []
      });
    }

    if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration' || node.type === 'ExportAllDeclaration') {
      const declaration = node.declaration;
      if (node.type === 'ExportAllDeclaration') {
        exports.push({ name: '*', line, kind: 're-export', source: node.source?.value || '' });
      } else if (declaration?.id?.name) {
        exports.push({ name: declaration.id.name, line, kind: 'export' });
      } else {
        for (const spec of node.specifiers || []) {
          if (spec.local?.name) exports.push({ name: spec.exported?.name || spec.local.name, line, kind: 'export' });
        }
      }
    }

    if (node.type === 'FunctionDeclaration' && node.id?.name) {
      symbols.push({ name: node.id.name, kind: 'function', line });
    }

    if (node.type === 'ClassDeclaration' && node.id?.name) {
      symbols.push({ name: node.id.name, kind: 'class', line });
    }

    if (node.type === 'TSInterfaceDeclaration' && node.id?.name) {
      symbols.push({ name: node.id.name, kind: 'interface', line });
    }

    if (node.type === 'TSTypeAliasDeclaration' && node.id?.name) {
      symbols.push({ name: node.id.name, kind: 'type', line });
    }

    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && node.init) {
      const init = node.init;
      if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') {
        symbols.push({ name: node.id.name, kind: 'function', line });
      }
    }

    if (node.type === 'MethodDefinition' && node.key?.type === 'Identifier') {
      symbols.push({ name: node.key.name, kind: 'method', line });
    }

    if (node.type === 'ClassMethod' && node.key?.type === 'Identifier') {
      symbols.push({ name: node.key.name, kind: 'method', line });
    }
  });

  return {
    ...fallbackAnalyzeSource(file, content),
    parser: 'babel-ast',
    symbols: dedupeSymbols(symbols),
    imports: dedupeImports(imports),
    exports: dedupeExports(exports),
    parseErrors: (ast.errors || []).map(error => ({ message: error.message, line: error.loc?.line || 1 }))
  };
}

function dedupeSymbols(items) {
  return items.filter((item, index, all) => all.findIndex(x => x.name === item.name && x.kind === item.kind && x.line === item.line) === index);
}

function dedupeImports(items) {
  return items.filter((item, index, all) => all.findIndex(x => x.module === item.module && x.line === item.line) === index);
}

function dedupeExports(items) {
  return items.filter((item, index, all) => all.findIndex(x => x.name === item.name && x.line === item.line) === index);
}

export function analyzeSource(file, content) {
  const fallback = fallbackAnalyzeSource(file, content);
  if (!isBabelSupported(file.ext)) return fallback;
  try {
    return parseJavaScript(content, file);
  } catch (error) {
    return {
      ...fallback,
      parser: 'fallback',
      parseErrors: [{ message: error.message, line: error.loc?.line || 1 }]
    };
  }
}

function fallbackAnalyzeSource(file, content) {
  const symbols = [], imports = [], exports = [];
  addSymbolMatches(content, symbols);
  addImportMatches(content, imports);
  addExportMatches(content, exports);
  return {
    path: file.path,
    language: languageFor(file.ext),
    extension: file.ext,
    lines: content.split(/\r?\n/).length,
    bytes: new Blob([content]).size,
    tokens: estimateTokens(content),
    symbols,
    imports,
    exports,
    parser: 'pattern',
    parseErrors: []
  };
}

function isBabelSupported(ext) {
  return ['.js','.jsx','.ts','.tsx'].includes(ext);
}

function candidatePaths(path) {
  const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
  const candidates = [normalized];
  const exts = ['.js','.jsx','.ts','.tsx','.vue','.py','.java','.kt','.go','.rs','.php','.cs','.json'];
  for (const ext of exts) candidates.push(normalized + ext);
  for (const ext of exts) candidates.push(normalized + '/index' + ext);
  return candidates;
}

function resolveImport(fromPath, module, fileMap) {
  if (!module?.startsWith('.')) return null;
  const base = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/') + 1) : '';
  const target = (base + module).replace(/\\/g, '/');
  const normalized = [];
  for (const part of target.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') normalized.pop(); else normalized.push(part);
  }
  for (const candidate of candidatePaths(normalized.join('/'))) {
    if (fileMap.has(candidate)) return candidate;
  }
  return null;
}

export async function buildRepositoryIndex(project) {
  if (!project) return null;
  const files = project.files.filter(isTextFile);
  const fileMap = new Map(files.map(file => [file.path, file]));
  const index = {
    repository: project.name,
    generatedAt: new Date().toISOString(),
    files: [],
    symbols: [],
    imports: [],
    exports: [],
    dependencies: [],
    externalDependencies: [],
    unresolvedImports: [],
    languages: {},
    stats: { files: files.length, lines: 0, bytes: 0, tokens: 0, symbols: 0, imports: 0, exports: 0, internalEdges: 0, externalImports: 0 }
  };

  for (const file of files) {
    const content = await (await file.handle.getFile()).text();
    const analysis = analyzeSource(file, content);
    index.files.push(analysis);
    index.stats.lines += analysis.lines;
    index.stats.bytes += analysis.bytes;
    index.stats.tokens += analysis.tokens;
    index.stats.symbols += analysis.symbols.length;
    index.stats.imports += analysis.imports.length;
    index.stats.exports += analysis.exports.length;
    index.languages[analysis.language] = (index.languages[analysis.language] || 0) + 1;

    analysis.symbols.forEach(symbol => index.symbols.push({ ...symbol, path: file.path }));
    analysis.exports.forEach(item => index.exports.push({ ...item, path: file.path }));

    for (const item of analysis.imports) {
      const target = resolveImport(file.path, item.module, fileMap);
      const edge = { from: file.path, to: target, module: item.module, line: item.line };
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

  return index;
}

export function findDependents(index, path) {
  return (index?.dependencies || []).filter(edge => edge.to === path).map(edge => edge.from);
}

export function findDependencies(index, path) {
  return (index?.dependencies || []).filter(edge => edge.from === path).map(edge => edge.to);
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
      if (start >= 0) cycles.push([...stack.slice(start), node]);
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

export async function buildContext(index, files, options = {}) {
  const selected = new Set(files);
  const chunks = [];
  let tokens = 0;
  for (const item of index?.files || []) {
    if (!selected.has(item.path)) continue;
    const source = index._fileHandles?.get(item.path);
    if (!source) continue;
    const content = await (await source.handle.getFile()).text();
    tokens += estimateTokens(content);
    chunks.push(options.includeMetadata
      ? \`## \${item.path}\\nLanguage: \${item.language}\\nLines: \${item.lines}\\n\\n\${content}\`
      : \`/* --- Start of file: \${item.path} --- */\\n\${content}\\n/* --- End of file: \${item.path} --- */\`);
  }
  return { content: chunks.join('\\n\\n'), tokens };
}

export function attachFileHandles(index, project) {
  if (!index) return index;
  index._fileHandles = new Map(project.files.filter(isTextFile).map(file => [file.path, file]));
  return index;
}

export function summarizeIndex(index) {
  if (!index) return null;
  return { ...index.stats, languages: Object.entries(index.languages).sort((a,b) => b[1] - a[1]), cycles: detectCycles(index) };
}
