import { component } from '../component.js';
import { currentAccount, mailTime, parseAddress, shortAddress } from '../mailbox.js';
import { deleteDraft, listDrafts } from '../drafts.js';
import { contactNames } from '../contacts.js';
import { mailErrorMessage } from '../mail.js';
import { toastStore } from '../stores.js';

/** The drafts page: saved drafts, newest first. */
export function draftsPage() {
  return component({
    /** @type {string | null} */
    h160: null,
    /** @type {import('../mailbox.js').Draft[]} */
    drafts: [],
    /** @type {Record<string, string>} */
    names: {},
    loading: true,
    error: '',

    async init() {
      this.h160 = await currentAccount();
      if (!this.h160) {
        this.loading = false;
        return;
      }
      try {
        const [drafts, names] = await Promise.all([listDrafts(this.h160), contactNames(this.h160)]);
        this.drafts = drafts;
        this.names = names;
      } catch (err) {
        this.error = `Your drafts could not be loaded. ${mailErrorMessage(err)}`;
      } finally {
        this.loading = false;
      }
    },

    /** @param {import('../mailbox.js').Draft} draft */
    openHref(draft) {
      return `/compose/?draft=${encodeURIComponent(draft.id)}&return=/drafts/`;
    },

    /** @param {import('../mailbox.js').Draft} draft */
    recipientOf(draft) {
      const address = parseAddress(draft.to);
      if (!address) return draft.to ? draft.to : 'No recipient yet';
      return `To ${this.names[address] ?? shortAddress(address)}`;
    },

    /** @param {import('../mailbox.js').Draft} draft */
    subjectOf(draft) {
      return draft.subject.trim() || '(no subject)';
    },

    /** @param {import('../mailbox.js').Draft} draft */
    snippet(draft) {
      return draft.body.split('\n').find((line) => line.trim()) ?? '';
    },

    /** @param {import('../mailbox.js').Draft} draft */
    when(draft) {
      return mailTime(draft.updatedAt);
    },

    /** @param {import('../mailbox.js').Draft} draft */
    async remove(draft) {
      try {
        await deleteDraft(this.h160, draft.id);
        this.drafts = this.drafts.filter((d) => d.id !== draft.id);
        toastStore().push({ title: 'Draft deleted', tone: 'info' });
      } catch (err) {
        toastStore().push({ title: 'Could not delete the draft', message: mailErrorMessage(err), tone: 'danger' });
      }
    },
  });
}
