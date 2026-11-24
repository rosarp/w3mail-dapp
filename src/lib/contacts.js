import { mailbox, parseAddress, uuidv7 } from './mailbox.js';
import { previewFallback } from './preview.js';

/** @typedef {import('./mailbox.js').Contact} Contact */

/** @type {Contact[]} */
const SAMPLE_CONTACTS = [
  { id: 'sample-ada', name: 'Ada Lindqvist', address: '0x8eaf04151687736326c9fea17e25fc5287613693' },
  { id: 'sample-ben', name: 'Ben Okafor', address: '0x90b5ab205c6974c9ea841be688864633dc9ca8a3' },
  { id: 'sample-chiara', name: 'Chiara Rossi', address: '0x306721211d5404bd9da88e0204360a1a9ab8b87c' },
];

/**
 * Every contact, by name.
 *
 * @param {string} h160
 * @returns {Promise<Contact[]>}
 */
export async function listContacts(h160) {
  const contacts = await mailbox(h160).contacts.all();
  const sorted = [...contacts].sort((a, b) => a.name.localeCompare(b.name));
  return previewFallback(sorted, SAMPLE_CONTACTS);
}

/**
 * @param {string} h160
 * @param {string} id
 * @returns {Promise<Contact | null>}
 */
export async function getContact(h160, id) {
  const found = await mailbox(h160).contacts.get(id);
  return found ?? previewFallback(null, SAMPLE_CONTACTS.find((c) => c.id === id) ?? null);
}

/**
 * Contact names by lowercase H160, for labelling mail rows.
 *
 * @param {string} h160
 * @returns {Promise<Record<string, string>>}
 */
export async function contactNames(h160) {
  /** @type {Record<string, string>} */
  const names = {};
  for (const contact of await listContacts(h160)) names[contact.address.toLowerCase()] = contact.name;
  return names;
}

/**
 * What is wrong with a contact form, by field; empty when it can be saved.
 *
 * @param {{ name: string, address: string }} form
 * @returns {{ name?: string, address?: string }}
 */
export function validateContact(form) {
  /** @type {{ name?: string, address?: string }} */
  const errors = {};
  if (!form.name.trim()) errors.name = 'Give this contact a name.';
  else if (form.name.trim().length > 80) errors.name = 'Keep the name under 80 characters.';
  if (!form.address.trim()) errors.address = 'Enter their address.';
  else if (!parseAddress(form.address)) errors.address = 'This is not a valid Polkadot address.';
  return errors;
}

/**
 * Add or update a contact; returns the saved record.
 *
 * @param {string} h160
 * @param {{ id?: string, name: string, address: string }} form
 * @returns {Promise<Contact>}
 */
export async function saveContact(h160, form) {
  const address = parseAddress(form.address);
  if (!address) throw new Error('This is not a valid Polkadot address.');
  const contact = { id: form.id || uuidv7(), name: form.name.trim(), address };
  await mailbox(h160).contacts.put(contact.id, contact);
  return contact;
}

/**
 * @param {string} h160
 * @param {string} id
 */
export function removeContact(h160, id) {
  return mailbox(h160).contacts.remove(id);
}
