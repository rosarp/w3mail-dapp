import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blake2b256, bytesToHex } from '@parity/product-sdk-crypto';

const host = vi.hoisted(() => ({ inHost: true, query: /** @type {any} */ (null) }));

vi.mock('./host/detection.js', () => ({ isInHost: () => host.inHost }));
vi.mock('./host/allowances.js', () => ({ ensureBulletinAllowance: async () => {} }));
vi.mock('@parity/product-sdk-cloud-storage', async (importOriginal) => {
  const actual = /** @type {any} */ (await importOriginal());
  return { ...actual, queryBytes: (/** @type {any[]} */ ...args) => host.query(...args) };
});

import {
  CloudStorageLookupTimeoutError,
  CidCodec,
  HashAlgorithm,
  calculateCid,
} from '@parity/product-sdk-cloud-storage';
import { bytes32ToCid, cidToBytes32, fetchBytes, fetchJson } from './bulletin.js';

const hello = new TextEncoder().encode('hello');

beforeEach(() => {
  host.inHost = true;
  host.query = vi.fn(async () => ({ ok: true, value: hello }));
});

describe('CID and bytes32', () => {
  it('round-trips a raw blake2b-256 CID through its digest', async () => {
    const cid = (await calculateCid(hello)).toString();
    const hex = cidToBytes32(cid);
    expect(hex).toBe(`0x${bytesToHex(blake2b256(hello))}`);
    expect(bytes32ToCid(hex)).toBe(cid);
    expect(cidToBytes32(`ipfs://${cid}`)).toBe(hex);
  });

  it('refuses CIDs a bytes32 cannot rebuild', async () => {
    const manifest = (await calculateCid(hello, CidCodec.DagPb)).toString();
    expect(() => cidToBytes32(manifest)).toThrow('Only raw blake2b-256');
    const sha = (await calculateCid(hello, CidCodec.Raw, HashAlgorithm.Sha2_256)).toString();
    expect(() => cidToBytes32(sha)).toThrow('Only raw blake2b-256');
  });
});

describe('fetchBytes', () => {
  it('returns the bytes behind a CID', async () => {
    expect(await fetchBytes('ipfs://bafk', { timeoutMs: 5 })).toEqual(hello);
    expect(host.query).toHaveBeenCalledWith('bafk', { lookupTimeoutMs: 5 });
  });

  it('parses JSON', async () => {
    host.query = vi.fn(async () => ({ ok: true, value: new TextEncoder().encode('{"a":1}') }));
    expect(await fetchJson('bafk')).toEqual({ a: 1 });
  });

  it('says content is unavailable when the lookup times out', async () => {
    const timeout = new CloudStorageLookupTimeoutError('bafk', 5);
    host.query = vi.fn(async () => ({ ok: false, error: timeout }));
    const error = await fetchBytes('bafk').catch((e) => e);
    expect(error.message).toBe('This content is not available on Bulletin');
    expect(error.cause).toBe(timeout);
  });

  it('passes other failures through', async () => {
    const failure = new Error('broken');
    host.query = vi.fn(async () => ({ ok: false, error: failure }));
    await expect(fetchBytes('bafk')).rejects.toBe(failure);
  });

  it('needs the host', async () => {
    host.inHost = false;
    await expect(fetchBytes('bafk')).rejects.toThrow('Reading Bulletin needs the Polkadot host');
    expect(host.query).not.toHaveBeenCalled();
  });
});
