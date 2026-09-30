import { generateEvalQuery } from '../../services/temenos/routineGenerator';

export const DEFAULT_ROUTINE_STATE = Object.freeze({
  routineName: 'MY.ROUTINE',
  developer: '',
  purpose: '',
  template: '',
  tables: [{ application: 'ACCOUNT', suffix: '' }],
  fields: [],
  functions: [],
  concat: false,
  separator: '^',
  clearFields: false,
  evalQuery: false,
  evalSeparator: '^',
});

export function createRoutineCreatorState() {
  return {
    ...DEFAULT_ROUTINE_STATE,
    tables: DEFAULT_ROUTINE_STATE.tables.map((table) => ({ ...table })),
    fields: [],
    functions: [],
  };
}

export function buildRoutineSpec(state) {
  return {
    routineName: state.routineName,
    developer: state.developer,
    purpose: state.purpose,
    tables: state.tables.map(({ application, suffix }) => application + suffix),
    fields: state.fields.map(({ name, table, position }) => ({
      name,
      table,
      position: position === '' ? null : Number(position),
    })),
    functions: [...state.functions],
    concat: state.concat,
    separator: state.separator,
    clearFields: state.clearFields,
  };
}

export function validateRoutineState(state) {
  const errors = [];
  const warnings = [];
  const routineName = String(state.routineName || '').trim();

  if (!routineName) errors.push('Routine name is required.');
  else if (!/^[A-Za-z][A-Za-z0-9_.]*$/.test(routineName)) {
    errors.push(
      'Routine name must start with a letter and contain only letters, numbers, underscores, or dots.',
    );
  }

  if (!state.template && !state.tables.length) {
    errors.push('Select at least one application table.');
  }

  const unverified = state.fields.filter(
    (field) => !Number.isInteger(Number(field.position)) || Number(field.position) <= 0,
  );
  if (unverified.length) {
    warnings.push(
      unverified.length === 1
        ? '1 field is unverified and will be emitted as a verification comment.'
        : unverified.length +
            ' fields are unverified and will be emitted as verification comments.',
    );
  }

  if (state.clearFields && !state.fields.length) {
    warnings.push('Clear fields is enabled, but no fields are selected.');
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function buildEvalQuery(state) {
  if (!state.evalQuery || !state.tables.length) return '';
  const table = state.tables[0].application + state.tables[0].suffix;
  const fields = state.fields.map((field) => field.name).filter(Boolean);
  return generateEvalQuery(table, fields, state.evalSeparator);
}
