import { component } from '../component.js';
import { currentAccount, fullTime, returnTo, shortAddress } from '../mailbox.js';
import { getMessage, mailErrorMessage, purgeMessage, trackMail } from '../mail.js';
import { contactNames } from '../contacts.js';
import { flash } from '../flash.js';

/** The delete-for-good confirmation page. */
export function purgePage() {
  return component({
    /** @type {string | null} */
    h160: null,
    /** @type {import('../mailbox.js').MailRecord | null} */
    msg: null,
    /** @type {Record<string, string>} */
    names: {},
    loading: true,
    deleting: false,
    error: '',
    backHref: returnTo('/trash/'),

    async init() {
      this.h160 = await currentAccount();
      if (!this.h160) {
        this.loading = false;
        return;
      }
      const key = new URLSearchParams(window.location.search).get('msgId') ?? '';
      try {
        const [msg, names] = await Promise.all([key ? getMessage(this.h160, key) : null, contactNames(this.h160)]);
        this.msg = msg;
        this.names = names;
      } catch (err) {
        this.error = mailErrorMessage(err);
      } finally {
        this.loading = false;
      }
    },

    get subject() {
      if (!this.msg) return '';
      if (this.msg.expired) return 'Expired message';
      return this.msg.subject.trim() || '(no subject)';
    },

    get detail() {
      if (!this.msg) return '';
      const sent = this.msg.from === this.h160;
      const other = sent ? this.msg.to : this.msg.from;
      const name = this.names[other] ?? shortAddress(other);
      return `${sent ? 'To' : 'From'} ${name} · ${fullTime(this.msg.timestamp)}`;
    },

    async confirm() {
      if (!this.msg || this.deleting) return;
      this.deleting = true;
      this.error = '';
      try {
        await trackMail('Deleting message', 'Message deleted', () => purgeMessage(this.h160, this.msg.key));
        flash({ title: 'Message deleted for good', tone: 'success' });
        window.location.href = this.backHref.startsWith('/read/') ? '/trash/' : this.backHref;
      } catch (err) {
        this.error = mailErrorMessage(err);
        this.deleting = false;
      }
    },
  });
}
