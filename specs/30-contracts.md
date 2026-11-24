---
role: contracts
phases: []
---

# Contracts

The three contracts are provided, not generated:

| Contract | Source |
|---|---|
| `PubKeyRegistry` | `/home/jamz/workspace/rosarp/w3mail/contracts/contracts/PubKeyRegistry.sol` |
| `MailboxIndex` (abstract base of the router) | `/home/jamz/workspace/rosarp/w3mail/contracts/contracts/MailboxIndex.sol` |
| `W3bMailRouter` | `/home/jamz/workspace/rosarp/w3mail/contracts/contracts/W3bMailRouter.sol` |

- Copy them into `contracts/contracts/` byte for byte. Do not edit, reformat or rename
  them; fix compile problems in the Hardhat config (Solidity 0.8.24, viaIR,
  `@openzeppelin/contracts-upgradeable`), never in the sources.
- Port the reference tests `PubKeyRegistry.test.cjs` and `W3bMailRouter.test.cjs` to
  `contracts/test/*.test.js`; all 16 must pass.
- `contracts/deploy.config.json`, following the reference `deploy.cjs`:
  1. `PubKeyRegistry`, no arguments;
  2. `W3bMailRouter` behind a UUPS proxy, `initialize("$PubKeyRegistry", 10000)`.
  `MailboxIndex` is abstract and is not deployed.

## Functions the app uses
- `PubKeyRegistry.registerPubKey(bytes)`, `fetchPubKey(address) -> bytes`,
  `hasPubKey(address) -> bool`.
- `W3bMailRouter.sendMessage(address receiver, bytes32 messageCid, string msgId)`: reverts
  with "Receiver has no public key", "Receiver inbox full", "Bad msgId", "Empty CID".
- `deleteMessages(string[] msgIds)`: soft-deletes from the caller's inbox.
- `getActiveInboxCount(address) -> uint256`.
- `getInboxPage(uint256 offset, uint256 limit) -> (EmailMetadata[] page, uint256 total)`
  and `getSentPage(...)`: both read `msg.sender`, and have two outputs, so a read returns
  `{ page, total }`.
- Events: `MessageSent(sender, receiver, msgId)`, `MessageDeleted(owner, msgId)`.
