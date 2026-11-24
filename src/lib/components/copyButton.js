/** Alpine data `copyButton`, the behaviour of `ui/CopyButton.astro`. */
export function copyButton(read = () => '', feedbackMs = 2000) {
  return {
    copied: false,

    async copy() {
      const value = String(read() ?? '');
      if (!value) return;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(value);
        } else {
          const el = document.createElement('textarea');
          el.value = value;
          el.setAttribute('readonly', '');
          el.style.position = 'absolute';
          el.style.left = '-9999px';
          document.body.appendChild(el);
          el.select();
          document.execCommand('copy');
          el.remove();
        }
        this.copied = true;
        setTimeout(() => {
          this.copied = false;
        }, feedbackMs);
      } catch {}
    },
  };
}
