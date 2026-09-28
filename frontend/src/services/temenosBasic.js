// Temenos T24 / Transact BASIC (jBC, InfoBasic) for the code index. A line-oriented parser: it
// records what the index can link — the routine, its labels, CALL / DEFFUN / $INSERT / CALLJ
// dependencies, GOSUB / GOTO references — and the T24 applications the routine uses. Variables are
// not declared in BASIC, so they are not symbols or references.

const NAME = '[A-Za-z][\\w.$%]*';
const HEADER = new RegExp(`^\\s*(SUBROUTINE|PROGRAM|FUNCTION)\\s+(${NAME})`);
const PACKAGE = /^\s*\$PACKAGE\s+([\w.$%]+)/;
const USING = /^\s*\$USING\s+(.+)$/;
// $INSERT I_COMMON, $INCLUDE T24.BP I_EQUATE, INCLUDE I_F.ACCOUNT
const INSERT = /^\s*\$?(?:INSERT|INCLUDE)\s+(?:[\w.$%]+\s+)?([\w.$%]+)\s*$/;
// A label starts a line and ends with a colon; ":=" is concatenate-and-assign.
const LABEL = /^\s*([A-Za-z][\w.$%]*|\d+):(?!=)/;
const CALL = new RegExp(`(?<![\\w.$%])CALL\\s+(@?)(${NAME})`, 'g');
const DEFFUN = new RegExp(`(?<![\\w.$%])DEFFUN\\s+(${NAME})\\s*\\(`, 'g');
const JUMP =
  /(?<![\w.$%])(?:GOSUB|GOTO|GO\s+TO)\s+([A-Za-z0-9][\w.$%]*(?:\s*,\s*[A-Za-z0-9][\w.$%]*)*)/g;
// CALLJ "com.acme.Rates", "convert", arg SETTING result
const CALLJ = /(?<![\w.$%])CALLJ\s+(["'])([\w.$]+)\1\s*,\s*(["'])(\$?[\w$]+)\3/g;

// 'F.ACCOUNT', "FBNK.FUNDS.TRANSFER$NAU" -> ACCOUNT, FUNDS.TRANSFER
const FILE_NAME = /^F(?:BNK)?\.([A-Z][A-Z0-9.]*?)(?:\$(?:NAU|HIS|ARC))?$/;
const ASSIGN_FILE = /^\s*([\w.$%]+)\s*=\s*(["'])(F(?:BNK)?\.[A-Z][A-Z0-9.$]*)\2/;
const OPF = /(?<![\w.$%])CALL\s+OPF\s*\(\s*([\w.$%]+)\s*,\s*([\w.$%]+)/;
const ARG = `\\s*\\(\\s*(["'][^"']*["']|[\\w.$%]+)`;
const ACCESS_CALLS = [
  [new RegExp(`(?<![\\w.$%])CALL\\s+(?:F\\.READU?|F\\.READV|CACHE\\.READ)${ARG}`, 'g'), 'read'],
  [
    new RegExp(`(?<![\\w.$%])CALL\\s+(?:F\\.WRITE|F\\.DELETE|F\\.LIVE\\.WRITE)${ARG}`, 'g'),
    'write',
  ],
  [new RegExp(`\\bEB\\.DataAccess\\.(?:FRead[uv]?|CacheRead)${ARG}`, 'g'), 'read'],
  [new RegExp(`\\bEB\\.DataAccess\\.(?:FWrite|FDelete|FLiveWrite)${ARG}`, 'g'), 'write'],
  [/(?<![\w.$%])READ[UV]?\s+[\w.$%<>,]+\s+FROM\s+([\w.$%]+)/g, 'read'],
  [/(?<![\w.$%])WRITE[UV]?\s+[\w.$%<>,]+\s+(?:ON|TO)\s+([\w.$%]+)/g, 'write'],
  [/(?<![\w.$%])DELETE\s+([\w.$%]+)\s*,/g, 'write'],
];
// TAFJ table API: AC.AccountOpening.Account.Read(...), FT.Contract.FundsTransfer.Write(...)
const TABLE_API =
  /\b[A-Z]{2}\.[A-Z]\w*\.([A-Z][A-Za-z0-9]*)\.(Read|ReadNau|ReadHis|CacheRead|ReadU|LockRead|Write|Delete)\s*\(/g;

const COMMENT_LINE = /^\s*(?:\*|!|\/\/|REM\b)/;
const tableName = (camel) => camel.replace(/([a-z0-9])([A-Z])/g, '$1.$2').toUpperCase();
export const routineName = (fileName) => fileName.replace(/\.b$/, '');

/**
 * Splits one line into `code` (comments removed, strings kept), `blank` (the same with string
 * contents blanked, so keywords inside strings are ignored) and its string literals.
 */
function splitLine(line) {
  if (COMMENT_LINE.test(line)) return { code: '', blank: '', strings: [] };
  let quote = null,
    start = 0,
    end = line.length;
  const strings = [];
  let blank = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) {
        strings.push(line.slice(start, i));
        quote = null;
        blank += c;
      } else blank += ' ';
    } else if (c === '"' || c === "'") {
      quote = c;
      start = i + 1;
      blank += c;
    } else if (c === ';' && /^;\s*(?:\*|!|\/\/|REM\b)/.test(line.slice(i))) {
      end = i;
      break;
    } else blank += c;
  }
  return { code: line.slice(0, end), blank, strings };
}

/** Parses a BASIC source into the index's per-file shape plus a `temenos` summary. */
export function parseBasic(file, content) {
  const raw = content.split('\n');
  const starts = [];
  for (let i = 0, offset = 0; i < raw.length; i++) {
    starts.push(offset);
    offset += raw[i].length + 1;
  }
  const lines = raw.map((line) => line.replace(/\r$/, ''));
  const parts = lines.map(splitLine);

  // File and file-name variables (FN.ACC = 'F.ACCOUNT'; CALL OPF(FN.ACC, F.ACC)) are usually set in
  // an initialisation section below the code that uses them, so they are collected first.
  const fileVars = new Map();
  for (const { code } of parts) {
    const assign = ASSIGN_FILE.exec(code);
    const app = assign && FILE_NAME.exec(assign[3]);
    if (app) fileVars.set(assign[1], app[1]);
  }
  for (const { code } of parts) {
    const opf = OPF.exec(code);
    if (opf && fileVars.has(opf[1])) fileVars.set(opf[2], fileVars.get(opf[1]));
  }
  const applicationOf = (arg) => {
    const literal = /^["'](.*)["']$/.exec(arg);
    return literal ? FILE_NAME.exec(literal[1])?.[1] : fileVars.get(arg);
  };

  const base = routineName(file.name || file.path.split('/').pop());
  let routine = null,
    pkg = null,
    dynamicCalls = 0;
  const symbols = [],
    imports = new Map(),
    references = [],
    applications = new Map(),
    javaCalls = [],
    using = [],
    functions = new Map();
  const addImport = (module, line, kind) => {
    if (!imports.has(module))
      imports.set(module, {
        module,
        line,
        column: 1,
        kind,
        bindings: kind === 'callj' ? [] : [{ local: module, imported: module, kind }],
      });
  };
  const addApplication = (name, access, line) => {
    const key = name + '|' + access;
    if (name && !applications.has(key)) applications.set(key, { name, access, line });
  };

  parts.forEach(({ code, blank, strings }, i) => {
    if (!code.trim()) return;
    const line = i + 1;
    const at = (index) => ({ line, column: index + 1, offset: starts[i] + index });

    const header = !routine && HEADER.exec(blank);
    if (header) {
      routine = { name: header[2], kind: header[1].toLowerCase(), line };
      return;
    }
    const pkgMatch = PACKAGE.exec(code);
    if (pkgMatch) pkg = pkgMatch[1];
    const usingMatch = USING.exec(code);
    if (usingMatch)
      using.push(
        ...usingMatch[1]
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
      );
    const insert = INSERT.exec(code);
    if (insert) {
      addImport(insert[1], line, 'insert');
      const layout = /^I_F\.(.+)$/.exec(insert[1]);
      if (layout) addApplication(layout[1], 'layout', line);
      return;
    }

    const label = LABEL.exec(blank);
    if (label)
      symbols.push({
        name: label[1],
        kind: 'label',
        line,
        column: label.index + label[0].indexOf(label[1]) + 1,
        // Labels are local to the routine: visible in this file only.
        scopeStart: 0,
        scopeEnd: content.length,
      });

    for (const m of blank.matchAll(CALL)) {
      if (m[1]) {
        dynamicCalls++;
        continue;
      }
      addImport(m[2], line, 'call');
      references.push({ name: m[2], kind: 'call', ...at(m.index + m[0].indexOf(m[2])) });
    }
    for (const m of blank.matchAll(DEFFUN)) {
      addImport(m[1], line, 'call');
      functions.set(m[1], line);
    }
    for (const m of blank.matchAll(JUMP)) {
      let from = m.index + m[0].length - m[1].length;
      for (const target of m[1].split(',')) {
        const name = target.trim();
        references.push({ name, kind: 'label', ...at(from + target.indexOf(name)) });
        from += target.length + 1;
      }
    }
    for (const m of code.matchAll(CALLJ)) {
      addImport(m[2], line, 'callj');
      javaCalls.push({ className: m[2], method: m[4], line });
    }

    for (const [pattern, access] of ACCESS_CALLS)
      for (const m of code.matchAll(pattern)) addApplication(applicationOf(m[1]), access, line);
    for (const m of code.matchAll(TABLE_API))
      addApplication(tableName(m[1]), /^(Write|Delete)$/.test(m[2]) ? 'write' : 'read', line);
    for (const value of strings) {
      const app = FILE_NAME.exec(value);
      if (app) addApplication(app[1], 'uses', line);
    }
  });

  // Calls to functions declared with DEFFUN look like array access: NAME(...).
  if (functions.size) {
    const names = [...functions.keys()].map((n) => n.replace(/[.$]/g, '\\$&'));
    const call = new RegExp(`(?<![\\w.$%])(${names.join('|')})\\s*\\(`, 'g');
    parts.forEach(({ blank }, i) => {
      for (const m of blank.matchAll(call))
        if (functions.get(m[1]) !== i + 1)
          references.push({
            name: m[1],
            kind: 'call',
            line: i + 1,
            column: m.index + 1,
            offset: starts[i] + m.index,
          });
    });
  }

  const type = routine?.kind || (/^I_/.test(base) ? 'insert' : 'program');
  const name = routine?.name || base;
  const line = routine?.line || 1;
  symbols.unshift({ name, kind: type, line, column: 1 });
  // An application used with a known access is not listed again as merely "uses".
  const known = new Set(
    [...applications.values()].filter((a) => a.access !== 'uses').map((a) => a.name),
  );
  return {
    parser: 'temenos-basic',
    symbols,
    imports: [...imports.values()],
    exports: [{ name, line, column: 1, kind: 'export' }],
    references,
    parseErrors: [],
    temenos: {
      routine: name,
      type,
      package: pkg,
      using,
      applications: [...applications.values()].filter(
        (a) => a.access !== 'uses' || !known.has(a.name),
      ),
      javaCalls,
      dynamicCalls,
    },
  };
}
