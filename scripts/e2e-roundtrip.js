import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws';
import { local } from '@polkadot-api/descriptors';
import {
  createContract,
  createContractRuntimeFromClient,
  ensureContractAccountMapped,
} from '@parity/product-sdk-contracts';
import { createDevSigner, getDevPublicKey } from '@parity/product-sdk-tx';
import { ss58Address } from '@polkadot-labs/hdkd-helpers';
import { ss58ToH160 } from '@parity/product-sdk-address';
import { calculateCid } from '@parity/product-sdk-cloud-storage';
import { bytesToHex, hexToBytes, nacl, sha256, utf8ToBytes } from '@parity/product-sdk-crypto';
import { PUBKEYREGISTRY_ABI, W3BMAILROUTER_ABI } from '../src/lib/contracts/abi.js';
import { bytes32ToCid, cidToBytes32 } from '../src/lib/bulletin.js';
import { openJson, sealJson } from '../src/lib/crypto/seal.js';

/**
 * End-to-end round trip against the local chain `dapp-factory chain up` runs: Alice and
 * Bob map their accounts and register mailbox keys, Alice seals a message to Bob's key
 * and announces it through W3bMailRouter, Bob's inbox page lists it, and the content
 * opens with Bob's key. It uses the app's own ABIs, CID conversion and sealing.
 *
 * Bulletin uploads go through the Polkadot host, which a headless run does not have, so
 * the sealed blob is kept in this process under its real CID. Set `BULLETIN_IPFS` to an
 * IPFS gateway to fetch it from there instead.
 *
 * Run with `node scripts/e2e-roundtrip.js`. Exits 0 on success, 1 on failure.
 */

const WS_URL = process.env.LOCAL_WS ?? 'ws://127.0.0.1:9955';
const SEAL_INFO = 'w3mail:v1';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const deployment = JSON.parse(readFileSync(`${ROOT}contracts/deployments/latest.json`, 'utf8'));

const log = (/** @type {unknown[]} */ ...parts) => process.stdout.write(`[e2e] ${parts.join(' ')}\n`);

/** @type {Map<string, Uint8Array>} */
const blobs = new Map();

/** @param {'Alice' | 'Bob'} name */
function devAccount(name) {
  const ss58 = ss58Address(getDevPublicKey(name));
  const keys = nacl.box.keyPair.fromSecretKey(sha256(utf8ToBytes(`w3mail:e2e:${name}`)));
  return { name, ss58, h160: ss58ToH160(ss58).toLowerCase(), signer: createDevSigner(name), keys };
}

/** @param {unknown} value */
function bytesOf(value) {
  if (value instanceof Uint8Array) return value;
  const binary = /** @type {{ asBytes?: () => Uint8Array }} */ (value);
  if (binary && typeof binary.asBytes === 'function') return binary.asBytes();
  return hexToBytes(String(value).replace(/^0x/, ''));
}

/**
 * @template T
 * @param {string} label
 * @param {() => Promise<T>} poll
 * @returns {Promise<T>}
 */
async function waitFor(label, poll, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await poll().catch(() => null);
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

/** @param {{ success: boolean, value: any }} result @param {string} what */
function valueOf(result, what) {
  if (!result.success) throw new Error(`${what} failed: ${JSON.stringify(result.value, (_k, v) => (typeof v === 'bigint' ? `${v}` : v))}`);
  return result.value;
}

/** @param {{ ok: boolean, error?: unknown }} result @param {string} what */
function sent(result, what) {
  if (result.ok === false) throw new Error(`${what} failed: ${result.error instanceof Error ? result.error.message : result.error}`);
  log(what);
}

/** @param {string} cid */
async function fetchBlob(cid) {
  const gateway = process.env.BULLETIN_IPFS;
  if (!gateway) return blobs.get(cid) ?? null;
  const response = await fetch(`${gateway.replace(/\/$/, '')}/ipfs/${cid}`);
  return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
}

async function run() {
  const client = createClient(getWsProvider(WS_URL));
  try {
    const runtime = createContractRuntimeFromClient(client, local);
    const registry = createContract(runtime, deployment.contracts.PubKeyRegistry, PUBKEYREGISTRY_ABI);
    const router = createContract(runtime, deployment.contracts.W3bMailRouter, W3BMAILROUTER_ABI);
    const alice = devAccount('Alice');
    const bob = devAccount('Bob');
    log(`Alice ${alice.ss58} (${alice.h160})`);
    log(`Bob   ${bob.ss58} (${bob.h160})`);

    for (const who of [alice, bob]) {
      sent(await ensureContractAccountMapped(runtime, who.ss58, who.signer), `${who.name} mapped`);
      const keyHex = `0x${bytesToHex(who.keys.publicKey)}`;
      const onChain = valueOf(await registry.hasPubKey.query(who.h160, { origin: who.ss58 }), 'hasPubKey')
        ? `0x${bytesToHex(bytesOf(valueOf(await registry.fetchPubKey.query(who.h160, { origin: who.ss58 }), 'fetchPubKey')))}`
        : null;
      if (onChain === keyHex) {
        log(`${who.name} key already registered`);
      } else {
        sent(await registry.registerPubKey.tx(keyHex, { signer: who.signer, origin: who.ss58 }), `${who.name} key registered`);
      }
    }

    const bobKey = bytesOf(valueOf(await registry.fetchPubKey.query(bob.h160, { origin: alice.ss58 }), 'fetchPubKey'));
    assert.deepEqual([...bobKey], [...bob.keys.publicKey], "the registry returned a different key for Bob");

    const msgId = crypto.randomUUID();
    const subject = 'Hello from the local chain';
    const body = `Round trip ${msgId}`;
    const sealed = sealJson({ v: 1, from: alice.h160, to: bob.h160, subject, body, sentAt: Date.now() }, bobKey, SEAL_INFO);
    const cid = (await calculateCid(sealed)).toString();
    blobs.set(cid, sealed);
    sent(await router.sendMessage.tx(bob.h160, cidToBytes32(cid), msgId, { signer: alice.signer, origin: alice.ss58 }), `Alice sent ${msgId}`);

    const entry = await waitFor("the message in Bob's inbox", async () => {
      const head = valueOf(await router.getInboxPage.query(0n, 1n, { origin: bob.ss58 }), 'getInboxPage');
      const total = Number(head.total ?? head[1] ?? 0);
      const start = BigInt(Math.max(0, total - 50));
      const result = valueOf(await router.getInboxPage.query(start, 50n, { origin: bob.ss58 }), 'getInboxPage');
      const page = /** @type {any[]} */ (result.page ?? result[0] ?? []);
      return page.find((e) => String(e.msgId) === msgId) ?? null;
    });
    assert.equal(String(entry.sender).toLowerCase(), alice.h160, 'the inbox entry names a different sender');
    log("Bob's inbox lists the message");

    const blobCid = bytes32ToCid(/** @type {`0x${string}`} */ (`0x${bytesToHex(bytesOf(entry.messageCid))}`));
    assert.equal(blobCid, cid, 'the inbox entry points at a different blob');
    const blob = await waitFor('the sealed message', () => fetchBlob(blobCid));
    const opened = /** @type {any} */ (openJson(blob, bob.keys.secretKey, SEAL_INFO));
    assert.equal(opened.subject, subject);
    assert.equal(opened.body, body);
    assert.throws(() => openJson(blob, alice.keys.secretKey, SEAL_INFO), /cannot be decrypted/);
    log('Bob opened the message; Alice cannot');
  } finally {
    client.destroy();
  }
}

run().then(
  () => {
    log('PASS');
    process.exit(0);
  },
  (err) => {
    process.stderr.write(`[e2e] FAIL: ${err instanceof Error ? err.stack : err}\n`);
    process.exit(1);
  },
);
