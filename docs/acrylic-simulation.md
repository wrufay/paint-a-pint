# Simulating acrylic paint: tech and model

Goal: not a digital art tool. A simulation of *physical acrylic painting*: it dries on a clock, holds ridges,
tacks up, skins over, shifts colour when dry, layers and glazes over dried paint, and responds to pressure.
Impressionism is the *style* we paint in. The physics is what we simulate.

Numbers below marked "approx" are from general knowledge, not measurements. Section 6 is how to measure the
real ones. "Exactly" is out of reach (real paint has microstructure nobody simulates), so the target is
*behaviourally correct in every way a painter would notice*.

---

## 1. What real acrylic does (the behaviours to reproduce)

Acrylic = pigment particles + polymer emulsion (binder) + water + additives. It dries by **water leaving**
(evaporation, plus some soaking into gessoed canvas), after which the polymer particles fuse into a
water-resistant film.

| Behaviour | Physical cause | What must exist in the sim |
|---|---|---|
| Working time, then it "tacks up" | Water evaporates, so viscosity and yield stress climb | Water content per texel; rheology as a function of it |
| Skins over before it's dry underneath | Surface loses water first, then bulk diffuses up through the skin | Skin/resistance term, so thick paint dries much slower than thin |
| Thick paint dries in hours, thin in minutes (approx) | Evaporation is surface-limited | Thickness-dependent drying |
| Brush ridges and peaks hold their shape | Yield-stress (paste-like) fluid: flows only if driving stress exceeds a threshold | Herschel–Bulkley style flow, not plain viscous flow |
| Paint shrinks as it dries | Water volume is lost; only solids remain | Track solids and water separately: `height = solids + water` |
| Dries darker / colour shifts | Milky wet emulsion turns clear; scattering changes | Wet→dry optical change per pigment |
| Wet-in-wet blends, wet-on-dry does not | Dried film is insoluble | Separate *wet paint* from a *dried film* layer |
| Opaque vs transparent pigments, glazing | Per-pigment absorption (K) and scattering (S) | Kubelka–Munk layer compositing |
| Dry brush, skipping | Low load + canvas tooth | Already in your engine |
| Pressure changes contact and splay | Bristle bending | Partly in your engine |
| Thin, water-thinned paint runs, pools and wicks into the weave | Low yield stress, gravity, capillarity | Thin-film flow + gravity + absorption |
| Brush and palette paint dry too | Same evaporation | Paint reservoirs with their own water content |

---

## 2. Where the current engine stands ([src/brush/engine.js](../src/brush/engine.js))

| Have | Missing |
|---|---|
| Bristle-level load, dry-brush against weave, contact threshold from pressure, splay | No water or solids split. Wetness is `wetUntil = now + 90s`, a constant timer |
| Height field, lit as impasto, with weave | Height is only ever *added*. Nothing is pushed aside, so there are no ridges, slump or shrinkage |
| Wet pickup by bristles | No yield-stress flow, no tack/drag phase, no skin |
| Linear-RGB mixing hack (`mix3`) | No pigment mixing model, no opacity per pigment, no glazing. One colour per texel |
| | No dried-film layer, no dry colour shift |
| | No brush/palette state (paint drying in the bristles, dipping in water, medium) |
| | Deposit ignores stroke speed and tilt |

The bristle/stamp part is a good base. The **state model** is what has to change.

---

## 3. The model

### State per texel

- `s`: solids volume (pigment + polymer), tracked *per pigment* or as a mixable latent colour (see Colour below)
- `w`: water volume
- `h_wet = s + w`: wet paint thickness. When `w → 0` the height collapses to `s` on its own, so shrinkage falls out for free
- `film`: the **dried film**. It stores its composite reflectance and thickness, and it is immutable once formed
- `ground`: canvas weave height and absorbency (you already have the height)
- Derived: solvent fraction `f = w / (s + w)`. Everything about rheology keys off `f`

### Per-step rules

1. **Brush contact** (stamp bristle footprints, as now):
   - *Transfer* paint (volume, water, pigment) from the bristle reservoir to canvas. It depends on pressure, speed, load and tooth.
   - *Pick up* wet paint into the bristle.
   - **Displace** wet paint sideways under the bristle, conserving mass. This is what makes ridges and knife edges.
2. **Flow**: thin-film flow with a yield stress. Roughly `flux = mobility(h, f) · max(0, |driving stress| − τ_y(f))`. The driving terms are the height gradient, gravity (canvas tilt) and surface tension. Peaks hold when `τ_y` is high and slump when it's low. As `f` falls, `τ_y` and viscosity rise steeply, which is the tack-up you feel.
3. **Transport**: pigment and water advect with the flux. Water also drains into the gesso/canvas (absorption sink) and wicks into the weave.
4. **Evaporation**: `dw/dt = −E(temperature, humidity, airflow) · exposure`, slowed by a skin-resistance term as the surface dries. Thick paint therefore dries slower than thin.
5. **Film formation**: when `f` drops below a critical value, that texel freezes and is composited into `film` (Kubelka–Munk over whatever film was under it). It no longer flows, mixes or gets picked up. A later wet layer starts fresh on top of it.
6. **Wet→dry optics**: apply the per-pigment shift (usually darker, less milky) and roughness change during film formation.

### Colour

- Ordinary RGB mixing cannot do blue + yellow → green, or opaque vs transparent pigments. Two options:
  - **Mixbox** (Sochorová & Jamriška, SIGGRAPH Asia 2021): practical pigment mixing. It works in a latent space that is *linear*, so you can advect and blend it safely. From memory the default licence is non-commercial, so check it.
  - **Kubelka–Munk with K and S per wavelength band** (6–8 bands stored across a couple of RGBA textures). Physically the most honest, and it also gives you glazing. This is the "exact" route.
- Recommendation: Mixbox-style latent mixing to get moving, and K–M for the *layer compositing* so opacity and glazes are right.
- Layer compositing with K–M has a closed form. For a layer of thickness `h` over a background of reflectance `R_g`: `a = 1 + K/S`, `b = √(a²−1)`, `R = (1 − R_g(a − b·coth(bSh))) / (a − R_g + b·coth(bSh))`. Wet paint is drawn with the same formula on top of `film`.

### Scale: pick this on purpose

Bristles are ~0.1–0.3 mm and canvas thread pitch is ~0.3–0.5 mm (approx, so measure yours). Your weave uses about 4.2 px per thread. If that is 0.4 mm, then **1 px ≈ 0.1 mm**, and 1200×900 is only ~12×9 cm. A 40 cm canvas would be ~4000 px wide.

Acrylic dries fast, so *the wet region is small and shrinks*. Design around that:
- Sparse tiles: allocate only where paint exists.
- Only the **wet set** runs flow and evaporation at full resolution. Dried tiles freeze into cheap static maps (film colour + height + normal).
- When the user is away, don't simulate. On load, fast-forward drying analytically from the timestamp.

---

## 4. Tech stack

Keep **Vite + Three.js** for the room. Put the simulation in a separate module with a clean interface.

- **Prototype the physics in plain JS on the CPU first**, on a small canvas (e.g. 400×300).
  - Your engine already runs in Node ([tools/render-test.mjs](../tools/render-test.mjs)), so you can script strokes, advance the clock and inspect results without a GPU debugger.
  - Getting the *model* right is the hard part. Porting it comes second.
- **Then port to the GPU: WebGPU compute (WGSL).**
  - The fields are float textures and the flow/evaporation are stencil updates, which suit compute shaders.
  - Bristle stamping is a scatter, which is easier in compute than in WebGL2.
  - It ships in current Chrome and Safari, but confirm on your target.
  - Three.js `WebGPURenderer` supports compute and storage textures, so the sim textures can feed the room material directly. Verify the interop early, because it is the fiddly part.
  - WebGL2 fallback: ping-pong float textures. It works for flow but is clumsier for scatter.
- **Keep the CPU engine as the reference oracle.** Run the same stroke through both and compare. That is how you catch GPU bugs.
- **Native escape hatch**: Rust + `wgpu` reuses the same WGSL and lifts browser limits (memory, texture formats, fp32 filtering). Consider it only if the web hits a wall.
- **Rejected**: full 3D particle/MPM/SPH paint. It is physically nice but too heavy at canvas scale, and a height-field with yield-stress flow captures nearly everything you'd see.

### Rendering

- Height → normal map → PBR: `normalMap` + `roughnessMap` on the room's canvas material. Roughness comes from wetness (wet is glossier) and medium.
- Add ambient occlusion from height so ridges and grooves read. This matters as much as normals for "thick paint".
- Output the film + wet layers through the K–M optical model, then light them.

### Time

- Use a fixed-timestep **sim clock** separate from the frame clock, with an optional time-warp so you're not waiting 20 real minutes for a layer to dry.
- Persist the clock timestamp with the painting.

### Input

- Pointer Events give `pressure`, `tiltX/Y`, `azimuthAngle`/`altitudeAngle`. Use `getCoalescedEvents()` so fast strokes keep their samples.
- **Real pressure needs a stylus** (Apple Pencil, Wacom). A mouse has none. Mac trackpad force is only reachable through non-standard Safari events and isn't dependable. For mouse/trackpad, fake pressure with a modifier key or scroll wheel, and be honest about it in the UI.
- Deposit should depend on **speed** (fast = thinner, more dry-brush) and **tilt** (brush angle → contact patch), not just pressure.

### Tools and state beyond the canvas

- **Brush state**: reservoir of paint + water. Dipping in water thins it, and paint left on a brush skins and stiffens (clumped bristles are a real acrylic experience).
- **Palette**: paint wells that dry on the same evaporation model. Mixing happens there.
- **Palette knife**: displacement without bristle texture. Gives sharp scraped edges and flat planes.
- **Media**: water, retarder (slows `E`), gel (raises `τ_y`).

---

## 5. Build order (each step is visible on its own)

1. **State refactor (CPU)**: replace `wetUntil` with `s`/`w`/`h`. Add evaporation with thickness dependence, and let height shrink as water leaves. *Payoff: drying that behaves like drying.*
2. **Rheology + displacement**: yield-stress flow and brush displacement. *Payoff: ridges that hold, then slump if paint is thin or wet.*
3. **Tack phase**: the drag/pull as `f` falls. Re-touching half-dry paint should drag and tear, not blend.
4. **Dried film + K–M layering + dry colour shift**: opacity, glazes, dry-darkening.
5. **Brush and palette state**: loading, water, brush drying.
6. **Thin-paint behaviour**: gravity/easel tilt, runs, wicking into weave.
7. **GPU port** against the CPU oracle.
8. **Room integration**: sim textures feed the room's canvas material.

---

## 6. Calibration: replace guesses with measurements

The parameters that matter can be measured with a kitchen scale, a phone and a light:

- **Evaporation curve**: spread paint at known thickness (tape a stencil, or draw down with a card) on a non-absorbent card sitting on a 0.01 g scale, and log mass vs time. Repeat at ~3 thicknesses and record room temperature and humidity. This gives `E` and the skin-resistance term.
- **Yield stress vs dryness**: dab a peak, then time-lapse its slump and measure height/angle at intervals. Repeat with water added. This gives `τ_y(f)`.
- **Working window**: video the same wet-in-wet move (drag a second colour through the first) at increasing delays. Note when it goes from blending → dragging → tearing.
- **Dry colour shift**: swatch each pigment (and a tint with white) wet and dry, photographed under fixed light next to a grey card. This gives the wet→dry transform and K/S fits.
- **Stroke relief**: photograph strokes under raking light and compare ridge height and spacing against the sim.
- Manufacturers publish open-time and drying notes (Golden has extensive technical documentation). Use those to sanity-check your numbers, not as your only source.

Keep measured values in one data file (one entry per paint) and reference it from the sim. Tuning "by feel" then becomes tuning against a photo.

---

## 7. Reading list

- Curtis, Anderson, Seims, Fleischer, Salesin, *Computer-Generated Watercolor* (SIGGRAPH 1997): shallow-water flow, pigment transport, K–M layering. Closest classical relative to thinned acrylic.
- Baxter, Wendt, Lin, *IMPaSTo: A Realistic, Interactive Model for Paint* (NPAR 2004): height-field viscous paint with impasto.
- Baxter, Scheib, Lin, Manocha, *DAB: Interactive Haptic Painting with 3D Virtual Brushes* (SIGGRAPH 2001): deformable bristle brush.
- Chen, Kim, Ito, Wang, *WetBrush: GPU-based 3D Painting Simulation at the Bristle Level* (SIGGRAPH Asia 2015): real-time bristle-level paint on the GPU.
- Sochorová & Jamriška, *Practical Pigment Mixing for Digital Painting* (SIGGRAPH Asia 2021): Mixbox.
- Herschel–Bulkley model: standard yield-stress rheology. Search "thin-film lubrication approximation yield stress" for height-field flow.
- Spectral.js: open-source spectral pigment mixing (an alternative to Mixbox).

Titles and years are from memory, so verify them before citing.
