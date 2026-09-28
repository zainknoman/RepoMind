/**
 * AI investigations: turns RepoMind's own analysis — a symbol's transitive impact, or a change's
 * changed symbols, diff, affected items and broken references — into briefing sections and a
 * ranked file list for the grounded context, so the model explains the analysis instead of
 * rediscovering it.
 */
import { lineDiff } from '../lib/diff';
import { estimateTokens } from './repository';
import { changeImpactMarkdown } from './changeImpact';
import { looksSecret, redactSecret } from './analyzers';

const AFFECTED_ROWS = 60;
const CONTEXT_LINES = 3;

const masked = (line) => (looksSecret(line) ? redactSecret(line) : line);

/** Adds lines while they fit in `maxTokens`; returns whether everything fit. */
function fill(out, lines, maxTokens) {
  let used = estimateTokens(out.join('\n'));
  for (const line of lines) {
    const cost = estimateTokens(line + '\n');
    if (used + cost > maxTokens) return false;
    out.push(line);
    used += cost;
  }
  return true;
}

export function impactTask(root) {
  return (
    `Explain what could break if ${root.name} (${root.kind} in ${root.path}) changes. ` +
    'Walk through the affected code from the impact analysis, most certain first; say which items ' +
    'are only possibly affected and why (medium or low confidence, blind spots); suggest what to test.'
  );
}

export function changeTask(title) {
  return (
    `Explain this change (${title}): what it does, based on the diff; what else it could affect, ` +
    'using the change impact analysis; which broken references must be fixed; the risks, calling ' +
    'out uncertain items and blind spots; and what to test.'
  );
}

/** `## Impact analysis` for a `symbolImpact` result. */
export function impactBriefing(result, { maxTokens = 4000 } = {}) {
  const { root, affected, counts, files, blindSpots, truncated } = result;
  const out = [
    '## Impact analysis',
    '',
    'Static analysis by RepoMind: what uses the symbol below, directly or through other code. A ' +
      'chain is only as strong as its weakest link.',
    '',
    `- Changed symbol: ${root.name} (${root.kind}) at ${root.path}:${root.line}`,
    `- Affected: ${affected.length}${truncated ? '+' : ''} items in ${files.length} files ` +
      `(high ${counts.high}, medium ${counts.medium}, low ${counts.low})`,
    '',
  ];
  const rows = affected.length
    ? [
        '| Affected | Uses it at | Level | Confidence |',
        '|---|---|---|---|',
        ...affected
          .slice(0, AFFECTED_ROWS)
          .map(
            (a) =>
              `| ${a.name ? `${a.name} (${a.kind})` : 'module code'} | ${a.via.path}:${a.via.line} | ${a.depth} | ${a.confidence} |`,
          ),
        ...(affected.length > AFFECTED_ROWS
          ? [`| … ${affected.length - AFFECTED_ROWS} more | | | |`]
          : []),
      ]
    : ['Nothing in the index uses this symbol.'];
  const spots = blindSpots.length
    ? ['', '### Blind spots', '', ...blindSpots.map((s) => '- ' + s.message)]
    : [];
  // Blind spots are kept even when the table is cut: they qualify everything above.
  const room = maxTokens - estimateTokens(spots.join('\n'));
  if (!fill(out, rows, room)) out.push('… impact table truncated');
  out.push(...spots);
  return out.join('\n');
}

/** Diff hunks of one change, `+`/`-` lines numbered by new/old line, with secrets masked. */
function fileDiff(change) {
  const split = (text) => (text == null ? [] : text.replace(/\r\n?/g, '\n').split('\n'));
  const ops = lineDiff(split(change.oldText), split(change.newText));
  const changed = ops.map((op) => op.type !== 'same');
  const near = ops.map((_, i) =>
    changed.slice(Math.max(0, i - CONTEXT_LINES), i + CONTEXT_LINES + 1).some(Boolean),
  );
  const lines = [`### ${change.path} (${change.status})`, '```diff'];
  ops.forEach((op, i) => {
    if (!near[i]) {
      if (near[i - 1]) lines.push('@@');
      return;
    }
    if (op.type === 'same') lines.push(`  ${op.ri}| ${masked(op.r)}`);
    if (op.type === 'del' || op.type === 'change') lines.push(`- ${op.li}| ${masked(op.l)}`);
    if (op.type === 'add' || op.type === 'change') lines.push(`+ ${op.ri}| ${masked(op.r)}`);
  });
  lines.push('```');
  return lines;
}

/**
 * `## Change impact` (the change-impact report) and `## Diff` for a `changeImpact` result and the
 * changes it came from. The diff is cut at `maxTokens` with a note, never dropped silently.
 */
export function changeBriefing(
  result,
  changes,
  title,
  { maxTokens = 8000, reportTokens = 4000 } = {},
) {
  const report = changeImpactMarkdown(result, title)
    .split('\n')
    .filter((line) => !line.startsWith('# '))
    .map((line) => (line.startsWith('## ') ? '#' + line : line));
  const impact = ['## Change impact', ''];
  if (!fill(impact, report, reportTokens)) impact.push('… report truncated');

  const diff = [
    '## Diff',
    '',
    '`+ N|` is line N of the new version, `- N|` line N of the old one.',
    '',
  ];
  const shown = changes.filter((c) => !c.skipped);
  let omitted = 0;
  for (const change of shown) {
    if (omitted) {
      omitted++;
      continue;
    }
    const lines = fileDiff(change);
    const before = diff.length;
    if (!fill(diff, lines, maxTokens)) {
      diff.length = before;
      omitted++;
    }
  }
  if (omitted)
    diff.push(
      `… diff truncated: ${omitted} of ${shown.length} changed file${shown.length === 1 ? '' : 's'} not shown (token budget).`,
    );
  return [impact.join('\n'), diff.join('\n')];
}

const uniqueFiles = (items) => {
  const seen = new Map();
  for (const item of items) if (!seen.has(item.path)) seen.set(item.path, item);
  return [...seen.values()];
};

/** Files for an impact investigation: the root's file, then affected files, strongest first. */
export function impactFiles(result) {
  return uniqueFiles([
    { path: result.root.path, reason: `defines ${result.root.name} (impact root)` },
    ...result.affected.map((a) => ({
      path: a.path,
      reason: `affected: uses ${a.via.name} (${a.confidence}, level ${a.depth})`,
    })),
  ]);
}

/** Files for a change investigation: changed, then affected (strongest first), then broken. */
export function changeFiles(result) {
  return uniqueFiles([
    ...result.files
      .filter((f) => f.status !== 'deleted')
      .map((f) => ({ path: f.path, reason: `changed (${f.status})` })),
    ...result.affected.map((a) => ({
      path: a.path,
      reason: `affected via ${a.because.join(', ')} (${a.confidence})`,
    })),
    ...result.broken.map((b) => ({ path: b.path, reason: `broken reference: ${b.reason}` })),
  ]);
}
