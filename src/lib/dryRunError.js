/**
 * A readable sentence for a nested dry-run error such as
 * `{ type: 'Module', value: { type: 'Revive', value: { type: 'StorageDepositNotEnoughFunds' } } }`.
 * `contracts.js` already maps its own errors; use this for direct `ReviveApi.call` work.
 */

/** @type {Record<string, string>} */
const FRIENDLY = {
  AccountUnmapped: 'Your account is not yet mapped to the EVM layer. Approve the mapping transaction first.',
  StorageDepositNotEnoughFunds: 'Not enough PAS to cover the storage deposit. Top up your account and try again.',
  StorageDepositLimitExhausted: 'Storage deposit limit exhausted. Try a smaller operation.',
  OutOfGas: 'Transaction ran out of gas. Try again — the gas limit will be re-estimated.',
  ExhaustsResources: 'Transaction exceeds block resource limits. Break it into smaller steps.',
  InsufficientBalance: 'Not enough balance for this transaction.',
  InsufficientFunds: 'Not enough balance for this transaction.',
  CodeRejected: 'Contract bytecode was rejected by the chain.',
  ContractTrapped: 'Contract execution trapped (reverted without a reason).',
  ReentrantCall: 'Reentrant call blocked.',
};

const WRAPPERS = ['Module', 'Revive', 'Pallet', 'Token', 'Arithmetic', 'Transactional'];

/**
 * @param {unknown} err
 * @returns {string}
 */
export function decodeDryRunError(err) {
  if (err == null) return 'Unknown error (no details)';
  if (typeof err === 'string') return FRIENDLY[err] ?? err;

  const node = /** @type {Record<string, unknown>} */ (err);
  if ('success' in node && node.success === false && 'value' in node) return decodeDryRunError(node.value);
  if (typeof node.message === 'string') return FRIENDLY[node.message] ?? node.message;

  if (typeof node.type === 'string') {
    if (node.value == null) return FRIENDLY[node.type] ?? `Chain error: ${node.type}`;
    const inner = decodeDryRunError(node.value);
    return WRAPPERS.includes(node.type) ? inner : `${node.type}: ${inner}`;
  }

  try {
    const s = JSON.stringify(err);
    return s.length > 200 ? 'Unrecognized chain error (see console for details)' : s;
  } catch {
    return 'Unrecognized chain error';
  }
}
