import { describe, expect, it } from 'vitest';
import {
  buildEvalQuery,
  buildRoutineSpec,
  createRoutineCreatorState,
  validateRoutineState,
} from '../routineCreatorState';

describe('Routine Creator Phase 2 state', () => {
  it('starts with a useful ACCOUNT routine configuration', () => {
    const state = createRoutineCreatorState();
    expect(state.routineName).toBe('MY.ROUTINE');
    expect(state.tables).toEqual([{ application: 'ACCOUNT', suffix: '' }]);
    expect(state.fields).toEqual([]);
  });

  it('maps UI state to the Phase 1 generator contract', () => {
    const state = createRoutineCreatorState();
    state.routineName = 'ACCOUNT.EXTRACT';
    state.developer = 'Zain';
    state.purpose = 'Extract account data';
    state.tables = [
      { application: 'ACCOUNT', suffix: '' },
      { application: 'CUSTOMER', suffix: '$HIS' },
    ];
    state.fields = [
      { name: 'AC.CUSTOMER', table: 'ACCOUNT', position: '1' },
      { name: 'EB.CUS.NAME.1', table: 'CUSTOMER', position: '' },
    ];
    state.functions = ['Fread', 'Trim'];
    state.concat = true;
    state.clearFields = true;

    expect(buildRoutineSpec(state)).toEqual({
      routineName: 'ACCOUNT.EXTRACT',
      developer: 'Zain',
      purpose: 'Extract account data',
      tables: ['ACCOUNT', 'CUSTOMER$HIS'],
      fields: [
        { name: 'AC.CUSTOMER', table: 'ACCOUNT', position: 1 },
        { name: 'EB.CUS.NAME.1', table: 'CUSTOMER', position: null },
      ],
      functions: ['Fread', 'Trim'],
      concat: true,
      separator: '^',
      clearFields: true,
    });
  });

  it('reports invalid routine names and unverified field warnings', () => {
    const state = createRoutineCreatorState();
    state.routineName = 'BAD NAME';
    state.fields = [{ name: 'AC.CUSTOMER', table: 'ACCOUNT', position: '' }];

    const result = validateRoutineState(state);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Routine name');
    expect(result.warnings[0]).toContain('unverified');
  });

  it('builds an application-aware EVAL query', () => {
    const state = createRoutineCreatorState();
    state.evalQuery = true;
    state.fields = [
      { name: 'AC.CUSTOMER', table: 'ACCOUNT', position: '1' },
      { name: 'AC.CURRENCY', table: 'ACCOUNT', position: '2' },
    ];

    expect(buildEvalQuery(state)).toBe('SELECT FBNK.ACCOUNT SAVING EVAL "CUSTOMER":"^":"CURRENCY"');
  });

  it('allows legacy template mode without application tables', () => {
    const state = createRoutineCreatorState();
    state.tables = [];
    state.template = 'standard-routine';

    expect(validateRoutineState(state).valid).toBe(true);
  });
});
