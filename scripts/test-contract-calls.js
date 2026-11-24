import * as fs from 'node:fs';
import * as path from 'node:path';
import { createClient } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws';
import { createContractFromClient, QUERY_FALLBACK_ORIGIN } from '@parity/product-sdk-contracts';
import { chainDescriptor } from '../src/lib/host/chains.js';

/**
 * Dry-runs every function of every deployed contract with default arguments, through
 * `@parity/product-sdk-contracts` — the same encoding and decoding the app uses —
 * matching `VITE_*_ADDRESS` entries in `.env` to ABIs in `src/lib/contracts/*.json` or
 * Hardhat artifacts. A revert passes: the contract exists and answered. No signing or
 * funds needed. Run with `node scripts/test-contract-calls.js`.
 */

if (fs.existsSync('.env')) process.loadEnvFile('.env');

const WS_URL = process.env.VITE_RPC_URL || 'ws://127.0.0.1:9955';

function discoverContracts() {
  const contracts = [];
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('VITE_')) continue;
    if (!value || !value.startsWith('0x')) continue;
    if (value.length !== 42) continue;
    if (key === 'VITE_RPC_URL') continue;

    const isAddress = key.endsWith('_ADDRESS') || key.endsWith('_CONTRACT') || key.endsWith('_CONTRACT_ADDRESS');
    if (isAddress) {
      const name = key
        .replace(/^VITE_/, '')
        .replace(/_ADDRESS$/, '')
        .replace(/_CONTRACT_ADDRESS$/, '')
        .replace(/_CONTRACT$/, '')
        .toLowerCase();
      contracts.push({ name, address: value });
    }
  }
  return contracts;
}

function discoverAbis() {
  const abis = [];
  const contractsLibDir = path.join('src', 'lib', 'contracts');
  if (fs.existsSync(contractsLibDir)) {
    for (const file of fs.readdirSync(contractsLibDir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = JSON.parse(fs.readFileSync(path.join(contractsLibDir, file), 'utf-8'));
        const abi = Array.isArray(content) ? content : content.abi;
        if (Array.isArray(abi)) {
          const name = file.replace(/\.json$/, '').replace(/[-_]abi$/i, '').toLowerCase();
          abis.push({ name, abi, filePath: path.join(contractsLibDir, file) });
        }
      } catch {}
    }
  }
  if (abis.length === 0) {
    const artifactsDir = path.join('contracts', 'artifacts', 'contracts');
    if (fs.existsSync(artifactsDir)) {
      for (const solDir of fs.readdirSync(artifactsDir)) {
        const solDirPath = path.join(artifactsDir, solDir);
        if (!fs.statSync(solDirPath).isDirectory()) continue;
        for (const file of fs.readdirSync(solDirPath)) {
          if (!file.endsWith('.json') || file.endsWith('.dbg.json')) continue;
          try {
            const content = JSON.parse(fs.readFileSync(path.join(solDirPath, file), 'utf-8'));
            if (Array.isArray(content.abi) && content.abi.length > 0) {
              const name = file.replace(/\.json$/, '').toLowerCase();
              abis.push({ name, abi: content.abi, filePath: path.join(solDirPath, file) });
            }
          } catch {}
        }
      }
    }
  }

  return abis;
}

function matchAbisToContracts(contracts, abis) {
  const matched = [];
  for (const contract of contracts) {
    const match = abis.find(a => {
      const cn = contract.name.replace(/[-_]/g, '');
      const an = a.name.replace(/[-_]/g, '');
      return cn === an || cn.includes(an) || an.includes(cn);
    });
    if (match) {
      matched.push({ contract, abi: match });
    }
  }
  if (matched.length === 0 && contracts.length === abis.length && contracts.length > 0) {
    for (let i = 0; i < contracts.length; i++) {
      matched.push({ contract: contracts[i], abi: abis[i] });
    }
  }

  return matched;
}

function defaultArgForType(input) {
  const type = input.type || 'uint256';

  if (type.endsWith('[]')) return [];
  if (type === 'tuple' || type === 'tuple[]') {
    const components = input.components || [];
    const tupleVal = components.reduce((acc, comp) => {
      acc[comp.name || 'field'] = defaultArgForType(comp);
      return acc;
    }, {});
    return type === 'tuple[]' ? [tupleVal] : tupleVal;
  }
  if (type.startsWith('uint') || type.startsWith('int')) return 0n;
  if (type === 'address') return '0x0000000000000000000000000000000000000000';
  if (type === 'bool') return false;
  if (type === 'string') return '';
  if (type.startsWith('bytes')) {
    const m = type.match(/^bytes(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      return '0x' + '00'.repeat(n);
    }
    return '0x';
  }
  return '0x';
}

async function runContractTests() {
  console.log('Contract Call Validation Test\n');
  console.log('  RPC:', WS_URL);
  const contracts = discoverContracts();
  const abis = discoverAbis();

  console.log(`  Contracts found: ${contracts.length}`);
  console.log(`  ABIs found: ${abis.length}`);

  if (contracts.length === 0 || abis.length === 0) {
    console.log('\n[SKIP] No contracts or ABIs found — SPA mode or contracts not deployed');
    console.log('Contract call validation skipped.');
    process.exit(0);
  }
  const pairs = matchAbisToContracts(contracts, abis);
  if (pairs.length === 0) {
    console.log('\n[SKIP] Could not match ABIs to contract addresses');
    console.log('  Contracts:', contracts.map(c => `${c.name}=${c.address}`).join(', '));
    console.log('  ABIs:', abis.map(a => a.name).join(', '));
    process.exit(0);
  }

  console.log(`  Matched pairs: ${pairs.length}`);
  for (const p of pairs) {
    console.log(`    ${p.abi.name} -> ${p.contract.address}`);
  }
  const client = createClient(getWsProvider(WS_URL));
  const descriptor = await chainDescriptor();

  const results = [];
  let failures = 0;
  for (const { contract, abi } of pairs) {
    console.log(`\n--- ${abi.name} @ ${contract.address} ---`);

    const functions = abi.abi.filter((item) => item.type === 'function');
    if (functions.length === 0) {
      console.log('  [SKIP] No functions in ABI');
      results.push({ contract: contract.name, fn: '*', status: 'SKIP', message: 'No functions in ABI' });
      continue;
    }

    const handle = createContractFromClient(client, descriptor, contract.address, abi.abi, {
      defaultOrigin: QUERY_FALLBACK_ORIGIN,
    });

    for (const fn of functions) {
      const inputs = fn.inputs || [];
      const label = `${fn.name}(${inputs.map((i) => i.type).join(',')})`;
      try {
        const result = await handle[fn.name].query(...inputs.map((input) => defaultArgForType(input)));
        if (result.success) {
          console.log(`  [PASS] ${label} — success`);
          results.push({ contract: contract.name, fn: label, status: 'PASS', message: 'Success' });
        } else if (result.value?.type === 'ContractRevertedWithPayload') {
          console.log(`  [PASS] ${label} — reverted (business logic, contract exists)`);
          results.push({ contract: contract.name, fn: label, status: 'PASS', message: 'Reverted (business logic)' });
        } else {
          const msg = JSON.stringify(result.value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
          console.log(`  [FAIL] ${label} — ${msg.slice(0, 120)}`);
          results.push({ contract: contract.name, fn: label, status: 'FAIL', message: msg.slice(0, 200) });
          failures++;
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.log(`  [FAIL] ${label} — ${msg.slice(0, 120)}`);
        results.push({ contract: contract.name, fn: label, status: 'FAIL', message: msg.slice(0, 200) });
        failures++;
      }
    }
  }

  await client.destroy();
  console.log('\n=== CONTRACT CALL VALIDATION SUMMARY ===');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;
  console.log(`  PASS: ${passed}  FAIL: ${failed}  SKIP: ${skipped}`);

  if (failures > 0) {
    console.log('\nFailed calls:');
    for (const r of results.filter(r => r.status === 'FAIL')) {
      console.log(`  ${r.contract}.${r.fn}: ${r.message}`);
    }
    console.log('\nContract call validation FAILED');
    process.exit(1);
  } else {
    console.log('\nAll contract calls validated successfully!');
    process.exit(0);
  }
}

runContractTests().catch((error) => {
  console.error('\nContract call test FAILED:', error.message);
  console.error('\nCommon issues:');
  console.error('  - "ReviveApi.call not available" = Chain does not support Revive pallet');
  console.error('  - "encoding" errors = ABI does not match deployed contract');
  console.error('  - "not found" = Contract address is wrong or contract not deployed');
  process.exit(1);
});
