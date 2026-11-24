import { mailbox, uuidv7 } from './mailbox.js';
import { previewFallback } from './preview.js';

/** @typedef {import('./mailbox.js').Draft} Draft */

const HOUR = 3600000;

/** @type {Draft[]} */
const SAMPLE_DRAFTS = [
  {
    id: 'sample-draft-1',
    to: '0x8eaf04151687736326c9fea17e25fc5287613693',
    subject: 'Notes from Thursday',
    body: 'Here is what we agreed on, roughly in order.',
    updatedAt: Date.now() - 2 * HOUR,
  },
  {
    id: 'sample-draft-2',
    to: '',
    subject: 'Trip plan',
    body: 'Train leaves at 8:40. Bring the maps.',
    updatedAt: Date.now() - 30 * HOUR,
  },
];

/**
 * Saved drafts, newest first.
 *
 * @param {string} h160
 * @returns {Promise<Draft[]>}
 */
export async function listDrafts(h160) {
  const drafts = await mailbox(h160).drafts.all();
  const sorted = [...drafts].sort((a, b) => b.updatedAt - a.updatedAt);
  return previewFallback(sorted, SAMPLE_DRAFTS);
}

/**
 * @param {string} h160
 * @param {string} id
 * @returns {Promise<Draft | null>}
 */
export async function getDraft(h160, id) {
  const found = await mailbox(h160).drafts.get(id);
  return found ?? previewFallback(null, SAMPLE_DRAFTS.find((d) => d.id === id) ?? null);
}

/**
 * Save a draft, creating its id on first save; returns the id.
 *
 * @param {string} h160
 * @param {{ id?: string | null, to: string, subject: string, body: string }} draft
 * @returns {Promise<string>}
 */
export async function saveDraft(h160, draft) {
  const id = draft.id || uuidv7();
  await mailbox(h160).drafts.put(id, {
    id,
    to: draft.to,
    subject: draft.subject,
    body: draft.body,
    updatedAt: Date.now(),
  });
  return id;
}

/**
 * @param {string} h160
 * @param {string} id
 */
export function deleteDraft(h160, id) {
  return mailbox(h160).drafts.remove(id);
}
