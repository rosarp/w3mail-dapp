import { CONTRACT_ADDRESS } from './config.js';
import { CONTRACT_ABI } from './abi.js';

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Whether a real contract is wired: a non-empty ABI and a non-zero 20-byte address.
 * Read helpers short-circuit to an empty state until this holds, so the app renders
 * before deployment instead of throwing.
 *
 * @param {readonly unknown[]} abi
 * @param {string} address
 */
export function isContractReady(abi, address) {
  return (
    Array.isArray(abi) &&
    abi.length > 0 &&
    /^0x[0-9a-fA-F]{40}$/.test(address) &&
    address.toLowerCase() !== ZERO_ADDRESS
  );
}

/** Readiness of this app's own contract. */
export function isContractDeployed() {
  return isContractReady(CONTRACT_ABI, CONTRACT_ADDRESS);
}
