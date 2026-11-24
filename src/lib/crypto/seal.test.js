import { describe, expect, it } from 'vitest';
import { nacl, utf8ToBytes } from '@parity/product-sdk-crypto';

import { open, openJson, seal, sealJson } from './seal.js';

const INFO = 'test:mail:v1';
const recipient = nacl.box.keyPair();

describe('seal', () => {
  it('round-trips for the recipient', () => {
    const sealed = seal(utf8ToBytes('hello'), recipient.publicKey, INFO);
    expect(new TextDecoder().decode(open(sealed, recipient.secretKey, INFO))).toBe('hello');
    expect(sealed.length).toBe(32 + 24 + 5 + 16);
  });

  it('uses a fresh ephemeral key per message', () => {
    const a = seal(utf8ToBytes('hello'), recipient.publicKey, INFO);
    const b = seal(utf8ToBytes('hello'), recipient.publicKey, INFO);
    expect(a.subarray(0, 32)).not.toEqual(b.subarray(0, 32));
  });

  it('refuses another key', () => {
    const sealed = seal(utf8ToBytes('hello'), recipient.publicKey, INFO);
    expect(() => open(sealed, nacl.box.keyPair().secretKey, INFO)).toThrow('This message cannot be decrypted');
  });

  it('refuses a tampered byte', () => {
    const sealed = seal(utf8ToBytes('hello'), recipient.publicKey, INFO);
    sealed[sealed.length - 1] ^= 1;
    expect(() => open(sealed, recipient.secretKey, INFO)).toThrow('This message cannot be decrypted');
  });

  it('refuses another info', () => {
    const sealed = seal(utf8ToBytes('hello'), recipient.publicKey, INFO);
    expect(() => open(sealed, recipient.secretKey, 'test:other:v1')).toThrow('This message cannot be decrypted');
  });

  it('refuses something too short to be sealed', () => {
    expect(() => open(new Uint8Array(10), recipient.secretKey, INFO)).toThrow('This message cannot be decrypted');
  });

  it('round-trips JSON, with bigints as strings', () => {
    const sealed = sealJson({ subject: 'hi', amount: 5n }, recipient.publicKey, INFO);
    expect(openJson(sealed, recipient.secretKey, INFO)).toEqual({ subject: 'hi', amount: '5' });
  });
});
