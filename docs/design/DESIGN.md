# paint-a-pint design system

One place for colour, type and technical UI rules. If code disagrees with this file, one of them is wrong: fix it or update this file in the same change.

- Tokens: `src/tokens.css`, linked by `index.html` and `lab.html`. Fonts: `src/fonts.css`, linked by `index.html`.
- Font comparison page: `docs/design/font-specimen.html`.
- Colour: `docs/design/colour-specimen-original.html` is the chosen 14-token palette. `docs/design/colour-specimen.html` holds the alternatives explored (see "Alternatives explored").

Status: **typography decided, colour decided.**

## Vibe

Warm, tactile, desk-corner. Paper scraps and masking tape rather than glass and gradients. References: the Teracy taped "MENU" chip, the desk photos, Amsterdam acrylic tube labels. Impressionism, thick brushes, a mixing tray.

## Typography (decided)

Three families.

| Role | Family | Weights | Used for |
|---|---|---|---|
| Display | **Young Serif** | 400 only | wordmark, room names, big titles |
| UI | **DM Sans** | 400, 500, 700 | chips, buttons, body copy, tube labels |
| Tape | **Nunito** | 700 | masking-tape labels (e.g. "W16.2 × L22.5 cm") |
| Debug | system mono | n/a | `lab.html` sliders only, never in the room UI |

Rules:
- Young Serif has a single weight. Never fake bold or italic on it.
- **Chips** (MENU, PALETTE): DM Sans 700, 12px, uppercase, `--tracking-caps`. Cream paper scrap, slight tilt, a tape strip on top (see "Tape" under Colour).
- **Buttons**: DM Sans 400, 12px, pill shape, `--tracking-btn`.
- **Body / helper text**: DM Sans 400, 14px, line-height about 1.55.
- **Tube labels** (modelled on the Amsterdam label: swatch, pigment code, multilingual names, number): DM Sans 500, 14px. Pigment code (e.g. `PR112`) 12px centred under the swatch, colour number bold and right-aligned. DM Sans is wider than a true condensed face, so give label textures room.
- **Tape label** is optional. If it is dropped from the app, Nunito can be dropped with it and tape text falls back to DM Sans.

Sizes: `--text-xs` 11, `--text-sm` 12, `--text-base` 14, `--text-lg` 18, `--text-xl` 24, `--text-display` 44.

### Canvas / Three.js text

`room.js` paints textures with canvas 2D. Canvas draws with whatever font is loaded at that instant and never redraws, so a label drawn early is stuck with the fallback face.

Always await the font before drawing:

```js
await document.fonts.load('500 14px "DM Sans"');
await document.fonts.load('400 44px "Young Serif"');
// then draw
```

Do this for every family and weight a texture uses, and check that the tube label textures really render in DM Sans and not the fallback.

### Loading fonts

The app self-hosts fonts through Fontsource, bundled by Vite, so it works offline and on iPad. `src/fonts.css` is linked from `index.html` and currently loads **DM Sans 400, 500 and 700** only, because that is all the UI draws. Add **Young Serif** (400) for the display wordmark and **Nunito** (700) for tape labels the first time something uses them: `npm install @fontsource/young-serif @fontsource/nunito`, then `@import` them in `fonts.css`. That is a `package.json` change, so do it as its own commit and check no other session has uncommitted edits to `package.json` first. The font specimen pages still load from Google Fonts. Do not rely on `/System/Library/Fonts`: it is macOS-only. `lab.html` keeps system mono and does not load fonts.

## Colour (decided)

Fourteen tokens. Values were sampled from the desk photos, paintings and room inspo (the specimen shows the sources); `--ink-soft` and the ones marked new were added on top of what the code already had.

| Group | Token | Value | Role |
|---|---|---|---|
| Surface | `--cream` | `#fbf7ee` | cards, chips |
| Surface | `--paper` | `#f6efdd` | canvas / sheet surface |
| Surface | `--butter` | `#ecdcaa` | highlight, lamp glow, hover wash (new) |
| Ink | `--ink` | `#4a3b34` | text on light |
| Ink | `--ink-soft` | `#756558` | secondary text on light (new) |
| Dark | `--backdrop` | `#1c1915` | room page background |
| Dark | `--backdrop-lab` | `#2b2622` | lab page background |
| Dark | `--dusk` | `#404070` | night surface (new) |
| Dark | `--muted-on-dark` | `#cdbfae` | secondary text on dark |
| Accent | `--pink` | `#e58a8a` | decoration |
| Accent | `--green` | `#5fa88c` | decoration |
| Accent | `--sky` | `#68a0d1` | decoration (new) |
| Accent | `--terracotta` | `#954a33` | primary action on light, coloured text (new) |
| Accent | `--ultramarine` | `#335295` | coloured text and links on light (new) |

`room.js` hard-codes about 30 more hex values for the room itself (walls, sky, lawn, and so on). Those are scene art, not UI, and are out of scope for now. The nine paint tubes are data in `src/brush/paints.js`, not tokens: keep the UI quieter than the paint so the tubes are the loudest colours on screen.

### What each accent is for

Each accent has one job, so colour is never arbitrary:

- **Pink, green, sky: decoration.** Tape, dashed borders, selection rings, slider tracks, tags.
- **Terracotta: the primary action** on light surfaces (cream text on it), and coloured text.
- **Ultramarine: coloured text and links** on light surfaces, secondary headings.
- **Butter: highlight.** Lamp glow, a hover or selected wash. Text on it is `--ink`.
- **Dusk: the night surface.**

### Tape

Tape strips on chips and labels may be pink, green or sky, chosen freely, like real washi tape. Tape colour carries no meaning, so never use it to signal state. Chips and tape labels stay paper-coloured in every theme: they are physical objects in the scene, not themed UI.

### Text safety (WCAG 2.x, small text needs 4.5:1)

| On | OK for text | Not for small text |
|---|---|---|
| cream / paper | ink 9.99, ink-soft 5.23, terracotta 5.94, ultramarine 7.06 | pink 2.36, green 2.63, sky 2.61 |
| backdrop `#1c1915` | cream 16.38, butter 12.83, muted-on-dark 9.72, pink 6.95, sky 6.29, green 6.23 | none |
| dusk `#404070` | cream 8.99, butter 7.04 | pink 3.81 (and green 3.42, sky 3.45) |

Text on a filled colour:
- OK: cream on terracotta 5.94, cream on ultramarine 7.06, ink on butter 7.82, and `--backdrop` on pink, green or sky when the button sits on a dark surface (pink 6.95).
- Not OK: `--ink` on pink 4.24, on green 3.80, on sky 3.83, and white on green 2.81.

Practical rule: **on light surfaces pink, green and sky are never text or button labels.** Put the label on cream next to the colour, or use terracotta or ultramarine.

### Contrast fixes applied when the tokens were adopted

`index.html` used to set the primary button as white on `--green` (2.81:1) and the card heading in `--green` on cream (2.63:1). Both failed the rule above. The primary button is now cream on `--terracotta` (5.94:1) and the card heading is `--ultramarine` (7.06:1).

Watch item: the paint card now shows four accents at once (pink dashed border, green selection ring and slider, terracotta button, ultramarine heading). If that reads as busy, set the heading in `--ink` instead; that is a one-word change and stays within the rules.

### Alternatives explored (not adopted)

Kept in `docs/design/colour-specimen.html` for reference:
- A trimmed 10-token, 2-hue palette that adds a `--green-deep` (`#357059`) instead of terracotta.
- One-accent schemes (strawberry, melon, blueberry, apricot) and a "fruit salad" two-accent default.
- A deeper night indigo (`#232340` page, `#30305a` card). Raw `--dusk` is too light to carry pink, green or sky text; if that is ever needed at night, this is the fix.
- Per-room accents (alps, Waterloo, home) are still an open question: nothing in the palette prevents it.

## Adopting the tokens (done for the two pages)

`index.html` and `lab.html` link `src/tokens.css` and no longer define their own `:root` tokens. Palette hexes in their CSS are now tokens (backdrop, paper, tape, butter hover, muted-on-dark).

Still hard-coded, deliberately or not yet:
- `src/paint.js` is the old gouache painter and nothing imports it any more. Its `PAPER = '#f6efdd'` and 6-colour `PALETTE` are dead code: ignore them (delete the file when its owner agrees). The live paints are in `src/brush/paints.js`.
- Neutral utilities in the pages: white button fills (`#fff`), shadow and cursor `rgba(...)` values, and the cream-with-alpha hint pill.
- Scene colours in `room.js`, which are art, not UI.

New UI CSS should use the tokens; do not add new palette hexes to the pages.

## Working agreement

- Add to this file when a decision is made. Do not leave decisions only in chat.
- New design tokens go in `src/tokens.css` first, then get used.
- Notes on the app's look and feel from playtesting belong in `docs/LOGS.md`; decisions belong here.
