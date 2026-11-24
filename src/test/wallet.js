import { vi } from 'vitest';
import { formatBalance, truncateAddress } from '../lib/format.js';

/**
 * `$store.wallet` for unit tests: the shape `createWalletStore()` returns, signed in as a
 * fixed account, with every method a spy that touches no host and no chain. Pass
 * overrides for the state a test needs; `signedOutWallet()` is the visitor with no host.
 *
 *   vi.mock('./stores.js', () => ({ walletStore: () => wallet }));
 *
 * `src/lib/wallet.test.js` holds this in step with the real store.
 *
 * @typedef {import('../lib/wallet.js').WalletStore} WalletStore
 */

export const FIXTURE_ADDRESS = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
export const FIXTURE_H160 = '0xd43593c715fdd31c61141abd04a99fd6822c8558';

/**
 * @param {Partial<WalletStore>} [overrides]
 * @returns {WalletStore}
 */
export function walletFixture(overrides = {}) {
  const account = { address: FIXTURE_ADDRESS, name: 'fixture.dot' };
  /** @type {WalletStore} */
  const store = {
    mode: 'host',
    connecting: false,
    accounts: [account],
    account,
    h160: FIXTURE_H160,
    username: 'Ada',
    balance: 10n ** 12n,

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
      return formatBalance(this.balance);
    },

    init: vi.fn(),
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(function () {
      this.accounts = [];
      this.account = null;
      this.h160 = null;
      this.username = null;
      this.balance = 0n;
    }),
    refreshBalance: vi.fn(async () => {}),
    select: vi.fn(function (next) {
      this.accounts = [next];
      this.account = next;
    }),
    applyProductAccount: vi.fn(async () => true),
    useDevAccount: vi.fn(async () => {}),
    watchConnection: vi.fn(),
  };
  return Object.assign(store, overrides);
}

/**
 * A visitor outside any host: no account, and the wallet asks for one.
 *
 * @param {Partial<WalletStore>} [overrides]
 * @returns {WalletStore}
 */
export function signedOutWallet(overrides = {}) {
  return walletFixture({
    mode: 'host-required',
    accounts: [],
    account: null,
    h160: null,
    username: null,
    balance: 0n,
    ...overrides,
  });
}
