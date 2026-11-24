import { component } from '../component.js';
import { onBlock } from '../chain.js';
import { currentAccount } from '../mailbox.js';
import { folderCounts, keyStatus, mailErrorMessage, registerKey, syncInbox, trackMail } from '../mail.js';
import { listDrafts } from '../drafts.js';
import { listContacts } from '../contacts.js';
import { toastStore } from '../stores.js';

/** The home page: mailbox setup, then the unread count. */
export function homePage() {
  return component({
    /** @type {string | null} */
    h160: null,
    /** @type {'loading' | 'unavailable' | 'setup' | 'ready'} */
    status: 'loading',
    keyChanged: false,
    registering: false,
    error: '',
    counts: { inbox: 0, sent: 0, trash: 0, unread: 0, drafts: 0, contacts: 0 },
    /** @type {(() => void) | null} */
    stopBlocks: null,

    get accountReady() {
      return !!this.h160;
    },

    async init() {
      this.h160 = await currentAccount();
      if (!this.h160) {
        this.status = 'unavailable';
        return;
      }
      await this.refresh();
      this.stopBlocks = onBlock(() => this.tick(), { minIntervalMs: 30000 });
    },

    destroy() {
      this.stopBlocks?.();
    },

    async tick() {
      if (this.status === 'unavailable') return this.refresh();
      if (this.status !== 'ready') return;
      await syncInbox(this.h160).catch(() => {});
      await this.loadCounts();
    },

    async refresh() {
      if (!this.h160) this.h160 = await currentAccount(3000);
      if (!this.h160) return;
      await this.loadCounts();
      try {
        const state = await keyStatus(this.h160);
        this.keyChanged = state === 'changed';
        this.status = state === 'registered' ? 'ready' : state === 'unavailable' ? 'unavailable' : 'setup';
      } catch {
        this.status = 'unavailable';
        return;
      }
      if (this.status === 'ready') {
        await syncInbox(this.h160).catch(() => {});
        await this.loadCounts();
      }
    },

    async loadCounts() {
      try {
        const [folders, drafts, contacts] = await Promise.all([
          folderCounts(this.h160),
          listDrafts(this.h160),
          listContacts(this.h160),
        ]);
        this.counts = { ...folders, drafts: drafts.length, contacts: contacts.length };
      } catch (err) {
        toastStore().push({ title: 'Your mailbox could not be read', message: mailErrorMessage(err), tone: 'danger' });
      }
    },

    async register() {
      if (!this.h160 || this.registering) return;
      this.registering = true;
      this.error = '';
      try {
        await trackMail('Setting up your mailbox', 'Your mailbox is ready', () => registerKey(this.h160));
        this.keyChanged = false;
        this.status = 'ready';
        await syncInbox(this.h160).catch(() => {});
        await this.loadCounts();
      } catch (err) {
        this.error = mailErrorMessage(err);
      } finally {
        this.registering = false;
      }
    },
  });
}
