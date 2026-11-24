import { component } from '../component.js';
import { uploadBytes } from '../bulletin.js';

/**
 * @param {File} file
 * @param {number} maxDimension
 * @returns {Promise<Uint8Array>}  WebP when the browser can encode it, else the original bytes.
 */
async function downscale(file, maxDimension) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82));
    if (!(blob instanceof Blob)) throw new Error('encode failed');
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return new Uint8Array(await file.arrayBuffer());
  }
}

/** Alpine data `bulletinImageUpload`, the behaviour of `ui/BulletinImageUpload.astro`. */
export function bulletinImageUpload(/** @type {boolean} */ deferred, /** @type {number} */ maxDimension) {
  return component({
    /** @type {any} */
    value: null,
    dragging: false,
    uploading: false,
    /** @type {string | null} */
    error: null,
    /** @type {string | null} */
    preview: null,

    get shown() {
      if (deferred) return this.value?.previewUrl ?? null;
      return typeof this.value === 'string' ? this.value : null;
    },

    /** @param {File | undefined} file */
    async pick(file) {
      if (!file || !file.type.startsWith('image/')) return;
      this.error = null;
      if (deferred) {
        const bytes = await downscale(file, maxDimension);
        this.revoke();
        this.preview = URL.createObjectURL(file);
        this.value = { bytes, previewUrl: this.preview };
        this.$dispatch('picked', this.value);
        return;
      }
      this.uploading = true;
      try {
        const result = await uploadBytes(await downscale(file, maxDimension));
        this.value = result.url;
        this.$dispatch('uploaded', result);
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Upload failed';
      } finally {
        this.uploading = false;
      }
    },

    clear() {
      this.revoke();
      this.value = null;
      this.$dispatch(deferred ? 'picked' : 'uploaded', null);
      const input = this.$refs.file;
      if (input instanceof HTMLInputElement) input.value = '';
    },

    revoke() {
      if (typeof this.preview === 'string') URL.revokeObjectURL(this.preview);
      this.preview = null;
    },

    destroy() {
      this.revoke();
    },
  });
}
