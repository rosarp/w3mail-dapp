import { afterEach, describe, expect, it, vi } from 'vitest';

import { identifierFor, productIdentifier } from './detection.js';

/** @param {string} url */
const at = (url) => {
  const { protocol, host } = new URL(url);
  return { protocol, host };
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('identifierFor', () => {
  it.each([
    ['http://localhost:4321', 'localhost:4321'],
    ['https://mail.paseo.li', 'mail.paseo'],
    ['https://mail.app.paseo.li', 'mail.paseo'],
    ['https://mail.dot.li', 'mail.dot'],
    ['polkadot://app.mail.paseo', 'mail.paseo'],
    ['polkadot://widget.mail.paseo', 'mail.paseo'],
    ['polkadot://mail.paseo', 'mail.paseo'],
    ['polkadot://app.paseo', 'app.paseo'],
    ['https://example.com', 'example.com'],
  ])('%s is %s', (url, id) => {
    expect(identifierFor(at(url))).toBe(id);
  });
});

describe('productIdentifier', () => {
  it('is empty outside a browser', () => {
    expect(productIdentifier()).toBe('');
  });

  it('follows the location without an override', () => {
    vi.stubEnv('PUBLIC_PRODUCT_ID', '');
    vi.stubGlobal('window', { location: at('https://mail.paseo.li') });
    expect(productIdentifier()).toBe('mail.paseo');
  });

  it('prefers the id the factory sets', () => {
    vi.stubEnv('PUBLIC_PRODUCT_ID', 'mailbox-app.paseo');
    vi.stubGlobal('window', { location: at('http://localhost:4321') });
    expect(productIdentifier()).toBe('mailbox-app.paseo');
  });
});
