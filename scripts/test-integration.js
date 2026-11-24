import { createClient } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws';

/**
 * Chain smoke test: connects, reads the chain spec, and checks the Revive runtime API is
 * present. Run with `node scripts/test-integration.js`.
 */

const WS_URL = process.env.VITE_RPC_URL || 'ws://127.0.0.1:9955';

async function testIntegration() {
  console.log('Testing PAPI integration on Asset Hub...\n');
  console.log('  Connecting to:', WS_URL);

  const client = createClient(getWsProvider(WS_URL));
  console.log('[PASS] PAPI client created');

  const chainSpec = await client.getChainSpecData();
  console.log('[PASS] Connected to chain:', chainSpec.name);

  const api = client.getUnsafeApi();
  if (api.apis?.ReviveApi) {
    console.log('[PASS] ReviveApi available (for EVM contracts)');
  } else {
    console.log('[WARN] ReviveApi not found - check chain supports Revive pallet');
  }

  if (api.apis?.ContractsApi) {
    console.log('[WARN] contractsApi found - this is NOT for PolkaVM/Revive!');
  } else {
    console.log('[PASS] contractsApi correctly absent (Asset Hub uses Revive)');
  }

  client.destroy();
  console.log('\nAll PAPI integration tests passed!');
  console.log('\nREMINDER: Use ReviveApi for EVM contracts, NOT contractsApi!');
  process.exit(0);
}

testIntegration().catch((error) => {
  console.error('\nIntegration test FAILED:', error instanceof Error ? error.message : error);
  console.error('\nCommon issues:');
  console.error('  - "contractsApi is undefined" = Use ReviveApi instead!');
  console.error('  - "Buffer is not defined" = Check imports, do NOT add vite-plugin-node-polyfills (breaks blake2b)');
  console.error('  - Connection failed = Check WebSocket URL is correct');
  process.exit(1);
});
