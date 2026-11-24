---
role: testing
phases: []
---

# Testing

## Contracts
The 16 ported Hardhat tests pass.

## Unit tests (`src/lib/mail.test.js`), against mocked `contracts.js`, `bulletin.js` and
`crypto/keys.js`, with the real `seal.js` and the in-memory `store.js`:
- send seals to the recipient's key and a second key pair opens it (round trip);
- send stops with the "hasn't set up w3mail yet" message for an unregistered recipient;
- sync pages from `meta.inboxSynced`, skips stored and deleted entries, and is idempotent;
- an unavailable or undecryptable blob is stored as expired;
- sync does nothing while the account is unmapped;
- first use registers the key only when missing or changed;
- purge calls `deleteMessages` and hides the record; trash and restore round trip;
- collections of two accounts do not mix.

## End to end
`scripts/e2e-roundtrip.js`, ported from the references `roundtrip.mjs` and
`contracts-headless.mjs`: against the local chain, Alice and Bob register keys, Alice
sends Bob a sealed message, Bob's inbox page lists it and the content opens. Run with
`node scripts/e2e-roundtrip.js`; it is not part of `bun run test`.
