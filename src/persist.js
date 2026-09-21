// Autosave: the painting, the palette and the paintings on the wall are kept in this browser (IndexedDB), so closing the tab does not
// lose them. Nothing leaves the device. Storage can be missing or refused (private windows, a full disk), so every call here fails
// quietly: the room works the same, it just forgets.
//
// A canvas is saved as its raw engine state (float arrays, gzipped when the browser can: mostly bare canvas squeezes to almost nothing),
// plus the time it was saved. Paint dries while you are away: on load the clock is wound forward by that long before the canvas is shown.

const DB = 'paint-a-pint', STORE = 'kv', VERSION = 1;
let dbp = null;
const db = () => dbp || (dbp = new Promise((res, rej) => {
  const open = indexedDB.open(DB, 1);
  open.onupgradeneeded = () => open.result.createObjectStore(STORE);
  open.onsuccess = () => res(open.result);
  open.onerror = () => rej(open.error);
}));
const tx = (mode, fn) => db().then((d) => new Promise((res, rej) => {
  const t = d.transaction(STORE, mode), r = fn(t.objectStore(STORE));
  t.oncomplete = () => res(r && r.result); t.onerror = t.onabort = () => rej(t.error);
}));
const put = (key, val) => tx('readwrite', (s) => s.put(val, key));
const get = (key) => tx('readonly', (s) => s.get(key));

// gzip / gunzip a byte array through the browser's own streams, or leave it as is when they are missing
const stream = (bytes, T) => new Response(new Blob([bytes]).stream().pipeThrough(new T('gzip'))).arrayBuffer();
const gzip = (bytes) => typeof CompressionStream === 'function' ? stream(bytes, CompressionStream).then((b) => ({ gz: true, b })) : Promise.resolve({ gz: false, b: bytes.buffer });
const gunzip = (b, gz) => gz ? new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer() : Promise.resolve(b);

// ── a paint engine ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// `extra` is whatever else the caller wants kept with it (a small JSON-able object).
async function saveEngine(key, engine, extra) {
  const s = engine.exportState();                         // a copy, so the painting can carry on while this compresses
  const { gz, b } = await gzip(new Uint8Array(s.data.buffer));
  await put(key, { v: VERSION, W: s.W, H: s.H, now: s.now, savedAt: Date.now(), gz, b, extra });
}

// Puts the saved painting into `engine` and lets it dry for as long as it was away. Returns the record's `extra`, or null if nothing usable was saved.
async function loadEngine(key, engine) {
  const rev = engine.rev;
  const r = await get(key);
  if (!r || r.v !== VERSION) return null;
  const data = new Float32Array(await gunzip(r.b, r.gz));
  if (engine.rev !== rev) return null;                    // painted on already while this was loading: keep that
  if (!engine.importState({ W: r.W, H: r.H, now: r.now, data })) return null;
  const away = Math.max(0, (Date.now() - r.savedAt) / 1000) * engine.params.timeScale;
  if (away > 0.5) engine.advance(away);
  return r.extra || {};
}

// ── the painting on the easel and the palette ────────────────────────────────────────────────────────────────────────────────
// targets: [{ key, engine, extra(): object, restored(extra) }]. Restores each one, then starts saving: whenever an engine has changed
// (its `rev`), once it has been still for a moment, and straight away when the tab is hidden. Returns { save } to force a save.
export async function startAutosave(targets, { every = 2000 } = {}) {
  if (typeof indexedDB === 'undefined') return { save() {} };
  for (const t of targets) {
    try {
      const extra = await loadEngine(t.key, t.engine);
      if (extra) t.restored(extra);
    } catch (e) { console.warn('autosave: could not load', t.key, e); }
    t.saved = t.engine.rev; t.busy = false;
  }
  const save = (t) => {
    if (t.busy || t.engine.stroke || t.engine.rev === t.saved) return;
    t.busy = true; const rev = t.engine.rev;
    saveEngine(t.key, t.engine, t.extra()).then(() => { t.saved = rev; }, (e) => console.warn('autosave: could not save', t.key, e)).finally(() => { t.busy = false; });
  };
  const all = () => targets.forEach(save);
  setInterval(all, every);
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') all(); });
  addEventListener('pagehide', all);
  return { save: all };
}

// ── the paintings on the wall ────────────────────────────────────────────────────────────────────────────────────────────────
// Each is kept as a PNG, with the frame it hangs in. `frames` is room.js's list of frames (a filled one has a `canvas`).
let wallQueue = Promise.resolve();   // saves run one after another, and each reads the wall as it is then, so the last one to run always wins
export const saveWall = (frames) => (wallQueue = wallQueue.then(() => writeWall(frames)));
async function writeWall(frames) {
  try {
    if (typeof indexedDB === 'undefined') return;
    const items = [];
    for (let i = 0; i < frames.length; i++) {
      const c = frames[i].filled && frames[i].canvas;
      if (!c) continue;
      const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
      if (blob) items.push({ i, png: await blob.arrayBuffer() });
    }
    await put('wall', { v: VERSION, items });
  } catch (e) { console.warn('autosave: could not save the wall', e); }
}

// calls hang(canvas, frameIndex) for each saved painting
export async function loadWall(hang) {
  try {
    if (typeof indexedDB === 'undefined') return;
    const r = await get('wall');
    if (!r || r.v !== VERSION) return;
    for (const { i, png } of r.items) {
      const bmp = await createImageBitmap(new Blob([png], { type: 'image/png' }));
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      c.getContext('2d').drawImage(bmp, 0, 0);
      hang(c, i);
    }
  } catch (e) { console.warn('autosave: could not load the wall', e); }
}
