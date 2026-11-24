import { component } from '../component.js';
import { currentAccount, fullTime, returnTo, shortAddress } from '../mailbox.js';
import { getMessage, mailErrorMessage, markRead, moveToTrash, restoreMessage } from '../mail.js';
import { contactNames } from '../contacts.js';
import { toastStore } from '../stores.js';
import { flash } from '../flash.js';

const LABELS = { '/inbox/': 'Inbox', '/sent/': 'Sent', '/trash/': 'Trash', '/': 'Mailbox' };

/** The read page: one message, opened and marked read. */
export function readPage() {
  return component({
    /** @type {string | null} */
    h160: null,
    /** @type {import('../mailbox.js').MailRecord | null} */
    msg: null,
    /** @type {Record<string, string>} */
    names: {},
    loading: true,
    error: '',
    backHref: returnTo('/inbox/'),

    get backLabel() {
      return `Back to ${(LABELS[this.backHref] ?? 'mail').toLowerCase()}`;
    },

    async init() {
      this.h160 = await currentAccount();
      if (!this.h160) {
        this.loading = false;
        return;
      }
      const key = new URLSearchParams(window.location.search).get('msgId') ?? '';
      try {
        const [msg, names] = await Promise.all([key ? getMessage(this.h160, key) : null, contactNames(this.h160)]);
        this.names = names;
        this.msg = msg;
        if (msg && msg.folder === 'inbox' && !msg.read) {
          await markRead(this.h160, msg.key);
          this.msg = { ...msg, read: true };
        }
      } catch (err) {
        this.error = `This message could not be opened. ${mailErrorMessage(err)}`;
      } finally {
        this.loading = false;
      }
    },

    /** @param {string} address */
    nameOf(address) {
      if (address && address === this.h160) return 'You';
      return this.names[address] ?? shortAddress(address);
    },

    get subject() {
      if (!this.msg) return '';
      if (this.msg.expired) return 'Message expired';
      return this.msg.subject.trim() || '(no subject)';
    },

    get when() {
      return this.msg ? fullTime(this.msg.timestamp) : '';
    },

    get counterpart() {
      if (!this.msg) return '';
      return this.msg.from === this.h160 ? this.msg.to : this.msg.from;
    },

    get canReply() {
      return !!this.counterpart;
    },

    get replyHref() {
      if (!this.msg) return '/compose/';
      const subject = this.msg.subject.trim();
      const params = new URLSearchParams({
        to: this.counterpart,
        subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`,
        return: window.location.pathname + window.location.search,
      });
      return `/compose/?${params}`;
    },

    get purgeHref() {
      if (!this.msg) return '/purge/';
      const params = new URLSearchParams({ msgId: this.msg.key, return: this.backHref });
      return `/purge/?${params}`;
    },

    async trash() {
      if (!this.msg) return;
      try {
        await moveToTrash(this.h160, this.msg.key);
        flash({ title: 'Moved to trash', tone: 'info', link: { href: '/trash/', label: 'Open trash' } });
        window.location.href = this.backHref === '/trash/' ? '/inbox/' : this.backHref;
      } catch (err) {
        toastStore().push({ title: 'Could not move to trash', message: mailErrorMessage(err), tone: 'danger' });
      }
    },

    async restore() {
      if (!this.msg) return;
      try {
        const restored = await restoreMessage(this.h160, this.msg.key);
        if (restored) this.msg = restored;
        toastStore().push({ title: 'Message restored', tone: 'success' });
      } catch (err) {
        toastStore().push({ title: 'Could not restore', message: mailErrorMessage(err), tone: 'danger' });
      }
    },
  });
}
