# Handoff: paint-a-pint (read this whole file before touching anything)

You are picking up a hackathon project mid-build. Another Claude session wrote the acrylic-paint engine and wired it into the room; its context is full, so this file is everything it knew that you need. Read it, then run the plan in section 6.

## 1. The project

**paint-a-pint**: a tiny 3D painting room (Three.js diorama of a desk corner) where you paint with a *simulation of real acrylic paint*. Not a digital art tool: paint dries on a clock, thick paint holds ridges, colours mix like pigment, wet-on-wet blends and wet-on-dry covers. The style target is impressionism, in thin-to-medium acrylics (Amsterdam and Galeria). Goal: reduce friction of painting (no cost, no cleanup), not to make masterpieces, but as good as it can be.

- **Hack the North 2026, solo.** Hacking started 2026-09-19 00:00 America/Toronto. **Deadline 2026-09-20 08:00 America/Toronto.** Judging is a **live demo** (criteria: originality, UX, technical complexity, WOW). It was ~23:15 on the 19th when this was written. Protect the last ~2 hours for demo rehearsal and submission.
- The user paints for real (photos of their work and desk are in the repo). They test on an **iPad with Apple Pencil**. A Wacom is a later idea.
- Stack: Vite, Three.js, plain JS (ES modules). No backend. Repo: `github.com/wrufay/paint-a-pint`, branch `main`.
- Reference art (what we are trying to make): `canvas/painting_examples_better/`, `canvas/painting_examples/` (low-res), `canvas/progress/` (a 10 h painting on smooth sketchbook paper, 16.2 x 22.5 cm), `canvas/painting_examples/progress2_closeup/` (impasto knife painting, the real styrofoam palette, close-ups). Use them as visual targets to compare renders against. Paint data and swatches: `paints/`. Desk and room photos: `reference_images/`, `diorama/`.
- The user's own notes: `docs/LOGS.md` (playtest reactions), `docs/CONTEXT.md`. **Do not edit either.** Read `docs/LOGS.md` again before starting: it is the source of truth for what they want.

## 2. Rules (from the user, and from a shared working folder)

- **Other sessions share this folder.** A **design-system Claude** (session name `paint-a-pint-f6`) owns `src/tokens.css`, `src/fonts.css`, `docs/design/*`, and the *visual styling* in `index.html` and `lab.html`. Do not restyle. Use `ListAgents` to see peers, and `SendMessage` (load it with ToolSearch) to coordinate before touching the card layout (task T3).
- **Commit locally, never push.** Stage files by name (`git add path ...`), never `git add -A` (there are uncommitted files that are not yours: `docs/LOGS.md`, `docs/CONTEXT.md`, deleted `inspo/` and `room-refs/` files, untracked photo folders). Small commits with clear `type(area): subject` messages. Do not push, deploy or open PRs without the user saying so.
- Do not edit `docs/LOGS.md` or `docs/CONTEXT.md`. Do not commit the manufacturers' swatch images in `paints/`.
- Numbers are guesses unless said otherwise (drying times, tinting strengths, some Galeria opacities). Say so in code comments and to the user; never present them as measured.
- Report results faithfully. If something could only be checked headless (no real GPU, no iPad), say that.
- Match the surrounding code's style and comment density.

## 3. What has been built (all committed, in git history)

Key commits: `ca49468` drying, `d332e8a` pigment mixing, `f077972` paints as data, `7c3aea4` ridges, `4613c5d` and `939104c` colour fixes, `3f3d5f8` engine into the room, `8d38ef3`/`8b7a47c` easel thickness maps, `a2cd265` settings/wetness/save in the room, `8b0d353` bird's-eye, `ac274fe` brush shapes, `f81990c` easel/desk toggle.

### Files
| File | What it is |
|---|---|
| `src/brush/engine.js` | The engine. Pure JS, no DOM, runs in Node. Read its header comment first. |
| `src/brush/pigment.js` | Fast Kubelka-Munk pigment mixer over a 38-band spectrum (`mixPigment`). Typed arrays, ~0.2 us per mix. |
| `src/brush/spectral-data.js` | **Generated** by `node tools/gen-spectral-data.mjs` from the `spectral.js` dev dependency (MIT, Ronald van Wijnen). Keep its licence header. Do not hand-edit. |
| `src/brush/paints.js` | The 9 real paints as data (hex sampled from swatches, opacity, guessed tinting strength). `PALETTES['my box']`. Add paints here, not in code. |
| `src/brush/tune.js` | Saved settings (`localStorage` key `paint-a-pint:lab-params:v1`, shared by lab and room), the raw slider list, and the settings panel (plain-language controls + "advanced"). |
| `src/acrylic-painter.js` | `AcrylicPainter`: adapter with the old painter's interface (`down/move/up/clear/composite`), 3D map outputs, and `initAcrylicUI` (card buttons, pointer handling). |
| `src/main.js` | The room: paint mode, easel poses (`easelUp`, `easelFlat`), `view` toggle (lay flat / stand up), textures on the easel canvas, `window.__paint` test hook. |
| `src/room.js` | The diorama (design-owned, mostly untouched by the engine work). Easel at `(-0.05, 2.45, -3.3)`, desk top y = 1.5. |
| `src/lab.js`, `lab.html` | Brush lab page (`/lab.html`): engine + sliders, for tuning on the iPad. |
| `src/paint.js` | The OLD gouache painter. No longer used by the room. Keep as fallback. |
| `tools/` | `dry-test.mjs`, `mix-test.mjs`, `render-test.mjs`, `brush-shapes.mjs` (Node checks that write PNGs / print numbers), `gen-spectral-data.mjs`. |
| `docs/acrylic-simulation.md` | The original tech plan, aimed at "exact" physics. **Partly superseded** by what was built; still useful for ideas not done (see T10, gravity/drips, GPU). |

### The engine model (what to know before changing it)
- State per pixel (canvas is 1300 x 950 in the room, 1200 x 900 in the lab): `color` (the *visible* colour, linear RGB x3), `height` (solids in the wet layer), `water` (water in the wet layer), `film` (dried paint underneath), `ground` (fixed weave height).
- **Drying**: water evaporates on a clock. `f = water/(solids+water)`. `f > 0.3` open (blends, gets picked up), `0.12 < f < 0.3` tacky (drags, breaks up), `f <= 0.12` locks into `film`. Thick dries slower (roughly thickness squared), a skin slows the last water. `wetSeconds` (default 90) = how long one typical stroke stays open. `timeScale` = time warp; `dryAll()` = "dry now"; `advance(seconds)`.
- **Layering**: new paint over `film` covers it (no mixing); over open paint it mixes (pigment mix).
- **Bristles**: each carries paint + colour, runs dry, picks up open paint. Three shapes via `params.shape`: `flat`, `filbert`, `round`. Round deposits every `step` pixels, each weighted by `step` (mixing/pushing compound, laid paint scales).
- **Ridges**: bristles shove open paint sideways (`params.push`), queued and applied after all bristles, spread bilinearly, pushed paint carries its colour.
- **Colour**: `mixPigment`. Over bare ground or dried paint the old colour is treated as a ground (`lumPow` scaled by wet thickness) so thin paint reads as a glaze, not paint cut with white.
- **Rendering**: tile-based (32 px). Only tiles with wet paint are dried; only dirty tiles are shaded; drying-only changes are shaded lazily (`render(lazy=48)` tiles per call). `enableMaps()` adds `albedo` (unlit) and `normals` outputs, used by the 3D easel so the room's lights shade the paint.
- **Input**: pressure from the Pencil; mouse/trackpad fakes it from speed. One-level undo (`snapshot()/restore()`).

### Room behaviour
Click the easel: camera travels in, paint overlay appears (centred, ~17% bigger than the first version). Starts at the standing easel; **lay it flat** puts the canvas on the desk for a bird's-eye view, **stand it up** reverses it. **Esc** goes back to the room and leaves the painting on the easel (it keeps drying). **hang it up & go back** hangs it on the wall and clears the easel. Settings, wetness view and save PNG live on the card.

## 4. Known limits (tell the user if they come up)
- The visible colour is one value per pixel, so a paint/ground mix is stored as one colour. The `lumPow` patch fixes most of the chalky look, but bristles still pick up a paint+ground mix (guarded by "does this pixel look like bare gesso"). The full fix (separate ground / wet colour / coverage) is task T10.
- Drying times, thickness scale, tinting strengths and Galeria opacities are guesses. No measurements exist.
- Nothing was profiled on an iPad. Node numbers: a fast stroke is ~4 ms per 30 px of travel (flat), round brush ~1.8x that.
- The lift-and-turn animation between easel and desk was never watched running (headless is far too slow); only start and end poses were checked.
- A wetness-toggle "switching back and forth bug" the user mentioned could not be reproduced in the engine (toggling off restores the exact pixels).
- Undo is one level. The card has many buttons (the user says it "doesn't look intentional", see T3).

## 5. How to check your work

**Node (fast, no browser):** `node tools/dry-test.mjs`, `node tools/mix-test.mjs`, `node tools/render-test.mjs out.png`, `node tools/brush-shapes.mjs out.png`. Read the PNGs with the Read tool and compare against the reference art. Build check: `npx vite build`.

**Real browser (slow but real):** headless Chrome renders the 3D room in software (~1 fps), so every run takes 1 to 4 minutes. Install the driver *outside the repo*: `mkdir -p /tmp/drv && cd /tmp/drv && npm init -y && npm i puppeteer-core` (do not add it to `package.json`). Then:
```js
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,760'],
  defaultViewport: { width: 1280, height: 760 },
});
// ...goto the dev server, then:
await page.waitForFunction(() => window.__paint, { timeout: 30000, polling: 250 }); // polling must be a number: the default (per frame) stalls
await page.evaluate(() => window.__paint.enterPaint());
await page.waitForFunction(() => window.__paint.mode === 'paint', { timeout: 120000, polling: 250 });
```
- Start the dev server with `npx vite --port 5199 --strictPort` in the background. **Do not edit source files while a browser run is in progress** (Vite reloads the page under it).
- Run drivers in the background and watch for completion (the Monitor tool with an `until grep ...` loop); print results with `console.log` and end with an `errors:` line so you know it finished.
- Hook: `window.__paint = { enterPaint, leavePaint(hang), painter, world, camera, uploadPaint, mode }`. `painter.engine` is the `PaintEngine`. To see the 3D easel large while in paint mode: `painter.tick(performance.now()); __paint.uploadPaint(); document.getElementById('paint').style.opacity = 0`.
- Use few, short mouse moves (`steps: 10`), since every move waits on a slow frame.

## 6. The plan (run in this order; commit after each task)

Times are estimates. It is ~23:15 now; finish T1 to T4 before ~01:30 if you can, then build wow features while time remains, and stop adding features around 05:30 to leave time to rehearse and submit.

**T1. Paint runs out too fast (15 min).** The user asked "why does the paint run out so quick". `consumption` in `DEFAULTS` (`src/brush/engine.js`) is 0.00035 per pixel touched. Make a small Node script or extend `tools/brush-shapes.mjs` to measure how many pixels of travel a bristle lasts at size 46, and tune so an ordinary stroke stays loaded for roughly 600 to 800 px before the dry-brush tail begins, while keeping the dry-brush look. Note: saved settings in `localStorage` override defaults; the "reset to defaults" button clears that. Done when: numbers before/after are reported and `tools/*` still pass.

**T2. Keyboard shortcuts (20 min).** Keys `1`-`9` select the nine paints in card order, `[` and `]` change brush size, `z` undo, `w` toggles wetness. Only while `mode === 'paint'` and not typing in an input. Implement in `initAcrylicUI` in `src/acrylic-painter.js`. Add the number to each swatch's `title`/`aria-label` only (no styling). Done when a Chrome check confirms the key changes `painter.paint`.

**T3. Sidebar has too many buttons (30 min, coordinate first).** The user: "too many buttons in the sidebar and it doesn't look intentional... potentially use the real estate on the right side". Before changing anything, message `paint-a-pint-f6` (or ask the user) so the design session owns the visual decisions. Proposal to offer: keep paints, brush shape, size, **lay flat**, and **hang it up** as the main card; group undo, clear, dry now, wetness, save png and settings into one compact secondary toolbar. Restructure only the DOM built in `acrylic-painter.js`; leave CSS to the design session (use existing tokens and classes).

**T4. Deploy, README, demo script, submission checklist (60 to 90 min).** **Host decided: Vercel** (the user chose it). Facts checked: `npm run build` works and outputs `dist/` (gitignored) with two pages, `index.html` and `lab.html` (`vite.config.js`); no `vercel.json` or `.vercel/` exists yet and none is needed for a plain Vite static app (framework preset "Vite", build `npm run build`, output `dist`, served from the root so no `base` change). The `vercel` CLI is **not installed** and needs the user's login, so pick a route *with the user*: (a) they import `github.com/wrufay/paint-a-pint` in the Vercel dashboard (requires the latest commits pushed, which needs their OK: `main` was ahead of `origin/main` by 6 last time), or (b) they run `npx vercel login` themselves, then `npx vercel --prod` from this folder. The main JS chunk is ~600 kB (a size warning only, ignore it). After deploying, open the live URL in a real browser and confirm the room loads, painting works and `/lab.html` loads. Write:
- `README.md`: what it is, how to run (`npm install`, `npm run dev`), controls, credits (Spectral.js, MIT, is the source of the pigment tables; fonts via Fontsource; the paints are real Amsterdam and Winsor & Newton Galeria colours).
- `docs/DEMO.md`: a 60 to 90 second live-demo script that leads with the wow: click easel, mix yellow and blue on wet paint to get green, wet-on-dry covers, ridges and thickness in the room's light, lay it flat for the bird's-eye view, hang it on the wall. Include a fallback if the iPad or network fails.
- A submission checklist (source link including design assets, badge IDs, optional demo video, and the sponsor-prize cutoff of 2026-09-19 14:00 has already passed).

**T5. A real mixing palette (60 to 90 min, biggest wow).** The user wants to choose colours "from our own palette we mix on", their old styrofoam tray where paint piles up (photo: `canvas/painting_examples/progress2_closeup/texture_palette.jpg`). Idea: a second `PaintEngine` instance as a tray (about 700 x 480). Tubes squeeze blobs onto it, you mix with a brush or knife on the tray, and clicking a colour on the tray loads it into `painter.color` (pass `beginStroke(..., colorLinear, paint)` a synthetic paint, e.g. `{ opacity: 'semi', strength: 1 }`). The tray dries with the same engine. MVP: a "palette" toggle on the card that swaps the paper overlay for the tray; sample the colour under the pointer on tap. The 3D palette prop is already on the desk (`room.js`), visible in the bird's-eye view.

**T6. Palette knife (45 min).** From `impasto_small.jpg`: flat planes, sharp edges, big ridges. Add `shape: 'knife'` in `beginStroke`: a tight straight row (near-zero bristle gaps, very high `push`, low colour drift) that drags paint into a flat plane and leaves a raised edge. Add it to the shape picker.

**T7. Masking tape (45 min).** The user asked for it (`canvas/progress/README.md`). A mask array on the engine: pixels under tape receive no paint; removing tape leaves a crisp edge. UI: draw strips along the canvas border.

**T8. Paper as an alternative to canvas (30 min).** Progress painting is on smooth sketchbook paper. Add a `ground` option in `PaintEngine` (finer, lower-contrast tooth) and a toggle.

**T9. Choose where paintings hang, and remove them (45 min).** `world.hang(canvas)` in `room.js` fills the first unfilled of 8 frame slots (`world.frames`), and once all are full it silently overwrites in rotation. Let the user pick a slot, remove a hung painting, and avoid the silent overwrite. State can stay in memory for now (optionally `localStorage` thumbnails); no backend. Keep `room.js` edits minimal and tell the design session.

**T10. Fuller colour fix (about 1 hour, only if time).** Keep the ground, the wet paint colour and how much it covers as separate things, so thin paint is a true glaze, bristles pick up pure paint, and dried layers become the new ground. See `docs/LOGS.md` (line 20) and the notes in section 4.

**T11. Multi-step undo.** `snapshot()` is one level. A snapshot is ~30 MB at this size, so store 3 to 5 or diffs by dirty rectangle.

**T12. Ask the user to test on the iPad** and report feel and speed. Anything about performance must come from them.

**Final block (last 2 to 3 hours, do not skip):** rehearse `docs/DEMO.md` end to end in a real browser, fix only bugs, run `npx vite build`, run all `tools/*` checks, and walk the submission checklist with the user.

## 7. Suggested first message to the user
Tell them you have read this file and `docs/LOGS.md`, list T1 to T4 as what you will do first, and ask what only they can answer: whether the design session should own the sidebar restructure (T3), and which Vercel route they want (dashboard import, which needs a push, or CLI login). The host (Vercel) is already decided.
