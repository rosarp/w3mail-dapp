import { component } from '../component.js';
import { currentAccount, shortAddress } from '../mailbox.js';
import { listContacts } from '../contacts.js';
import { mailErrorMessage } from '../mail.js';

/** The contacts page. */
export function contactsPage() {
  return component({
    /** @type {string | null} */
    h160: null,
    /** @type {import('../mailbox.js').Contact[]} */
    contacts: [],
    loading: true,
    error: '',

    async init() {
      this.h160 = await currentAccount();
      if (!this.h160) {
        this.loading = false;
        return;
      }
      try {
        this.contacts = await listContacts(this.h160);
      } catch (err) {
        this.error = `Your contacts could not be loaded. ${mailErrorMessage(err)}`;
      } finally {
        this.loading = false;
      }
    },

    /** @param {string} address */
    short(address) {
      return shortAddress(address);
    },

    /** @param {import('../mailbox.js').Contact} contact */
    writeHref(contact) {
      return `/compose/?to=${encodeURIComponent(contact.address)}&return=/contacts/`;
    },

    /** @param {import('../mailbox.js').Contact} contact */
    editHref(contact) {
      return `/contacts/edit/?id=${encodeURIComponent(contact.id)}&return=/contacts/`;
    },
  });
}
