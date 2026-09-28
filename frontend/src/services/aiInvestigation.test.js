import { describe, expect, it } from 'vitest';
import { attachFileHandles, buildRepositoryIndex } from './repository';
import { toWorkerProject } from './indexProject';
import { symbolImpact } from './impact';
import { changeImpact } from './changeImpact';
import { buildGroundedContext, GROUNDING_RULES } from './aiContext';
import {
  changeBriefing,
  changeFiles,
  changeTask,
  impactBriefing,
  impactFiles,
  impactTask,
} from './aiInvestigation';

const FILES = {
  'core.js': 'export function core() {\n  return 1;\n}\n',
  'mid.js': "import { core } from './core';\nexport function mid() {\n  return core();\n}\n",
  'top.js': "import { mid } from './mid';\nexport function top() {\n  return mid();\n}\n",
};

async function indexOf(files = FILES) {
  const project = toWorkerProject(
    'inv',
    Object.entries(files).map(([path, content]) => ({
      path,
      name: path,
      ext: '.' + path.split('.').pop(),
      content,
    })),
  );
  return attachFileHandles(await buildRepositoryIndex(project), project);
}

const modified = (path, oldText, newText) => ({ path, status: 'modified', oldText, newText });

describe('impact investigation', () => {
  it('briefs the impact and lists the root file, then affected files', async () => {
    const index = await indexOf();
    const result = symbolImpact(
      index,
      index.symbols.find((s) => s.name === 'core'),
    );
    const brief = impactBriefing(result);
    expect(brief).toContain('## Impact analysis');
    expect(brief).toContain('- Changed symbol: core (function) at core.js:1');
    expect(brief).toMatch(/\| mid \(function\) \| mid\.js:3 \| 1 \| high \|/);
    expect(brief).toMatch(/\| top \(function\) \| top\.js:3 \| 2 \| high \|/);
    expect(impactFiles(result)).toEqual([
      { path: 'core.js', reason: 'defines core (impact root)' },
      { path: 'mid.js', reason: 'affected: uses core (high, level 1)' },
      { path: 'top.js', reason: 'affected: uses mid (high, level 2)' },
    ]);
    expect(impactTask(result.root)).toContain('core (function in core.js)');
  });

  it('keeps blind spots when the table is cut', async () => {
    const index = await indexOf();
    const result = symbolImpact(
      index,
      index.symbols.find((s) => s.name === 'core'),
    );
    result.blindSpots = [{ kind: 'x', message: 'Something is not analysed.' }];
    const brief = impactBriefing(result, { maxTokens: 90 });
    expect(brief).toContain('… impact table truncated');
    expect(brief).toContain('- Something is not analysed.');
  });
});

describe('change investigation', () => {
  const CHANGE = modified(
    'core.js',
    FILES['core.js'],
    "export function core() {\n  const api_key = 'abcd1234efgh5678ijkl';\n  return 2;\n}\n",
  );

  it('briefs the change impact and a numbered, masked diff', async () => {
    const index = await indexOf();
    const result = changeImpact(index, [CHANGE]);
    const [impact, diff] = changeBriefing(result, [CHANGE], 'Uncommitted changes');
    expect(impact).toMatch(/^## Change impact/);
    expect(impact).toContain('### Changed');
    expect(impact).not.toContain('# Change impact: ');
    expect(diff).toContain('### core.js (modified)');
    expect(diff).toContain('- 2|   return 1;');
    expect(diff).toContain('+ 3|   return 2;');
    expect(diff).toContain('  1| export function core() {');
    expect(diff).not.toContain('abcd1234efgh5678ijkl');
    expect(changeFiles(result).map((f) => f.path)).toEqual(['core.js', 'mid.js', 'top.js']);
    expect(changeFiles(result)[1].reason).toBe('affected via core (high)');
    expect(changeTask('Commit abc')).toContain('Commit abc');
  });

  it('cuts a diff over budget with a note instead of dropping it silently', async () => {
    const index = await indexOf();
    const big = modified(
      'mid.js',
      FILES['mid.js'],
      FILES['mid.js'] + Array.from({ length: 400 }, (_, i) => `// line ${i}`).join('\n'),
    );
    const result = changeImpact(index, [CHANGE, big]);
    const [, diff] = changeBriefing(result, [CHANGE, big], 'x', { maxTokens: 400 });
    expect(diff).toContain('### core.js (modified)');
    expect(diff).not.toContain('### mid.js');
    expect(diff).toContain('… diff truncated: 1 of 2 changed files not shown (token budget).');
  });

  it('places briefings before the source in the grounded context', async () => {
    const index = await indexOf();
    const result = changeImpact(index, [CHANGE]);
    const context = await buildGroundedContext(index, {
      files: changeFiles(result),
      sections: changeBriefing(result, [CHANGE], 'Uncommitted changes'),
      repoMap: false,
    });
    const at = (text) => context.content.indexOf(text);
    expect(at('## Change impact')).toBeGreaterThan(0);
    expect(at('## Diff')).toBeGreaterThan(at('## Change impact'));
    expect(at('## Source')).toBeGreaterThan(at('## Diff'));
    expect(context.files[0]).toMatchObject({ path: 'core.js', reason: 'changed (modified)' });
    expect(GROUNDING_RULES).toContain('7. Impact, change impact and diff sections');
  });
});
