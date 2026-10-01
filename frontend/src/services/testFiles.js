/**
 * Test files by naming convention, and the tests an impact result reaches: what to run after a
 * change.
 */

const TEST_PATTERNS = [
  /\.(?:test|spec)\.[cm]?[jt]sx?$/, // JS/TS: a.test.js, a.spec.tsx
  /(?:^|\/)(?:__tests__|tests?|e2e|spec)\//, // test folders
  /(?:^|\/)test_[^/]+\.py$/, // Python: test_models.py
  /_test\.(?:py|go)$/, // Python / Go: models_test.py, main_test.go
  /(?:^|\/)conftest\.py$/,
  /(?:Test|Tests|IT)\.(?:java|kt)$/, // Java/Kotlin: AppTest.java, AppIT.java
  /(?:^|\/|\.)TEST(?:\.[A-Z0-9]+)*(?:\.b)?$/, // T24: ACCOUNT.VALIDATE.TEST, TEST.ACCOUNT
  /(?:^|\/)TEST\.[^/]+$/,
];

export const isTestFile = (path) => TEST_PATTERNS.some((pattern) => pattern.test(path));

/**
 * Test files among `items` (affected items with `path` and, for change impact, `because`), plus
 * any changed paths that are tests. Returns `[{ path, because }]` sorted by path.
 */
export function affectedTests(items, { changed = [], root = null } = {}) {
  const tests = new Map();
  const add = (path, reasons) => {
    if (!isTestFile(path)) return;
    const entry = tests.get(path) || new Set();
    for (const reason of reasons) entry.add(reason);
    tests.set(path, entry);
  };
  for (const path of changed) add(path, ['changed']);
  for (const item of items) add(item.path, item.because || (root ? [root] : []));
  return [...tests]
    .map(([path, because]) => ({ path, because: [...because].sort() }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
