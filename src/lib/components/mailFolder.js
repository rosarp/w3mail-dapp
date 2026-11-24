import { component } from '../component.js';
import { onBlock } from '../chain.js';
import { toastStore } from '../stores.js';
import { contactNames } from '../contacts.js';
import { currentAccount, readState, mailTime, shortAddress } from '../mailbox.js';
import {
  isMailServiceReady,
  keyStatus,
  listFolder,
  mailErrorMessage,
  moveToTrash,
  restoreMessage,
  syncInbox,
} from '../mail.js';
import { isDesignPreview } from '../preview.js';
import { timeAgo } from '../format.js';

/**
 * Alpine data `mailFolder`, the behaviour of `mail/MailFolder.astro`: one folder's
 * messages, with sync for the inbox.
 *
 * @param {import('../mailbox.js').Folder} folder
 */
export function mailFolder(folder) {
  return component({
    folder,
    /** @type {string | null} */
    h160: null,
    /** @type {import('../mailbox.js').MailRecord[]} */
    items: [],
    /** @type {Record<string, string>} */
    names: {},
    loading: true,
    syncing: false,
    error: '',
    needsSetup: false,
    lastSyncedAt: 0,
    now: Date.now(),
    /** @type {(() => void) | null} */
    stopBlocks: null,

    async init() {
      this.h160 = await currentAccount();
      if (!this.h160) {
        this.loading = false;
        return;
      }
      await this.load();
      if (folder !== 'inbox') return;
      this.checkSetup();
      if (!isMailServiceReady() || isDesignPreview()) return;
      this.sync(true);
      this.stopBlocks = onBlock(() => this.sync(true), { minIntervalMs: 20000 });
    },

    destroy() {
      this.stopBlocks?.();
    },

    async load() {
      try {
        const [items, names, state] = await Promise.all([
          listFolder(this.h160, folder),
          contactNames(this.h160),
          readState(this.h160),
        ]);
        this.items = items;
        this.names = names;
        this.lastSyncedAt = state.lastSyncedAt ?? 0;
        this.error = '';
      } catch (err) {
        this.error = `Your mail could not be loaded. ${mailErrorMessage(err)}`;
      } finally {
        this.loading = false;
      }
    },

    async checkSetup() {
      try {
        const status = await keyStatus(this.h160);
        this.needsSetup = status === 'unregistered' || status === 'changed';
      } catch {
        this.needsSetup = false;
      }
    },

    async sync(quiet = false) {
      if (this.syncing || !this.h160) return;
      if (!isMailServiceReady()) {
        if (!quiet) this.error = 'Mail is not available yet. Try again in a moment.';
        return;
      }
      this.syncing = true;
      try {
        const { added } = await syncInbox(this.h160);
        await this.load();
        this.now = Date.now();
        if (!quiet) {
          toastStore().push({
            title: added ? `${added} new message${added === 1 ? '' : 's'}` : 'You are up to date',
            tone: added ? 'success' : 'info',
          });
        }
      } catch (err) {
        if (!quiet) this.error = `Sync did not finish. ${mailErrorMessage(err)}`;
      } finally {
        this.syncing = false;
      }
    },

    /** @param {import('../mailbox.js').MailRecord} item */
    counterpart(item) {
      const origin = item.folder === 'trash' ? item.previousFolder : item.folder;
      return origin === 'sent' ? item.to : item.from;
    },

    /** @param {import('../mailbox.js').MailRecord} item */
    nameFor(item) {
      const address = this.counterpart(item);
      const prefix = item.folder === 'sent' ? 'To ' : '';
      return prefix + (this.names[address] ?? shortAddress(address));
    },

    /** @param {import('../mailbox.js').MailRecord} item */
    subjectOf(item) {
      if (item.expired) return 'Message expired';
      return item.subject.trim() || '(no subject)';
    },

    /** @param {import('../mailbox.js').MailRecord} item */
    snippet(item) {
      if (item.expired) return 'Not synced within about two weeks, so it can no longer be read.';
      return item.body.split('\n').find((line) => line.trim()) ?? '';
    },

    /** @param {import('../mailbox.js').MailRecord} item */
    when(item) {
      return mailTime(item.timestamp);
    },

    /** @param {import('../mailbox.js').MailRecord} item */
    isUnread(item) {
      return item.folder === 'inbox' && !item.read && !item.expired;
    },

    /** @param {import('../mailbox.js').MailRecord} item */
    readHref(item) {
      return `/read/?msgId=${encodeURIComponent(item.key)}&return=${encodeURIComponent(`/${folder}/`)}`;
    },

    /** @param {import('../mailbox.js').MailRecord} item */
    purgeHref(item) {
      return `/purge/?msgId=${encodeURIComponent(item.key)}&return=${encodeURIComponent(`/${folder}/`)}`;
    },

    /** @param {import('../mailbox.js').MailRecord} item */
    async restore(item) {
      try {
        await restoreMessage(this.h160, item.key);
        this.items = this.items.filter((m) => m.key !== item.key);
        toastStore().push({ title: 'Message restored', tone: 'success' });
      } catch (err) {
        toastStore().push({ title: 'Could not restore', message: mailErrorMessage(err), tone: 'danger' });
      }
    },

    /** @param {import('../mailbox.js').MailRecord} item */
    async trash(item) {
      try {
        await moveToTrash(this.h160, item.key);
        this.items = this.items.filter((m) => m.key !== item.key);
        toastStore().push({ title: 'Moved to trash', tone: 'info', link: { href: '/trash/', label: 'Open trash' } });
      } catch (err) {
        toastStore().push({ title: 'Could not move to trash', message: mailErrorMessage(err), tone: 'danger' });
      }
    },

    get unreadCount() {
      return this.items.filter((m) => this.isUnread(m)).length;
    },

    get lastSyncedLabel() {
      return this.lastSyncedAt ? `Last synced ${timeAgo(this.lastSyncedAt, this.now)}` : 'Not synced yet';
    },

    get isEmpty() {
      return !this.loading && this.items.length === 0;
    },
  });
}
