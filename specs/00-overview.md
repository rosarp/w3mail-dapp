---
role: overview
phases: []
---

# w3mail

Private mail between Polkadot accounts. Every message is end-to-end encrypted to the
recipient's key before it leaves the sender's device; nobody else, including the chain, can
read it. The sender stores the encrypted message on the Bulletin Chain, and a small
contract on Asset Hub tells the recipient where to find it. Each person's mailbox lives on
their own device.

## Who it is for
People who already have a Polkadot account in the host and want to send each other
messages without a mail provider in between.

## Core loop
1. Open the app. On first use it sets the mailbox up (one key registration), then shows
   the inbox.
2. Compose a message to an address or a contact, and send it.
3. The recipient's inbox picks it up within a few blocks, decrypts it on their device, and
   shows it.
4. Read, reply, move to trash, restore, or delete for good.

## Feel
A clean, quiet mail client: dense lists, clear unread state, fast. It should feel like
mail, not like crypto. Say "message", "address", "contact"; never "CID", "blob",
"transaction" or "gas" in the UI. Errors say what to do next.

## Things to know
- Messages are kept on the Bulletin Chain for about two weeks. Once a message has been
  synced it lives on the device; one that was never synced in time shows as expired.
- There is no login page: the host provides the account.
- On the local development chain the account is a dev account (Alice, Bob, ...), picked
  from the header; the app is otherwise identical.
