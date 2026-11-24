/**
 * Contract address and network. The deploy script writes `VITE_CONTRACT_ADDRESS` into
 * `.env` and may regenerate this file; the zero address applies only before deployment.
 */
export const CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000';

export const CHAIN_CONFIG = {
  network: import.meta.env.VITE_NETWORK || 'paseo-asset-hub',
};
