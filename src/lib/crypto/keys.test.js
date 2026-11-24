import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256, utf8ToBytes } from '@parity/product-sdk-crypto';

const host = vi.hoisted(() => ({
  inHost: true,
  preview: false,
  derive: /** @type {any} */ (null),
}));

vi.mock('../host/detection.js', () => ({
  isInHost: () => host.inHost,
  isDesignPreview: () => host.preview,
}));
vi.mock('@parity/product-sdk-host', () => ({
  deriveEntropy: (/** @type {Uint8Array} */ key) => host.derive(key),
}));

import { clearKeyCache, deriveKeyPair } from './keys.js';

/** Entropy that depends only on the context, as the host's does for one wallet. */
const fromContext = async (/** @type {Uint8Array} */ key) => ({ ok: true, value: sha256(key) });

beforeEach(() => {
  clearKeyCache();
  host.inHost = true;
  host.preview = false;
  host.derive = vi.fn(fromContext);
});

describe('deriveKeyPair', () => {
  it('derives the same pair from the same entropy', async () => {
    const first = await deriveKeyPair('mail:x25519:v1:0xaa');
    clearKeyCache();
    const second = await deriveKeyPair('mail:x25519:v1:0xaa');
    expect(second.publicKey).toEqual(first.publicKey);
    expect(first.publicKey).toHaveLength(32);
    expect(first.secretKey).toHaveLength(32);
  });

  it('gives each account its own pair', async () => {
    const alice = await deriveKeyPair('mail:x25519:v1:0xaa');
    const bob = await deriveKeyPair('mail:x25519:v1:0xbb');
    expect(bob.publicKey).not.toEqual(alice.publicKey);
  });

  it('asks the host once per context', async () => {
    await deriveKeyPair('mail:x25519:v1:0xaa');
    await deriveKeyPair('mail:x25519:v1:0xaa');
    expect(host.derive).toHaveBeenCalledTimes(1);
    expect(host.derive).toHaveBeenCalledWith(sha256(utf8ToBytes('mail:x25519:v1:0xaa')));
  });

  it('gives the host a 32-byte key however long the context', async () => {
    await deriveKeyPair(`w3mail:x25519:v1:0x${'ab'.repeat(20)}`);
    const [key] = host.derive.mock.calls[0];
    expect(key).toHaveLength(32);
  });

  it('hashes entropy that is not 32 bytes', async () => {
    host.derive = vi.fn(async () => ({ ok: true, value: new Uint8Array(64).fill(7) }));
    const pair = await deriveKeyPair('long');
    expect(pair.secretKey).toEqual(sha256(new Uint8Array(64).fill(7)));
  });

  it('makes a random pair in design preview without the host', async () => {
    host.preview = true;
    host.inHost = false;
    const pair = await deriveKeyPair('preview');
    expect(pair.publicKey).toHaveLength(32);
    expect(host.derive).not.toHaveBeenCalled();
  });

  it('needs the host outside design preview', async () => {
    host.inHost = false;
    await expect(deriveKeyPair('x')).rejects.toThrow('Keys need the Polkadot host');
  });

  it('reports a host failure', async () => {
    host.derive = vi.fn(async () => ({ ok: false, error: new Error('denied') }));
    await expect(deriveKeyPair('x')).rejects.toThrow('The host could not derive a key: denied');
  });
});
