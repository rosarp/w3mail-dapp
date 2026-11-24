import { SignerManager, HostProvider, DevProvider } from '@parity/product-sdk-signer';
import { getAccountsProvider } from '@parity/product-sdk-host';
import { getChain, ss58ToH160 } from './chain.js';
import { formatBalance, truncateAddress } from './format.js';
import { isInHost, isDesignPreview, productIdentifier } from './host/detection.js';
import { SITE } from './site.js';

/**
 * The account this app acts as. Inside a host there is no "connect wallet" flow: the
 * host hands the app a product account on load and signs on its behalf, through
 * `@parity/product-sdk-signer`'s `SignerManager`. On the local development chain the
 * phone cannot sign, so the app acts as a well-known dev account instead (mode `dev`),
 * chosen on `/dev-account/`.
 *
 * @typedef {'detecting' | 'host' | 'dev' | 'host-required'} WalletMode
 *
 * @typedef {object} WalletAccount
 * @property {string} address  SS58.
 * @property {string} [name]
 *
 * @typedef {object} WalletStore
 * @property {WalletMode} mode
 * @property {boolean} connecting
 * @property {WalletAccount[]} accounts
 * @property {WalletAccount | null} account
 * @property {string | null} h160
 * @property {string | null} username  Host display name, when the user has one.
 * @property {bigint} balance  Free balance in planck.
 * @property {boolean} isConnected
 * @property {string | null} address
 * @property {string | null} displayName
 * @property {string | null} truncated
 * @property {string} formattedBalance
 * @property {() => void} init
 * @property {() => Promise<void>} connect
 * @property {() => void} disconnect
 * @property {() => Promise<void>} refreshBalance
 * @property {(account: WalletAccount, h160?: string | null) => void} select
 * @property {() => Promise<boolean>} applyProductAccount
 * @property {(name?: string) => Promise<void>} useDevAccount
 * @property {() => void} watchConnection
 */

const PREVIEW_ACCOUNT = { address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', name: 'preview' };

/** The dev accounts `DevProvider` derives from the well-known development phrase. */
export const DEV_ACCOUNTS = /** @type {const} */ (['Alice', 'Bob', 'Charlie', 'Dave', 'Eve', 'Ferdie']);

const DEV_ACCOUNT_KEY = 'dev-account';

/** The local development chain's native token, as `formatBalance` decimals and symbol. */
export const LOCAL_TOKEN = /** @type {const} */ ([12, 'WND']);

/**
 * Whether this build signs with dev accounts: only on the local development chain,
 * never on a public network.
 */
export function usesDevAccounts() {
  return SITE.chain === 'local';
}

/**
 * The dev account this browser acts as, `Alice` until another is chosen.
 *
 * @returns {string}
 */
export function devAccountName() {
  try {
    const stored = localStorage.getItem(DEV_ACCOUNT_KEY);
    return DEV_ACCOUNTS.find((name) => name === stored) ?? DEV_ACCOUNTS[0];
  } catch {
    return DEV_ACCOUNTS[0];
  }
}

/** @param {string} name */
function rememberDevAccount(name) {
  try {
    localStorage.setItem(DEV_ACCOUNT_KEY, name);
  } catch {}
}

/** @type {SignerManager | null} */
let manager = null;

/**
 * The signer manager for this app's product account. The `ChainSubmit` permission is
 * left to the first write, so a read-only visitor never sees a prompt. Kept outside
 * Alpine's reactive state so the object is never proxied.
 *
 * @returns {SignerManager}
 */
export function getSignerManager() {
  manager ??= new SignerManager({
    dappName: productIdentifier(),
    persistence: null,
    createProvider: (type) =>
      type === 'dev'
        ? new DevProvider()
        : new HostProvider({
            productAccount: { dotNsIdentifier: productIdentifier(), derivationIndex: 0 },
            requestChainSubmitPermission: false,
          }),
  });
  return manager;
}

/**
 * The host transaction creator for the current account, or null before the host has
 * granted one.
 *
 * @returns {import('@polkadot-api/signers-common').CommonSignerTxCreator | null}
 */
export function getSigner() {
  return manager?.getSigner() ?? null;
}

/** @returns {WalletStore} */
export function createWalletStore() {
  return {
    mode: 'detecting',
    connecting: false,
    accounts: [],
    account: null,
    h160: null,
    username: null,
    balance: 0n,

    get isConnected() {
      return this.account !== null;
    },
    get address() {
      return this.account?.address ?? null;
    },
    get displayName() {
      return this.username ?? this.truncated;
    },
    get truncated() {
      return this.address ? truncateAddress(this.address, 6, 6) : null;
    },
    get formattedBalance() {
      return usesDevAccounts() ? formatBalance(this.balance, ...LOCAL_TOKEN) : formatBalance(this.balance);
    },

    init() {
      if (isDesignPreview()) {
        this.select(PREVIEW_ACCOUNT);
        this.username = PREVIEW_ACCOUNT.name;
        this.mode = 'host';
        return;
      }
      if (!isInHost()) {
        this.mode = 'host-required';
        return;
      }
      if (usesDevAccounts()) {
        this.mode = 'dev';
        this.connect().catch((err) => console.error('[wallet] dev account failed:', err));
        return;
      }
      this.mode = 'host';
      this.connect()
        .then(() => this.watchConnection())
        .catch((err) => console.error('[wallet] host auto-connect failed:', err));
    },

    async connect() {
      if (!isInHost()) {
        this.mode = 'host-required';
        throw new Error('A Polkadot host is required');
      }
      this.connecting = true;
      try {
        if (usesDevAccounts()) {
          await this.useDevAccount();
          this.mode = 'dev';
        } else {
          await this.applyProductAccount();
          this.mode = 'host';
        }
      } finally {
        this.connecting = false;
      }
    },

    disconnect() {
      manager?.disconnect();
      this.accounts = [];
      this.account = null;
      this.h160 = null;
      this.username = null;
      this.balance = 0n;
      this.mode = !isInHost() ? 'host-required' : usesDevAccounts() ? 'dev' : 'host';
    },

    async refreshBalance() {
      if (!this.address || isDesignPreview()) return;
      try {
        const { api } = await getChain();
        const info = await api.query.System.Account.getValue(this.address);
        this.balance = info.data.free;
      } catch (err) {
        console.error('[wallet] balance query failed:', err);
        this.balance = 0n;
      }
    },

    select(account, h160 = null) {
      this.accounts = [account];
      this.account = account;
      try {
        this.h160 = h160?.toLowerCase() ?? ss58ToH160(account.address);
      } catch {
        this.h160 = null;
      }
      this.refreshBalance();
    },

    /**
     * Connect the signer manager and take its product account. False, not an error,
     * when the host has no session yet — `watchConnection` retries once the user signs
     * in.
     */
    async applyProductAccount() {
      const signers = getSignerManager();
      const result = await signers.connect('host');
      if (result.ok === false) throw result.error;
      const selected = signers.getState().selectedAccount;
      if (!selected) {
        this.account = null;
        this.accounts = [];
        this.h160 = null;
        return false;
      }
      this.select({ address: selected.address, name: productIdentifier() }, selected.h160Address);
      this.username = selected.name;
      return true;
    },

    /**
     * Act as the dev account `name`, remembered for this browser; the remembered one,
     * else Alice, when no name is given. Only on the local development chain.
     */
    async useDevAccount(name = devAccountName()) {
      if (!usesDevAccounts()) throw new Error('Dev accounts exist only on the local development chain');
      const signers = getSignerManager();
      if (signers.getState().status !== 'connected') {
        const result = await signers.connect('dev');
        if (result.ok === false) throw result.error;
      }
      const accounts = signers.getState().accounts;
      const chosen = accounts.find((account) => account.name === name);
      if (!chosen) throw new Error(`${name} is not a dev account`);
      const selected = signers.selectAccount(chosen.address);
      if (selected.ok === false) throw selected.error;
      rememberDevAccount(name);
      this.select({ address: chosen.address, name }, chosen.h160Address);
      this.accounts = accounts.map((account) => ({ address: account.address, name: account.name }));
      this.username = name;
    },

    watchConnection() {
      getSignerManager().subscribe((state) => {
        if (state.status === 'connected' && !state.selectedAccount && this.account) {
          this.account = null;
          this.accounts = [];
          this.h160 = null;
        }
      });
      getAccountsProvider()
        .then((accounts) =>
          accounts?.subscribeAccountConnectionStatus((status) => {
            if (String(status).toLowerCase() !== 'connected' || this.account) return;
            this.applyProductAccount().catch((err) => console.error('[wallet] reconnect failed:', err));
          }),
        )
        .catch(() => {});
    },
  };
}
