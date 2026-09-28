/**
 * Module resolution: which repository file an import names. JS/TS relative paths, then the nearest
 * tsconfig/jsconfig `paths` and `baseUrl`; Python modules (absolute and relative); Java classes by
 * package. Unresolved bare specifiers are packages (external).
 */

const JS_EXTENSIONS = [
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.d.ts',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
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

const unique = (items) => [...new Set(items)];

export function candidatePaths(path) {
  const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
  return unique([
    normalized,
    ...JS_EXTENSIONS.map((ext) => normalized + ext),
    ...JS_EXTENSIONS.map((ext) => normalized + '/index' + ext),
  ]);
}

const dirOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

/** `base` joined with `relative`, with `.` and `..` resolved. */
export function joinPath(base, relative) {
  const parts = [];
  for (const part of (base ? base + '/' : '').concat(relative).replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

const firstExisting = (target, fileMap) => {
  for (const candidate of candidatePaths(target)) if (fileMap.has(candidate)) return candidate;
  return null;
};

export function resolveImport(fromPath, module, fileMap) {
  if (!module?.startsWith('.')) return null;
  return firstExisting(joinPath(dirOf(fromPath), module), fileMap);
}

/** Strips `//` and block comments and trailing commas outside strings (JSONC → JSON). */
function stripJsonc(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2);
      if (i < 0) break;
      i++;
    } else if (c === ',') {
      let j = i + 1;
      while (/\s/.test(text[j] || '')) j++;
      if (text[j] !== '}' && text[j] !== ']') out += c;
    } else out += c;
  }
  return out;
}

/**
 * The module settings of a tsconfig/jsconfig: `{ extends?, baseUrl?, paths? }`, `{}` when it has
 * none, or null when it is not valid JSON(C).
 */
export function parseModuleConfig(text) {
  let json;
  try {
    json = JSON.parse(stripJsonc(String(text || '')));
  } catch {
    return null;
  }
  if (!json || typeof json !== 'object') return null;
  const options = json.compilerOptions || {};
  const config = {};
  if (typeof json.extends === 'string') config.extends = json.extends;
  if (typeof options.baseUrl === 'string') config.baseUrl = options.baseUrl;
  if (options.paths && typeof options.paths === 'object') config.paths = options.paths;
  return config;
}

export const isModuleConfigFile = (path) =>
  /(?:^|\/)(?:ts|js)config(?:\.[\w-]+)?\.json$/.test(path);

/**
 * `configs`: Map(path → parsed config). Returns the effective settings for each config directory,
 * `{ dir, baseDir, paths, pathsDir }`, with `extends` (relative paths only) followed and cycles
 * cut. `baseUrl` is relative to the config that sets it; `paths` without a `baseUrl` are relative
 * to the config that sets them.
 */
function effectiveConfigs(configs) {
  const cache = new Map();
  const resolveConfig = (path, seen = new Set()) => {
    if (cache.has(path)) return cache.get(path);
    if (seen.has(path)) return {};
    seen.add(path);
    const own = configs.get(path) || {};
    let inherited = {};
    if (own.extends?.startsWith('.')) {
      const target = joinPath(dirOf(path), own.extends);
      const parent = configs.has(target) ? target : `${target}.json`;
      if (configs.has(parent)) inherited = resolveConfig(parent, seen);
    }
    const result = { ...inherited };
    if (own.baseUrl !== undefined) result.baseDir = joinPath(dirOf(path), own.baseUrl);
    if (own.paths) {
      result.paths = own.paths;
      result.pathsDir = dirOf(path);
    }
    cache.set(path, result);
    return result;
  };
  const byDir = new Map();
  // tsconfig.json wins over jsconfig.json and variants (tsconfig.app.json) in the same folder.
  const rank = (path) => (/tsconfig\.json$/.test(path) ? 0 : /jsconfig\.json$/.test(path) ? 1 : 2);
  for (const path of [...configs.keys()].sort((a, b) => rank(a) - rank(b))) {
    const dir = dirOf(path);
    if (!byDir.has(dir)) byDir.set(dir, resolveConfig(path));
  }
  return byDir;
}

/** The target patterns of the `paths` entry that matches `module` best (longest prefix). */
function matchPaths(paths, module) {
  let best = null;
  for (const [pattern, targets] of Object.entries(paths)) {
    if (!Array.isArray(targets)) continue;
    const star = pattern.indexOf('*');
    if (star < 0) {
      if (pattern === module) return targets.map((t) => String(t));
      continue;
    }
    const prefix = pattern.slice(0, star),
      suffix = pattern.slice(star + 1);
    if (
      module.length >= prefix.length + suffix.length &&
      module.startsWith(prefix) &&
      module.endsWith(suffix) &&
      (!best || prefix.length > best.prefix)
    )
      best = {
        prefix: prefix.length,
        targets: targets.map((t) =>
          String(t).replace('*', module.slice(prefix.length, module.length - suffix.length)),
        ),
      };
  }
  return best?.targets || null;
}

/**
 * `files`: index analyses (each with `path`, and `moduleConfig` for config files). Returns
 * `(fromPath, module) => path | null` for JS/TS: relative first, then the nearest config's `paths`,
 * then its `baseUrl`. `aliasesResolved` counts imports resolved through a config.
 */
export function createJsResolver(files, fileMap) {
  const configs = new Map(files.filter((f) => f.moduleConfig).map((f) => [f.path, f.moduleConfig]));
  const byDir = effectiveConfigs(configs);
  const nearest = new Map();
  const configFor = (dir) => {
    if (nearest.has(dir)) return nearest.get(dir);
    const found = byDir.get(dir) || (dir ? configFor(dirOf(dir)) : null);
    nearest.set(dir, found);
    return found;
  };
  const resolver = (fromPath, module) => {
    if (!module) return null;
    if (module.startsWith('.')) return resolveImport(fromPath, module, fileMap);
    const config = byDir.size ? configFor(dirOf(fromPath)) : null;
    if (!config) return null;
    const targets = config.paths && matchPaths(config.paths, module);
    const base = config.baseDir ?? config.pathsDir ?? '';
    for (const target of targets || []) {
      const found = firstExisting(joinPath(base, target), fileMap);
      if (found) {
        resolver.aliasesResolved++;
        return found;
      }
    }
    if (config.baseDir !== undefined) {
      const found = firstExisting(joinPath(config.baseDir, module), fileMap);
      if (found) {
        resolver.aliasesResolved++;
        return found;
      }
    }
    return null;
  };
  resolver.aliasesResolved = 0;
  resolver.configs = configs.size;
  return resolver;
}

/**
 * Python modules: `a.b` → `a/b.py` or `a/b/__init__.py` from the repository root, else a unique
 * `…/a/b.py` below a source root (src/, lib/, …), or the closest one to the importing file. A
 * one-segment module also matches a sibling of the importing file (script folders). Relative
 * modules (`.`, `..pkg`) start from the importing file's package.
 */
// Folders that hold top-level packages (src layout).
const PYTHON_ROOTS = ['src', 'lib', 'python', 'source'];

export function createPythonResolver(files) {
  const bySuffix = new Map();
  const paths = new Set();
  for (const { path } of files) {
    if (!path.endsWith('.py')) continue;
    paths.add(path);
    const parts = path.replace(/\.py$/, '').split('/');
    if (parts[parts.length - 1] === '__init__') parts.pop();
    for (let k = 0; k < parts.length; k++) {
      const key = parts.slice(k).join('/');
      if (!bySuffix.has(key)) bySuffix.set(key, []);
      bySuffix.get(key).push(path);
    }
  }
  const moduleFile = (target) =>
    paths.has(target + '.py')
      ? target + '.py'
      : paths.has(target + '/__init__.py')
        ? target + '/__init__.py'
        : null;
  const shared = (a, b) => {
    let n = 0;
    while (n < a.length && a[n] === b[n]) n++;
    return n;
  };
  return (fromPath, module) => {
    if (!module) return null;
    const dots = /^\.*/.exec(module)[0].length;
    const rest = module.slice(dots).replace(/\./g, '/');
    if (dots) {
      let base = dirOf(fromPath);
      for (let k = 1; k < dots; k++) base = dirOf(base);
      return rest ? moduleFile(joinPath(base, rest)) : moduleFile(base);
    }
    const root = moduleFile(rest);
    if (root) return root;
    if (!rest.includes('/'))
      return (
        moduleFile(joinPath(dirOf(fromPath), rest)) ||
        PYTHON_ROOTS.map((root) => moduleFile(`${root}/${rest}`)).find(Boolean) ||
        null
      );
    const candidates = bySuffix.get(rest) || [];
    if (candidates.length <= 1) return candidates[0] || null;
    return [...candidates].sort((a, b) => shared(b, fromPath) - shared(a, fromPath))[0];
  };
}

/**
 * Java classes by fully qualified name (declared package + file name) and by package. Returns
 * `entries(fromPath, item, analysis)`: a single or static import is an edge to the class's file
 * (a nested class resolves to its outer file); a wildcard import — and the implicit import of the
 * file's own package — is an edge to each class of that package the file refers to by name.
 */
export function createJavaResolver(files) {
  const classes = new Map();
  const packages = new Map();
  for (const file of files) {
    if (!file.path.endsWith('.java')) continue;
    const name = file.path
      .split('/')
      .pop()
      .replace(/\.java$/, '');
    const pkg = file.java?.package;
    const fqn = pkg ? `${pkg}.${name}` : name;
    if (!classes.has(fqn)) classes.set(fqn, file.path);
    if (!packages.has(pkg || '')) packages.set(pkg || '', []);
    packages.get(pkg || '').push({ name, path: file.path });
  }
  const classFile = (fqn) => {
    for (let name = fqn; name.includes('.'); name = name.slice(0, name.lastIndexOf('.')))
      if (classes.has(name)) return classes.get(name);
    return classes.get(fqn) || null;
  };
  return (fromPath, item, analysis) => {
    if (!item.wildcard)
      return [{ module: item.module, target: classFile(item.module), bindings: item.bindings }];
    const pkg = item.module.slice(0, -2);
    const members = packages.get(pkg);
    if (!members) return item.implicit ? [] : [{ module: item.module, target: null, bindings: [] }];
    const used = new Set((analysis?.references || []).map((r) => r.name));
    const own = new Set((analysis?.symbols || []).map((s) => s.name));
    return members
      .filter((m) => m.path !== fromPath && used.has(m.name) && !own.has(m.name))
      .map((m) => ({
        module: `${pkg}.${m.name}`,
        target: m.path,
        bindings: [{ local: m.name, imported: m.name, kind: 'named' }],
      }));
  };
}

const PYTHON = /\.py$/;
const JAVA = /\.java$/;

/**
 * Resolves the imports of every supported language. `entries(fromPath, item)` returns the edges an
 * import makes, `[{ module, target, bindings }]` — one per import, except Python
 * `from pkg import submodule`, which is an edge to the submodule. `module(fromPath, module)`
 * resolves a JS/TS specifier (for re-exports). `aliasesResolved` counts JS/TS imports resolved
 * through a tsconfig/jsconfig.
 */
export function createModuleResolver(files, fileMap) {
  const js = createJsResolver(files, fileMap);
  const python = createPythonResolver(files);
  const java = createJavaResolver(files);
  const entries = (fromPath, item, analysis) => {
    if (JAVA.test(fromPath)) return java(fromPath, item, analysis);
    if (!PYTHON.test(fromPath))
      return [{ module: item.module, target: js(fromPath, item.module), bindings: item.bindings }];
    if (!item.from)
      return [
        { module: item.module, target: python(fromPath, item.module), bindings: item.bindings },
      ];
    const out = [];
    const remaining = [];
    for (const binding of item.bindings) {
      const sub = /^\.+$/.test(item.module)
        ? item.module + binding.imported
        : `${item.module}.${binding.imported}`;
      const target = python(fromPath, sub);
      if (target)
        out.push({
          module: sub,
          target,
          bindings: [{ local: binding.local, imported: '*', kind: 'namespace' }],
        });
      else remaining.push(binding);
    }
    if (remaining.length || !item.bindings.length)
      out.unshift({
        module: item.module,
        target: python(fromPath, item.module),
        bindings: remaining,
      });
    return out;
  };
  return {
    entries,
    module: (fromPath, module) => js(fromPath, module),
    get aliasesResolved() {
      return js.aliasesResolved;
    },
  };
}
