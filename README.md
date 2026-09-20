# paint-a-pint
the dream is to make art in the alps. 🏔️

A tiny 3D painting room (a Three.js diorama of a desk corner) where you paint with a **simulation of real acrylic paint**. It is not a digital art tool: paint dries on a clock, thick paint holds ridges, colours mix like pigment, wet-on-wet blends and wet-on-dry covers. The aim is impressionism in thin-to-medium acrylics, with none of the cost or cleanup. Built solo for Hack the North 2026.

## Run it

```
npm install
npm run dev       # the room at http://localhost:5173, the brush lab at /lab.html
npm run build     # static site into dist/
```

No backend. Plain JS modules, Vite and Three.js.

## How to paint

Click the easel. The camera moves in and a card appears with the paints.

| | |
|---|---|
| paint | click a colour, or press **1**-**9** (card order) |
| brush | flat, filbert (oval, width follows pressure), round (click for a dab) or palette knife (flat planes with a raised edge) |
| size | the slider, or **[** and **]** |
| undo | **z**, many steps back (up to 40) |
| tubes and brushes on the desk | click a **tube** to pick that paint and a **brush** to pick that shape, in the room or in paint mode; the chosen paint's tube lifts off the pile |
| mixing palette | **p**, or the button: a tray to squeeze paints onto, mix on with a knife, and tap a colour from to load your brush |
| wetness view | **w**: blue = still workable, orange = getting tacky, no tint = dry |
| dry now | skips the wait: everything wet becomes dry paint |
| lay it flat / stand it up | puts the canvas on the desk for a bird's-eye view, and back on the easel |
| esc | back to the room; the painting stays on the easel and keeps drying |
| hang it up & go back | hangs the painting on the wall and clears the easel |
| settings | plain-language sliders (how runny, how much paint, drying speed, ridges, texture, fast-forward time), with the raw ones under "advanced" |
| save png | downloads the canvas |

Made for an iPad with an Apple Pencil (pressure is used); on a mouse or trackpad, pressure is faked from speed.

## What the paint does

- **Drying runs on a clock.** Water leaves the wet layer, thick paint dries far slower than thin, and a skin slows the last of it. Paint goes from open (blends, gets picked up) to tacky (drags, breaks up) to locked. `open time` and a fast-forward slider are in the settings.
- **Wet-on-wet blends, wet-on-dry covers.** A bristle dragged through open paint picks it up and mixes; new paint over dried paint just covers it.
- **Colours mix as pigment**, not as RGB: blue and yellow lean green, white tints. Kubelka-Munk over a 38-band spectrum.
- **Bristles.** Each bristle carries its own paint, runs dry on its own, and shoves open paint aside into ridges, so you get streaks, broken edges and dry-brush.
- **Lit by thickness.** The paint's height becomes a normal map, and the room's own lights shade it on the easel.

The numbers behind this (drying times, paint thickness, tinting strengths, some paint opacities) are **educated guesses tuned by eye against real paintings, not measurements**. `docs/acrylic-simulation.md` has the original plan; `src/brush/engine.js` starts with a header describing what is built.

## Layout

| | |
|---|---|
| `src/brush/engine.js` | the acrylic engine: pure JS, no DOM, runs in Node |
| `src/brush/pigment.js`, `spectral-data.js` | the pigment mixer and its generated tables |
| `src/brush/paints.js` | the nine paints as data (add paints here) |
| `src/brush/tune.js` | saved settings and the settings panel |
| `src/acrylic-painter.js` | connects the engine to the room and the card |
| `src/main.js`, `src/room.js` | the room, the easel, the camera |
| `src/lab.js`, `lab.html` | brush lab: engine and raw sliders on one page |
| `src/paint.js` | the older gouache painter, kept as a fallback |
| `tools/` | Node checks: `dry-test`, `mix-test`, `render-test`, `brush-shapes`, `consumption-test` |
| `docs/design/` | the design system (tokens, type, specimens) |

Regenerate the pigment tables with `node tools/gen-spectral-data.mjs`. The Node checks print numbers or write PNGs, for example `node tools/brush-shapes.mjs out.png`.

## Credits

- Pigment mixing tables come from [Spectral.js](https://github.com/rvanwijnen/spectral.js) by Ronald van Wijnen (MIT), used as a dev dependency to generate `src/brush/spectral-data.js`.
- Three.js for the room. Type set in DM Sans through [Fontsource](https://fontsource.org/).
- The paints are real Amsterdam and Winsor & Newton Galeria colours. Their hex values were sampled from the makers' swatch images, so they are approximate.
- Reference art and paints are the author's own paintings and desk.
