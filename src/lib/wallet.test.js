import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signedOutWallet, walletFixture } from '../test/wallet.js';

const ACCOUNT = {
  address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
  h160Address: `0x${'AB'.repeat(20)}`,
  name: 'ada',
};
const SIGNER = { signTx: 'fake' };
const DEV = ['Alice', 'Bob', 'Charlie', 'Dave', 'Eve', 'Ferdie'].map((name, i) => ({
  address: `5Dev${name}`,
  h160Address: `0x${String(i + 1).repeat(40)}`,
  name,
  signer: { signTx: name },
}));

const host = vi.hoisted(() => ({
  inHost: false,
  preview: false,
  signedIn: true,
  /** @type {any[]} */
  managers: [],
  /** @type {((status: string) => void) | null} */
  onStatus: null,
  chain: 'paseo-asset-hub',
}));

vi.mock('./site.js', () => ({
  SITE: {
    get chain() {
      return host.chain;
    },
  },
}));

vi.mock('./host/detection.js', () => ({
  isInHost: () => host.inHost,
  isDesignPreview: () => host.preview,
  productIdentifier: () => 'polls.dot',
}));

vi.mock('@parity/product-sdk-signer', () => {
  class SignerManager {
    /** @param {any} options */
    constructor(options) {
      this.options = options;
      /** @type {any} */
      this.state = { status: 'disconnected', selectedAccount: null };
      /** @type {Array<(state: any) => void>} */
      this.listeners = [];
      /** @type {string | null} */
      this.connectedWith = null;
      host.managers.push(this);
    }
    /** @param {string} type */
    async connect(type) {
      this.connectedWith = type;
      if (type === 'dev') {
        this.setState({ status: 'connected', accounts: DEV, selectedAccount: DEV[0] });
        return { ok: true, value: DEV };
      }
      this.setState({ status: 'connected', selectedAccount: host.signedIn ? ACCOUNT : null });
      return { ok: true, value: host.signedIn ? [ACCOUNT] : [] };
    }
    /** @param {string} address */
    selectAccount(address) {
      const account = this.state.accounts?.find((/** @type {any} */ a) => a.address === address);
      if (!account) return { ok: false, error: new Error('unknown account') };
      this.setState({ ...this.state, selectedAccount: account });
      return { ok: true, value: account };
    }
    /** @param {any} state */
    setState(state) {
      this.state = state;
      this.listeners.forEach((listener) => listener(state));
    }
    getState() {
      return this.state;
    }
    getSigner() {
      return this.state.selectedAccount?.signer ?? (this.state.selectedAccount ? SIGNER : null);
    }
    /** @param {(state: any) => void} cb */
    subscribe(cb) {
      this.listeners.push(cb);
      return () => {};
    }
    disconnect() {
      this.state = { status: 'disconnected', selectedAccount: null };
    }
  }
  class HostProvider {
    /** @param {any} options */
    constructor(options) {
      this.options = options;
    }
  }
  class DevProvider {}
  return { SignerManager, HostProvider, DevProvider };
});

vi.mock('@parity/product-sdk-host', () => ({
  getAccountsProvider: async () => ({
    subscribeAccountConnectionStatus: (/** @type {(status: string) => void} */ cb) => {
      host.onStatus = cb;
      return { unsubscribe: () => {}, onInterrupt: () => () => {} };
    },
  }),
}));

vi.mock('./chain.js', () => ({
  getChain: async () => ({
    api: { query: { System: { Account: { getValue: async () => ({ data: { free: 5n } }) } } } },
  }),
  ss58ToH160: () => `0x${'cd'.repeat(20)}`,
}));

/** A fresh module per test: the signer manager is module state. */
async function load() {
  vi.resetModules();
  return import('./wallet.js');
}

beforeEach(() => {
  const saved = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (/** @type {string} */ k) => saved.get(k) ?? null,
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => saved.set(k, v),
  });
  host.chain = 'paseo-asset-hub';
  host.inHost = false;
  host.preview = false;
  host.signedIn = true;
  host.managers = [];
  host.onStatus = null;
});

describe('the wallet store', () => {
  it('shows a stub account in design preview and never reaches for a host', async () => {
    host.preview = true;
    const { createWalletStore } = await load();
    const wallet = createWalletStore();
    wallet.init();
    expect(wallet.mode).toBe('host');
    expect(wallet.isConnected).toBe(true);
    expect(wallet.username).toBe('preview');
    expect(host.managers).toHaveLength(0);
  });

  it('asks for a host outside one, and refuses to connect', async () => {
    const { createWalletStore, getSigner } = await load();
    const wallet = createWalletStore();
    wallet.init();
    expect(wallet.mode).toBe('host-required');
    await expect(wallet.connect()).rejects.toThrow('host is required');
    expect(wallet.isConnected).toBe(false);
    expect(getSigner()).toBeNull();
  });

  it('takes the product account and its signer from the signer manager', async () => {
    host.inHost = true;
    const { createWalletStore, getSigner, getSignerManager } = await load();
    const wallet = createWalletStore();
    wallet.init();
    await vi.waitFor(() => expect(wallet.username).toBe('ada'));

    const manager = /** @type {any} */ (getSignerManager());
    expect(manager.connectedWith).toBe('host');
    const provider = manager.options.createProvider('host');
    expect(provider.options).toEqual({
      productAccount: { dotNsIdentifier: 'polls.dot', derivationIndex: 0 },
      requestChainSubmitPermission: false,
    });
    expect(getSigner()).toBe(SIGNER);
    expect(wallet.account?.name).toBe('polls.dot');
    expect(wallet.h160).toBe(`0x${'ab'.repeat(20)}`);
    await vi.waitFor(() => expect(wallet.balance).toBe(5n));
  });

  it('waits for a sign-in instead of failing, then picks the account up', async () => {
    host.inHost = true;
    host.signedIn = false;
    const { createWalletStore, getSigner, getSignerManager } = await load();
    const wallet = createWalletStore();
    wallet.init();
    await vi.waitFor(() => expect(host.onStatus).not.toBeNull());
    expect(wallet.isConnected).toBe(false);
    expect(getSigner()).toBeNull();

    host.signedIn = true;
    host.onStatus?.('Connected');
    await vi.waitFor(() => expect(wallet.isConnected).toBe(true));
    expect(getSigner()).toBe(SIGNER);

    /** @type {any} */ (getSignerManager()).setState({ status: 'connected', selectedAccount: null });
    expect(wallet.isConnected).toBe(false);
    expect(getSigner()).toBeNull();
  });

  it('forgets the signer on disconnect', async () => {
    host.inHost = true;
    const { createWalletStore, getSigner } = await load();
    const wallet = createWalletStore();
    await wallet.connect();
    expect(getSigner()).toBe(SIGNER);
    wallet.disconnect();
    expect(getSigner()).toBeNull();
    expect(wallet.account).toBeNull();
    expect(wallet.balance).toBe(0n);
  });

  it('never offers dev accounts on a public network', async () => {
    host.inHost = true;
    const { createWalletStore, usesDevAccounts } = await load();
    expect(usesDevAccounts()).toBe(false);
    await expect(createWalletStore().useDevAccount('Bob')).rejects.toThrow(/local development chain/);
  });

  it('acts as Alice on the local chain until another dev account is chosen', async () => {
    host.inHost = true;
    host.chain = 'local';
    const { createWalletStore, getSigner, getSignerManager } = await load();
    const wallet = createWalletStore();
    wallet.init();
    expect(wallet.mode).toBe('dev');
    await vi.waitFor(() => expect(wallet.username).toBe('Alice'));
    expect(/** @type {any} */ (getSignerManager()).connectedWith).toBe('dev');
    expect(getSigner()).toEqual({ signTx: 'Alice' });
    expect(wallet.h160).toBe(`0x${'1'.repeat(40)}`);
    expect(wallet.accounts.map((a) => a.name)).toHaveLength(6);
    expect(host.onStatus).toBeNull();

    await wallet.useDevAccount('Bob');
    expect(wallet.address).toBe('5DevBob');
    expect(getSigner()).toEqual({ signTx: 'Bob' });
    expect(localStorage.getItem('dev-account')).toBe('Bob');
    await expect(wallet.useDevAccount('Mallory')).rejects.toThrow(/not a dev account/);
  });

  it('honours the dev account chosen earlier in this browser', async () => {
    host.inHost = true;
    host.chain = 'local';
    localStorage.setItem('dev-account', 'Charlie');
    const { createWalletStore, devAccountName } = await load();
    expect(devAccountName()).toBe('Charlie');
    const wallet = createWalletStore();
    await wallet.connect();
    expect(wallet.mode).toBe('dev');
    expect(wallet.username).toBe('Charlie');

    localStorage.setItem('dev-account', 'Mallory');
    expect(devAccountName()).toBe('Alice');
  });

  it('has a test fixture of exactly the same shape', async () => {
    const { createWalletStore } = await load();
    const keys = (/** @type {object} */ o) => Object.keys(Object.getOwnPropertyDescriptors(o)).sort();
    expect(keys(walletFixture())).toEqual(keys(createWalletStore()));
    expect(walletFixture().displayName).toBe('Ada');
    expect(signedOutWallet().isConnected).toBe(false);
    expect(signedOutWallet().mode).toBe('host-required');
  });
});
