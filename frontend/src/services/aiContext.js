// Grounded repository context for AI: which files to include for a question, what the model is told
// about the repository, and a check of the answer's file:line citations against the index.
import { estimateTokens, findDependencies, findDependents } from './repository';
import { fileCoupling } from './health';
import { SEVERITIES, createSourceReader, looksSecret, redactSecret } from './analyzers';
import { coverageGaps } from './coverage';

export const TOKEN_BUDGETS = [8000, 16000, 32000, 64000, 128000];
export const DEFAULT_BUDGET = 32000;

// Instructions sent as the system message (and prepended when a prompt is copied or exported).
export const GROUNDING_RULES = `You are RepoMind, a senior software engineer answering questions about one repository.
1. Use only the repository context supplied. If it does not contain the answer, say what is missing and which files you would need. Do not guess.
2. Cite evidence as path:line or path:start-end, using the line numbers shown in the Source section (for example src/app.js:12).
3. Separate observed facts (with citations) from assumptions and recommendations.
4. Never invent files, symbols, APIs or line numbers. The repository map lists the files that exist.
5. Values shown as •••• were redacted from the source; do not try to reconstruct them.
6. Dependency data is incomplete for languages listed under analysis coverage gaps: never conclude from it that nothing uses a file or symbol there.
7. Impact, change impact and diff sections come from RepoMind's static analysis. Each affected item has a confidence: present high as likely, medium and low as possible, and state the listed blind spots as limits of the analysis.`;

const STOPWORDS = new Set(
  (
    'the and for are but not you all any can had her was one our out has have how its may new now ' +
    'see who did get let put say she too use what when where which while with this that these those ' +
    'from into about does code file files function functions method class explain show find list ' +
    'there their them then than will would should could why work works used using make change ' +
    'happen happens called call calls repository repo project each other some also just like only'
  ).split(' '),
);

const APPLICATION_WEIGHT = { write: 12, read: 8, layout: 6, uses: 6 };
const ACCESS_VERB = { write: 'writes', read: 'reads', layout: 'uses the layout of', uses: 'uses' };

/** Lowercase parts of an identifier: `getUserName` / `get_user_name` → get, user, name. */
export const identifierParts = (name) =>
  String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map((x) => x.toLowerCase())
    .filter(Boolean);

/** Search terms in a question: whole identifiers plus their parts, without common words. */
export function questionTerms(question) {
  const terms = new Set();
  for (const word of String(question || '').match(/[A-Za-z_$][A-Za-z0-9_$]*/g) || []) {
    const whole = word.toLowerCase();
    if (whole.length >= 3 && !STOPWORDS.has(whole)) terms.add(whole);
    for (const part of identifierParts(word))
      if (part.length >= 3 && !STOPWORDS.has(part)) terms.add(part);
  }
  return [...terms];
}

/**
 * Ranks indexed files by how likely they are to answer `question`: paths named in the question,
 * files defining a symbol it names, T24 routines and applications it names, symbol-name and
 * path-part matches, then graph neighbours of the best of those (callers, importers, imports).
 * Without usable terms, falls back to the most coupled files. Returns [{ path, score, reasons }].
 */
export function rankFilesForQuestion(index, question, { limit = 12 } = {}) {
  const files = index?.files || [];
  const scores = new Map();
  const add = (path, score, reason) => {
    if (!scores.has(path)) scores.set(path, { path, score: 0, reasons: new Map() });
    const entry = scores.get(path);
    entry.score += score;
    if (reason) entry.reasons.set(reason, Math.max(entry.reasons.get(reason) || 0, score));
  };
  // The three strongest reasons, strongest first.
  const reasonsOf = (entry) => ({
    ...entry,
    reasons: [...entry.reasons]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([reason]) => reason),
  });
  const text = String(question || '');
  const words = new Set(text.split(/[\s`'"(),;:?!]+/).map((w) => w.replace(/\.+$/, '')));
  for (const file of files)
    if (text.includes(file.path)) add(file.path, 50, 'named in the question');
    else if (words.has(file.path.split('/').pop())) add(file.path, 30, 'named in the question');

  const terms = new Set(questionTerms(text));
  const named = [];
  if (terms.size) {
    for (const symbol of index.symbols || []) {
      const whole = symbol.name.toLowerCase();
      if (terms.has(whole)) {
        add(symbol.path, 10, 'defines ' + symbol.name);
        named.push(symbol);
        continue;
      }
      const matched = identifierParts(symbol.name).filter((p) => terms.has(p));
      if (matched.length)
        add(symbol.path, Math.min(matched.length * 2, 6), 'symbol ' + symbol.name);
    }
    for (const file of files) {
      const base = (file.path.split('/').pop() || '').replace(/\.[^.]+$/, '');
      if (terms.has(base.toLowerCase())) add(file.path, 8, 'file name');
      else {
        const parts = new Set(file.path.split('/').flatMap(identifierParts));
        const matched = [...terms].filter((t) => parts.has(t));
        if (matched.length) add(file.path, matched.length * 3, 'path: ' + matched.join(', '));
      }
    }
  }
  // T24 routine names (ACCOUNT.VALIDATE) and applications (CUSTOMER, FUNDS.TRANSFER), as written.
  const upper = new Set([
    ...(text.match(/\b[A-Z][A-Z0-9]*(?:\.[A-Z0-9]+)+\b/g) || []),
    ...(text.match(/\b[A-Z][A-Z0-9]{2,}\b/g) || []),
  ]);
  if (upper.size)
    for (const file of files) {
      const t24 = file.temenos;
      if (!t24) continue;
      if (upper.has(t24.routine)) add(file.path, 40, 'routine ' + t24.routine);
      for (const app of t24.applications || [])
        if (upper.has(app.name))
          add(
            file.path,
            APPLICATION_WEIGHT[app.access] || 6,
            `${ACCESS_VERB[app.access] || 'uses'} ${app.name}`,
          );
    }

  // Graph neighbours of the best matches: callers of the symbols the question names, and the
  // files the top matches import or are imported by. They stay below the files they came from.
  const byScore = (a, b) => b.score - a.score || a.path.localeCompare(b.path);
  const seeds = [...scores.values()].sort(byScore).slice(0, 5);
  const neighbour = (path, seed, score, reason) => {
    if (path !== seed.path) add(path, Math.min(score, seed.score / 2), reason);
  };
  for (const symbol of named) {
    const seed = scores.get(symbol.path);
    for (const from of new Set((symbol.references || []).map((r) => r.from)))
      neighbour(from, seed, 4, 'uses ' + symbol.name);
  }
  for (const seed of seeds) {
    for (const path of findDependents(index, seed.path))
      neighbour(path, seed, 3, 'imports ' + seed.path);
    for (const path of findDependencies(index, seed.path))
      neighbour(path, seed, 3, 'imported by ' + seed.path);
  }

  let ranked = [...scores.values()].sort(byScore).map(reasonsOf);
  if (!ranked.length)
    ranked = fileCoupling(index).map((x) => ({
      path: x.path,
      score: 0,
      reasons: [x.score ? 'dependency hotspot' : 'largest file'],
    }));
  return ranked.slice(0, limit);
}

const fenceFor = (text) => (text.includes('```') ? '````' : '```');
const langOf = (path) => (path.match(/\.([A-Za-z0-9]+)$/)?.[1] || '').toLowerCase();

function overviewSection(index, projectName) {
  const languages = Object.entries(index.languages || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => `${name} (${count})`);
  const frameworks = (index.project?.frameworks || []).map((x) => x.name);
  const packages = (index.project?.packages || []).filter((x) => x.known).map((x) => x.package);
  const gaps = coverageGaps(index);
  return [
    '# Repository: ' + (projectName || index.project?.name || 'repository'),
    '',
    `- Files: ${index.stats?.files ?? index.files.length} · symbols: ${index.stats?.symbols ?? index.symbols.length} · internal dependency edges: ${index.stats?.internalEdges ?? index.dependencies.length}`,
    languages.length ? '- Languages: ' + languages.join(', ') : '',
    frameworks.length ? '- Frameworks: ' + frameworks.join(', ') : '',
    packages.length ? '- Key packages: ' + packages.join(', ') : '',
    gaps.length
      ? '- Analysis coverage gaps:\n' + gaps.map((g) => `  - ${g.language}: ${g.note}`).join('\n')
      : '',
  ]
    .filter((x) => x !== '')
    .join('\n');
}

/** Every indexed path with a few of its top-level symbols, within `maxTokens`. */
function repositoryMap(index, maxTokens) {
  const lines = ['## Repository map', ''];
  let used = estimateTokens(lines.join('\n'));
  const files = [...(index.files || [])].sort((a, b) => a.path.localeCompare(b.path));
  let shown = 0;
  for (const file of files) {
    const names = (file.symbols || [])
      .filter((s) => s.scopeStart === undefined && !s.parent)
      .slice(0, 6)
      .map((s) => s.name);
    const line = '- ' + file.path + (names.length ? ' — ' + names.join(', ') : '');
    const cost = estimateTokens(line + '\n');
    if (used + cost > maxTokens) break;
    lines.push(line);
    used += cost;
    shown++;
  }
  if (shown < files.length) lines.push(`- … and ${files.length - shown} more files`);
  return lines.join('\n');
}

/** Analyzer results as a short list: counts per analyzer and the most severe findings. */
function findingsSection(results, maxTokens) {
  const entries = Object.entries(results || {}).filter(([, r]) => r && !r.error);
  if (!entries.length) return '';
  const lines = ['## Analyzer findings', ''];
  let used = 0;
  for (const [id, result] of entries) {
    const findings = [...result.findings].sort(
      (a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity),
    );
    const head = `- ${result.name || id}: ${findings.length} finding${findings.length === 1 ? '' : 's'}`;
    lines.push(head);
    used += estimateTokens(head);
    for (const f of findings.slice(0, 10)) {
      const line = `  - [${f.severity}] ${f.title}${f.file ? ' — ' + f.file + (f.line ? ':' + f.line : '') : ''}`;
      used += estimateTokens(line);
      if (used > maxTokens) break;
      lines.push(line);
    }
    if (used > maxTokens) break;
  }
  return lines.join('\n');
}

/**
 * Builds the context sent to an AI provider:
 *   overview → repository map → analyzer findings → numbered source of the chosen files,
 * all within `budget` tokens. Files are added in the order given (most relevant first); one that
 * does not fit is cut to the lines that do, or left out. Lines that look like credentials are
 * masked before anything leaves the browser.
 *
 * `files`: paths or { path, reason }. `sections`: extra Markdown sections (e.g. an impact
 * briefing) placed before the source; the caller keeps them within budget. Returns { content, tokens, requested (the given paths that
 * exist), files (included, with reason and shown lines), omitted, redactions, budget }.
 */
export async function buildGroundedContext(index, options = {}) {
  if (!index) throw new Error('Build the code index first.');
  const {
    files = [],
    budget = DEFAULT_BUDGET,
    includeDependencies = false,
    includeDependents = false,
    repoMap = true,
    findings = null,
    projectName,
    sections: extraSections = [],
    readText = createSourceReader(index),
  } = options;
  const known = new Map(index.files.map((f) => [f.path, f]));
  const wanted = new Map();
  for (const item of files) {
    const path = typeof item === 'string' ? item : item.path;
    if (known.has(path) && !wanted.has(path))
      wanted.set(path, typeof item === 'string' ? 'selected' : item.reason || 'selected');
  }
  const requested = [...wanted.keys()];
  for (const path of requested) {
    if (includeDependencies)
      for (const dep of findDependencies(index, path))
        if (!wanted.has(dep)) wanted.set(dep, 'imported by ' + path);
    if (includeDependents)
      for (const dep of findDependents(index, path))
        if (!wanted.has(dep)) wanted.set(dep, 'imports ' + path);
  }

  const sections = [overviewSection(index, projectName)];
  if (repoMap) sections.push(repositoryMap(index, Math.round(budget * 0.15)));
  const findingsText = findings ? findingsSection(findings, Math.round(budget * 0.05)) : '';
  if (findingsText) sections.push(findingsText);
  // Briefings from RepoMind's own analysis (impact, change impact, diff), already budgeted.
  for (const section of extraSections) if (section) sections.push(section);
  sections.push('## Source\n\nLine numbers are shown as `N|` at the start of each line.');

  let remaining = budget - estimateTokens(sections.join('\n\n'));
  const included = [],
    omitted = [];
  let redactions = 0;
  for (const [path, reason] of wanted) {
    const file = known.get(path);
    const text = await readText(path);
    const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
    const width = String(lines.length).length;
    const numbered = lines.map((line, i) => {
      if (looksSecret(line)) {
        redactions++;
        line = redactSecret(line);
      }
      return String(i + 1).padStart(width) + '| ' + line;
    });
    const headerFor = (shown) =>
      `### ${path}\n` +
      `Reason: ${reason} · ${file.language || 'text'} · ` +
      (shown < lines.length
        ? `lines 1–${shown} of ${lines.length} (truncated)`
        : `${lines.length} lines`);
    const render = (shown) => {
      const body = numbered.slice(0, shown).join('\n');
      const fence = fenceFor(body);
      return `${headerFor(shown)}\n${fence}${langOf(path)}\n${body}\n${fence}`;
    };
    let shown = lines.length;
    let chunk = render(shown);
    let cost = estimateTokens(chunk) + 1;
    if (cost > remaining) {
      // Keep the lines that fit, if that is a useful amount.
      let fit = 0,
        used = estimateTokens(headerFor(1)) + 8;
      while (fit < numbered.length && used + estimateTokens(numbered[fit] + '\n') <= remaining)
        used += estimateTokens(numbered[fit++] + '\n');
      if (fit < 20) {
        omitted.push({ path, reason, tokens: cost });
        continue;
      }
      shown = fit;
      chunk = render(shown);
      cost = estimateTokens(chunk) + 1;
    }
    sections.push(chunk);
    remaining -= cost;
    included.push({
      path,
      reason,
      tokens: cost,
      lines: lines.length,
      shownLines: shown,
      truncated: shown < lines.length,
    });
  }
  if (omitted.length)
    sections.push(
      '## Not included (token budget)\n\n' + omitted.map((x) => '- ' + x.path).join('\n'),
    );
  const content = sections.join('\n\n');
  return {
    content,
    tokens: estimateTokens(content),
    requested,
    files: included,
    omitted,
    redactions,
    budget,
  };
}

/** The user message: the task, then the grounded context. */
export const formatPrompt = (task, context) =>
  '# RepoMind Task\n\n' +
  (String(task || '').trim() || 'Review this codebase context.') +
  '\n\n' +
  (context || 'No repository context was supplied.');

/** A prompt to paste into another assistant: the grounding rules travel with it. */
export const exportablePrompt = (prompt) =>
  '# Instructions\n\n' + GROUNDING_RULES + '\n\n' + prompt;

const CITATION =
  /(?:^|[\s`'"([])((?:[\w.@-]+\/)*[\w@-][\w.@-]*\.[A-Za-z][A-Za-z0-9]{0,9})(?::(\d+)(?:\s*[-–]\s*(\d+))?)?/g;

/**
 * Checks file references in an AI answer against the index and the context that was sent.
 * status: 'verified' (file and lines were in the context), 'outside-context' (real file, but those
 * lines were not sent), 'bad-line' (past the end of the file), 'unknown-file' (no such path).
 * Bare names without a folder are checked only when they match an indexed file.
 */
export function verifyCitations(answer, index, contextFiles = []) {
  const files = index?.files || [];
  const byPath = new Map(files.map((f) => [f.path, f]));
  const byName = new Map();
  for (const f of files) {
    const name = f.path.split('/').pop();
    byName.set(name, byName.has(name) ? null : f);
  }
  const sent = new Map(contextFiles.map((f) => [f.path, f]));
  const seen = new Set(),
    citations = [];
  for (const m of String(answer || '').matchAll(CITATION)) {
    const [, rawPath, start, end] = m;
    const path = rawPath.replace(/^\.\//, '').replace(/[.,;:]+$/, '');
    const text = path + (start ? ':' + start + (end ? '-' + end : '') : '');
    if (seen.has(text)) continue;
    let file = byPath.get(path);
    if (!file && path.includes('/')) {
      const suffix = files.filter((f) => f.path.endsWith('/' + path));
      file = suffix.length === 1 ? suffix[0] : null;
    }
    if (!file && !path.includes('/')) file = byName.get(path) || null;
    if (!file && !path.includes('/')) continue; // e.g. "Node.js", "e.g."
    seen.add(text);
    const line = start ? Number(start) : null,
      endLine = end ? Number(end) : line;
    let status;
    if (!file) status = 'unknown-file';
    else if (line && (endLine > (file.lines || Infinity) || line < 1)) status = 'bad-line';
    else if (!sent.has(file.path) || (line && endLine > sent.get(file.path).shownLines))
      status = 'outside-context';
    else status = 'verified';
    citations.push({ text, path: file?.path || path, line, endLine, status });
  }
  const counts = { verified: 0, 'outside-context': 0, 'bad-line': 0, 'unknown-file': 0 };
  citations.forEach((c) => counts[c.status]++);
  return { citations, counts };
}
