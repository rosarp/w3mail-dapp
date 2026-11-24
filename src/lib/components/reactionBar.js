import { reactions } from '../live/reactions.js';

function burst(layer = document.body, emoji = '') {
  for (let i = 0; i < 7; i++) {
    const theta = ((200 + Math.random() * 140) * Math.PI) / 180;
    const distance = 28 + Math.random() * 30;
    const particle = document.createElement('span');
    particle.textContent = emoji;
    particle.className = 'absolute left-1/2 top-1/2 text-sm';
    layer.appendChild(particle);
    particle
      .animate(
        [
          { opacity: 1, transform: 'translate(-50%, -50%) scale(0.5) rotate(0deg)' },
          {
            opacity: 0,
            transform: `translate(calc(-50% + ${Math.cos(theta) * distance}px), calc(-50% + ${Math.sin(theta) * distance}px)) scale(${0.9 + Math.random() * 0.8}) rotate(${-40 + Math.random() * 80}deg)`,
          },
        ],
        { duration: 800, easing: 'ease-out' },
      )
      .finished.finally(() => particle.remove());
  }
}

/** The `$burst` magic, used by the markup of `live/ReactionBar.astro`. */
export const burstMagic = () => (button = document.body, emoji = '') => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = button.querySelector('[data-burst]');
  if (layer instanceof HTMLElement) burst(layer, emoji);
};

/** Alpine data `reactionBar`, the behaviour of `live/ReactionBar.astro`. */
export function reactionBar(targetId = '') {
  return reactions(targetId);
}
