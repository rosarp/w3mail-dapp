/**
 * Facts about this app fixed at scaffold time. Everything else reads from here rather
 * than repeating a name or a chain.
 */
export const SITE = {
  name: 'w3mail',
  title: 'w3mail',
  description: 'Private, end-to-end encrypted mail between Polkadot accounts. Messages are sealed to the recipient\'s key, stored on the Bulletin Chain for about two weeks, and indexed by a contract on Asset Hub; each mailbox lives on the person\'s own device. Screens: inbox, sent, drafts, trash, read, compose, contacts, settings and a delete-for-good confirmation, each its own page. A clean, quiet mail client that never feels like crypto.',
  chain: 'local',
  defaultTheme: /** @type {'light' | 'dark'} */ ('light'),
};
