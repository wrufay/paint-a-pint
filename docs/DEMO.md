# Live demo script (60-90 seconds)

Judging is a live demo (originality, UX, technical complexity, WOW), so the demo leads with the thing nobody expects from a browser painting toy: **the paint behaves like paint.** Everything below uses features that exist today. Times are targets; **rehearse it on the device you will demo on** and cut whatever drags.

## Before you start (once, off stage)

- Open the live URL (or `npm run dev`) and click the easel once, so the first load and shader compile are done. Press Esc, then reload if you want a clean room.
- Settings, "advanced": press **reset to defaults**, so an old saved tuning does not surprise you. Saved settings live in the browser's `localStorage`.
- Check the canvas is clear. Sound and brightness up. Pencil charged, if you are using one.
- Have the fallback (bottom of this page) open in another tab.

## The script

**0:00 - the hook (10 s).** Say: *"Painting is expensive, messy, and takes a whole afternoon to set up. This is a painting room where the paint is simulated: it dries on a clock, it mixes like real pigment, it holds ridges."* Click the easel: the camera flies in.

**0:10 - mixing (20 s).** Press **8** (king's blue) and lay a fat blue stroke. Press **3** (azo yellow) and drag a yellow stroke *through the edge of the blue while it is still wet*. Green appears where they meet, and streaks of both stay in it. Say: *"Blue and yellow make green because the mixer works on pigment spectra, not RGB."* Then press **1** (white) and pull a stroke through the blue: it tints, it does not just go grey.

**0:30 - it's wet, then it isn't (15 s).** Press **w**: blue tint = still workable, orange = getting tacky, none = dry. Say: *"Every stroke has open time. Watch."* Press **w** to turn it off, then hit **dry now**. Say: *"Now it's dry."* Press **7** (burnt sienna) and paint a stroke across the dry green: it **covers** it and does not blend. That is wet-on-dry.

**0:45 - texture (10 s).** Pick the **round** brush and tap a few dabs for texture. Switch to **filbert** and press lightly, then firmly: the width follows pressure. Point at the ridges the bristles leave in thick paint. Pick the **knife** and lay a flat slab of paint, like the impasto skies in the reference painting.

**0:55 - the room (15 s).** Click **lay it flat**: the canvas goes down on the desk and the camera goes bird's-eye, like painting at a real desk. Say: *"And the paint is lit by the room, so thickness reads as thickness."* Click **stand it up** if you want the easel view again.

**1:10 - the ending (10 s).** Click **hang it up & go back**. The painting appears in a frame on the wall. Say: *"Zero cost, zero cleanup. It's for people who want to paint and don't want the friction."* Optionally mention what's next: a real mixing palette (the styrofoam tray), masking tape, a Wacom.

## Things that can go wrong on stage

- **Paint runs out too soon or too late:** that is `runs dry` in settings, "advanced". Do not tune on stage.
- **Waiting for paint to dry:** use **dry now**, or the "fast-forward time" slider in settings.
- **Slow on the device:** the round brush and very large sizes cost the most. Use flat or filbert at a smaller size. Performance on the iPad has not been measured; if it is slow, say so on the spot rather than apologise.
- **Painting the wrong colour:** **z** undoes one stroke (one level only).

## Fallback

If the venue network or the iPad fails:

1. Run it locally on a laptop: `npm install && npm run dev`, open the printed URL. The mouse works, with pressure faked from speed.
2. If the laptop also fails, play the recorded demo video (record one during rehearsal; see `docs/SUBMISSION.md`).
3. Last resort: talk over screenshots of a finished painting and the room. Say honestly that it is a recording.
