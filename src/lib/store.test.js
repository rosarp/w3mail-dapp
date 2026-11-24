import { beforeEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({
  inHost: true,
  preview: false,
  data: new Map(),
  log: /** @type {string[]} */ ([]),
  fail: /** @type {Error | null} */ (null),
}));

vi.mock('./host/detection.js', () => ({
  isInHost: () => host.inHost,
  isDesignPreview: () => host.preview,
}));
vi.mock('@parity/product-sdk-host', () => ({
  getHostLocalStorage: async () => ({
    readJSON: async (/** @type {string} */ key) => (host.data.has(key) ? JSON.parse(host.data.get(key)) : null),
    writeJSON: async (/** @type {string} */ key, /** @type {unknown} */ value) => {
      await new Promise((r) => setTimeout(r, Math.random() * 3));
      if (host.fail) throw host.fail;
      host.log.push(`write ${key}`);
      host.data.set(key, JSON.stringify(value));
    },
    clear: async (/** @type {string} */ key) => {
      host.log.push(`clear ${key}`);
      host.data.delete(key);
    },
  }),
}));

import { openCollection, resetStore } from './store.js';

beforeEach(() => {
  resetStore();
  host.inHost = true;
  host.preview = false;
  host.data = new Map();
  host.log = [];
  host.fail = null;
});

describe('openCollection', () => {
  it('keeps the index in step with put and remove', async () => {
    const mail = openCollection('mail');
    await mail.put('a', { subject: 'A' });
    await mail.put('b', { subject: 'B' });
    await mail.put('a', { subject: 'A2' });
    expect(await mail.ids()).toEqual(['a', 'b']);
    expect(await mail.get('a')).toEqual({ subject: 'A2' });
    await mail.remove('a');
    expect(await mail.ids()).toEqual(['b']);
    expect(await mail.get('a')).toBeNull();
    expect(await mail.all()).toEqual([{ subject: 'B' }]);
  });

  it('writes the record before the index, and drops the index entry first', async () => {
    const mail = openCollection('mail');
    await mail.put('a', 1);
    await mail.remove('a');
    expect(host.log).toEqual(['write c:mail:r:a', 'write c:mail:ids', 'write c:mail:ids', 'clear c:mail:r:a']);
  });

  it('loses no id under concurrent puts', async () => {
    const mail = openCollection('mail');
    const ids = Array.from({ length: 20 }, (_, i) => `m${i}`);
    await Promise.all(ids.map((id) => mail.put(id, { id })));
    expect(await mail.ids()).toEqual(ids);
  });

  it('keeps collections apart and clears one', async () => {
    const mail = openCollection('mail');
    const drafts = openCollection('drafts');
    await mail.put('a', 1);
    await drafts.put('a', 2);
    await mail.clear();
    expect(await mail.ids()).toEqual([]);
    expect(await drafts.get('a')).toBe(2);
  });

  it('propagates errors, and maps a full device', async () => {
    const mail = openCollection('mail');
    host.fail = new Error('storage Full');
    await expect(mail.put('a', 1)).rejects.toThrow('Device storage is full');
    host.fail = new Error('broken');
    await expect(mail.put('a', 1)).rejects.toThrow('broken');
    host.fail = null;
    await mail.put('b', 2);
    expect(await mail.ids()).toEqual(['b']);
  });

  it('keeps records in memory outside a host', async () => {
    host.inHost = false;
    const mail = openCollection('mail');
    const record = { subject: 'A' };
    await mail.put('a', record);
    record.subject = 'changed';
    expect(await mail.get('a')).toEqual({ subject: 'A' });
    expect(host.data.size).toBe(0);
  });
});
