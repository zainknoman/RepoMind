import { describe, expect, it } from 'vitest';
import { applyTheme, loadTheme, nextTheme, saveTheme } from './theme';

const memory = () => {
  const values = new Map();
  return { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
};

describe('theme', () => {
  it('cycles system → light → dark → system', () => {
    expect([nextTheme('system'), nextTheme('light'), nextTheme('dark')]).toEqual([
      'light',
      'dark',
      'system',
    ]);
  });

  it('remembers a valid choice and falls back to system otherwise', () => {
    const storage = memory();
    expect(loadTheme(storage)).toBe('system');
    saveTheme('dark', storage);
    expect(loadTheme(storage)).toBe('dark');
    storage.setItem('repomind.theme', 'neon');
    expect(loadTheme(storage)).toBe('system');
    const blocked = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(loadTheme(blocked)).toBe('system');
    expect(() => saveTheme('light', blocked)).not.toThrow();
  });

  it('sets data-theme for light and dark and removes it for system', () => {
    const root = { dataset: {} };
    applyTheme('dark', root);
    expect(root.dataset.theme).toBe('dark');
    applyTheme('system', root);
    expect(root.dataset.theme).toBeUndefined();
  });
});
