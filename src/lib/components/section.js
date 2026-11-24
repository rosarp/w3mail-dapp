const HIDDEN = ['opacity-0', 'translate-y-6'];
const MOTION = ['transition', 'duration-500', 'ease-[cubic-bezier(0.16,1,0.3,1)]'];

/** Alpine data `reveal`, the behaviour of `sections/Section.astro`. */
export const reveal = () => ({
  init() {
    const el = this.$el;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    el.classList.add(...MOTION, ...HIDDEN);
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        el.classList.remove(...HIDDEN);
        observer.disconnect();
      },
      { rootMargin: '0px 0px -80px 0px' },
    );
    observer.observe(el);
  },
});
