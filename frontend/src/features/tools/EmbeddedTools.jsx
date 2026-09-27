import { useEffect, useRef, useState } from 'react';
import { BASE_URL } from '../../lib/files';

// Embedded tools run in an opaque-origin sandbox: scripts may run, but they cannot read RepoMind's
// storage (including the AI API key) or navigate the app. They talk to us through repomind-bridge.js.
const SANDBOX = 'allow-scripts allow-downloads allow-modals allow-forms';
export const BRIDGE_KEYS = ['repomind.ofs.config', 'repomind.t24.ofsContext'];
const MAX_VALUE_LENGTH = 1_000_000;

function storageSnapshot() {
  const values = {};
  for (const key of BRIDGE_KEYS) {
    try {
      const v = localStorage.getItem(key);
      if (v !== null) values[key] = v;
    } catch {}
  }
  return values;
}

/** Handles one bridge message. Exported for unit tests. Returns true when the message was accepted. */
export function handleBridgeMessage(
  data,
  { reply, onOpenTool, storage = globalThis.localStorage },
) {
  if (!data || typeof data !== 'object') return false;
  switch (data.type) {
    case 'repomind:bridge-ready':
      reply({ type: 'repomind:storage-snapshot', values: storageSnapshot() });
      return true;
    case 'repomind:storage-set':
      if (!BRIDGE_KEYS.includes(data.key) || typeof data.value !== 'string') return false;
      if (data.value.length > MAX_VALUE_LENGTH) return false;
      storage.setItem(data.key, data.value);
      return true;
    case 'repomind:storage-remove':
      if (!BRIDGE_KEYS.includes(data.key)) return false;
      storage.removeItem(data.key);
      return true;
    case 'repomind:open-tool':
      if (data.tool !== 'ofs') return false;
      onOpenTool?.('ofs');
      return true;
    default:
      return false;
  }
}

function SandboxedTool({ title, file, onOpenTool }) {
  const ref = useRef(null);
  useEffect(() => {
    function onMessage(event) {
      const frame = ref.current?.contentWindow;
      // Only our own sandboxed frame (opaque origin "null") may use the bridge.
      if (!frame || event.source !== frame || event.origin !== 'null') return;
      handleBridgeMessage(event.data, {
        reply: (message) => frame.postMessage(message, '*'),
        onOpenTool,
      });
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onOpenTool]);
  return (
    <div className="embedded-tool">
      <iframe
        ref={ref}
        title={title}
        src={BASE_URL + 'tools/' + file}
        sandbox={SANDBOX}
        allow="clipboard-write"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

export function OFSWorkspace() {
  const [tool, setTool] = useState('ofs');
  return (
    <section className="workspace-category">
      <div className="head">
        <div>
          <h1>📨 Temenos / OFS</h1>
          <small>Temenos OFS Generator and T24 Log Analyzer.</small>
        </div>
      </div>
      <div className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tool === 'ofs'}
          className={tool === 'ofs' ? 'active' : ''}
          onClick={() => setTool('ofs')}
        >
          📨 OFS Generator
        </button>
        <button
          role="tab"
          aria-selected={tool === 'analyzer'}
          className={tool === 'analyzer' ? 'active' : ''}
          onClick={() => setTool('analyzer')}
        >
          📋 T24 Log Analyzer
        </button>
      </div>
      {tool === 'ofs' && <SandboxedTool title="OFS Generator" file="ofsMessageGenNew.html" />}
      {tool === 'analyzer' && (
        <SandboxedTool title="T24 Log Analyzer" file="t24_logMultiFile.html" onOpenTool={setTool} />
      )}
    </section>
  );
}

export function EngineeringWorkspace() {
  return (
    <section>
      <div className="head">
        <div>
          <h1>🧰 Engineering</h1>
          <small>Daily engineering converters and utilities.</small>
        </div>
      </div>
      <SandboxedTool title="Engineering Utilities" file="engineeringUtilities.html" />
    </section>
  );
}
