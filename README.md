# w3mail

Private, end-to-end encrypted mail between Polkadot accounts.

Every message is sealed to the recipient's mailbox key on the sender's device before it
leaves it; nobody else, the chain included, can read it. The sealed message is stored on
the Polkadot Bulletin Chain, where it is kept for about two weeks, and a small contract on
Asset Hub tells the recipient where to find it. Each person's mailbox — inbox, sent,
drafts, trash and contacts — lives on their own device.

## Features

- **Inbox, Sent, Drafts, Trash**: a dense mail list with a clear unread state.
- **Compose**: write to an address or a contact; drafts are saved on the device.
- **Read**: open a message, reply, move it to trash.
- **Trash and restore**: a trashed message goes back to the folder it came from.
- **Delete for good**: its own confirmation page; a received message is also removed
  from your mailbox on chain.
- **Contacts**: name the addresses you write to.
- **Settings**: mailbox key status, message storage permission and sync state.
- **Expiry**: a message that was not picked up while it was still on the Bulletin Chain
  shows as expired rather than disappearing.

## Using it in the Polkadot host

w3mail runs inside the Polkadot host (Desktop or the mobile app); there is no login page,
the host provides the account. Outside the host the app shows an "Open in the Polkadot
app" screen.

1. Open the app. On first use it asks you to set up your mailbox: one approval that
   registers your mailbox key. If your key ever changes, it asks again.
2. Press **Compose**, enter an address or pick a contact, and send. The host asks you to
   allow message storage the first time.
3. The recipient's inbox picks the message up within a few blocks and decrypts it on
   their device.
4. Read, reply, move to trash, restore, or delete for good.

On the local development chain the account is a dev account (Alice, Bob, ...) picked
from the header chip; the app is otherwise identical.

## Contracts

Solidity, running on Asset Hub through the Revive pallet. Addresses live in `.env` and
in `contracts/deployments/latest.json`; the deploy script also writes them into
`src/lib/contracts/config.js` and the ABIs into `src/lib/contracts/abi.js`.

| Contract | What it does | Address (local chain) |
|---|---|---|
| `PubKeyRegistry` | Holds each account's 32-byte mailbox public key: `registerPubKey`, `hasPubKey`, `fetchPubKey`. | `0xc01Ee7f10EA4aF4673cFff62710E1D7792aBa8f3` (`VITE_PUBKEYREGISTRY_ADDRESS`, also `VITE_CONTRACT_ADDRESS`) |
| `W3bMailRouter` | The mail index, behind a UUPS proxy: `sendMessage` records the sealed message's location in the recipient's inbox; `getInboxPage`, `getActiveInboxCount` and `deleteMessages` serve the caller's own inbox. Admin-only inbox size and upgrades. | `0x3ed62137c5DB927cb137c26455969116BF0c23Cb` (`VITE_W3BMAILROUTER_ADDRESS`) |
| `MailboxIndex` | Abstract base of the router's inbox storage; not deployed. | — |

## Local development

```bash
bun install
bun run dev      # dev server on http://localhost:4321
bun run check    # astro check
bun run build    # static build into dist/
bun run test     # Vitest unit tests for src/lib
```

Contracts:

```bash
cd contracts && npm install && npx hardhat compile && npx hardhat test
```

End-to-end round trip against the local chain (`dapp-factory chain up`, contracts
deployed): Alice and Bob register keys, Alice sends Bob a sealed message, Bob's inbox
lists it and it opens.

```bash
node scripts/e2e-roundtrip.js
```

Copy `.env.example` to `.env` for the variables the app reads. Chain access goes through
the host; the app never opens an RPC connection of its own.

## Project structure

```
src/pages/        one file per screen: inbox, sent, drafts, trash, read, compose,
                  purge (delete for good), contacts/, contacts/edit, settings
src/components/   mail/ (MailShell, MailFolder, HostRequired) plus the template's
                  ui/, sections/, shell/, chain/, wallet/ and live/ primitives
src/lib/          mail.js (send, sync, folders), mailbox.js (per-account storage),
                  drafts.js, contacts.js, crypto/ (keys, sealing), bulletin.js,
                  contracts.js, pages/ (Alpine page objects)
src/styles/       global.css design tokens
contracts/        Solidity sources, Hardhat tests and the deploy script
scripts/          e2e-roundtrip.js and chain smoke tests
```
