import { useEffect, useMemo, useRef, useState } from 'react';
import { cp, dl } from '../../lib/text';
import { findMatches, replaceAll, replaceAt } from '../../lib/findReplace';

export function Editor({ sel, text, setText, dirty, save, readOnly = false }) {
  const [find, setFind] = useState(''),
    [rep, setRep] = useState(''),
    [caseSensitive, setCaseSensitive] = useState(false),
    [match, setMatch] = useState(0),
    [navTick, setNavTick] = useState(0),
    ref = useRef();
  const lineCount = useMemo(() => text.split(/\r?\n/).length, [text]);
  const matches = useMemo(
    () => findMatches(text, find, caseSensitive),
    [text, find, caseSensitive],
  );
  const current = matches.length ? Math.min(match, matches.length - 1) : 0;

  // Select the current match only when the user navigates; selecting while typing in Find would move
  // focus into the document and let the next keystroke overwrite the selection.
  useEffect(() => {
    if (!navTick || !ref.current || !matches.length) return;
    const pos = matches[current];
    ref.current.focus();
    ref.current.setSelectionRange(pos, pos + find.length);
  }, [navTick]); // eslint-disable-line react-hooks/exhaustive-deps

  function go(step) {
    if (!matches.length) return;
    setMatch((current + step + matches.length) % matches.length);
    setNavTick((x) => x + 1);
  }
  function replaceCurrent() {
    if (!matches.length) return;
    setText(replaceAt(text, matches[current], find, rep));
  }
  return (
    <section>
      <div className="head">
        <div>
          <h1>
            {sel?.path || 'Editor'} {dirty && <em>● modified</em>}
          </h1>
          <small>{readOnly ? 'Read-only imported repository file.' : 'Local editor with Find, Replace and Replace All.'}</small>
        </div>
        <div className="toolbar-actions">
          <button onClick={() => ref.current?.focus()} disabled={!sel}>
            ✎ Focus editor
          </button>
          <button onClick={() => cp(text, 'File contents copied to clipboard')} disabled={!sel}>
            📋 Copy
          </button>
          <button onClick={() => sel && dl(sel.name, text)} disabled={!sel}>
            ⬇ Download
          </button>
          <button onClick={save} disabled={readOnly || !dirty}>
            💾 Save
          </button>
        </div>
      </div>
      {!sel && (
        <div className="empty">Open a file from Explorer, Search or the Dashboard to edit it.</div>
      )}
      {sel && (
        <>
          <div className="replace">
            <input
              aria-label="Find"
              value={find}
              onChange={(e) => {
                setFind(e.target.value);
                setMatch(0);
              }}
              onKeyDown={(e) => e.key === 'Enter' && go(e.shiftKey ? -1 : 1)}
              placeholder="Find"
            />
            <label className="inline-check">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)}
              />{' '}
              Match case
            </label>
            <button onClick={() => go(-1)}>◀ Previous</button>
            <button onClick={() => go(1)}>Next ▶</button>
            <strong aria-live="polite">
              {matches.length ? current + 1 : 0}/{matches.length}
            </strong>
            <input
              aria-label="Replace with"
              value={rep}
              onChange={(e) => setRep(e.target.value)}
              placeholder="Replace with"
            />
            <button onClick={replaceCurrent} disabled={!matches.length}>
              Replace
            </button>
            <button
              onClick={() => setText(replaceAll(text, find, rep, caseSensitive))}
              disabled={readOnly || !matches.length}
            >
              Replace All
            </button>
          </div>
          <div className="editor">
            <pre aria-hidden="true">
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </pre>
            <textarea
              ref={ref}
              aria-label={'Contents of ' + sel.path}
              spellCheck="false"
              value={text}
              onChange={(e) => setText(e.target.value)}
              readOnly={readOnly}
            />
          </div>
        </>
      )}
    </section>
  );
}
