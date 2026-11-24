---
role: integration
phases: []
---

# Integration

Put the mail logic in one domain module, `src/lib/mail.js`, over the template's modules;
pages call it, never `createContract` directly. Use `contracts.js`, `bulletin.js`
(`uploadBytes`, `fetchBytes`, `cidToBytes32`, `bytes32ToCid`), `crypto/keys.js`,
`crypto/seal.js` and `store.js`. Do not add crypto or storage dependencies. The reference
`/home/jamz/workspace/rosarp/w3mail/src/lib/mail.js`, `crypto.js` and `keys.js` show the flows; reimplement
them on these modules rather than copying.

## Keys and first use
- The key pair is `deriveKeyPair(`w3mail:x25519:v1:${wallet.h160}`)`: derived by the host,
  nothing secret stored. The address in the context keeps two accounts in one Desktop apart.
- First use, in order:
  1. the account is mapped (the first contract write maps it; `isAccountMapped` tells);
  2. `hasPubKey(myH160)`;
  3. if false, or `fetchPubKey` differs from the derived public key, `registerPubKey`;
  4. save the public key in `meta`.
- The index page shows these steps as they happen. Until they are done, Compose explains
  that the mailbox is being set up.

## Send
1. Resolve the recipient (contact or typed address) to H160.
2. `hasPubKey(recipient)`. If false, stop with "This address hasn't set up w3mail yet."
3. `fetchPubKey(recipient)`. The contract accepts keys of 1 to 64 bytes, so refuse one
   that is not exactly 32 bytes with "This address's mail key is invalid; they need to set
   up w3mail again." Then `sealJson(message, recipientKey, 'w3mail:v1')`.
4. `uploadBytes(sealed)`, then `sendMessage(recipient, cidToBytes32(cid), msgId)`.
5. Put a `sent` record with the plaintext: the sender cannot decrypt the sealed copy, so
   the device's record is the only readable copy of sent mail. Delete the draft it came from.
- Map reverts to sentences: inbox full -> "Their inbox is full."

## Sync (inbox)
1. Only once the account is mapped. A read from an unmapped account falls back to
   another origin, and its mailbox would be the wrong one.
2. `getActiveInboxCount(me)`; if it differs from the local inbox count, page through
   `getInboxPage(offset, 50)` from `meta.inboxSynced`.
3. msgIds are not unique on chain: any sender can reuse one. Sync never overwrites a
   stored record. An entry whose `msgId` is already stored from the same sender is
   skipped; one from a different sender is stored under the key `<sender>:<msgId>`, and
   purge passes that entry's on-chain `msgId`.
   For each entry not yet stored and not `deleted`:
   `fetchBytes(bytes32ToCid(messageCid))`, `openJson(bytes, secretKey, 'w3mail:v1')`, put
   it in `inbox` unread. Show the on-chain `sender` as the sender, not the blob's `from`.
4. "This content is not available on Bulletin" or "This message cannot be decrypted"
   stores the record as `expired` with sender and time only.
5. Advance `meta.inboxSynced`.
- Sync runs on page load, from a Sync button, and on `onBlock` at most once every 12
  blocks. One sync at a time.

## Trash and delete
- Move to trash and Restore are local (`folder`, `previousFolder`).
- Delete for good, from the purge page: `deleteMessages([msgId])` for an inbox message,
  then mark the record `deleted` and hide it. Sent mail is only removed locally.

## Contacts and drafts
- Local only, through `store.js`. Compose saves a draft as you type (debounced) and on
  leaving; sending removes it.
