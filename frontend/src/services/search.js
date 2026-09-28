import { esc } from '../lib/text';
import { languageFor } from './repository';

// One search for the whole product: symbols and files from the code index when it exists, plus
// full-text matches read from the files themselves (which works with or without an index).

export const MAX_TEXT_RESULTS = 2000;
const MAX_NAME_RESULTS = 200;
const MAX_LINE_LENGTH = 400;

/**
 * The pattern for a query: literal unless `regex`, case-insensitive unless `caseSensitive`.
 * Throws a SyntaxError for an invalid regular expression.
 */
export function searchPattern(query, { regex = false, caseSensitive = false } = {}, flags = '') {
  return new RegExp(regex ? query : esc(query), (caseSensitive ? '' : 'i') + flags);
}

function nameMatches(items, name, pattern) {
  const out = [];
  for (const item of items) {
    if (!pattern.test(name(item))) continue;
    out.push(item);
    if (out.length >= MAX_NAME_RESULTS) break;
  }
  return out;
}

/**
 * Searches a project. `files` are the project's files (with handles); `index` is the code index or
 * null. Returns { query, options, symbols, files, text, truncated, error }.
 */
export async function searchProject({
  files,
  index,
  query,
  options = {},
  limit = MAX_TEXT_RESULTS,
}) {
  const term = query?.trim() || '';
  const result = { query: term, options, symbols: [], files: [], text: [], truncated: false };
  if (!term) return result;
  let pattern;
  try {
    pattern = searchPattern(term, options);
  } catch (error) {
    return { ...result, error: `Invalid regular expression: ${error.message}` };
  }
  const textFiles = (files || []).filter((f) => f.text);

  if (index) {
    result.symbols = nameMatches(index.symbols || [], (s) => s.name, pattern).map((s) => ({
      name: s.name,
      kind: s.kind,
      path: s.path,
      line: s.line,
      references: s.references?.length || 0,
    }));
  }
  result.files = nameMatches(textFiles, (f) => f.path, pattern).map((f) => ({
    path: f.path,
    language: languageFor(f.ext),
  }));

  outer: for (const file of textFiles) {
    let content;
    try {
      content = await (await file.handle.getFile()).text();
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!pattern.test(lines[i])) continue;
      result.text.push({
        path: file.path,
        line: i + 1,
        text: lines[i].slice(0, MAX_LINE_LENGTH),
        language: languageFor(file.ext),
      });
      if (result.text.length >= limit) {
        result.truncated = true;
        break outer;
      }
    }
  }
  return result;
}
