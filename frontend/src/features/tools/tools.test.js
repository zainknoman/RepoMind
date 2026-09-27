import { describe, expect, it, vi } from 'vitest';
import { runTool } from './runTool';
import { BRIDGE_KEYS, handleBridgeMessage } from './EmbeddedTools';

describe('runTool', () => {
  it('formats JSON and reports invalid JSON', () => {
    expect(runTool('json', { input: '{"a":1}' })).toBe('{\n  "a": 1\n}');
    expect(runTool('json', { input: '{' })).toMatch(/^Error: /);
  });
  it('cleans up whitespace and blank lines', () => {
    expect(runTool('text', { input: '  a   b \n\n\n c ' })).toBe('a b\n\nc');
  });
  it('encodes UTF-8 text as Base64', () => {
    expect(runTool('base64', { input: 'héllo' })).toBe(Buffer.from('héllo').toString('base64'));
  });
  it('decodes a JWT header and payload and says the signature is unverified', () => {
    const part = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const out = JSON.parse(
      runTool('jwt', { input: `${part({ alg: 'HS256' })}.${part({ sub: 'ü' })}.sig` }),
    );
    expect(out.header.alg).toBe('HS256');
    expect(out.payload.sub).toBe('ü');
    expect(out.note).toMatch(/NOT verified/);
  });
  it('converts timestamps and rejects non-numbers', () => {
    expect(runTool('timestamp', { input: '0' })).toBe('1970-01-01T00:00:00.000Z');
    expect(runTool('timestamp', { input: 'soon' })).toMatch(/^Error: /);
  });
  it('lists regex matches with line numbers', () => {
    const out = JSON.parse(runTool('regex', { regex: 'b+', regexText: 'a\nbb\nb' }));
    expect(out.count).toBe(2);
    expect(out.matches.map((m) => m.line)).toEqual([2, 3]);
  });
  it('generates UUIDs', () => {
    expect(runTool('uuid')).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('embedded tool bridge', () => {
  function memoryStorage(initial = {}) {
    const data = { ...initial };
    return {
      data,
      getItem: (k) => data[k] ?? null,
      setItem: (k, v) => (data[k] = v),
      removeItem: (k) => delete data[k],
    };
  }
  it('only stores allow-listed keys with string values', () => {
    const storage = memoryStorage();
    const opts = { reply: vi.fn(), storage };
    expect(
      handleBridgeMessage({ type: 'repomind:storage-set', key: BRIDGE_KEYS[0], value: '{}' }, opts),
    ).toBe(true);
    expect(storage.data[BRIDGE_KEYS[0]]).toBe('{}');
    expect(
      handleBridgeMessage(
        { type: 'repomind:storage-set', key: 'repomind.ai.settings', value: 'x' },
        opts,
      ),
    ).toBe(false);
    expect(
      handleBridgeMessage({ type: 'repomind:storage-set', key: BRIDGE_KEYS[0], value: {} }, opts),
    ).toBe(false);
    expect(storage.data['repomind.ai.settings']).toBeUndefined();
  });
  it('only allows opening the OFS tool', () => {
    const onOpenTool = vi.fn();
    expect(handleBridgeMessage({ type: 'repomind:open-tool', tool: 'ofs' }, { onOpenTool })).toBe(
      true,
    );
    expect(
      handleBridgeMessage({ type: 'repomind:open-tool', tool: 'codebase' }, { onOpenTool }),
    ).toBe(false);
    expect(onOpenTool).toHaveBeenCalledTimes(1);
  });
  it('ignores unknown messages', () => {
    expect(handleBridgeMessage({ type: 'something-else' }, { reply: vi.fn() })).toBe(false);
    expect(handleBridgeMessage(null, { reply: vi.fn() })).toBe(false);
  });
});
