import { getApplication, normalizeTableSpec, ROUTINE_APPLICATIONS } from './routineCatalog';
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
    (Array.isArray(tables) ? tables : [tables]).map(normalizeTableSpec).filter(Boolean),
    (item) => item.table,
  );
}

function inferApplication(fieldName, tables) {
  const name = valueOf(fieldName);
  const matches = tables
    .filter(
      ({ application }) => application.fieldPrefix && name.startsWith(application.fieldPrefix),
    )
    .sort(
      (left, right) => right.application.fieldPrefix.length - left.application.fieldPrefix.length,
    );

  return matches[0]?.application || null;
}

function normalizeFields(fields, tables) {
  return uniqueBy(
    (Array.isArray(fields) ? fields : [fields])
      .map((field) => {
        if (typeof field === 'string') {
          const inferred = inferApplication(field, tables) || tables[0]?.application;
          return {
            name: valueOf(field),
            table: inferred?.name || '',
            position: null,
            verified: false,
          };
        }

        if (!field) return null;

        const name = valueOf(field.name || field.field || field.alias);
        const tableName = valueOf(field.table || field.application);
        const inferred =
          getApplication(tableName) || inferApplication(name, tables) || tables[0]?.application;
        const numericPosition =
          field.position === undefined || field.position === null || field.position === ''
            ? null
            : Number(field.position);
        const position =
          Number.isInteger(numericPosition) && numericPosition > 0 ? numericPosition : null;

        return {
          name,
          table: inferred?.name || tableName,
          position,
          verified: position !== null,
        };
      })
      .filter((field) => field?.name),
    (field) => field.table + '|' + field.name + '|' + (field.position ?? ''),
  );
}

function fieldExpression(field) {
  return field.verified && Number.isInteger(field.position) && field.position > 0
    ? '<' + field.position + '>'
    : null;
}

function fieldVariable(field) {
  return 'Y.' + field.name;
}

function headerLines(spec) {
  const routineName = valueOf(spec.routineName) || 'UNNAMED.ROUTINE';
  const lines = [
    '*-----------------------------------------------------------------------------',
    '*  Developed By          : ' + valueOf(spec.developer),
    '*  Purpose               : ' + valueOf(spec.purpose),
    '*-----------------------------------------------------------------------------',
    '',
    '    SUBROUTINE ' + routineName.toUpperCase(),
    '',
    '    $INSERT I_COMMON',
    '    $INSERT I_EQUATE',
  ];

  if (spec.header) {
    lines.push(...String(spec.header).replace(/\r\n?/g, '\n').split('\n'));
  }

  return lines;
}

function layoutLines(tables) {
  const seen = new Set();
  const lines = [];

  for (const { application } of tables) {
    if (!application.hasLayoutInsert || seen.has(application.name)) continue;
    seen.add(application.name);
    lines.push('    $INSERT I_F.' + application.name);
  }

  return lines;
}

function initLines(tables) {
  if (!tables.length) return ['    * No application tables selected'];

  return tables.flatMap(({ application, suffix }) => [
    '    ' + application.fileNameVariable + ' = "F.' + application.name + suffix + '"',
    '    ' + application.fileVariable + ' = ""',
    '    CALL OPF(' + application.fileNameVariable + ',' + application.fileVariable + ')',
  ]);
}

function contextualFread(application) {
  return (
    '    CALL F.READ(' +
    application.fileNameVariable +
    ',' +
    application.idVariable +
    ',' +
    application.recordVar +
    ',' +
    application.fileVariable +
    ',' +
    application.errorVariable +
    ')'
  );
}

function contextualFwrite(application) {
  return [
    '    CALL F.WRITE(' +
      application.fileNameVariable +
      ',' +
      application.idVariable +
      ',' +
      application.recordVar +
      ')',
    '    CALL JOURNAL.UPDATE(' + application.idVariable + ')',
  ];
}

function functionLines(functions, tables) {
  return (Array.isArray(functions) ? functions : []).flatMap((id) => {
    if (id === 'Fread') {
      return tables.length
        ? tables.map(({ application }) => contextualFread(application))
        : [getRoutineSnippet('Fread').content];
    }

    if (id === 'Fwrite') {
      return tables.length
        ? tables.flatMap(({ application }) => contextualFwrite(application))
        : [getRoutineSnippet('Fwrite').content];
    }

    const snippet = typeof id === 'string' ? getRoutineSnippet(id) : null;
    return snippet ? snippet.content.split('\n').map((line) => '    ' + line) : [];
  });
}

function fieldLines(fields, tables) {
  if (!fields.length) return ['    * No fields selected'];

  return fields.flatMap((field) => {
    const application =
      getApplication(field.table) || inferApplication(field.name, tables) || tables[0]?.application;
    const expression = fieldExpression(field);

    if (!expression) {
      return [
        '    * Field position not verified: ' +
          field.name +
          '. Verify the application schema before generating field access.',
      ];
    }

    return [
      '    ' + fieldVariable(field) + ' = ' + (application?.recordVar || 'R.FILE') + expression,
    ];
  });
}

function generatedFields(fields) {
  return fields.filter((field) => fieldExpression(field));
}

function concatLines(fields, enabled, separator) {
  const selected = generatedFields(fields);
  if (!enabled || !selected.length) return [];

  const sep = String(separator ?? '');
  return [
    '    MY.DATA<-1> = ' +
      selected.map(fieldVariable).join(" : '" + sep.replaceAll("'", "''") + "' : "),
  ];
}

function clearLines(fields, enabled) {
  if (!enabled) return [];
  return generatedFields(fields).map((field) => '    ' + fieldVariable(field) + " = ''");
}

function replaceRoutineDeclaration(content, routineName) {
  const name = valueOf(routineName) || 'NEW.ROUTINE';
  return content.replace(/^([ \t]*SUBROUTINE)(?:[ \t]+[^\r\n]*)?[ \t]*$/gim, '$1 ' + name);
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
    ...clearLines(fields, Boolean(spec.clearFields)),
    '',
    '    RETURN',
    '',
    'END',
  ].join('\n');
}

export function generatePreset(id, routineName) {
  const template = getRoutineTemplate(id);
  if (!template) return '';
  return replaceRoutineDeclaration(template.content, routineName);
}

function stripExactPrefix(field, application) {
  const name = valueOf(field);
  const matchingApplication = Object.values(ROUTINE_APPLICATIONS)
    .filter(({ fieldPrefix }) => fieldPrefix && name.startsWith(fieldPrefix))
    .sort((left, right) => right.fieldPrefix.length - left.fieldPrefix.length)[0];

  if (matchingApplication && matchingApplication.name !== application.name) return name;

  const prefixes = [
    application.fieldPrefix,
    application.alias ? application.alias + '.' : '',
    application.name + '.',
  ].filter(Boolean);

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

  if (!values.length) return 'SELECT FBNK.' + normalized.table + ' SAVING EVAL ""';

  const sep = String(separator ?? '');
  const expression = values
    .map((value) => '"' + value.replaceAll('"', '""') + '"')
    .join(':"' + sep.replaceAll('"', '""') + '":');

  return 'SELECT FBNK.' + normalized.table + ' SAVING EVAL ' + expression;
}

export function insertSnippet(text, offset, snippetId) {
  const source = String(text ?? '');
  const snippet = ROUTINE_SNIPPETS_BY_ID[snippetId];

  if (!snippet) {
    return { text: source, inserted: false, error: 'Unknown snippet: ' + snippetId };
  }

  if (!Number.isInteger(offset) || offset < 0 || offset > source.length) {
    return { text: source, inserted: false, error: 'Invalid insertion offset' };
  }

  return {
    text: source.slice(0, offset) + snippet.content + source.slice(offset),
    inserted: true,
    error: null,
  };
}
