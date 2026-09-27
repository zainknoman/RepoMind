import { read } from '../../lib/files';

export function analyzeSource(path, content) {
  if (!/\.(js|jsx|ts|tsx|vue)$/.test(path)) return null;
  const lines = content.split(/\r?\n/),
    functions = [],
    classes = [],
    imports = [],
    exports = [];
  const add = (a, name, line, extra = {}) => a.push({ name, line, ...extra });
  lines.forEach((line, i) => {
    let m;
    if ((m = line.match(/\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/)))
      add(functions, m[1], i + 1, { type: 'function' });
    if (
      (m = line.match(
        /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/,
      ))
    )
      add(functions, m[1], i + 1, { type: 'arrow' });
    if ((m = line.match(/\bclass\s+([A-Za-z_$][\w$]*)/)))
      add(classes, m[1], i + 1, { type: 'class' });
    if ((m = line.match(/^\s*import\s+(.+?)\s+from\s+['"](.+?)['"]/)))
      add(imports, m[2], i + 1, { binding: m[1] });
    else if ((m = line.match(/^\s*import\s+['"](.+?)['"]/)))
      add(imports, m[1], i + 1, { binding: 'side-effect' });
    if ((m = line.match(/^\s*export\s+(?:default\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/)))
      add(exports, m[1], i + 1);
    else if ((m = line.match(/^\s*export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/)))
      add(exports, m[1], i + 1);
  });
  return { lines: lines.length, functions, classes, imports, exports };
}

export async function buildProjectIndex(p) {
  if (!p) return null;
  const index = {
    files: [],
    symbols: [],
    imports: [],
    stats: { lines: 0, jsFiles: 0, functions: 0, classes: 0, imports: 0, exports: 0 },
  };
  for (const f of p.files.filter((x) => x.text)) {
    const content = await read(f),
      lines = content.split(/\r?\n/).length;
    index.files.push({ path: f.path, ext: f.ext, lines });
    index.stats.lines += lines;
    const a = analyzeSource(f.path, content);
    if (a) {
      index.stats.jsFiles++;
      index.stats.functions += a.functions.length;
      index.stats.classes += a.classes.length;
      index.stats.imports += a.imports.length;
      index.stats.exports += a.exports.length;
      index.symbols.push(
        ...a.functions.map((x) => ({ ...x, path: f.path })),
        ...a.classes.map((x) => ({ ...x, path: f.path })),
      );
      index.imports.push(...a.imports.map((x) => ({ ...x, path: f.path })));
    }
  }
  return index;
}
