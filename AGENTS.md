# AGENTS.md

> Stable framework guidance for any agent working inside this dApp-Factory generated
> Polkadot dApp. Project-specific details live in `specs/`, your task prompt, and
> `.dapp-factory/handoffs/`.

The orchestrator delegates one phase of work to you at a time. Treat the rest of the
project as a contract to honour, not to rewrite.

---

## Chain & Network

- **Target chain**: Paseo Asset Hub (Polkadot Hub TestNet), **chain ID** `420420417`; or,
  when `SITE.chain` is `local`, the local development chain (see **Local network**),
  chain ID `420420421`. Never substitute another value.
- **Never deploy to or connect to** Moonbase, Moonbeam, Westend, Polkadot mainnet,
  Ethereum or any other chain.
- **Contract execution**: PolkaVM via the Revive pallet. Solidity runs through Revive's
  EVM compatibility; Rust runs natively on PolkaVM.
- **All chain access is routed through the host.** The app never opens an RPC
  WebSocket; `src/lib/chain.js` asks the host for a connection by genesis hash.

**Never reference Talisman, SubWallet, MetaMask, or extension installation in the UI.**
Outside a host, show the designed "Open in host" empty state.

## Stack

- **Astro + Alpine.js + Tailwind v4**, static output. No React, Vue, Svelte or Solid —
  never add `@astrojs/react` or any other UI framework integration.
- **JavaScript, not TypeScript.** No `.ts` or `.tsx` files. Types are JSDoc at module
  boundaries and on shapes shared between files.
- **Pages** are `src/pages/*.astro`, one route per file (`src/pages/discover.astro` →
  `/discover/`). Links always carry a trailing slash. Files and directories starting
  with `_` are not routed — `src/pages/_archetypes/` holds reference pages to copy from.
- **Layout**: every page renders inside `src/layouts/Layout.astro` (theme, header,
  toasts, transaction status), usually wrapping its content in
  `components/shell/PageLayout.astro`.
- **Navigation**: add one entry per top-level page to `NAV` in `src/lib/nav.js`. The
  header and mobile tab bar render it.
- **Styling**: only the semantic tokens in `src/styles/global.css` — `bg-bg`,
  `bg-surface`, `bg-surface-2`, `text-fg`, `text-fg-muted`, `text-fg-subtle`,
  `border-border`, `bg-primary`, `text-primary-fg`, `text-success`, `text-danger`, …
  Never raw palette colours (`bg-gray-900`, `#fff`). Do not redefine tokens; the factory
  wrote them from the spec.
- **Icons**: `components/ui/Icon.astro`, any Lucide name: `<Icon name="wallet" class="size-4" />`.
- **Motion**: CSS — `animate-rise`, `animate-fade-in`, `animate-slide-in`, Alpine
  `x-transition`. No animation libraries.

## State: Alpine stores

Registered in `src/lib/alpine.js`, in this order — **chain, then wallet, then tx**.
Never reorder or remove them; add domain stores between the `domain-stores` markers.

| Store | Holds |
|---|---|
| `$store.chain` | `status` (`idle`/`connecting`/`ready`/`unavailable`), `block` |
| `$store.wallet` | `isConnected`, `address` (SS58), `h160`, `displayName`, `balance`, `formattedBalance`, `refreshBalance()` |
| `$store.tx` | in-flight transactions; `track(title, () => promise)` |
| `$store.toasts` | `push({ title, message, tone })` for non-transaction notices |
| `$store.theme` | `current`, `toggle()` |
| `$store.faucet` | `prompt()` — called automatically on insufficient funds; a toast linking to `/wallet/faucet/` |

Component-local state is `x-data`. Anything bigger than a line or two is an
`Alpine.data('name', () => ({ … }))` — registered in one of two places:

- **A page's own behaviour** — in the page's `<script>`, as below. A page is never
  rendered inside another element, so its script always runs before Alpine needs it.
- **A reusable component's behaviour** — never in the component's `<script>`. A
  component can render inside an `x-if` or `x-for` template, where its script has not run
  when Alpine initialises it. Put the factory in `src/lib/components/<name>.js` and
  register it in `src/lib/alpine.js` between the `domain-components` markers. The
  `component-behaviour-in-alpine-js` gate enforces this.

A page:

```astro
<script>
  import Alpine from 'alpinejs';
  import { getListings } from '../lib/market.js';

  Alpine.data('marketPage', () => ({
    listings: [],
    loading: true,
    async init() {
      this.listings = await getListings();
      this.loading = false;
    },
  }));
</script>
```

React idioms have Alpine equivalents: `useDebounce` → `x-model.debounce.300ms`,
`usePrevious` → `$watch`, `useToggle` → `x-data="{ open: false }"`, derived values →
getters on the data object.

## Chain and contracts

- **Chain client**: `getChain()` from `src/lib/chain.js` resolves `{ client, api, typedApi,
  contracts }` and connects on first use, through `@parity/product-sdk-chain-client`.
  `onBlock(cb, { minIntervalMs })` subscribes to best blocks. Never create a client of your own.
- **Host SDK**: host, chain, signer and contract access use the `@parity/product-sdk-*`
  packages pinned in `package.json`. Never add `@novasamatech/*`, `@polkadot-api/sdk-ink` or
  the umbrella `@parity/product-sdk` (it pulls in React), and never import `viem` in `src/`.
- **Contracts**: `createContract(abi, address)` from `src/lib/contracts.js` returns
  `{ read(fn, args), write(fn, args, value) }`. Write a **domain module** —
  `src/lib/<domain>.js` exporting `getListings()`, `buy(id)` — that wraps it. Pages and
  components call the domain module, never `createContract` directly.
- Every write goes through `$store.tx.track('Buying', () => buy(id))`. Never `alert()`.
- Before deployment reads short-circuit: guard with `isContractDeployed()` from
  `src/lib/contracts/ready.js` and render the empty state.
- `src/lib/contracts/abi.js` and `config.js` are **written by the deploy script** — do not
  hand-edit them.
- Addresses: display SS58 via `displayName()` from `src/lib/identity.js` beside an
  `AddressAvatar`; never show a raw address. `ss58ToH160` is in `src/lib/chain.js`.
- Files users upload go to the Bulletin Chain via `src/lib/bulletin.js`; store the CID.
  Read content back with `fetchBytes(cid)` / `fetchJson(cid)`; a contract that keeps a CID
  as `bytes32` converts with `cidToBytes32` / `bytes32ToCid`.
- Data the user expects to find again (drafts, settings, a local index) goes in
  `openCollection(name)` from `src/lib/store.js`, never `window.localStorage`.
- Per-user keys come from `deriveKeyPair(context)` in `src/lib/crypto/keys.js`, with the
  account in the context (`<app>:x25519:v1:<h160>`); encrypt for a public key with
  `seal` / `open` from `src/lib/crypto/seal.js`. Never store a secret key.
- Live cross-user state (presence, reactions, feeds) uses `src/lib/live/`.
- Design preview: wrap primary lists in `previewFallback(real, SAMPLE)` from
  `src/lib/preview.js` so the design review sees a populated app.

## Contract platforms

### Solidity + Hardhat (Revive EVM mode)

- Build: `cd contracts && npm install && npx hardhat compile`.
- Deploy: the engine runs `scripts/deploy-wrapper.js` on the spec's network after CONTRACTS, and `dapp-factory deploy <name>` runs it again.
- `contracts/hardhat.config.js` defines the `paseo` (chainId `420420417`) and `local`
  (chainId `420420421`) networks; the engine deploys to the spec's network.
- The frontend uses `createContract` over `@parity/product-sdk-contracts` (PAPI `ReviveApi`),
  not `contractsApi`, ethers or a viem client.

### Rust + CDM (PolkaVM native mode)

- **Do not use Hardhat.** Build and deploy with the CDM toolchain in `contracts/`.
- Deploy writes `src/lib/contracts/abi.js` and the address into `.env`.

## Local network

Every project carries both networks; `SITE.chain` (from `PUBLIC_CHAIN` in `.env`, which
the factory writes) picks one, and `dapp-factory network <name> local|paseo` switches it.
Never hardcode a chain, a descriptor or an address: read `SITE.chain`, `chainDescriptor()`
and `src/lib/contracts/config.js`.

When `SITE.chain` is `local` the app runs against the development chain `dapp-factory
chain up` starts, typed by `@polkadot-api/descriptors`, which `bun install` (or `bun run
papi`) generates into `.papi/descriptors/dist/` from `.papi/metadata/local.scale` (never
edit either). The phone cannot sign for that chain, so `$store.wallet` acts as a dev
account (`mode: 'dev'`, Alice by default) chosen on `/wallet/dev-account/`, and contract
writes skip the gas allowance; the account is mapped on its first write. Bulletin uploads
and live messages stay on Paseo under the product account. To try it:

1. `bun run local` (chain:up, network:local and deploy);
2. in Desktop, Settings → Development → Custom chains, add `ws://localhost:9955`. Desktop
   records the chain's genesis when it is added: if that URL was added for another chain,
   remove it and add it again, or every call fails with `ChainNotSupportedError`;
3. open `dapp-factory preview <name>`'s URL in Desktop and pick a dev account from the
   header chip.

A dev account is a test identity: never offer one, or link `/wallet/dev-account/`, on `paseo`.

## Product id

`PUBLIC_PRODUCT_ID` in `.env` (`<domain>.paseo`) is the product id the host derives the
app's account from. The factory writes it; `productIdentifier()` reads it. Never hardcode
an id or change that line.

## Hosting constraints

The app is served from an IPFS archive inside a host iframe or webview.

- No inline `<script>` or `<style>` — never `is:inline` script bodies or `set:html`
  scripts. Put scripts in the component's `<script>` block (bundled) or in `public/`.
- No CDN assets or external fetches. Bundle fonts, images and data locally.
- Keep asset paths root-absolute (Astro's default). Do not set a relative `base`.

When the project has a `src-tauri/`, it also ships as a desktop app: the same build in a
native window, with no Polkadot host around it. The host-only rules above still hold —
the web build is the product. `src/lib/desktop.js` is the only module that may import
`@tauri-apps/api`, and every use of it is behind `isDesktop()`. Do not add commands,
plugins or capabilities to `src-tauri/` unless the spec asks for a native feature.

## Build tooling

- Astro (Vite) is the bundler. No Webpack, Rollup configs or alternative bundlers.
- Do not add `vite-plugin-node-polyfills`; PAPI needs no Node polyfills.
- Do not change `astro.config.mjs`, `app.config.mjs` or `triangle.config.mjs`. Alpine
  plugins are registered in `src/lib/alpine.js`.
- Never hand-edit lockfiles.

## Code conventions

- No code comments. Name things so a comment is unnecessary; exported functions get a
  JSDoc comment describing the contract.
- Components: PascalCase `.astro` in `src/components/`. A block used twice becomes a
  component; a block used once stays in the page.
- Props are documented with a `@typedef {object} Props` JSDoc block in the frontmatter.
- Library modules: camelCase `.js` in `src/lib/`. Import with relative paths and the `.js`
  extension. No barrel files.
- No `console.log` in committed code.

## UI conventions

- Reuse `src/components/ui/` before writing markup: `Button`, `Card`, `Field`, `Input`,
  `Textarea`, `Select`, `Tabs`, `Badge`, `Alert`,
  `EmptyState`, `Skeleton`, `DataTable`, `StatCard`, charts, `TxButton`, `AmountInput`,
  `AddressAvatar`, `IdentityChip`, `CopyButton`. Page sections live in
  `src/components/sections/`.
- Every list has a designed empty state; loading uses `Skeleton`.
- Forms validate on blur and submit and show inline errors (`Field` / `Input` `error`).
- **Pages, not dialogs.** A form, a detail view, a picker or a multi-step flow is its
  own page, reached by a link and left by a link back — pass `?return=<path>` when it
  can be reached from more than one place. A flow page that is not a top-level
  destination nests under its section (`src/pages/feed/compose.astro`) and stays out of
  `NAV`. Prefer undo (a toast) to asking for confirmation. Keep page JS light; Alpine
  for interaction.

## Anti-patterns

- ❌ Adding React, JSX, `.tsx`, or a client router.
- ❌ `ethers` `BigNumber` semantics on Substrate balances. Balances are `bigint`.
- ❌ EVM gas assumptions; PolkaVM uses weight-based metering.
- ❌ Hardhat against a Rust/PolkaVM project.
- ❌ Calling `createContract` from a page or component.
- ❌ A second chain client, or a `wss://` URL in app code.
- ❌ Wallet-extension prompts in the UI.
- ❌ Modal dialogs — a veil over the page that blocks it. Use a page.
- ❌ Re-installing dependencies already in `package.json`.

## Commits

- Commit your work as you finish each feature or module, one commit per feature or
  module: `Add inbox page and mail list`, `Add mail domain module`.
- Stage only the files you changed, by path. Never `git add -A` or `git commit -a`:
  another phase may be writing the same tree.
- Subject only: short, imperative, meaningful. No `prefix:` (`feat:`, `df:`, `fix:`), no
  body unless the change cannot be understood without one.
- Never add `Co-Authored-By`, `Generated with` or any other attribution trailer.

## Tool usage

- Read before you write; prefer editing to rewriting.
- Bash is for `bun install` / `npm install`, builds, deploy scripts and git. Do not run
  the dev server — the orchestrator owns it.

## Phase boundaries

- **Stay in your lane.** The frontend agent does not modify `contracts/`; the contracts
  agent does not modify `src/`.
- Read the handoffs of your declared dependencies in `.dapp-factory/handoffs/`.
- **Write your handoff as your final action**: `.dapp-factory/handoffs/<phase>.json`,
  via `<phase>.json.tmp` then rename.

## When stuck

- Re-read this file before guessing. The existing code is the truth for names and paths;
  this file is the truth for chain, contract and build rules.
- Don't invent a pattern silently: record the gap in your handoff's `gotchas_for_next`
  and use the simplest implementation that satisfies the task.

## This project

w3mail: end-to-end encrypted mail. Sealed messages go to the Bulletin Chain; the
`W3bMailRouter` contract indexes them per recipient; everything readable lives in the
device's mailbox collections.

**Pages** (`src/pages/`, behaviour in `src/lib/pages/*.js`, registered by each page):

- `/` (`homePage`): mailbox setup (key registration when missing or changed), then counts.
- `/inbox/`, `/sent/`, `/trash/`: `MailFolder` lists driven by `Alpine.data('mailFolder')`.
- `/drafts/`, `/compose/` (`?to=`, `?draft=`, reply), `/read/?msgId=<record key>`,
  `/purge/?msgId=` (delete for good), `/contacts/`, `/contacts/edit/`, `/settings/`.
- `/wallet/dev-account/` (local chain only) and `/wallet/faucet/` come from the template.

**Domain modules** (`src/lib/`):

- `mail.js`: `isMailServiceReady`, `mailboxKey`, `keyStatus`, `registerKey`, `sendMail`,
  `syncInbox`, `listFolder`, `folderCounts`, `getMessage`, `markRead`, `moveToTrash`,
  `restoreMessage`, `purgeMessage`, `hasStorageAllowance`, `requestStorageAllowance`,
  `mailErrorMessage`, `trackMail`.
- `mailbox.js`: `mailbox(h160)` (collections `mail`/`drafts`/`contacts`/`meta` per account),
  `currentAccount`, `readState`, `writeState`, `parseAddress`, `shortAddress`, `uuidv7`,
  `returnTo`, `mailTime`, `fullTime`.
- `drafts.js`: `listDrafts`, `getDraft`, `saveDraft`, `deleteDraft`.
- `contacts.js`: `listContacts`, `getContact`, `contactNames`, `validateContact`,
  `saveContact`, `removeContact`.
- `flash.js`: `flash(toast)` shows a toast after the next navigation.
- `mailLimits.js`: `MAX_BODY_LENGTH`, `MAX_SUBJECT_LENGTH`.

**Stores**: `Alpine.store('flash')` between the `domain-stores` markers.

**Contract calls**: `PubKeyRegistry.hasPubKey`, `fetchPubKey`, `registerPubKey`;
`W3bMailRouter.sendMessage`, `getActiveInboxCount`, `getInboxPage`, `deleteMessages`.

**Things that trip newcomers**:

- `getInboxPage` answers for `msg.sender`, so `syncInbox` passes `{ origin }` and reads
  nothing until the account is mapped. It returns `{ page, total }`.
- Sync progress is `meta.state.inboxSynced` (an on-chain offset), saved per entry. A
  Bulletin fetch failure is retried unless the entry is older than 13 days; an
  undecryptable blob is stored as expired.
- Record keys: inbox copies use the `msgId`; a sent copy of a note to self uses
  `<msgId>:sent`; a msgId reused by another sender is `<sender>:<msgId>`.
- Only received messages are deleted on chain; sent copies exist only on this device.
- `.astro` frontmatter runs in Node at build time: never import a module that reaches
  `alpinejs` there (use `mailLimits.js`, `site.js`).
- The UI never says transaction, CID or gas: status goes through `trackMail`, not
  `$store.tx.track`.
- `src/lib/contracts/config.js` reads `import.meta.env`, so Node scripts take addresses
  from `contracts/deployments/latest.json`.
- `scripts/e2e-roundtrip.js` registers deterministic test keys for the Alice and Bob
  dev accounts; in the app those accounts then show "key changed" and ask to set up again.
- Tests: `src/lib/mail.test.js` mocks `contracts.js`, `bulletin.js`, `crypto/keys.js`,
  `chain.js` and `stores.js` with a small in-memory chain, and uses the real `seal.js` and
  in-memory `store.js`. `vitest.config.js` limits Vitest to `src/**/*.test.js`.
