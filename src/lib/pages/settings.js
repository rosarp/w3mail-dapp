import { component } from '../component.js';
import { currentAccount, readState } from '../mailbox.js';
import {
  hasStorageAllowance,
  keyStatus,
  mailErrorMessage,
  registerKey,
  requestStorageAllowance,
  syncInbox,
  trackMail,
} from '../mail.js';
import { timeAgo } from '../format.js';
import { toastStore } from '../stores.js';

const KEY_TEXT = {
  registered: 'People can write to you. Messages sealed to this key open on this device.',
  unregistered: 'Register your key so people can write to you.',
  changed: 'The key on record does not match this device, so new messages would not open here. Register again.',
  unavailable: 'The mail service is not reachable right now. Try again in a moment.',
  loading: '',
};

/** The settings page: account, mailbox key, storage and sync. */
export function settingsPage() {
  return component({
    /** @type {string | null} */
    h160: null,
    /** @type {'loading' | import('../mail.js').KeyStatus} */
    key: 'loading',
    keyError: '',
    registering: false,
    storageGranted: hasStorageAllowance(),
    allowing: false,
    syncing: false,
    syncError: '',
    lastSyncedAt: 0,

    get keyText() {
      return KEY_TEXT[this.key];
    },

    get lastSyncedLabel() {
      return this.lastSyncedAt ? timeAgo(this.lastSyncedAt) : 'Not synced yet';
    },

    async init() {
      this.h160 = await currentAccount();
      if (!this.h160) {
        this.key = 'unavailable';
        return;
      }
      await this.loadKey();
      try {
        this.lastSyncedAt = (await readState(this.h160)).lastSyncedAt ?? 0;
      } catch (err) {
        this.syncError = mailErrorMessage(err);
      }
    },

    async loadKey() {
      try {
        this.key = await keyStatus(this.h160);
      } catch {
        this.key = 'unavailable';
      }
    },

    async register() {
      if (!this.h160 || this.registering) return;
      this.registering = true;
      this.keyError = '';
      try {
        await trackMail('Registering your mailbox key', 'Your mailbox key is registered', () => registerKey(this.h160));
        this.key = 'registered';
      } catch (err) {
        this.keyError = mailErrorMessage(err);
      } finally {
        this.registering = false;
      }
    },

    async allowStorage() {
      if (this.allowing) return;
      this.allowing = true;
      try {
        this.storageGranted = await requestStorageAllowance();
        if (!this.storageGranted) {
          toastStore().push({ title: 'Storage not allowed', message: 'You will be asked again when you send.', tone: 'warning' });
        }
      } catch (err) {
        toastStore().push({ title: 'Storage not allowed', message: mailErrorMessage(err), tone: 'warning' });
      } finally {
        this.allowing = false;
      }
    },

    async syncNow() {
      if (!this.h160 || this.syncing) return;
      this.syncing = true;
      this.syncError = '';
      try {
        const { added } = await syncInbox(this.h160);
        this.lastSyncedAt = (await readState(this.h160)).lastSyncedAt ?? Date.now();
        toastStore().push({
          title: added ? `${added} new message${added === 1 ? '' : 's'}` : 'You are up to date',
          tone: added ? 'success' : 'info',
        });
      } catch (err) {
        this.syncError = `Sync did not finish. ${mailErrorMessage(err)}`;
      } finally {
        this.syncing = false;
      }
    },
  });
}
