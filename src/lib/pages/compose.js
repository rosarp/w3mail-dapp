import { component } from '../component.js';
import { currentAccount, parseAddress, returnTo, shortAddress } from '../mailbox.js';
import { mailErrorMessage, sendMail, trackMail } from '../mail.js';
import { MAX_BODY_LENGTH, MAX_SUBJECT_LENGTH } from '../mailLimits.js';
import { deleteDraft, getDraft, saveDraft } from '../drafts.js';
import { listContacts } from '../contacts.js';
import { timeAgo } from '../format.js';
import { flash } from '../flash.js';

const STEPS = [
  { id: 'encrypting', label: 'Encrypting', hint: 'Locking it to the recipient' },
  { id: 'storing', label: 'Storing', hint: 'Keeping the sealed message' },
  { id: 'sending', label: 'Sending', hint: 'Telling their mailbox' },
];

/** The compose page: a message with autosaved draft, sent in three steps. */
export function composePage() {
  return component({
    /** @type {string | null} */
    h160: null,
    form: { to: '', subject: '', body: '' },
    /** @type {{ to?: string, subject?: string, body?: string }} */
    errors: {},
    /** @type {import('../mailbox.js').Contact[]} */
    contacts: [],
    picked: '',
    /** @type {string | null} */
    draftId: null,
    savedAt: 0,
    loading: true,
    sending: false,
    sent: false,
    /** @type {string | null} */
    step: null,
    error: '',
    steps: STEPS,
    backHref: returnTo('/sent/'),
    /** @type {ReturnType<typeof setTimeout> | null} */
    saveTimer: null,

    async init() {
      this.h160 = await currentAccount();
      if (!this.h160) {
        this.loading = false;
        return;
      }
      const params = new URLSearchParams(window.location.search);
      this.form.to = params.get('to') ?? '';
      this.form.subject = params.get('subject') ?? '';
      try {
        const draftParam = params.get('draft');
        const [contacts, draft] = await Promise.all([
          listContacts(this.h160),
          draftParam ? getDraft(this.h160, draftParam) : null,
        ]);
        this.contacts = contacts;
        if (draft) {
          this.draftId = draft.id;
          this.savedAt = draft.updatedAt;
          this.form = { to: draft.to, subject: draft.subject, body: draft.body };
        }
      } catch (err) {
        this.error = mailErrorMessage(err);
      } finally {
        this.loading = false;
      }
      this.$watch('form', () => this.saveSoon());
    },

    destroy() {
      if (this.saveTimer) clearTimeout(this.saveTimer);
    },

    get recipient() {
      return parseAddress(this.form.to);
    },

    get recipientLabel() {
      const address = this.recipient;
      if (!address) return '';
      if (address === this.h160) return 'A note to yourself';
      const contact = this.contacts.find((c) => c.address === address);
      return contact ? contact.name : shortAddress(address);
    },

    get draftLabel() {
      if (this.sending) return '';
      return this.savedAt ? `Draft saved ${timeAgo(this.savedAt)}` : 'Drafts save as you type';
    },

    /** @param {string} id */
    stateOf(id) {
      const order = STEPS.findIndex((s) => s.id === id);
      const current = this.sent ? STEPS.length : STEPS.findIndex((s) => s.id === this.step);
      if (current < 0) return 'waiting';
      return order < current ? 'done' : order === current ? 'active' : 'waiting';
    },

    pickContact() {
      if (!this.picked) return;
      this.form.to = this.picked;
      this.errors.to = '';
      this.picked = '';
    },

    /** @param {'to' | 'subject' | 'body'} [field] */
    validate(field) {
      /** @type {{ to?: string, subject?: string, body?: string }} */
      const next = {};
      if (!this.form.to) next.to = 'Who is this for? Enter an address or choose a contact.';
      else if (!this.recipient) next.to = 'This is not a valid Polkadot address.';
      if (this.form.subject.length > MAX_SUBJECT_LENGTH) next.subject = `Keep the subject under ${MAX_SUBJECT_LENGTH} characters.`;
      if (!this.form.subject.trim() && !this.form.body.trim()) next.body = 'Write a subject or a message.';
      else if (this.form.body.length > MAX_BODY_LENGTH) next.body = 'This message is too long. Shorten it, then send.';
      if (field) {
        if (field === 'to' && !this.form.to) return;
        if (field === 'body' && !this.form.body && !this.form.subject) return;
        this.errors = { ...this.errors, [field]: next[field] ?? '' };
        return;
      }
      this.errors = next;
      return Object.keys(next).length === 0;
    },

    get hasContent() {
      return !!(this.form.to || this.form.subject.trim() || this.form.body.trim());
    },

    saveSoon() {
      if (this.sending || this.sent || !this.h160) return;
      if (this.saveTimer) clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => this.saveNow(), 800);
    },

    async saveNow() {
      if (this.sending || this.sent || !this.h160 || !this.hasContent) return;
      try {
        this.draftId = await saveDraft(this.h160, { id: this.draftId, ...this.form });
        this.savedAt = Date.now();
      } catch (err) {
        this.error = `Your draft could not be saved. ${mailErrorMessage(err)}`;
      }
    },

    async send() {
      if (this.sending || !this.h160) return;
      this.error = '';
      if (!this.validate()) return;
      if (this.saveTimer) clearTimeout(this.saveTimer);
      this.sending = true;
      this.step = 'encrypting';
      try {
        await trackMail('Sending message', 'Message sent', () =>
          sendMail(this.h160, this.form, (step) => {
            this.step = step;
          }),
        );
        this.sent = true;
        if (this.draftId) await deleteDraft(this.h160, this.draftId).catch(() => {});
        flash({ title: 'Message sent', message: this.recipientLabel ? `To ${this.recipientLabel}` : undefined, tone: 'success' });
        window.location.href = this.backHref;
      } catch (err) {
        this.error = mailErrorMessage(err);
        this.step = null;
        this.sending = false;
        await this.saveNow();
      }
    },

    async discard() {
      if (this.saveTimer) clearTimeout(this.saveTimer);
      this.sent = true;
      if (this.draftId && this.h160) await deleteDraft(this.h160, this.draftId).catch(() => {});
      flash({ title: 'Draft discarded', tone: 'info' });
      window.location.href = this.backHref;
    },
  });
}
