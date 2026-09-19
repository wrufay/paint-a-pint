# paint-a-pint: experiencing joy of creation without the friction.



## The core idea

A small, personal web app. You paint on an iPad using a brush tuned to feel like real acrylic paint, not generic digital art. When a piece is finished, it appears as a physical object inside a small 3D room modeled after your actual desk, pinned to a corkboard, propped on a shelf, hung on a wall. Over time the room fills up with what you've made, a visible record of getting back into art.

## The story behind it

You grew up painting, self-taught, mostly acrylics, just for fun, never considered yourself a "real" artist. At uni, no space or materials for it, oil pastel but no paper. Art quietly disappeared under CS coursework. This project is you rebuilding a small way back into it, on devices you already have.

Pitch opener: *"I hate being a CS major. My dream was never big tech or SF. It was being an artist in the Alps."*

## Why this, and not something else

- Not an AI wrapper: no ML, no LLM calls, no computer vision. The "smarts" are hand-written canvas math (pressure, blend, texture) and 3D scene composition, both things you or an agent build/arrange directly.
- Not a generic drawing app: most digital art tools are built for illustrators (layers, undo, infinite canvas). This is built for someone who paints physically and wants that feeling back, scarcity and texture over control and correction.
- Not "AI art": this doesn't generate art for you. You make every mark. Any generative/procedural techniques used are about texture and rendering, not content generation.
- Personal, not a mission statement: it's not "make everyone an artist." It's built for one specific person (you) with a specific memory (acrylics at home, none at uni). That's what makes it unclonable by another team at the same hackathon.
- Checked: nothing combining [personal 3D room] + [real-medium-accurate brush] + [pieces accumulating as a visible record] currently exists. Adjacent things exist separately (VR painting tools, art-mockup-on-wall apps) but not this combination.

## What we deliberately ruled out (and why)

- **Full POV camera simulating the physical act of painting** (like the room "watching" a hand paint) — multi-month-scale problem (rigging, animation blending, real-time material-specific simulation). Cut entirely.
- **Blender, hand-modeled from scratch** — real skill ceiling, not reachable from zero in one night. Use pre-made/composed assets instead (Spline library, Sketchfab models, or AI-assisted Three.js scaffolding), never model geometry by hand.
- **Native mobile app** — no benefit over web; web (Safari, Pointer Events API) already supports Apple Pencil pressure/tilt on iPad and runs identically on Mac. Asked and re-confirmed multiple times: staying web.
- **Live real-time sync between iPad and Mac** — not needed. Usage pattern is: paint on iPad now, view the room on Mac later. Not simultaneous. Removes the need for real-time infrastructure.
- **Sponsor/API integrations bolted on after the fact** — would dilute the personal story and add breakage risk for no functional reason. Skipped, except possibly a free domain registration (near-zero cost, no build risk).
- **"Convince everyone art matters" framing** — vague, overdone, weaker every time it was tried. Replaced with the specific personal angle above.

## Stack (final)

- Plain HTML + CSS + JS. No framework, no build step.
- **Canvas view**: HTML5 `<canvas>` + Pointer Events API for pressure/tilt (Apple Pencil on iPad Safari).
- **Room view**: a 3D scene built either by composing a pre-made template (Spline library, or a free Sketchfab/desk asset pack imported into Three.js) or scaffolded directly in Three.js code with simple primitives (boxes, cylinders, cones) plus a few free GLB props — not hand-modeled in Blender.
- **Connecting the two views**: `localStorage` if same-session/device is enough for the demo, or one simple Firebase/Supabase document (no auth) if the piece needs to persist and show up later on a different device.
- No backend beyond that. No database beyond that. No ML. No CV. No native app.

## Brush spec (acrylic, thick/ridged/opaque)

- **Opaque**: strokes fully cover what's beneath rather than blending transparently.
- **Directional, not stamped**: strokes are drawn as tapered ribbon shapes following the actual path of motion, not a chain of circular dots (the earlier version felt like generic Procreate-style stamping — fixed).
- **Ridged texture**: thin bristle-like streaks running lengthwise along the stroke, alternating light/dark, to fake directional paint drag.
- **Pressure** → primarily affects width and opacity/coverage.
- **Paint runout**: opacity/coverage tapers slightly over the length of a fast/long stroke, like a loaded brush running low.
- **Seamless joints**: rounded joints between drawn segments so fast or curved strokes don't show chopped edges (earlier version had this bug — fixed).
- **Palette**: fixed swatches of acrylic-tube-like colors, tap to switch. No native color-wheel picker (felt jarring/generic).
- **Pinch-to-zoom and pan**: implemented via two-finger touch, separate from single-finger drawing.

Current status: core ribbon-stroke + zoom version is built and live. Keep testing on-device and iterating based on real feel before moving on to the room.

## Room spec

- Modeled after your actual desk, not a generic template. Reference photos available: photo-booth strip collage on the wall, fairy lights along the window frame, pastel pen cups, specific window view (tree + tall building), desk objects (mugs, journal, stickers, etc.).
- Visual target: a "clay-render" stylized isometric workspace — soft grey/warm materials, simple geometric primitives, good lighting, not photorealistic. (Reference image supplied: clean topology desk/chair/monitor scene.)
- Realistic path to get there: start from a well-made free asset (Sketchfab clay/isometric-room tag pages, or a workspace pack like "3d Isometric Workspace") and reskin/rearrange to match your desk, rather than modeling from zero.
- One interactive object (the desk/canvas) that, on click, transitions to the canvas view. A simple crossfade or cut is an acceptable fallback if a smooth camera zoom proves too time-costly.
- Finished paintings get placed in the room after completion (flat plane/decal on a wall, corkboard, or shelf object).

## Priority order for build time

1. Brush feel (acrylic ribbon/texture/runout) — the actual craft and differentiator. Protect this time above everything else.
2. Room existing and looking intentional, even if simple — borrowed/composed assets, not hand-modeled.
3. Pieces getting placed in the room after finishing a painting.
4. Click-to-zoom camera transition into the canvas (nice-to-have, cut first if short on time).
5. Anything else (sound, extra props, polish) — optional, last.

## Pitch structure

1. Open cold with the personal line ("I hate being a CS major...").
2. One sentence on what happened (art disappeared under CS/uni life).
3. Live demo: click the desk, paint a small stroke, show it land in the room.
4. Close small and honest — not a mission statement, just "I built myself a room to go back to."

## Guardrails (for future-you, mid-hackathon, at 5am)

- If the idea starts to feel "cooked" or "stupid," that has reliably been fatigue or a comparison spiral talking, not new information about the project, every single time tonight. Step away for a few minutes before making any real decision.
- Don't add sponsor integrations or unrelated features for judging-category reasons. They don't fit and they cost time.
- Don't restart the 3D approach from scratch more than once. Pick a lane (composed asset pack vs. code-scaffolded Three.js) and commit.
- Not trying to win. The goal is a small, finished, honest thing that's actually yours.