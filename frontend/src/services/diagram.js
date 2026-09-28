// Mermaid is bundled from npm and loaded on first use, so it adds nothing to the initial page load
// and never reaches out to a CDN.
import { STALE_BUILD_MESSAGE, isStaleBuildError } from '../lib/staleBuild';

let mermaidPromise = null;

export function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid')
      .then(({ default: mermaid }) => {
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default' });
        return mermaid;
      })
      .catch((error) => {
        mermaidPromise = null;
        throw new Error(
          isStaleBuildError(error)
            ? STALE_BUILD_MESSAGE
            : 'Unable to load the Mermaid renderer: ' + error.message,
        );
      });
  }
  return mermaidPromise;
}

export async function renderMermaid(source) {
  if (!source?.trim()) return { svg: '', bindFunctions: null };
  const mermaid = await loadMermaid();
  const id = 'repomind-mermaid-' + Math.random().toString(36).slice(2);
  return mermaid.render(id, source.trim());
}

/** Renders every `.mermaid` block inside `root` in place. */
export async function renderMermaidBlocks(root) {
  const nodes = root ? [...root.querySelectorAll('.mermaid')] : [];
  if (!nodes.length) return;
  const mermaid = await loadMermaid();
  await mermaid.run({ nodes });
}
