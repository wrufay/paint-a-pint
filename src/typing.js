// Typing animation for short bits of UI text (the hint pill, the esc line).
//
// The whole sentence stays in the layout the entire time: the typed part is visible, the rest is there but invisible.
// So a centred pill never resizes or wanders while it types. Screen readers get the full text at once (an sr-only copy),
// and people who ask for reduced motion get the text with no animation. Styles live in index.html (.tw-*).

const timers = new WeakMap();
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// typeIn(el)                      types whatever the element currently says (or said when it was first typed)
// typeIn(el, 'new text', { delay, speed })    speed = average ms per character
export function typeIn(el, text, { delay = 0, speed = 32 } = {}) {
  if (!el) return;
  clearTimeout(timers.get(el));
  if (text == null) text = el.dataset.full ?? el.textContent.trim();
  el.dataset.full = text;

  if (reduced() || !text) { el.textContent = text; return; }

  const sr = document.createElement('span'), typed = document.createElement('span'), rest = document.createElement('span');
  sr.className = 'sr-only'; sr.textContent = text;
  typed.className = 'tw-typed tw-typing'; rest.className = 'tw-rest';
  typed.setAttribute('aria-hidden', 'true'); rest.setAttribute('aria-hidden', 'true');
  rest.textContent = text;
  el.replaceChildren(sr, typed, rest);

  let i = 0;
  const step = () => {
    i++;
    typed.textContent = text.slice(0, i);
    rest.textContent = text.slice(i);
    if (i >= text.length) { typed.classList.remove('tw-typing'); return; }
    const ch = text[i - 1];
    const pause = /[.,:·]/.test(ch) ? 140 : 0;                       // a beat after punctuation
    timers.set(el, setTimeout(step, speed * (0.6 + Math.random() * 0.8) + pause));
  };
  timers.set(el, setTimeout(step, delay));
}
