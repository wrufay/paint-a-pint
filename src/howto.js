// First-time how-to. Shown once, right after the camera arrives at the desk, and again from the "?" on the paint card.
// The markup and CSS live in index.html; the look is specified in docs/design/DESIGN.md ("How-to modal").
// main.js is not touched: it adds body.painting when the fly-in ends, and that is the moment this waits for.

const KEY = 'paint-a-pint:howto-seen';
const modal = document.getElementById('howto');
const go = document.getElementById('howto-go');
const helpBtn = document.getElementById('howto-open');
const forced = new URLSearchParams(location.search).has('howto');   // ?howto shows it on every visit, for testing

const seen = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
const remember = () => { try { localStorage.setItem(KEY, '1'); } catch {} };

let returnFocus = null;
const isOpen = () => !modal.hidden;

function open() {
  if (isOpen()) return;
  returnFocus = document.activeElement;
  modal.hidden = false;
  go.focus({ preventScroll: true });
}

function close() {
  if (!isOpen()) return;
  modal.hidden = true;
  remember();
  if (returnFocus && returnFocus.focus) returnFocus.focus({ preventScroll: true });
}

go.addEventListener('click', close);
modal.addEventListener('pointerdown', (e) => { if (e.target === modal) close(); });   // a tap outside the card closes it
if (helpBtn) helpBtn.addEventListener('click', open);

// While it is open the modal owns the keyboard. Esc closes it (and must not also leave paint mode, so it is stopped here,
// in the capture phase, before main.js sees it); Tab stays on the button; other keys must not reach the painter behind it.
addEventListener('keydown', (e) => {
  if (!isOpen()) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
  if (e.key === 'Tab') { e.preventDefault(); go.focus(); return; }
  if (e.key === 'Enter' || e.key === ' ') return;   // activates the focused button
  e.stopImmediatePropagation();
}, true);

// "The camera has arrived" is body.painting appearing.
let was = document.body.classList.contains('painting');
new MutationObserver(() => {
  const now = document.body.classList.contains('painting');
  if (now && !was && (forced || !seen())) open();
  was = now;
}).observe(document.body, { attributes: true, attributeFilter: ['class'] });
