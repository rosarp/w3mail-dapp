import { createClient, Binary } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws';
import { QUERY_FALLBACK_ORIGIN } from '@parity/product-sdk-contracts';

/**
 * Transaction encoding checks: H160 shape, Binary call data, ReviveApi availability, and
 * a `name()` dry-run against `VITE_CONTRACT_ADDRESS` when set. Run with
 * `node scripts/test-transactions.js`.
 */

const WS_URL = process.env.VITE_RPC_URL || 'ws://127.0.0.1:9955';

async function testContractInteraction() {
  console.log('\nTesting contract transaction...');

  const client = createClient(getWsProvider(WS_URL));
  const api = client.getUnsafeApi();
  const testAddress = '0x1234567890123456789012345678901234567890';

  try {
    const addressHex = testAddress.startsWith('0x') ? testAddress.slice(2) : testAddress;
    if (addressHex.length !== 40) {
      throw new Error(`H160 address must be 20 bytes (40 hex chars), got ${addressHex.length / 2} bytes`);
    }
    console.log('[PASS] Address encoding valid');

    if (Binary.toHex(new Uint8Array([0x00, 0x01, 0x02])) !== '0x000102') throw new Error('Binary hex encoding mismatch');
    console.log('[PASS] Binary encoding works');

    if (!api.apis?.ReviveApi?.call) {
      throw new Error('ReviveApi.call not available - check chain connection');
    }
    console.log('[PASS] ReviveApi.call available');

    const contractAddress = process.env.VITE_CONTRACT_ADDRESS;
    if (contractAddress) {
      console.log('Testing actual contract at:', contractAddress);
      const nameSelector = new Uint8Array([0x06, 0xfd, 0xde, 0x03]);
      try {
        const result = await api.apis.ReviveApi.call(
          QUERY_FALLBACK_ORIGIN,
          contractAddress,
          0n,
          undefined,
          undefined,
          nameSelector,
        );
        console.log('[PASS] Contract call executed successfully');
        console.log('  Result:', result);
      } catch (callError) {
        console.error('[FAIL] Contract call failed:', callError instanceof Error ? callError.message : callError);
        throw callError;
      }
    } else {
      console.log('[SKIP] No VITE_CONTRACT_ADDRESS set, skipping contract call test');
    }
  } catch (error) {
    console.error('\nTransaction test FAILED:', error instanceof Error ? error.message : error);
    console.error('\nERROR DETAILS FOR FIXING:');
    console.error(error instanceof Error ? error.stack : error);
    throw error;
  } finally {
    client.destroy();
  }

  console.log('\nTransaction tests passed!');
  process.exit(0);
}

testContractInteraction().catch(() => {
  console.error('\nTRANSACTION TEST FAILED');
  console.error('\nCommon fixes:');
  console.error('  - H160 encoding error: Ensure address is exactly 20 bytes (40 hex chars)');
  console.error('  - Binary encoding error: pass call data as a Uint8Array (Binary.fromHex for hex)');
  console.error('  - ReviveApi undefined: Check chain supports Revive pallet');
  console.error('  - contractsApi error: Use ReviveApi, NOT contractsApi!');
  process.exit(1);
});
