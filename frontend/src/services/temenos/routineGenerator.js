import { getApplication, normalizeTableSpec } from './routineCatalog';
import { getRoutineSnippet, ROUTINE_SNIPPETS_BY_ID } from './routineSnippets';
import { getRoutineTemplate } from './routineTemplates';

const text = (value) => String(value ?? '').trim();

function uniqueBy(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
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

function normalizeFields(fields, tables) {
  const defaultTable = tables[0]?.application.name || '';
  return uniqueBy(
    (Array.isArray(fields) ? fields : [fields])
      .map((field) => {
        if (typeof field === 'string') return { name: text(field), table: defaultTable, position: null };
        if (!field) return null;
        return {
          name: text(field.name || field.field || field.alias),
          table: text(field.table || field.application || defaultTable),
          position:
            field.position === undefined || field.position === null || field.position === ''
              ? null
              : Number(field.position),
        };
      })
      .filter((field) => field?.name),
    (field) => `${field.table}|${field.name}|${field.position ?? ''}`,
  );
}

function header(spec) {
  const lines = [
    `* Routine: ${text(spec.routineName) || 'UNNAMED.ROUTINE'}`,
    `* Developer: ${text(spec.developer) || 'Unknown'}`,
    `* Purpose: ${text(spec.purpose) || 'Generated Temenos routine'}`,
  ];
  if (spec.header) lines.push(String(spec.header).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, ''));
  lines.push(`SUBROUTINE ${text(spec.routineName) || 'UNNAMED.ROUTINE'}`, '$INSERT I_COMMON', '$INSERT I_EQUATE');
  return lines;
}

function initLines(tables) {
  if (!tables.length) return ['    * No application tables selected'];
  return tables.flatMap(({ application, suffix }) => [
    `    FN.${application.alias} = 'F.${application.name}${suffix}'`,
    `    F.${application.alias} = ''`,
    `    CALL OPF(FN.${application.alias}, F.${application.alias})`,
  ]);
}

function processReadLines(tables) {
  return tables.map(
    ({ application }) =>
      `    CALL F.READ(FN.${application.alias}, ID.NEW, ${application.recordVar}, F.${application.alias}, ERR)`,
  );
}

function fieldLines(fields, tables) {
  if (!fields.length) return ['    * No fields selected'];
  const byName = new Map(tables.map((table) => [table.application.name, table.application]));
  return fields.map((field) => {
    const application = byName.get(field.table) || tables[0]?.application;
    const position = field.position !== null ? `<${field.position}>` : '';
    return `    ${field.name} = ${application?.recordVar || 'R.FILE'}${position}`;
  });
}

function concatLines(fields, enabled, separator) {
  if (!enabled || !fields.length) return [];
  return [`    CONCAT.VALUE = ${fields.map((field) => field.name).join(` : '${separator}' : `)}`];
}

function clearLines(fields) {
  return fields.map((field) => `    ${field.name} = ''`);
}

function functionLines(functions) {
  return (Array.isArray(functions) ? functions : []).flatMap((id) => {
    const snippet = typeof id === 'string' ? getRoutineSnippet(id) : null;
    return snippet ? snippet.content.split('\n').map((line) => `    ${line}`) : [];
  });
}

export function generateRoutine(spec = {}) {
  const tables = normalizeTables(spec.tables || []);
  const fields = normalizeFields(spec.fields || [], tables);
  const layout = tables
    .filter(({ application }) => application.hasLayoutInsert)
    .map(({ application, suffix }) => `$INSERT I_F.${application.name}${suffix}`);
  return [
    ...header(spec),
    ...layout,
    '* $INSERT I_ENQUIRY.COMMON',
    '',
    'GOSUB INIT',
    'GOSUB PROCESS',
    'RETURN',
    '',
    'INIT:',
    ...initLines(tables),
    'RETURN',
    '',
    'PROCESS:',
    ...functionLines(spec.functions),
    ...processReadLines(tables),
    ...fieldLines(fields, tables),
    ...concatLines(fields, Boolean(spec.concat), spec.separator ?? '^'),
    ...clearLines(fields),
    'RETURN',
    '',
    'END',
  ].join('\n');
}

export function generatePreset(id, routineName) {
  const template = getRoutineTemplate(id);
  return template ? template.content.replaceAll('{{ROUTINE_NAME}}', text(routineName) || 'NEW.ROUTINE') : '';
}

function stripExactPrefix(value, application) {
  const candidates = [
    `${application.fieldPrefix}.`,
    `${application.alias}.`,
    `${application.name}.`,
  ];
  return candidates.find((prefix) => value.startsWith(prefix))
    ? value.slice(candidates.find((prefix) => value.startsWith(prefix)).length)
    : value;
}

export function generateEvalQuery(table, fields = [], separator = '^') {
  const normalized = normalizeTableSpec(table);
  if (!normalized) return '';
  const values = (Array.isArray(fields) ? fields : [fields])
    .map((field) => (typeof field === 'object' ? field.name || field.field : field))
    .map((field) => stripExactPrefix(text(field), normalized.application))
    .filter(Boolean);
  const expression = values.length
    ? values.map((value) => `"${value}"`).join(`:"${separator}":`)
    : '""';
  return `SELECT FBNK.${normalized.table} SAVING EVAL ${expression}`;
}

export function insertSnippet(source, offset, snippetId) {
  const value = String(source ?? '');
  const snippet = ROUTINE_SNIPPETS_BY_ID[snippetId];
  if (!snippet) return { text: value, inserted: false, error: `Unknown snippet: ${snippetId}` };
  if (!Number.isInteger(offset) || offset < 0 || offset > value.length) {
    return { text: value, inserted: false, error: 'Invalid insertion offset' };
  }
  return {
    text: value.slice(0, offset) + snippet.content + value.slice(offset),
    inserted: true,
    error: null,
  };
}
