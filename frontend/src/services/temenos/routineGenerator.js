import { getApplication, normalizeTableSpec } from './routineCatalog';
import { getRoutineSnippet, ROUTINE_SNIPPETS_BY_ID } from './routineSnippets';
import { getRoutineTemplate } from './routineTemplates';

const valueOf = (value) => String(value ?? '').trim();

function uniqueBy(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const keyValue = key(item);
    if (seen.has(keyValue)) return false;
    seen.add(keyValue);
    return true;
  });
}

function normalizeTables(tables) {
  return uniqueBy(
    (Array.isArray(tables) ? tables : [tables])
      .map(normalizeTableSpec)
      .filter(Boolean),
    (item) => item.table,
  );
}

function inferApplication(fieldName, tables) {
  const name = valueOf(fieldName);
  const matches = tables.filter(({ application }) => application.fieldPrefix && name.startsWith(application.fieldPrefix));
  return matches.length === 1 ? matches[0].application : null;
}

function normalizeFields(fields, tables) {
  return uniqueBy(
    (Array.isArray(fields) ? fields : [fields])
      .map((field) => {
        if (typeof field === 'string') {
          const inferred = inferApplication(field, tables) || tables[0]?.application;
          return { name: valueOf(field), table: inferred?.name || '', position: null };
        }
        if (!field) return null;
        const name = valueOf(field.name || field.field || field.alias);
        const tableName = valueOf(field.table || field.application);
        const inferred = getApplication(tableName) || inferApplication(name, tables) || tables[0]?.application;
        const position = field.position === undefined || field.position === null || field.position === ''
          ? null
          : Number(field.position);
        return { name, table: inferred?.name || tableName, position };
      })
      .filter((field) => field?.name),
    (field) => `${field.table}|${field.name}|${field.position ?? ''}`,
  );
}

function fieldExpression(field) {
  return field.position !== null && Number.isFinite(field.position)
    ? `<${field.position}>`
    : `<${field.name}>`;
}

function fieldVariable(field) {
  return `Y.${field.name}`;
}

function headerLines(spec) {
  const routineName = valueOf(spec.routineName) || 'UNNAMED.ROUTINE';
  const lines = [
    '*-----------------------------------------------------------------------------',
    `*  Developed By          : ${valueOf(spec.developer)}`,
    `*  Purpose               : ${valueOf(spec.purpose)}`,
    '*-----------------------------------------------------------------------------',
    '',
    `    SUBROUTINE ${routineName.toUpperCase()}`,
    '',
    '    $INSERT I_COMMON',
    '    $INSERT I_EQUATE',
  ];
  if (spec.header) lines.push(...String(spec.header).replace(/\r\n?/g, '\n').split('\n'));
  return lines;
}

function layoutLines(tables) {
  const seen = new Set();
  const lines = [];
  for (const { application } of tables) {
    if (!application.hasLayoutInsert || seen.has(application.name)) continue;
    seen.add(application.name);
    lines.push(`    $INSERT I_F.${application.name}`);
  }
  return lines;
}

function initLines(tables) {
  if (!tables.length) return ['    * No application tables selected'];
  return tables.flatMap(({ application, suffix }) => [
    `    FN.${application.alias} = "F.${application.name}${suffix}"`,
    `    F.${application.alias} = ""`,
    `    CALL OPF(FN.${application.alias},F.${application.alias})`,
  ]);
}

function contextualFread(application) {
  return `    CALL F.READ(FN.${application.alias},Y.${application.alias}.ID,${application.recordVar},F.${application.alias},E.${application.alias})`;
}

function contextualFwrite(application) {
  return [
    `    CALL F.WRITE(FN.${application.alias},Y.${application.alias}.ID,${application.recordVar})`,
    `    CALL JOURNAL.UPDATE(Y.${application.alias}.ID)`,
  ];
}

function functionLines(functions, tables) {
  return (Array.isArray(functions) ? functions : []).flatMap((id) => {
    if (id === 'Fread') return tables.length ? tables.map(({ application }) => contextualFread(application)) : [getRoutineSnippet('Fread').content];
    if (id === 'Fwrite') return tables.length ? tables.flatMap(({ application }) => contextualFwrite(application)) : [getRoutineSnippet('Fwrite').content];
    const snippet = typeof id === 'string' ? getRoutineSnippet(id) : null;
    return snippet ? snippet.content.split('\n').map((line) => `    ${line}`) : [];
  });
}

function fieldLines(fields, tables) {
  if (!fields.length) return ['    * No fields selected'];
  return fields.map((field) => {
    const application = getApplication(field.table) || inferApplication(field.name, tables) || tables[0]?.application;
    return `    ${fieldVariable(field)} = ${application?.recordVar || 'R.FILE'}${fieldExpression(field)}`;
  });
}

function concatLines(fields, enabled, separator) {
  if (!enabled || !fields.length) return [];
  const sep = String(separator ?? '');
  return [`    MY.DATA<-1> = ${fields.map(fieldVariable).join(` : '${sep.replaceAll("'", "''")}' : `)}`];
}

function clearLines(fields) {
  return fields.map((field) => `    ${fieldVariable(field)} = ''`);
}

export function generateRoutine(spec = {}) {
  const tables = normalizeTables(spec.tables || []);
  const fields = normalizeFields(spec.fields || [], tables);
  return [
    ...headerLines(spec),
    '',
    ...layoutLines(tables),
    '* $INSERT I_ENQUIRY.COMMON',
    '',
    '    GOSUB INIT',
    '    GOSUB PROCESS',
    '',
    '    RETURN',
    '',
    '********',
    'INIT:',
    '********',
    '',
    ...initLines(tables),
    '',
    '    RETURN',
    '',
    '***************',
    'PROCESS:',
    '***************',
    '',
    ...functionLines(spec.functions, tables),
    ...fieldLines(fields, tables),
    ...concatLines(fields, Boolean(spec.concat), spec.separator ?? '^'),
    ...clearLines(fields),
    '',
    '    RETURN',
    '',
    'END',
  ].join('\n');
}

export function generatePreset(id, routineName) {
  const template = getRoutineTemplate(id);
  if (!template) return '';
  const name = valueOf(routineName);
  return template.content.replace(/(\bSUBROUTINE\s*)[^\s\r\n]*/i, `$1${name || 'NEW.ROUTINE'}`);
}

function stripExactPrefix(field, application) {
  const name = valueOf(field);
  const prefixes = [application.fieldPrefix, application.alias + '.', application.name + '.'].filter(Boolean);
  for (const prefix of prefixes) {
    if (name.startsWith(prefix)) return name.slice(prefix.length);
  }
  return name;
}

export function generateEvalQuery(table, fields = [], separator = '^') {
  const normalized = normalizeTableSpec(table);
  if (!normalized) return '';
  const values = (Array.isArray(fields) ? fields : [fields])
    .map((field) => (typeof field === 'object' ? field.name || field.field : field))
    .map((field) => stripExactPrefix(field, normalized.application))
    .map(valueOf)
    .filter(Boolean);
  if (!values.length) return `SELECT FBNK.${normalized.table} SAVING EVAL ""`;
  const sep = String(separator ?? '');
  const expression = values.map((v) => `"${v.replaceAll('"','""')}"`).join(`:"${sep.replaceAll('"','""')}":`);
  return `SELECT FBNK.${normalized.table} SAVING EVAL ${expression}`;
}

export function insertSnippet(text, offset, snippetId) {
  const source = String(text ?? '');
  const snippet = ROUTINE_SNIPPETS_BY_ID[snippetId];
  if (!snippet) return { text: source, inserted: false, error: `Unknown snippet: ${snippetId}` };
  if (!Number.isInteger(offset) || offset < 0 || offset > source.length) {
    return { text: source, inserted: false, error: 'Invalid insertion offset' };
  }
  return { text: source.slice(0, offset) + snippet.content + source.slice(offset), inserted: true, error: null };
}
