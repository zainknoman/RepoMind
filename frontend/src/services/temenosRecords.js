/**
 * T24 configuration records kept in a repository: DL.DEFINE package exports (a `DL.D_<package>`
 * header and positional `REC000nn` records, one field per line) and records written as named
 * fields (`FIELD: value`, `FIELD = value`, OFS `FIELD:1:1=value`) in a folder named after the
 * application. Reads which routines a record names, and at which event they run.
 *
 * Field positions differ between releases. Defaults come from the Temenos-Skills references
 * (github.com/zainknoman/Temenos-Skills) and were checked against real R21 records; a
 * repository's own I_F.<APPLICATION> insert overrides them.
 */

const VM = /[\uF8FD\uF8FC]/; // value and sub-value marks as jBASE writes them in UTF-8
const FM = '\uF8FE';

/** Applications whose records name routines, with default field positions and their source. */
export const LAYOUTS = {
  VERSION: {
    source: 'R19 component-analyzer layout (Temenos-Skills), confirmed on R21 records',
    fields: {
      'VALIDATION.RTN': 59,
      'INPUT.ROUTINE': 63,
      'AUTH.ROUTINE': 64,
      'ID.RTN': 74,
      'CHECK.REC.RTN': 75,
      'AFTER.UNAU.RTN': 76,
      'BEFORE.AUTH.RTN': 77,
    },
  },
  ENQUIRY: {
    source: 'R25 I_F.ENQUIRY (Temenos-Skills), confirmed on R21 records',
    fields: { 'FILE.NAME': 2, 'BUILD.ROUTINE': 12, CONVERSION: 18 },
  },
  'EB.API': {
    source: 'R25 I_F.EB.API (Temenos-Skills)',
    fields: { 'SOURCE.TYPE': 3, 'JAVA.METHOD': 4, 'JAVA.CLASS': 5, 'JAVA.PACKAGE': 6 },
  },
  'PGM.FILE': {
    source: 'R25 I_F.PGM.FILE (Temenos-Skills)',
    fields: { TYPE: 1, 'BATCH.JOB': 4 },
  },
  BATCH: {
    source: 'R25 I_F.BATCH (Temenos-Skills)',
    fields: { 'BATCH.ENVIRONMENT': 4, 'JOB.NAME': 6, FREQUENCY: 8 },
  },
  'TSA.SERVICE': {
    source: 'R25 I_F.TSA.SERVICE (Temenos-Skills)',
    fields: { 'WORK.PROFILE': 3, 'SERVICE.CONTROL': 6 },
  },
};

export const CONFIG_APPLICATIONS = new Set(Object.keys(LAYOUTS));

const ROLES = {
  'VALIDATION.RTN': 'validation',
  'INPUT.ROUTINE': 'input',
  'AUTH.ROUTINE': 'authorisation',
  'ID.RTN': 'record id',
  'CHECK.REC.RTN': 'check record',
  'AFTER.UNAU.RTN': 'after unauthorised',
  'BEFORE.AUTH.RTN': 'before authorisation',
  'BUILD.ROUTINE': 'enquiry build',
  CONVERSION: 'enquiry conversion',
};

const ROUTINE_NAME = /^[A-Za-z][\w.$%]*$/;

/** Fields of a positional record: `fields[n - 1]` holds the values of field n. */
export function decodeFields(text) {
  const source = String(text || '');
  const lines = source.includes(FM) ? source.split(FM) : source.split(/\r?\n/);
  return lines.map((line) =>
    line
      .split(VM)
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

/** A DL.DEFINE header's records: field 9 holds the applications, field 10 the record ids. */
export function parseDlHeader(text) {
  const fields = String(text || '').split(/\r?\n/);
  const applications = (fields[8] || '').split(VM);
  const ids = (fields[9] || '').split(VM);
  return applications
    .map((application, i) => ({
      application: application.trim(),
      id: (ids[i] || '').trim(),
      record: 'REC' + String(i + 1).padStart(5, '0'),
    }))
    .filter((r) => r.application && r.id);
}

/** Field positions from an insert's EQU names (`EB.VER.VALIDATION.RTN TO 59`) over the defaults. */
export function layoutFromInsert(application, equates) {
  const layout = { ...(LAYOUTS[application]?.fields || {}) };
  for (const field of Object.keys(layout))
    for (const [name, position] of Object.entries(equates || {}))
      if (name === field || name.endsWith('.' + field)) layout[field] = position;
  return layout;
}

/** `{ FIELD: values }` of a positional record, for the fields of `layout` (`{ FIELD: n }`). */
export function recordValues(fields, layout) {
  const values = {};
  for (const [field, position] of Object.entries(layout))
    if (fields[position - 1]?.length) values[field] = fields[position - 1];
  return values;
}

// One named field per line, or several on one line separated by commas (OFS).
const NAMED = /^\s*([A-Z][A-Z0-9.]*?)(?::\d+(?::\d+)?)?\s*[:=]\s*(.*?)\s*$/;
const NAMED_SPLIT = /,(?=[A-Z][A-Z0-9.]*(?::\d+(?::\d+)?)?\s*[:=])/;

/** `{ FIELD: values }` of a record written as named fields, or null if it has none. */
export function parseNamedRecord(text) {
  const values = {};
  let found = false;
  for (const line of String(text || '').split(/\r?\n/))
    for (const part of line.split(NAMED_SPLIT)) {
      const m = NAMED.exec(part);
      if (!m || !m[2]) continue;
      found = true;
      (values[m[1]] ||= []).push(
        ...m[2]
          .split(VM)
          .map((v) => v.trim())
          .filter(Boolean),
      );
    }
  return found ? values : null;
}

const routineOf = (value) => {
  const name = value.replace(/^@\s*/, '').trim();
  return ROUTINE_NAME.test(name) ? name : null;
};

/**
 * The routines a record names: `[{ routine, role, field, position }]`. `optional` links (the
 * `.LOAD` / `.SELECT` routines of a batch job) are kept only if the routine exists.
 */
export function recordLinks(application, id, values, layout = LAYOUTS[application]?.fields) {
  const links = [];
  const add = (routine, role, field, extra = {}) =>
    routine && links.push({ routine, role, field, position: layout?.[field] ?? 0, ...extra });
  const batchJob = (job, field) => {
    if (!job) return;
    add(job, 'batch job', field);
    add(`${job}.LOAD`, 'batch job load', field, { optional: true });
    add(`${job}.SELECT`, 'batch job select', field, { optional: true });
  };
  if (application === 'VERSION' || application === 'ENQUIRY')
    for (const [field, role] of Object.entries(ROLES))
      for (const value of values[field] || []) {
        // Conversions are routines only when written `@ NAME`; others are operators (L, F, …).
        if (field === 'CONVERSION' && !value.startsWith('@')) continue;
        add(routineOf(value), role, field);
      }
  // EB.API and PGM.FILE records are keyed by the routine they describe.
  if (application === 'EB.API' && (values['SOURCE.TYPE']?.[0] || 'BASIC') !== 'JAVA')
    add(id, 'API', '@ID');
  if (application === 'PGM.FILE' && values.TYPE?.[0] === 'B') batchJob(id, '@ID');
  if (application === 'BATCH')
    for (const job of values['JOB.NAME'] || []) batchJob(routineOf(job), 'JOB.NAME');
  return links;
}

const dirOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const nameOf = (path) => path.split('/').pop();

/**
 * The per-file part of a record file's analysis (`t24record`), kept in the cache so reused files
 * need no re-reading: a DL.DEFINE header's entries, a positional record's fields, or a named
 * record's values.
 */
export function analyzeRecordContent(path, content) {
  const name = nameOf(path);
  if (/^DL\.D_/.test(name)) return { header: parseDlHeader(content) };
  if (/^REC\d{5}$/.test(name)) return { fields: decodeFields(content) };
  const named = parseNamedRecord(content);
  return named ? { named } : { fields: decodeFields(content) };
}

/**
 * Joins record analyses with their DL.DEFINE headers and the repository's I_F inserts:
 * `{ records: [{ path, application, id, package, links }], layouts: { APPLICATION: source } }`.
 * Pure: analyses are read, never changed.
 */
export function buildConfiguration(files) {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const inserts = new Map();
  for (const f of files) {
    const m = /^I_F\.(.+?)(?:\.b)?$/.exec(nameOf(f.path));
    if (m && f.temenos?.layout && !inserts.has(m[1])) inserts.set(m[1], f);
  }
  const layouts = {};
  const layoutFor = (application) => {
    const insert = inserts.get(application);
    layouts[application] = insert
      ? `repository insert ${insert.path}`
      : LAYOUTS[application]?.source || 'none';
    return insert
      ? layoutFromInsert(application, insert.temenos.layout)
      : LAYOUTS[application].fields;
  };
  const records = [];
  const add = (path, application, id, pkg, record) => {
    if (!LAYOUTS[application] || !record) return;
    const layout = layoutFor(application);
    const values = record.named || recordValues(record.fields || [], layout);
    records.push({
      path,
      application,
      id,
      ...(pkg ? { package: pkg } : {}),
      links: recordLinks(application, id, values, layout),
    });
  };
  for (const f of files) {
    const header = f.t24record?.header;
    if (header) {
      const dir = dirOf(f.path);
      const pkg = nameOf(f.path).slice(5);
      for (const entry of header) {
        const path = `${dir}/${entry.record}`;
        add(path, entry.application, entry.id, pkg, byPath.get(path)?.t24record);
      }
    } else if (f.t24record && !/^REC\d{5}$/.test(nameOf(f.path))) {
      // A record in a folder named after its application: VERSION/FUNDS.TRANSFER,ACME.txt.
      const application = nameOf(dirOf(f.path));
      add(
        f.path,
        application,
        nameOf(f.path).replace(/\.(?:txt|rec|ofs|t24r)$/i, ''),
        null,
        f.t24record,
      );
    }
  }
  return { records, layouts };
}
