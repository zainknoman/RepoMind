export const TOOL_IDS = ['json', 'text', 'base64', 'regex', 'jwt', 'uuid', 'timestamp'];

function decodeBase64Url(segment) {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Runs one developer tool and returns its text output. Errors are returned as "Error: …". */
export function runTool(tool, { input = '', regex = '', regexText = '' } = {}) {
  try {
    switch (tool) {
      case 'json':
        return JSON.stringify(JSON.parse(input), null, 2);
      case 'text':
        return input
          .replace(/[ \t]+/g, ' ')
          .split(/\r?\n/)
          .map((x) => x.trim())
          .filter((x, i, a) => x !== '' || i === 0 || a[i - 1] !== '')
          .join('\n')
          .trim();
      case 'base64': {
        const bytes = new TextEncoder().encode(input);
        return btoa(String.fromCharCode(...bytes));
      }
      case 'uuid':
        return crypto.randomUUID();
      case 'timestamp': {
        if (!input.trim()) return String(Math.floor(Date.now() / 1000));
        const seconds = Number(input.trim());
        if (!Number.isFinite(seconds)) throw new Error('Enter Unix time in seconds.');
        return new Date(seconds * 1000).toISOString();
      }
      case 'jwt': {
        const [header, payload] = input.trim().split('.');
        if (!payload) throw new Error('A JWT has three dot-separated parts.');
        return JSON.stringify(
          {
            header: JSON.parse(decodeBase64Url(header)),
            payload: JSON.parse(decodeBase64Url(payload)),
            note: 'Decoded only. The signature was NOT verified.',
          },
          null,
          2,
        );
      }
      case 'regex': {
        const r = new RegExp(regex, 'g');
        const matches = [...regexText.matchAll(r)].map((x) => ({
          match: x[0],
          index: x.index,
          line: regexText.slice(0, x.index).split(/\r?\n/).length,
        }));
        return JSON.stringify({ count: matches.length, matches }, null, 2);
      }
      default:
        throw new Error('Unknown tool: ' + tool);
    }
  } catch (e) {
    return 'Error: ' + e.message;
  }
}
