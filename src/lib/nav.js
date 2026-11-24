/**
 * Primary navigation, rendered by the header and the mobile tab bar. One entry per
 * top-level page in `src/pages/`; `icon` is a Lucide name.
 *
 * @typedef {object} NavItem
 * @property {string} href  With a trailing slash, e.g. `/discover/`.
 * @property {string} label
 * @property {string} [icon]
 *
 * @type {NavItem[]}
 */
export const NAV = [
  { href: '/inbox/', label: 'Inbox', icon: 'inbox' },
  { href: '/sent/', label: 'Sent', icon: 'send' },
  { href: '/drafts/', label: 'Drafts', icon: 'file-pen-line' },
  { href: '/trash/', label: 'Trash', icon: 'trash-2' },
  { href: '/contacts/', label: 'Contacts', icon: 'users' },
  { href: '/settings/', label: 'Settings', icon: 'settings' },
];

/** The compose page, reachable from every screen. */
export const COMPOSE_HREF = '/compose/';
