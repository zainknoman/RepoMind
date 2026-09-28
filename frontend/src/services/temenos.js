// Temenos T24 / Transact analyzers: a domain pack on the analyzer contract (docs/ANALYZERS.md).
// They read what the index records for BASIC sources (services/temenosBasic.js): routines, their
// CALL / $INSERT / CALLJ edges and the applications they use. Offered only when the index has BASIC.
import { defineAnalyzer, definePatternAnalyzer, registerAnalyzer } from './analyzers';

export const hasTemenos = (index) => (index?.files || []).some((f) => f.temenos);

const list = (items, max = 6) =>
  items.length > max
    ? items.slice(0, max).join(', ') + ` +${items.length - max}`
    : items.join(', ');

/**
 * Routines with their edges, from the index: { routines, byPath, callers(path), calls(path) }.
 * `calls` holds CALL / DEFFUN edges (target `to` is null for routines outside the repository).
 */
export function temenosModel(index) {
  const routines = (index?.files || [])
    .filter((f) => f.temenos)
    .map((f) => ({
      path: f.path,
      line: f.symbols?.find((s) => s.name === f.temenos.routine)?.line || 1,
      ...f.temenos,
    }));
  const byPath = new Map(routines.map((r) => [r.path, r]));
  const edgesFrom = new Map(),
    edgesTo = new Map();
  for (const edge of index?.imports || []) {
    if (!byPath.has(edge.from)) continue;
    if (!edgesFrom.has(edge.from)) edgesFrom.set(edge.from, []);
    edgesFrom.get(edge.from).push(edge);
    if (edge.to) {
      if (!edgesTo.has(edge.to)) edgesTo.set(edge.to, []);
      edgesTo.get(edge.to).push(edge);
    }
  }
  const of = (map, path, kind) => (map.get(path) || []).filter((e) => e.kind === kind);
  return {
    routines,
    byPath,
    calls: (path) => of(edgesFrom, path, 'call'),
    inserts: (path) => of(edgesFrom, path, 'insert'),
    javaCalls: (path) => of(edgesFrom, path, 'callj'),
    callers: (path) => of(edgesTo, path, 'call'),
    includers: (path) => of(edgesTo, path, 'insert'),
    javaCallers: (path) => of(edgesTo, path, 'callj'),
  };
}

const routineOf = (model, path) => model.byPath.get(path)?.routine || path;

const routinesAnalyzer = defineAnalyzer({
  id: 'temenos-routines',
  name: 'Temenos Routines',
  category: 'Temenos',
  description:
    'Every BASIC routine and insert: type, what it calls, who calls it and the applications it uses. Routine names defined in more than one file are flagged.',
  scope: 'index',
  appliesTo: hasTemenos,
  columns: [
    ['routine', 'Routine'],
    ['type', 'Type'],
    ['calls', 'Calls'],
    ['callers', 'Called / included by'],
    ['applications', 'Applications'],
    ['file', 'File'],
    ['line', 'Line'],
  ],
  run({ index }) {
    const model = temenosModel(index);
    const count = new Map();
    for (const r of model.routines) count.set(r.routine, (count.get(r.routine) || 0) + 1);
    return model.routines.map((r) => {
      const calls = model.calls(r.path);
      const internal = calls.filter((e) => e.to).length;
      const users = [...model.callers(r.path), ...model.includers(r.path)];
      const duplicate = count.get(r.routine) > 1;
      return {
        severity: duplicate ? 'medium' : 'info',
        title: duplicate
          ? `${r.routine} is defined in ${count.get(r.routine)} files`
          : `${r.type} ${r.routine}`,
        routine: r.routine,
        type: r.type,
        calls: `${internal} in repository · ${calls.length - internal} core/external`,
        callers: list([...new Set(users.map((e) => routineOf(model, e.from)))]),
        applications: list([...new Set(r.applications.map((a) => a.name))]),
        file: r.path,
        line: r.line,
      };
    });
  },
});

const applicationsAnalyzer = defineAnalyzer({
  id: 'temenos-applications',
  name: 'Temenos Applications',
  category: 'Temenos',
  description:
    'T24 applications (files) used by the routines — read, written, or only their layout ($INSERT I_F.*) — from F.READ/F.WRITE, OPF, READ/WRITE, file names and the TAFJ table API.',
  scope: 'index',
  appliesTo: hasTemenos,
  columns: [
    ['application', 'Application'],
    ['writers', 'Written by'],
    ['readers', 'Read by'],
    ['others', 'Layout / other use'],
    ['file', 'First use'],
    ['line', 'Line'],
  ],
  run({ index }) {
    const apps = new Map();
    for (const r of temenosModel(index).routines)
      for (const a of r.applications) {
        if (!apps.has(a.name))
          apps.set(a.name, { read: new Set(), write: new Set(), other: new Set(), first: null });
        const app = apps.get(a.name);
        app[a.access === 'read' || a.access === 'write' ? a.access : 'other'].add(r.routine);
        app.first ||= { file: r.path, line: a.line };
      }
    return [...apps]
      .sort(([, a], [, b]) => b.write.size - a.write.size || b.read.size - a.read.size)
      .map(([name, app]) => ({
        severity: 'info',
        title: `${name}: written by ${app.write.size}, read by ${app.read.size}`,
        application: name,
        writers: list([...app.write]),
        readers: list([...app.read]),
        others: list([...app.other].filter((r) => !app.read.has(r) && !app.write.has(r))),
        ...app.first,
      }));
  },
});

const servicesAnalyzer = defineAnalyzer({
  id: 'temenos-services',
  name: 'Temenos Services',
  category: 'Temenos',
  description:
    'Multi-threaded services (COB jobs / TSA services): a record routine NAME with NAME.LOAD, NAME.SELECT and the I_NAME.COMMON insert. Missing parts are flagged.',
  scope: 'index',
  appliesTo: hasTemenos,
  columns: [
    ['service', 'Service'],
    ['parts', 'Routines'],
    ['missing', 'Missing'],
    ['file', 'File'],
    ['line', 'Line'],
  ],
  run({ index }) {
    const model = temenosModel(index);
    const byName = new Map(model.routines.map((r) => [r.routine, r]));
    // A lone NAME.LOAD or NAME.SELECT is common in ordinary code; a service has two of the parts.
    const isService = (base) =>
      [base, base + '.LOAD', base + '.SELECT'].filter((n) => byName.has(n)).length >= 2;
    const services = new Set(
      model.routines
        .map((r) => /^(.+)\.(LOAD|SELECT)$/.exec(r.routine)?.[1])
        .filter((base) => base && isService(base)),
    );
    return [...services].sort().map((base) => {
      const parts = [base, base + '.LOAD', base + '.SELECT', `I_${base}.COMMON`];
      const present = parts.filter((n) => byName.has(n));
      const missing = parts.filter((n) => !byName.has(n));
      const main = byName.get(base) || byName.get(present[0]);
      return {
        severity: !byName.has(base) ? 'medium' : missing.length ? 'low' : 'info',
        title: !byName.has(base)
          ? `Service ${base} has no record routine`
          : `Service ${base}${missing.length ? ' (missing ' + missing.join(', ') + ')' : ''}`,
        service: base,
        parts: present.join(', '),
        missing: missing.join(', '),
        file: main.path,
        line: main.line,
      };
    });
  },
});

const callsAnalyzer = defineAnalyzer({
  id: 'temenos-calls',
  name: 'Core and External Routines',
  category: 'Temenos',
  description:
    'Routines called (CALL / DEFFUN) but not defined in this repository — usually the T24 core API. These are the calls to re-check after a core upgrade.',
  scope: 'index',
  appliesTo: hasTemenos,
  columns: [
    ['routine', 'Routine'],
    ['sites', 'Callers'],
    ['callers', 'Called from'],
    ['file', 'First caller'],
    ['line', 'Line'],
  ],
  run({ index }) {
    const model = temenosModel(index);
    const external = new Map();
    for (const r of model.routines)
      for (const edge of model.calls(r.path))
        if (!edge.to) {
          if (!external.has(edge.module)) external.set(edge.module, []);
          external.get(edge.module).push(edge);
        }
    return [...external]
      .sort(([, a], [, b]) => b.length - a.length)
      .map(([name, edges]) => ({
        severity: 'info',
        title: `CALL ${name} (${edges.length} routine${edges.length === 1 ? '' : 's'})`,
        routine: name,
        sites: edges.length,
        callers: list(edges.map((e) => routineOf(model, e.from))),
        file: edges[0].from,
        line: edges[0].line,
      }));
  },
});

// Java classes that plug into Transact: they import com.temenos.* and extend or implement a type.
const JAVA_CLASS =
  /\bclass\s+(\w+)(?:\s*<[^>{]*>)?(?:\s+extends\s+([\w.]+))?(?:\s+implements\s+([\w.,\s<>]+?))?\s*\{/;

const javaAnalyzer = defineAnalyzer({
  id: 'temenos-java',
  name: 'Temenos Java Links',
  category: 'Temenos',
  description:
    'CALLJ calls from BASIC to Java (resolved to the class file when it is in the repository) and Java classes that extend Temenos (com.temenos.*) APIs, with the routines that call them.',
  scope: 'source',
  appliesTo: hasTemenos,
  columns: [
    ['link', 'Link'],
    ['className', 'Java class'],
    ['method', 'Method / base type'],
    ['routines', 'Routines'],
    ['file', 'File'],
    ['line', 'Line'],
  ],
  async run({ index, readText, lineLocator, signal }) {
    const model = temenosModel(index);
    const findings = [];
    for (const r of model.routines)
      for (const call of r.javaCalls) {
        const edge = model.javaCalls(r.path).find((e) => e.module === call.className);
        findings.push({
          severity: edge?.to ? 'info' : 'low',
          title: `${r.routine} → ${call.className}.${call.method}${edge?.to ? '' : ' (class not in repository)'}`,
          link: 'CALLJ',
          className: call.className,
          method: call.method,
          routines: r.routine,
          target: edge?.to || null,
          file: r.path,
          line: call.line,
        });
      }
    for (const file of index.files) {
      if (signal?.aborted) throw new DOMException('Analysis cancelled', 'AbortError');
      if (file.extension !== '.java') continue;
      const text = await readText(file.path);
      if (!/^\s*import\s+com\.temenos\./m.test(text)) continue;
      const match = JAVA_CLASS.exec(text);
      if (!match || !(match[2] || match[3])) continue;
      const bases = [match[2], ...(match[3] || '').split(',')]
        .map((x) => x?.replace(/<.*$/, '').trim())
        .filter(Boolean);
      const callers = model.javaCallers(file.path).map((e) => routineOf(model, e.from));
      findings.push({
        severity: 'info',
        title: `Java extension ${match[1]} (${bases.join(', ')})`,
        link: 'Java extension',
        className: match[1],
        method: bases.join(', '),
        routines: list([...new Set(callers)]),
        file: file.path,
        line: lineLocator(text)(match.index),
      });
    }
    return findings;
  },
});

// Statement rules match from the start of a line, so commented-out code (* ... / ! ...) is skipped.
const NOT_COMMENT = '^(?![ \\t]*(?:\\*|!|REM\\b))[^\\n]*?';
const practicesAnalyzer = definePatternAnalyzer({
  id: 'temenos-practices',
  name: 'Temenos Coding Practices',
  category: 'Temenos',
  description:
    'Common review points in BASIC routines: direct READ/WRITE instead of F.READ/F.WRITE, EXECUTE, STOP in subroutines, GOTO, terminal output and hard-coded company codes.',
  appliesTo: hasTemenos,
  columns: [
    ['severity', 'Severity'],
    ['title', 'Finding'],
    ['file', 'File'],
    ['line', 'Line'],
    ['text', 'Line text'],
  ],
  files: (file) => !!file.temenos,
  rules: [
    {
      pattern: /^[ \t]*(?:READ[UV]?[ \t]+\S+[ \t]+FROM|WRITE[UV]?[ \t]+\S+[ \t]+(?:ON|TO))[ \t]/m,
      severity: 'medium',
      title: 'Direct READ/WRITE bypasses F.READ/F.WRITE caching and transaction handling',
    },
    {
      pattern: /^[ \t]*(?:EXECUTE|PERFORM)\b/m,
      severity: 'medium',
      title: 'EXECUTE/PERFORM runs a jBASE or shell command',
    },
    {
      pattern: /^[ \t]*(?:STOP|ABORT)\b/m,
      severity: 'medium',
      title: 'STOP/ABORT in a subroutine ends the whole session; use RETURN',
      applies: (file) => file.temenos?.type === 'subroutine',
    },
    {
      pattern: new RegExp(NOT_COMMENT + '(?<![\\w.$%])GO ?TO[ \\t]+[\\w.$%]', 'm'),
      severity: 'low',
      title: 'GOTO; prefer GOSUB with labelled paragraphs',
    },
    {
      pattern: /^[ \t]*CRT\b/m,
      severity: 'low',
      title: 'CRT writes to the terminal; not visible in browser or service sessions',
    },
    {
      pattern: new RegExp(NOT_COMMENT + '(["\'])[A-Z]{2}\\d{7}\\1', 'm'),
      severity: 'low',
      title: 'Hard-coded company code',
    },
  ].map(({ title, ...rule }) => ({
    ...rule,
    finding: (m, { lineText }) => ({ title, text: lineText.trim().slice(0, 240) }),
  })),
});

export const TEMENOS_ANALYZERS = [
  routinesAnalyzer,
  applicationsAnalyzer,
  servicesAnalyzer,
  callsAnalyzer,
  javaAnalyzer,
  practicesAnalyzer,
];

TEMENOS_ANALYZERS.forEach(registerAnalyzer);
