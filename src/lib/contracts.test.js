import { beforeEach, describe, expect, it, vi } from 'vitest';
import { accountIdFromBytes } from '@parity/product-sdk-address';
import { ContractDryRunFailedError, ContractRevertedError } from '@parity/product-sdk-contracts';
import { TxSigningRejectedError, TxValidityError } from '@parity/product-sdk-tx';
import { walletFixture } from '../test/wallet.js';

const sdk = vi.hoisted(() => ({
  /** @type {any} */
  methods: {},
  mapped: vi.fn(async () => ({ ok: true, value: null })),
  permission: vi.fn(async () => ({ ok: true, value: true })),
  allowance: vi.fn(async () => ({ ok: true })),
  /** @type {any} */
  wallet: null,
}));

vi.mock('@parity/product-sdk-contracts', async (original) => ({
  .../** @type {object} */ (await original()),
  createContract: () => sdk.methods,
  ensureContractAccountMapped: sdk.mapped,
}));
vi.mock('@parity/product-sdk-host', () => ({ requestPermission: sdk.permission }));
vi.mock('./chain.js', () => ({ getChain: async () => ({ contracts: { runtime: true } }) }));
vi.mock('./wallet.js', () => ({ getSigner: () => 'signer', getSignerManager: () => ({}) }));
vi.mock('./stores.js', () => ({ walletStore: () => sdk.wallet, faucetStore: () => null }));
vi.mock('./host/allowances.js', () => ({ ensureContractAllowance: sdk.allowance }));

import { contractErrorMessage, createContract, toH160 } from './contracts.js';

beforeEach(() => {
  sdk.methods = {};
  sdk.wallet = walletFixture();
  sdk.mapped.mockClear();
  sdk.permission.mockClear();
  sdk.allowance.mockClear();
});

describe('toH160', () => {
  it('passes an H160 through, lowercased', () => {
    expect(toH160(` 0x${'AB'.repeat(20)} `)).toBe(`0x${'ab'.repeat(20)}`);
  });

  it('unwraps an Ethereum-derived account to the H160 it came from', () => {
    const h160 = Uint8Array.from({ length: 20 }, (_, i) => i + 1);
    const ss58 = accountIdFromBytes(Uint8Array.from([...h160, ...new Array(12).fill(0xee)]));
    expect(toH160(ss58)).toBe(`0x${[...h160].map((b) => b.toString(16).padStart(2, '0')).join('')}`);
  });
});

describe('contract reads', () => {
  it('resolves the decoded value', async () => {
    sdk.methods.total = { query: vi.fn(async () => ({ success: true, value: 7n })) };
    expect(await createContract([], `0x${'11'.repeat(20)}`).read('total')).toBe(7n);
  });

  it('retries an unmapped caller from the fallback origin, then gives up quietly', async () => {
    const query = vi.fn(async () => ({ success: false, value: { type: 'AccountUnmapped' } }));
    sdk.methods.total = { query };
    expect(await createContract([], `0x${'11'.repeat(20)}`).read('total', [1n])).toBeUndefined();
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]).toEqual([1n, { origin: expect.any(String) }]);
  });

  it('names a function the ABI lacks', async () => {
    await expect(createContract([], `0x${'11'.repeat(20)}`).read('missing')).rejects.toThrow(/not a function/);
  });
});

describe('contract writes', () => {
  it('asks for permission, maps the account, and submits as the wallet', async () => {
    const events = [
      { type: 'Revive', value: { type: 'ContractEmitted', value: { data: '0x01' } } },
      { type: 'System', value: { type: 'ExtrinsicSuccess' } },
    ];
    const tx = vi.fn(async () => ({ ok: true, value: { ok: true, events } }));
    sdk.methods.buy = { tx };

    const result = await createContract([], `0x${'11'.repeat(20)}`).write('buy', [3n], 5n);

    expect(sdk.permission).toHaveBeenCalledWith({ tag: 'ChainSubmit', value: undefined });
    expect(sdk.mapped).toHaveBeenCalledWith({ runtime: true }, sdk.wallet.address, 'signer');
    expect(tx).toHaveBeenCalledWith(3n, { value: 5n, signer: 'signer', origin: sdk.wallet.address });
    expect(result.eventData.logs).toEqual([{ data: '0x01' }]);
    expect(sdk.wallet.refreshBalance).toHaveBeenCalled();
  });

  it('claims gas sponsorship for the product account only', async () => {
    sdk.methods.buy = { tx: vi.fn(async () => ({ ok: true, value: { ok: true, events: [] } })) };
    await createContract([], `0x${'11'.repeat(20)}`).write('buy');
    expect(sdk.allowance).toHaveBeenCalledWith({ account: sdk.wallet.address });

    sdk.allowance.mockClear();
    sdk.wallet = walletFixture({ mode: 'dev' });
    await createContract([], `0x${'11'.repeat(20)}`).write('buy');
    expect(sdk.allowance).not.toHaveBeenCalled();
    expect(sdk.permission).toHaveBeenCalledWith({ tag: 'ChainSubmit', value: undefined });
    expect(sdk.mapped).toHaveBeenLastCalledWith({ runtime: true }, sdk.wallet.address, 'signer');
  });

  it('stops before signing when the host withholds permission', async () => {
    sdk.permission.mockResolvedValueOnce({ ok: true, value: false });
    sdk.methods.buy = { tx: vi.fn() };
    await expect(createContract([], `0x${'11'.repeat(20)}`).write('buy')).rejects.toThrow(/permission/);
    expect(sdk.methods.buy.tx).not.toHaveBeenCalled();
  });

  it('surfaces the transaction error', async () => {
    sdk.methods.buy = { tx: vi.fn(async () => ({ ok: false, error: new TxSigningRejectedError() })) };
    await expect(createContract([], `0x${'11'.repeat(20)}`).write('buy')).rejects.toBeInstanceOf(TxSigningRejectedError);
  });
});

describe('contract error messages', () => {
  it('turns chain errors into sentences a person can act on', () => {
    expect(contractErrorMessage(new Error('Module: Revive AccountUnmapped'))).toMatch(/Setting up your account/);
    expect(contractErrorMessage('Insufficient balance for fee')).toBe('Not enough PAS for this transaction.');
    expect(contractErrorMessage(new Error('User rejected the request'))).toBe('Transaction was cancelled.');
    expect(contractErrorMessage(new Error('Something odd'))).toBe('Something odd');
    expect(contractErrorMessage(null)).toBe('An unexpected error occurred.');
  });

  it('reads the product SDK error types', () => {
    expect(contractErrorMessage(new TxSigningRejectedError())).toBe('Transaction was cancelled.');
    expect(contractErrorMessage(new ContractRevertedError('buy', '0x', { reason: 'Sold out' }))).toBe('Sold out');
    expect(contractErrorMessage(new TxValidityError({ type: 'Invalid' }, 'Invalid.Payment'))).toBe(
      'Not enough PAS for this transaction.',
    );
    const deposit = { type: 'Module', value: { type: 'Revive', value: { type: 'StorageDepositNotEnoughFunds' } } };
    expect(contractErrorMessage(new ContractDryRunFailedError('buy', deposit))).toMatch(/storage deposit/);
  });
});
