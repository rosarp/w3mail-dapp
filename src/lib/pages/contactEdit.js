import { component } from '../component.js';
import { currentAccount, parseAddress, returnTo } from '../mailbox.js';
import { getContact, removeContact, saveContact, validateContact } from '../contacts.js';
import { mailErrorMessage } from '../mail.js';
import { flash } from '../flash.js';

/** The add or edit contact page. */
export function contactEditPage() {
  return component({
    /** @type {string | null} */
    h160: null,
    /** @type {string | null} */
    id: null,
    form: { name: '', address: '' },
    /** @type {{ name?: string, address?: string }} */
    errors: {},
    loading: true,
    saving: false,
    error: '',
    backHref: returnTo('/contacts/'),

    get isNew() {
      return !this.id;
    },

    get preview() {
      return parseAddress(this.form.address);
    },

    async init() {
      this.h160 = await currentAccount();
      const params = new URLSearchParams(window.location.search);
      const id = params.get('id');
      this.form.address = params.get('address') ?? '';
      if (!this.h160) {
        this.loading = false;
        return;
      }
      try {
        if (id) {
          const contact = await getContact(this.h160, id);
          if (contact) {
            this.id = contact.id;
            this.form = { name: contact.name, address: contact.address };
          } else {
            this.error = 'This contact no longer exists. You can add it again below.';
          }
        }
      } catch (err) {
        this.error = mailErrorMessage(err);
      } finally {
        this.loading = false;
      }
    },

    /** @param {'name' | 'address'} [field] */
    validate(field) {
      const next = validateContact(this.form);
      if (field) {
        if (!this.form[field]) return;
        this.errors = { ...this.errors, [field]: next[field] ?? '' };
        return;
      }
      this.errors = next;
      return Object.keys(next).length === 0;
    },

    async save() {
      if (this.saving || !this.h160) return;
      this.error = '';
      if (!this.validate()) return;
      this.saving = true;
      try {
        const contact = await saveContact(this.h160, { id: this.id ?? undefined, ...this.form });
        flash({ title: this.isNew ? 'Contact added' : 'Contact saved', message: contact.name, tone: 'success' });
        window.location.href = this.backHref;
      } catch (err) {
        this.error = mailErrorMessage(err);
        this.saving = false;
      }
    },

    async remove() {
      if (!this.id || !this.h160 || this.saving) return;
      this.saving = true;
      try {
        await removeContact(this.h160, this.id);
        flash({ title: 'Contact removed', message: this.form.name, tone: 'info' });
        window.location.href = this.backHref;
      } catch (err) {
        this.error = mailErrorMessage(err);
        this.saving = false;
      }
    },
  });
}
