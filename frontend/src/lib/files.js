export const EXTS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
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
// `.class`, `.so`, `.o`, `.obj`, `.lib` and `.a` are binaries only in lower case: in T24 names
// they are words (COB.IS.LD.ASSET.CLASS, AB.TAX.A).
const BINARY_NAME = /\.(?:PNG|JPE?G|GIF|ICO|PDF|ZIP|JAR|EXE|DLL)$/i;
const BINARY_LOWER = /\.(?:class|so|o|obj|lib|a)$/;
const isBinaryName = (name) => BINARY_NAME.test(name) || BINARY_LOWER.test(name);
// A T24 routine name, optionally followed by a backup suffix (A.CTR.UPDATE_prev, X.Y_old_2016).
const T24_NAME = /^[A-Z0-9_$%][A-Z0-9_.$%-]*$/;
const T24_BACKUP = /^[A-Z][A-Z0-9_$%]*(?:\.[A-Z0-9_$%]+)+[_.-][\w.-]+$/;
export const maybeBasicName = (name) =>
  (T24_NAME.test(name) || T24_BACKUP.test(name)) && !isBinaryName(name);

// Statements that open or make up a jBC / InfoBasic source: routine headers, inserts, TAFJ
// packages, common blocks and equates. Upper case only, as T24 code is written, so prose such as a
// LICENSE ("program is ...") does not match.
const BASIC_MARKER =
  /^ *(?:\$(?:PACKAGE|INSERT|INCLUDE|USING) +\S|(?:SUBROUTINE|PROGRAM) +[A-Za-z][\w.$%]* *(?:\(|\r?$)|FUNCTION +[A-Za-z][\w.$%]* *\(|COM(?:MON)? *(?:\/|[A-Z][\w.$%]* *,)|EQU(?:ATE)? +[A-Za-z][\w.$%]* +TO )/m;
// T24 source folders: BP, T24.BP, BP.LOCAL, local_bp, … (any case).
const BASIC_FOLDER = /(?:^|\/)(?:bp|[^/]+[._]bp|bp[._][^/]+)\//i;

/**
 * Whether a file without a known text extension may be a BASIC routine, to be confirmed by its
 * content: an upper-case name (T24 naming) anywhere, or any routine-like name inside a BASIC
 * source folder (lower-case routine names such as BP/account.validate).
 */
export const basicCandidate = (path, name = path.split('/').pop()) =>
  maybeBasicName(name) ||
  (BASIC_FOLDER.test(path) && /^[A-Za-z0-9_$%][\w.$%-]*$/.test(name) && !isBinaryName(name));

export const looksLikeBasic = (text) => BASIC_MARKER.test((text || '').replace(/\t/g, ' '));

export const read = async (f) =>
  typeof f?.content === 'string' ? f.content : (await f.handle.getFile()).text();

// T24 configuration records: files of a DL.DEFINE package (a folder with a `DL.D_<package>`
// header and `REC000nn` records) and files in a folder named after a configuration application
// (records written as named fields). Both are indexed with this extension.
export const T24_RECORD_EXT = '.t24r';
export const T24_RECORD_FOLDERS = new Set([
  'VERSION',
  'ENQUIRY',
  'EB.API',
  'PGM.FILE',
  'BATCH',
  'TSA.SERVICE',
]);
const DL_HEADER = /^DL\.D_./;
const DL_FILE = /^(?:DL\.D_.+|REC\d{5})$/;
const SOURCE_FILE = /\.(?:b|java|[cm]?[jt]sx?|py|md|json|xml|html|css)$/i;

/** Folders (paths) that hold a DL.DEFINE package: those containing a `DL.D_<package>` file. */
export const dlPackageDirs = (paths) =>
  new Set(
    paths
      .filter((path) => DL_HEADER.test(path.split('/').pop()))
      .map((path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')),
  );

/** Whether a file is a T24 configuration record; `dlDirs` from `dlPackageDirs`. */
export function isT24Record(path, dlDirs) {
  const parts = path.split('/');
  const name = parts.pop();
  if (dlDirs.has(parts.join('/')) && DL_FILE.test(name)) return true;
  return T24_RECORD_FOLDERS.has(parts[parts.length - 1]) && !SOURCE_FILE.test(name);
}

/** Folders larger than this are truncated so the browser stays responsive. */
export const MAX_FILES = 50_000;

/**
 * Recursively lists a directory handle. Stops after `maxFiles` entries and sets `a.truncated`.
 * Sensitive-looking files are listed but marked non-text unless `includeSensitive` is set.
 */
export async function walk(h, p = '', a = [], includeSensitive = false, maxFiles = MAX_FILES) {
  // Listed first: whether the folder is a DL.DEFINE package decides how its files are read.
  const entries = [];
  for await (const entry of h.entries()) entries.push(entry);
  const dlDirs = entries.some(([n]) => DL_HEADER.test(n)) ? new Set([p]) : new Set();
  for (const [n, x] of entries) {
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
      const record = isT24Record(path, dlDirs);
      if (record) {
        isText = true;
        e = T24_RECORD_EXT;
      }
      if (isText && !includeSensitive && sensitiveName.test(path)) isText = false;
      const maybeBasic = !isText && basicCandidate(path, n);
      if (isText || maybeBasic) {
        try {
          const f = await x.getFile();
          if (f.size > 2 * 1024 * 1024) isText = false;
          // T24 routines are usually stored without an extension (ACCOUNT.VALIDATE, I_COMMON):
          // they are recognised by their content and classified as '.b' from here on.
          else if (maybeBasic && looksLikeBasic(await f.slice(0, 4096).text())) {
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
