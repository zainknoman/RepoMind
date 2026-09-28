export const EXTS = new Set([
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
  '.cpp',
  '.c',
  '.h',
  '.html',
  '.css',
  '.scss',
  '.json',
  '.md',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
  '.sql',
  '.sh',
  '.bat',
  '.ps1',
  '.env',
  // Temenos T24 / Transact BASIC (jBC) routines.
  '.b',
]);

export const IGN = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.venv',
  'venv',
  '__pycache__',
  '.idea',
  '.vscode',
]);

// Upper-case names without a lower-case letter (T24 naming) and not an obviously binary file.
const BINARY_NAME = /\.(PNG|JPE?G|GIF|ICO|PDF|ZIP|JAR|CLASS|EXE|DLL|SO|O|OBJ|LIB|A)$/i;
export const maybeBasicName = (name) =>
  /^[A-Z0-9_$%][A-Z0-9_.$%-]*$/.test(name) && !BINARY_NAME.test(name);

// Statements that open or make up a jBC / InfoBasic source: routine headers, inserts, TAFJ
// packages, common blocks and equates. Upper case only, as T24 code is written, so prose such as a
// LICENSE ("program is ...") does not match.
const BASIC_MARKER =
  /^ *(?:\$(?:PACKAGE|INSERT|INCLUDE|USING) +\S|(?:SUBROUTINE|PROGRAM) +[A-Z][\w.$%]* *(?:\(|\r?$)|FUNCTION +[A-Z][\w.$%]* *\(|COM(?:MON)? *\/|EQU(?:ATE)? +[A-Z][\w.$%]* +TO )/m;
export const looksLikeBasic = (text) => BASIC_MARKER.test((text || '').replace(/\t/g, ' '));

export const read = async (f) => (await f.handle.getFile()).text();

/** Folders larger than this are truncated so the browser stays responsive. */
export const MAX_FILES = 50_000;

/**
 * Recursively lists a directory handle. Stops after `maxFiles` entries and sets `a.truncated`.
 * Sensitive-looking files are listed but marked non-text unless `includeSensitive` is set.
 */
export async function walk(h, p = '', a = [], includeSensitive = false, maxFiles = MAX_FILES) {
  for await (const [n, x] of h.entries()) {
    if (a.length >= maxFiles) {
      a.truncated = true;
      return a;
    }
    if (x.kind === 'directory') {
      if (!IGN.has(n)) await walk(x, p ? p + '/' + n : n, a, includeSensitive, maxFiles);
    } else {
      let e = '.' + (n.split('.').pop() || '').toLowerCase(),
        path = p ? p + '/' + n : n,
        isText = EXTS.has(e) || ['Dockerfile', 'Makefile', '.gitignore'].includes(n);
      if (isText && !includeSensitive && sensitiveName.test(path)) isText = false;
      const basicCandidate = !isText && maybeBasicName(n);
      if (isText || basicCandidate) {
        try {
          const f = await x.getFile();
          if (f.size > 2 * 1024 * 1024) isText = false;
          // T24 routines are usually stored without an extension (ACCOUNT.VALIDATE, I_COMMON):
          // they are recognised by their content and classified as '.b' from here on.
          else if (basicCandidate && looksLikeBasic(await f.slice(0, 4096).text())) {
            isText = true;
            e = '.b';
          }
        } catch {
          isText = false;
        }
      }
      a.push({ name: n, path, ext: e, text: isText, handle: x });
    }
  }
  return a;
}

/** True when the browser supports opening local folders (File System Access API, Chromium). */
export const supportsFolderAccess = () =>
  typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

function globToRegExpSource(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      // "**/" matches zero or more directories; a trailing "**" matches everything below.
      if (glob[i + 2] === '/') {
        out += '(?:.*/)?';
        i += 2;
      } else {
        out += '.*';
        i += 1;
      }
    } else if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return out;
}

/**
 * Compiles root .gitignore text into a predicate `(path) => ignored`. Supports comments, "*", "**",
 * "?", root-anchored ("/build") and directory ("logs/") rules. Negation ("!") rules are not supported
 * and are skipped, so such files stay ignored.
 */
export function gitignoreMatcher(raw) {
  const rules = raw
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter((x) => x && !x.startsWith('#') && !x.startsWith('!'))
    .map((rule) => {
      const dirOnly = rule.endsWith('/');
      const body = rule.replace(/\/+$/, '');
      // A slash at the start or in the middle anchors the rule to the repository root.
      const anchored = body.startsWith('/') || body.includes('/');
      const source = globToRegExpSource(body.replace(/^\/+/, ''));
      const prefix = anchored ? '^' : '(?:^|.*/)';
      // Matching a directory also ignores everything inside it; files match exactly or as a directory.
      return new RegExp(prefix + source + (dirOnly ? '/' : '(?:/|$)'));
    });
  return (path) => rules.some((r) => r.test(path));
}

export function applyGitignore(files) {
  const gitignore = files.find((f) => f.path === '.gitignore');
  if (!gitignore) return Promise.resolve(files);
  return read(gitignore).then((raw) => {
    const ignored = gitignoreMatcher(raw);
    return files.filter((f) => f.path === '.gitignore' || !ignored(f.path));
  });
}

export const sensitiveName =
  /(^|\/)(\.env(?:\..*)?|.*(secret|credential|password|private[_-]?key|id_rsa|\.pem|\.p12|\.key))$/i;

export const BASE_URL = import.meta.env.BASE_URL || '/';
