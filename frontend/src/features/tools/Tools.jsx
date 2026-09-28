import { runTool } from './runTool';
import { toast } from '../../lib/toast';

const DEFS = {
  text: ['🧹', 'Text Cleanup', 'Paste messy text → Run → remove extra spaces and blank lines.'],
  json: ['{}', 'JSON Formatter', 'Paste JSON → Run → format it.'],
  base64: ['🔐', 'Base64', 'Paste text → Run → encode it (UTF-8).'],
  regex: ['🔎', 'Regex', 'Pattern + test text → Run → matches and lines.'],
  jwt: [
    '🎫',
    'JWT Decoder',
    'Paste a JWT → Run → decode header and payload (signature is not verified).',
  ],
  uuid: ['🆔', 'UUID', 'Run → generate a random UUID v4.'],
  timestamp: ['⏱️', 'Timestamp', 'Unix seconds → ISO date, or leave empty for the current time.'],
};

export function Tools({ state, setState }) {
  const { tool, input, regex, regexText, output } = state;
  const set = (patch) => setState((s) => ({ ...s, ...patch }));
  return (
    <section>
      <div className="head">
        <div>
          <h1>Developer Tools</h1>
          <small>Focused developer utilities. Everything runs locally in your browser.</small>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {Object.entries(DEFS).map(([id, [icon, label]]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tool === id}
            className={tool === id ? 'active' : ''}
            onClick={() => set({ tool: id, output: '' })}
          >
            <span aria-hidden="true">{icon}</span> {label}
          </button>
        ))}
      </div>
      {tool === 'regex' ? (
        <div className="tool-grid">
          <div>
            <label>
              Regular Expression
              <input
                value={regex}
                onChange={(e) => set({ regex: e.target.value })}
                placeholder="\b[A-Z][a-z]+\b"
              />
            </label>
            <label>
              Test Text
              <textarea
                value={regexText}
                onChange={(e) => set({ regexText: e.target.value })}
                placeholder={'Hello RepoMind.\nThis Tool Finds Words.'}
              />
            </label>
          </div>
          <label>
            Output
            <textarea value={output} readOnly />
          </label>
        </div>
      ) : (
        <>
          <textarea
            aria-label="Tool input"
            value={input}
            onChange={(e) => set({ input: e.target.value })}
            placeholder={DEFS[tool][2]}
          />
          <textarea aria-label="Tool output" value={output} readOnly />
        </>
      )}
      <div className="tool-run-strip">
        <button onClick={() => set({ input: '', regex: '', regexText: '', output: '' })}>
          🧹 Clear
        </button>
        <button
          className="primary"
          onClick={() => {
            const output = runTool(tool, state);
            set({ output });
            if (output.startsWith('Error: ')) toast.error(output.slice(7));
            else toast.success(DEFS[tool][1] + ' done');
          }}
        >
          ▶ Run
        </button>
      </div>
    </section>
  );
}
