# Submission checklist: Hack the North 2026

Deadline: **2026-09-20 08:00 America/Toronto** (hacking began 2026-09-19 00:00). Judging is a live demo. Protect the last ~2 hours for rehearsal and submitting.

Items marked *confirm* are things this file cannot know (portal wording, your badge). Check them on the day.

## Must have

- [ ] **Working live URL** (Vercel). Open it in a real browser (not just headless) and confirm: the room loads, clicking the easel paints, and `/lab.html` loads.
- [ ] **Source link:** `github.com/wrufay/paint-a-pint`. Push `main` (the local branch is ahead of `origin/main`) and check the repo is public (or shared, as the rules allow). *confirm*
- [ ] **Source includes the design assets:** `docs/design/`, `src/tokens.css`, `src/fonts.css`. Check they are committed and not just on disk.
- [ ] **No personal or third-party files in the repo you would not want public:** the reference and room photos, and the manufacturers' swatch images in `paints/` (do not commit those). Run `git status` and read the list before pushing.
- [ ] **Devpost project** (or whatever the portal is) filled in: title, one-line pitch, description, built-with (Three.js, Vite, JavaScript, Spectral.js), links (live URL, repo). *confirm*
- [ ] **Badge ID / team details** entered as the portal asks. *confirm*
- [ ] **Devpost "what's next"** mentions: real mixing palette (the styrofoam tray), palette knives, masking tape, Wacom, choosing where paintings hang, other rooms.

## Should have

- [ ] **Demo video** (optional, but it is also your fallback on stage): screen-record a run of `docs/DEMO.md`, 60-90 s.
- [ ] Screenshots: the room, a finished painting, the bird's-eye view.
- [ ] `README.md` reads correctly on GitHub.
- [ ] `npx vite build` passes and `npm run preview` shows the same as the live site.
- [ ] Node checks pass: `node tools/dry-test.mjs`, `mix-test.mjs`, `render-test.mjs out.png`, `brush-shapes.mjs out.png`, `consumption-test.mjs`.
- [ ] Rehearse the demo end to end on the device you will present on, twice.

## Already passed

- Sponsor-prize cutoff: **2026-09-19 14:00**. It has passed, so do not plan around sponsor prizes.

## Be honest about

- Drying times, paint thickness, tinting strengths and some opacities are **guesses tuned by eye**, not measurements.
- Nothing has been profiled on an iPad by Claude; ask for speed and feel reports from real testing.
- Undo is one level.
- The paint colour model keeps a single visible colour per pixel, so very thin paint over bare canvas is an approximation of a glaze.
