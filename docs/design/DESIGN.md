# paint-a-pint design system

One place for colour, type and technical UI rules. If code disagrees with this file, one of them is wrong: fix it or update this file in the same change.

- Tokens: `src/tokens.css` (not imported by any page yet, see "Adopting the tokens").
- Font comparison page: `docs/design/font-specimen.html`.

Status: **typography decided, colour provisional.**

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
- **Chips** (MENU, PALETTE): DM Sans 700, 12px, uppercase, `--tracking-caps`. Cream paper scrap, slight tilt, pink tape strip on top.
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

Currently the specimen loads from Google Fonts. For the app, self-host (Fontsource via npm, bundled by Vite) so it works offline and on iPad. That means a `package.json` change, so do it as its own commit and check no other session has uncommitted edits to `package.json` first. Do not rely on `/System/Library/Fonts`: it is macOS-only.

## Colour (provisional)

These are the values already in `index.html` and `lab.html`. They stay until the colour pass, which should sample from the desk photos and inspo instead of inventing.

| Token | Value | Where it comes from |
|---|---|---|
| `--cream` | `#fbf7ee` | cards, chips |
| `--paper` | `#f6efdd` | canvas surface |
| `--pink` | `#e58a8a` | accent, tape strip |
| `--green` | `#5fa88c` | accent |
| `--ink` | `#4a3b34` | text on light |
| `--backdrop` | `#1c1915` | room page background |
| `--backdrop-lab` | `#2b2622` | lab page background |

`room.js` hard-codes about 30 more hex values for the room itself (walls, sky, lawn, and so on). Those are scene art, not UI, and are out of scope for now.

Open questions for the colour pass: a real palette from the photos, the dusk-indigo and lamp-yellow moods from the inspo, and whether the UI should change with the selected room (alps, Waterloo, home).

## Adopting the tokens

`index.html` and `lab.html` each define their own `:root` tokens inline. `src/tokens.css` reuses the same names (`--cream`, `--pink`, `--green`, `--ink`, `--mono`), so switching is: import `tokens.css`, delete the inline `:root` block, then swap hard-coded fonts and colours for tokens. Do this in one focused commit, since those two files are shared with other sessions.

## Working agreement

- Add to this file when a decision is made. Do not leave decisions only in chat.
- New design tokens go in `src/tokens.css` first, then get used.
- Notes on the app's look and feel from playtesting belong in `docs/LOGS.md`; decisions belong here.
