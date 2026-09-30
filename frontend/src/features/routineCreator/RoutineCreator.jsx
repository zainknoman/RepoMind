import { useMemo, useState } from 'react';
import { cp, dl } from '../../lib/text';
import { generatePreset, generateRoutine } from '../../services/temenos/routineGenerator';
import { ROUTINE_APPLICATIONS, TABLE_SUFFIXES } from '../../services/temenos/routineCatalog';
import { ROUTINE_SNIPPETS } from '../../services/temenos/routineSnippets';
import { ROUTINE_TEMPLATES } from '../../services/temenos/routineTemplates';
import {
  buildEvalQuery,
  buildRoutineSpec,
  createRoutineCreatorState,
  validateRoutineState,
} from './routineCreatorState';

const APPLICATIONS = Object.keys(ROUTINE_APPLICATIONS);

function updateAt(items, index, patch) {
  return items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
}

export function RoutineCreator() {
  const [state, setState] = useState(createRoutineCreatorState);
  const [showValidation, setShowValidation] = useState(false);

  const spec = useMemo(() => buildRoutineSpec(state), [state]);
  const validation = useMemo(() => validateRoutineState(state), [state]);
  const output = useMemo(
    () =>
      state.template
        ? generatePreset(state.template, state.routineName)
        : generateRoutine(spec),
    [spec, state.routineName, state.template],
  );
  const evalQuery = useMemo(() => buildEvalQuery(state), [state]);
  const selectedTemplate = ROUTINE_TEMPLATES.find((template) => template.id === state.template);

  function patch(patchValue) {
    setState((current) => ({ ...current, ...patchValue }));
  }

  function addTable() {
    patch({ tables: [...state.tables, { application: 'ACCOUNT', suffix: '' }] });
  }

  function removeTable(index) {
    patch({ tables: state.tables.filter((_, itemIndex) => itemIndex !== index) });
  }

  function addField() {
    patch({
      fields: [
        ...state.fields,
        {
          name: '',
          table: state.tables[0]?.application || 'ACCOUNT',
          position: '',
        },
      ],
    });
  }

  function removeField(index) {
    patch({ fields: state.fields.filter((_, itemIndex) => itemIndex !== index) });
  }

  function reset() {
    setState(createRoutineCreatorState());
    setShowValidation(false);
  }

  const generatedName = (state.routineName || 'MY.ROUTINE').trim() || 'MY.ROUTINE';

  return (
    <section className="routine-creator">
      <div className="routine-creator-hero">
        <div>
          <span className="eyebrow">Temenos · Routine Creator</span>
          <h1>Routine Creator</h1>
          <p>
            Build a legacy T24/Infobasic routine from the Phase 1 generator. Field positions remain
            explicit; RepoMind does not invent schema metadata.
          </p>
        </div>
        <div className="routine-creator-actions">
          <button onClick={() => setShowValidation(true)}>Validate</button>
          <button onClick={reset}>Reset</button>
          <button
            className="primary"
            onClick={() => cp(output, 'Routine copied to clipboard')}
            disabled={!output}
          >
            📋 Copy
          </button>
          <button onClick={() => dl(generatedName + '.b', output)} disabled={!output}>
            ⬇ Download
          </button>
        </div>
      </div>

      {showValidation && (
        <div
          className={validation.valid ? 'routine-validation valid' : 'routine-validation invalid'}
          role="status"
        >
          <strong>{validation.valid ? '✓ Configuration valid' : 'Configuration needs attention'}</strong>
          {validation.errors.map((message) => (
            <div key={message}>{message}</div>
          ))}
          {validation.warnings.map((message) => (
            <div key={message} className="muted">
              {message}
            </div>
          ))}
        </div>
      )}

      <div className="routine-creator-grid">
        <div className="routine-creator-form">
          <section className="routine-card">
            <div className="routine-card-title">
              <div>
                <h2>Routine identity</h2>
                <small>Name and developer metadata used by the generated header.</small>
              </div>
            </div>
            <div className="routine-form-grid">
              <label>
                Routine name
                <input
                  value={state.routineName}
                  onChange={(event) => patch({ routineName: event.target.value })}
                  placeholder="MY.ROUTINE"
                />
              </label>
              <label>
                Developer
                <input
                  value={state.developer}
                  onChange={(event) => patch({ developer: event.target.value })}
                  placeholder="Developer name"
                />
              </label>
              <label className="wide">
                Purpose
                <input
                  value={state.purpose}
                  onChange={(event) => patch({ purpose: event.target.value })}
                  placeholder="Purpose of the routine"
                />
              </label>
            </div>
          </section>

          <section className="routine-card">
            <div className="routine-card-title">
              <div>
                <h2>Application tables</h2>
                <small>Select application files and optional $HIS / $NAU suffixes.</small>
              </div>
              <button onClick={addTable}>+ Table</button>
            </div>
            <div className="routine-list">
              {state.tables.map((table, index) => (
                <div className="routine-row" key={index}>
                  <select
                    aria-label={'Application table ' + (index + 1)}
                    value={table.application}
                    onChange={(event) =>
                      patch({
                        tables: updateAt(state.tables, index, {
                          application: event.target.value,
                        }),
                      })
                    }
                  >
                    {APPLICATIONS.map((application) => (
                      <option key={application} value={application}>
                        {application}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={'Table suffix ' + (index + 1)}
                    value={table.suffix}
                    onChange={(event) =>
                      patch({
                        tables: updateAt(state.tables, index, { suffix: event.target.value }),
                      })
                    }
                  >
                    {TABLE_SUFFIXES.map((suffix) => (
                      <option key={suffix || 'base'} value={suffix}>
                        {suffix || 'Base'}
                      </option>
                    ))}
                  </select>
                  <button
                    aria-label={'Remove table ' + (index + 1)}
                    onClick={() => removeTable(index)}
                    disabled={state.tables.length === 1}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="routine-card">
            <div className="routine-card-title">
              <div>
                <h2>Fields</h2>
                <small>
                  Positions are optional. Unverified fields are kept as comments instead of invalid
                  BASIC expressions.
                </small>
              </div>
              <button onClick={addField}>+ Field</button>
            </div>
            {state.fields.length === 0 ? (
              <p className="muted">No fields selected. Add fields when the record layout is known.</p>
            ) : (
              <div className="routine-list">
                {state.fields.map((field, index) => (
                  <div className="routine-row routine-field-row" key={index}>
                    <input
                      aria-label={'Field name ' + (index + 1)}
                      value={field.name}
                      onChange={(event) =>
                        patch({
                          fields: updateAt(state.fields, index, { name: event.target.value }),
                        })
                      }
                      placeholder="AC.CUSTOMER"
                    />
                    <select
                      aria-label={'Field table ' + (index + 1)}
                      value={field.table}
                      onChange={(event) =>
                        patch({
                          fields: updateAt(state.fields, index, { table: event.target.value }),
                        })
                      }
                    >
                      {APPLICATIONS.map((application) => (
                        <option key={application} value={application}>
                          {application}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={'Field position ' + (index + 1)}
                      type="number"
                      min="1"
                      value={field.position}
                      onChange={(event) =>
                        patch({
                          fields: updateAt(state.fields, index, { position: event.target.value }),
                        })
                      }
                      placeholder="Position"
                    />
                    <button
                      aria-label={'Remove field ' + (index + 1)}
                      onClick={() => removeField(index)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="routine-card">
            <div className="routine-card-title">
              <div>
                <h2>Functions and snippets</h2>
                <small>
                  Selected snippets are inserted into PROCESS. F.READ/F.WRITE use the selected
                  application context.
                </small>
              </div>
            </div>
            <div className="routine-snippet-grid">
              {ROUTINE_SNIPPETS.map((snippet) => (
                <label className="routine-check" key={snippet.id} title={snippet.description}>
                  <input
                    type="checkbox"
                    checked={state.functions.includes(snippet.id)}
                    onChange={(event) =>
                      patch({
                        functions: event.target.checked
                          ? [...state.functions, snippet.id]
                          : state.functions.filter((id) => id !== snippet.id),
                      })
                    }
                  />
                  <span>
                    <b>{snippet.name}</b>
                    <small>{snippet.description}</small>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="routine-card">
            <div className="routine-card-title">
              <div>
                <h2>Generation options</h2>
                <small>These options map directly to the Phase 1 generator contract.</small>
              </div>
            </div>
            <div className="routine-option-grid">
              <label className="routine-check compact">
                <input
                  type="checkbox"
                  checked={state.concat}
                  onChange={(event) => patch({ concat: event.target.checked })}
                />
                <span>
                  <b>Concatenate selected fields</b>
                  <small>Build MY.DATA from verified field values.</small>
                </span>
              </label>
              <label className="routine-check compact">
                <input
                  type="checkbox"
                  checked={state.clearFields}
                  onChange={(event) => patch({ clearFields: event.target.checked })}
                />
                <span>
                  <b>Clear selected fields</b>
                  <small>Opt-in field clearing after extraction.</small>
                </span>
              </label>
              <label>
                Separator
                <input
                  value={state.separator}
                  maxLength="8"
                  onChange={(event) => patch({ separator: event.target.value })}
                  disabled={!state.concat}
                />
              </label>
            </div>
          </section>

          <section className="routine-card">
            <div className="routine-card-title">
              <div>
                <h2>Legacy template</h2>
                <small>
                  Recovered templates are reference presets and do not change the generator
                  contract.
                </small>
              </div>
            </div>
            <div className="routine-template-picker">
              <select
                value={state.template}
                onChange={(event) => patch({ template: event.target.value })}
              >
                <option value="">Generated routine</option>
                {ROUTINE_TEMPLATES.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
              {selectedTemplate && <p className="muted">{selectedTemplate.description}</p>}
            </div>
          </section>

          <section className="routine-card">
            <div className="routine-card-title">
              <div>
                <h2>EVAL query helper</h2>
                <small>
                  Build an application-aware SELECT ... SAVING EVAL statement from selected fields.
                </small>
              </div>
            </div>
            <label className="routine-check compact">
              <input
                type="checkbox"
                checked={state.evalQuery}
                onChange={(event) => patch({ evalQuery: event.target.checked })}
              />
              <span>
                <b>Generate EVAL query</b>
                <small>
                  Uses the first selected application table and strips only its own field prefix.
                </small>
              </span>
            </label>
            {state.evalQuery && (
              <input
                className="routine-eval-separator"
                aria-label="EVAL separator"
                value={state.evalSeparator}
                maxLength="8"
                onChange={(event) => patch({ evalSeparator: event.target.value })}
                placeholder="^"
              />
            )}
            {evalQuery && <pre className="routine-query">{evalQuery}</pre>}
          </section>
        </div>

        <aside className="routine-preview-card">
          <div className="routine-preview-head">
            <div>
              <span className="eyebrow">Live output</span>
              <h2>{generatedName}.b</h2>
            </div>
            <span className={validation.valid ? 'routine-status ok' : 'routine-status warn'}>
              {validation.valid ? 'Ready' : 'Needs attention'}
            </span>
          </div>
          <textarea className="routine-output" value={output} readOnly spellCheck={false} />
          <div className="routine-preview-foot">
            <span>
              {state.template ? 'Legacy preset' : 'Phase 1 generator'} · {output.split('\n').length}{' '}
              lines
            </span>
            {validation.warnings.length > 0 && <span>{validation.warnings.length} warning(s)</span>}
          </div>
        </aside>
      </div>
    </section>
  );
}

export default RoutineCreator;
