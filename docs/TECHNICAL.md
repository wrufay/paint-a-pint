# paint-a-pint: technical overview

paint-a-pint is a browser-based painting room whose brush engine models the behaviour of acrylic paint: paint dries on a clock, thick paint holds ridges, colours mix as pigments, and new paint covers dried paint instead of blending with it. It runs entirely client-side, with no backend and no machine learning. The model is a set of physically motivated rules stepped forward in time.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Rendering | Three.js (WebGL), custom post chain | The 3D room, the easel and desk, the paint tubes and the palette |
| Paint engine | Plain JavaScript over typed arrays, no DOM | Runs identically in the browser and in Node, so the physics can be tested headlessly |
| Colour | Kubelka-Munk over a 38-band spectrum | Pigment mixing (blue + yellow gives green, white tints) instead of RGB blending |
| Build | Vite | Two entry pages: the room and a brush-tuning lab |
| Input | Pointer Events (pressure, coalesced events) | Apple Pencil and Wacom pressure, palm rejection |
| UI | Vanilla DOM built from design tokens, DM Sans self-hosted | No framework; the card, tooltip and palette controls are generated in code |
| Verification | Node scripts for the engine, headless Chrome for the room | Every behaviour below has a check that can be re-run |
| Deploy | Vercel (static) | The app has no server component |

## The paint model

Each canvas pixel (1300 x 950) holds five fields: visible colour (linear RGB), solids and water in the wet layer, a dried film underneath, and a fixed canvas-weave height. Everything else is derived from those.

- **Drying is a state machine driven by water content.** With f = water / (solids + water), paint is open (blends and is picked up) above f = 0.3, tacky (drags and breaks up under a brush) between 0.3 and 0.12, and locks into the dried film below 0.12. Evaporation slows for thick paint and slows again as a skin forms, so a thin glaze dries in seconds and an impasto stroke stays workable much longer. A simulated clock with a time-warp control lets a user skip the wait.
- **Layering.** Locked paint is inert: new paint over it covers it, and only open paint mixes. This reproduces wet-on-wet blending versus wet-on-dry layering, the distinction painters work with.
- **Bristles are individual agents.** Each bristle carries its own load and colour, lays paint along its own path, runs dry on its own, skips over the weave peaks as it empties (dry brush), and picks up open paint from what it crosses. Four tools use the same machinery: flat, filbert, round and palette knife.
- **Ridges.** Bristles shove open paint sideways, leaving a groove and a raised edge. The displaced paint carries its colour and its volume is conserved.
- **Lighting from thickness.** Paint height becomes a normal map, so thick paint reads as thick and the weave shows through thin paint.

## Technical challenges and how they were solved

### 1. Pigment mixing that behaves like paint, at brush speed
RGB blending cannot make green from blue and yellow, and per-pixel spectral mixing is expensive: a bristle-level engine mixes colour for every bristle on every pixel it touches.
**Solution.** A typed-array, allocation-free port of the Kubelka-Munk spectral mix (following the MIT-licensed Spectral.js). Reflectance tables are generated from the package by a script rather than copied by hand, and mixing runs at about 0.2 microseconds per mix. Tinting strength and opacity are per-paint data, so a strong pigment such as Prussian blue takes over a mix faster than a weak one.

### 2. Mass-conserving ridges without artefacts
A first version that moved paint sideways produced speckled, one-pixel ridges and, worse, lost the colour of the moved paint, so raised paint sat on the canvas coloured like bare gesso ("ghost ridges").
**Solution.** Displacements are queued and applied after every bristle has been through (so order does not matter), spread bilinearly over four pixels, and carry their colour. Bristles no longer pick up from pixels that still look like bare canvas. In a fixed test stroke set, raised pixels with no paint colour fell from 35% to under 0.1%, and total paint volume was unchanged by the shoving.

### 3. Telling paint apart from the ground it sits on
With one visible colour per pixel, thin paint over bare canvas mixed as if the canvas were white paint, giving chalky pastel tails.
**Solution.** Over bare canvas or dried paint the existing colour is treated as a ground, not a paint, by scaling the mixer's luminance weighting with the wet thickness underneath. Thin strokes now read as glazes. A fuller fix (separate ground, wet colour and coverage layers) is identified but not built.

### 4. Real-time cost: tiles, lazy shading and a lookup table
Drying and lighting over 1.2 million pixels every frame would be far too slow.
**Solution.** Work is tiled (32 px). Only tiles that hold wet paint are dried, and only dirty tiles are re-shaded. Tiles changed by drying alone are shaded lazily on a per-frame budget, so a fully wet canvas costs a few milliseconds per frame instead of stalling. A sRGB lookup table replaced a power function in the shader loop and roughly halved the worst re-shade frame (6.9 ms to 3.6 ms in a Node benchmark).

### 5. Undo without copying the canvas
A full-canvas snapshot is about 28 MB, so the first undo only went back one step.
**Solution.** Copy-on-write undo by tile: a step saves only the tiles a stroke touches, the first time it touches them. Twenty-five long strokes hold about 41 MB instead of 700 MB, undo takes milliseconds, and the history is capped at 40 steps or 96 MB. A test asserts that every undo restores the canvas exactly, including clear and dry-now.

### 6. Rendering the same paint in two places without lighting it twice
The 3D room shows the painting on the easel. Feeding it the already-lit canvas would light the ridges twice.
**Solution.** The engine emits an unlit colour map and a tangent-space normal map. The 3D surfaces use both, so the room's own lights shade the paint's thickness. The same path drives the mixing palette.

### 7. A GPU that does nothing while you paint
The room re-rendered every frame even while a 2D overlay hid it, which cost heat on a laptop and frame rate on a tablet.
**Solution.** On-demand rendering: a frame is drawn only while the camera, easel, hover state or paint texture changes, and the large shadow map is redrawn only when something that casts a shadow moves. On touch devices the pixel ratio is capped, MSAA is reduced and the shadow map is halved. Measured on a desktop GPU in headless Chrome: zero draw calls per second while idle or painting, versus every frame before. This has not been measured on an iPad.

### 8. An interactive 3D palette whose surface is a simulation
The palette had to be a physical object in the room and a working paint surface.
**Solution.** A second engine instance is UV-mapped onto a palette mesh built from a parametric outline (an ellipse with a dent and a thumb hole, extruded as a wooden board). A pointer ray is intersected with the mesh, converted from UV to engine pixels, and drives squeeze and mix tools. Because the hole and dent are absent from the mesh, they cannot be painted. Paint on the palette dries and is lit like everything else.

### 9. Paint tubes that look like the real ones
**Solution.** The tubes are procedural geometry with label textures drawn on a canvas: a crimped seal with a hang hole, banded Amsterdam labels with a transparency square and lightfastness rating, silver Galeria tubes with the range name and a colour band. Fonts are awaited before drawing, because a canvas texture drawn early keeps the fallback face. The tubes are also the paint picker: they are raycast for hover and click, and a hover tooltip shows name, pigment code, colour number, opacity and use.

### 10. Camera and overlay alignment
Painting happens on a 2D canvas overlaid on the 3D scene, so the overlay must line up with a canvas that is moving in 3D.
**Solution.** The overlay's rectangle is computed each time by projecting the canvas corners through the current camera. The overhead pose is derived from the desk layout and screen size, and the canvas width is chosen so the tool card never covers it. A subtle failure found along the way: `Object3D.lookAt` points +z at the target, unlike a camera, which produced a black frame until a real camera object was used.

### 11. Placing objects without overlap, and finding the sun
Scattering nine tubes at angles among a canvas, a palette, water jars and a draggable card by hand kept producing overlaps and clipping.
**Solution.** A small solver places oriented rectangles with a separating-axis overlap test and keep-out zones, and prints the coordinates. To decide where the palette should sit, a brightness map of the empty desk was rendered and sampled, which showed the sunlit region and explained why the palette looked odd straddling a shadow edge.

### 12. Input on a tablet
**Solution.** Pointer Events with coalesced samples so fast strokes keep their shape, pressure and stylus support, palm rejection once a pen is detected, and pressure faked from stroke speed for mouse and trackpad.

### 13. Verifying a graphics app with no human in the loop
The room renders in a real browser, so behaviour could not be checked by unit tests alone.
**Solution.** Node scripts exercise the engine (drying, mixing, undo, brush shapes, the palette, tube placement) and write images; headless Chrome drives the real room through enter, paint, mix, drag, undo and leave, and asserts on engine state as well as screenshots. An early mistake is worth recording: the browser harness forced software rendering, which turned each check into minutes. Running on the real GPU brought a full round trip to about six seconds and made the whole test loop practical.

### 14. Autosave, with paint that keeps drying while you are away
The painting is about 30 MB of floats and the tab can close at any moment.
**Solution.** The engine exports its colour, wet layer and dried film, and a change counter says when a stroke, clear, dry-now or undo has made a save worth doing. A saver checks the counter every two seconds (and when the tab is hidden), gzips the state through the browser's own stream API off the main thread, and writes it to IndexedDB along with the time. On load the paint is dried for as long as the tab was closed, so a wet painting reopened the next day is dry. A fully painted canvas stores as about 20 MB, saves in under a second and restores in about 0.3 s; the palette and the hung pictures (stored as PNGs with their frame) are kept the same way. Nothing leaves the device, and a browser that refuses storage simply forgets.

## Limits, stated plainly

- Drying times, paint thickness, tinting strengths and some opacities are educated estimates tuned by eye against real paintings, not measurements.
- Each pixel stores one visible colour, so the paint-versus-ground separation in challenge 3 is a patch rather than a full layer model.
- Performance numbers come from Node and desktop Chrome. Tablet performance has not been measured.
- Autosave keeps the painting, the palette and the hung pictures in this browser only (IndexedDB), so they do not follow you to another browser or device, and the browser may clear them (Safari does after about a week without a visit). Undo history is not kept across a reload.

## Credits

Pigment mixing follows Spectral.js (MIT, Ronald van Wijnen), with its data tables generated from the package. Fonts are self-hosted through Fontsource. The paints are real Amsterdam and Winsor & Newton Galeria colours, with swatch colours sampled from the makers' images.
