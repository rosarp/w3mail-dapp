import { beforeEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({ inHost: true, request: /** @type {any} */ (null) }));

vi.mock('./detection.js', () => ({ isInHost: () => host.inHost }));
vi.mock('@parity/product-sdk-host', () => ({
  requestResourceAllocation: (/** @type {any} */ resources) => host.request(resources),
}));

import { checkPgasGranted, claimHostAllowances, clearAllowanceCache, ensureContractAllowance } from './allowances.js';

/** @param {string[]} outcomes */
const answer = (outcomes) => ({ ok: true, value: outcomes });

beforeEach(() => {
  const saved = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (/** @type {string} */ k) => saved.get(k) ?? null,
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => saved.set(k, v),
    removeItem: (/** @type {string} */ k) => saved.delete(k),
  });
  host.inHost = true;
  host.request = vi.fn(async () => answer(['Allocated']));
});

describe('host allowances', () => {
  it('claims nothing outside a host', async () => {
    host.inHost = false;
    expect(await ensureContractAllowance()).toEqual({ ok: true, skipped: true, denied: [] });
    expect(host.request).not.toHaveBeenCalled();
  });

  it('asks once per account, then trusts the cached grant', async () => {
    expect((await ensureContractAllowance({ account: 'alice', derivationIndex: 3 })).ok).toBe(true);
    expect(host.request).toHaveBeenCalledWith([
      { tag: 'SmartContractAllowance', value: { tag: 'Index', value: 3 } },
    ]);
    await ensureContractAllowance({ account: 'alice' });
    expect(host.request).toHaveBeenCalledTimes(1);

    await ensureContractAllowance({ account: 'bob' });
    expect(host.request).toHaveBeenCalledTimes(2);

    clearAllowanceCache('SmartContractAllowance', 'alice');
    await ensureContractAllowance({ account: 'alice' });
    expect(host.request).toHaveBeenCalledTimes(3);
  });

  it('shares one prompt between parallel claims', async () => {
    /** @type {(v: any) => void} */
    let grant = () => {};
    host.request = vi.fn(() => new Promise((resolve) => (grant = resolve)));
    const first = ensureContractAllowance();
    const second = ensureContractAllowance();
    grant(answer(['Allocated']));
    expect(await first).toEqual(await second);
    expect(host.request).toHaveBeenCalledTimes(1);
  });

  it('reports what the user denied and asks again next time', async () => {
    host.request = vi.fn(async () => answer(['Allocated', 'Rejected']));
    const result = await claimHostAllowances(['SmartContractAllowance', 'BulletinAllowance']);
    expect(result).toEqual({ ok: false, skipped: false, denied: ['BulletinAllowance'] });

    host.request = vi.fn(async () => answer(['Allocated']));
    await claimHostAllowances(['SmartContractAllowance', 'BulletinAllowance']);
    expect(host.request).toHaveBeenCalledWith([{ tag: 'BulletinAllowance', value: undefined }]);
  });

  it('treats a host error as a denial, never a throw', async () => {
    host.request = vi.fn(async () => {
      throw new Error('host gone');
    });
    expect(await ensureContractAllowance()).toEqual({
      ok: false,
      skipped: false,
      denied: ['SmartContractAllowance'],
    });
    host.request = vi.fn(async () => ({ ok: false, error: new Error('Denied') }));
    expect((await ensureContractAllowance()).ok).toBe(false);
  });

  it('reads PGAS as the sign that gas is sponsored', async () => {
    const api = (/** @type {bigint} */ balance) => ({
      query: { Assets: { Account: { getValue: async () => ({ balance }) } } },
    });
    expect(await checkPgasGranted(api(1n), 'alice')).toBe(true);
    expect(await checkPgasGranted(api(0n), 'alice')).toBe(false);
    expect(await checkPgasGranted({ query: { Assets: { Account: { getValue: async () => { throw new Error('x'); } } } } }, 'a')).toBe(false);
  });
});
