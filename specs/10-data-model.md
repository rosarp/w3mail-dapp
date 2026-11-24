---
role: data-model
phases: []
---

# Data model

## On chain (provided contracts, unchanged)
- `PubKeyRegistry`: each account's X25519 public key (32 bytes), keyed by H160.
- `W3bMailRouter` (UUPS proxy): per account an inbox and a sent list of
  `EmailMetadata { sender, receiver, messageCid (bytes32), msgId (string), timestamp, deleted }`,
  and an inbox limit (`maxInboxSize`, 10000).

## On the Bulletin Chain
One encrypted blob per message: the JSON
`{ "v": 1, "from": <sender H160>, "to": <recipient H160>, "subject", "body", "sentAt": <ms> }`
sealed to the recipient's public key with `sealJson` from `src/lib/crypto/seal.js`, info
string `w3mail:v1`. Its CID goes on chain as `bytes32` with `cidToBytes32`, and back with
`bytes32ToCid`.

## On the device (`openCollection` from `src/lib/store.js`)
All collections are per account: prefix every collection name with the account's H160
(for example `mail:<h160>`), so Alice and Bob in one Desktop never see each other's mail.

- `mail`, keyed by `msgId`:
  `{ msgId, folder: 'inbox'|'sent'|'trash', from, to, subject, body, cid, timestamp, read, expired, deleted }`.
  `from`/`to` are H160. `folder` before trash is remembered as `previousFolder` so restore
  puts it back. An expired record has no subject or body.
- `drafts`, keyed by a local id: `{ id, to, subject, body, updatedAt }`.
- `contacts`, keyed by a local id: `{ id, name, address }`, `address` stored as H160.
- `meta`, one record `state`: `{ publicKey (hex), registeredAt, inboxSynced (count of inbox
  entries already processed) }`.

## Identifiers
- `msgId` is a UUIDv7 string, made in the app (timestamp + random, no dependency).
- Addresses are typed as SS58 or H160 and stored as lowercase H160 (`toH160` in
  `src/lib/contracts.js`).
