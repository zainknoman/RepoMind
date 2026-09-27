import { read, sensitiveName } from '../../lib/files';

export async function buildDashboardData(files) {
  const textFiles = files.filter((f) => f.text);
  let totalLines = 0,
    totalChars = 0,
    blankLines = 0,
    commentLines = 0,
    todos = 0,
    tests = 0,
    configs = 0,
    docs = 0;
  const types = {},
    dirs = {},
    largest = [],
    sizeBuckets = { '<10 KB': 0, '10–50 KB': 0, '50–250 KB': 0, '>250 KB': 0 },
    lineBuckets = { '1–50': 0, '51–200': 0, '201–500': 0, '500+': 0 },
    composition = { Tests: 0, Configuration: 0, Documentation: 0, Source: 0, Other: 0 };
  const signals = [];
  for (const f of files) {
    const slash = f.path.indexOf('/');
    const topDir = slash > 0 ? f.path.slice(0, slash) : '(root)';
    dirs[topDir] = (dirs[topDir] || 0) + 1;
    types[f.ext] = (types[f.ext] || 0) + 1;
    const isTest = /(^|\/)(test|tests|__tests__)(\/|$)|\.(test|spec)\.[^.]+$/i.test(f.path);
    const isConfig =
      /(^|\/)(package\.json|tsconfig.*|vite\.config.*|webpack\.config.*|babel\.config.*|eslint.*|prettier.*|dockerfile|docker-compose.*|\.env.*)$/i.test(
        f.path,
      );
    const isDoc = /\.(md|mdx|txt|rst)$/i.test(f.path);
    if (isTest) {
      tests++;
      composition.Tests++;
    } else if (isConfig) {
      configs++;
      composition.Configuration++;
    } else if (isDoc) {
      docs++;
      composition.Documentation++;
    } else if (f.text) composition.Source++;
    else composition.Other++;
    if (sensitiveName.test(f.path)) signals.push({ type: 'sensitive', path: f.path });
    if (!f.text) continue;
    try {
      const content = await read(f),
        lines = content.split(/\r?\n/);
      totalLines += lines.length;
      totalChars += content.length;
      blankLines += lines.filter((x) => !x.trim()).length;
      commentLines += lines.filter((x) => /^\s*(\/\/|\/\*|\*|#|<!--)/.test(x)).length;
      todos += (content.match(/\b(TODO|FIXME|HACK|XXX)\b/gi) || []).length;
      largest.push({ path: f.path, lines: lines.length, size: content.length, ext: f.ext });
      const kb = content.length / 1024;
      sizeBuckets[kb < 10 ? '<10 KB' : kb < 50 ? '10–50 KB' : kb < 250 ? '50–250 KB' : '>250 KB']++;
      lineBuckets[
        lines.length <= 50
          ? '1–50'
          : lines.length <= 200
            ? '51–200'
            : lines.length <= 500
              ? '201–500'
              : '500+'
      ]++;
    } catch {}
  }
  largest.sort((a, b) => b.lines - a.lines);
  const typesRows = Object.entries(types)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([ext, count]) => ({ ext, count, pct: Math.round((count / files.length) * 100) }));
  const top = typesRows[0];
  const insights = [];
  insights.push({
    icon: '📦',
    title: 'Repository footprint',
    text: `${files.length} files across ${Object.keys(dirs).length} top-level areas.`,
  });
  if (totalLines)
    insights.push({
      icon: '📏',
      title: 'Code volume',
      text: `${totalLines.toLocaleString()} lines across ${textFiles.length} readable files.`,
    });
  if (top)
    insights.push({
      icon: '🧩',
      title: 'Primary technology',
      text: `${top.ext || 'extensionless'} is the most common type with ${top.count} files.`,
    });
  if (tests)
    insights.push({
      icon: '🧪',
      title: 'Testing footprint',
      text: `${tests} test-related files/directories detected.`,
    });
  if (configs)
    insights.push({
      icon: '⚙️',
      title: 'Configuration',
      text: `${configs} configuration or manifest files detected.`,
    });
  if (todos)
    insights.push({
      icon: '📝',
      title: 'Open markers',
      text: `${todos} TODO/FIXME/HACK-style markers found.`,
    });
  if (signals.length)
    insights.push({
      icon: '🔐',
      title: 'Review sensitive names',
      text: `${signals.length} filename(s) match the sensitive-name heuristic.`,
    });
  return {
    totalFiles: files.length,
    textFiles: textFiles.length,
    totalLines,
    totalChars,
    blankLines,
    commentLines,
    todos,
    tests,
    configs,
    docs,
    types: typesRows,
    largest: largest.slice(0, 30),
    insights,
    readability: files.length ? Math.round((textFiles.length / files.length) * 100) : 0,
    sensitive: signals.length,
    dirs: Object.entries(dirs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([name, count]) => ({ name, count })),
    sizeBuckets: Object.entries(sizeBuckets).map(([name, count]) => ({ name, count })),
    lineBuckets: Object.entries(lineBuckets).map(([name, count]) => ({ name, count })),
    composition: Object.entries(composition)
      .filter(([, count]) => count > 0)
      .map(([name, count]) => ({ name, count })),
  };
}
