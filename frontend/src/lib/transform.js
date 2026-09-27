// "Transform" bundle format: each file is wrapped in start/end marker comments.
const START = (path) => '/* --- Start of file: ' + path + ' --- */';
const END = (path) => '/* --- End of file: ' + path + ' --- */';

export function combineFiles(files) {
  return files
    .map(({ path, content }) => START(path) + '\n' + content + '\n' + END(path))
    .join('\n\n');
}

/** Splits a combined bundle back into files. Accepts LF or CRLF line endings. */
export function splitCombined(text) {
  const r =
    /\/\* --- Start of file: (.*?) --- \*\/\r?\n([\s\S]*?)\r?\n\/\* --- End of file: \1 --- \*\//g;
  const parts = [];
  let m;
  while ((m = r.exec(text))) parts.push({ name: m[1], content: m[2] });
  return parts;
}

/** Normalises a path for use inside a ZIP: no absolute paths, drive letters or ".." segments. */
export function safeArchivePath(name) {
  const segments = String(name)
    .replace(/\\/g, '/')
    .replace(/^[a-zA-Z]:/, '')
    .split('/')
    .filter((s) => s && s !== '.' && s !== '..');
  return segments.join('/') || 'file.txt';
}
