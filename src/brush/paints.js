// The paints, as data: one entry per tube, so a new paint (or a heavy-body Golden) is a new row, not new code.
//
// hex       sampled from the makers' swatch images in paints/ (screen colours, so approximate; the Galeria ones are
//           lit product renders, and white is idealised). Burnt sienna is the dark masstone of its drawdown.
// opacity   from the maker's transparency icon on Amsterdam. Galeria's aren't in the screenshots, so those are guesses (guess: true).
// strength  tinting strength: how hard a paint overpowers others in a mix. All guesses, tune against real mixes.
// blurb     one line for the hover tooltip. PLACEHOLDER copy (mine, not the maker's): replace it with your own.
// code      pigment index name, where the swatch shows it (Galeria's are not visible in the screenshots).

export const OPACITY = { opaque: 1, semi: 0.85, transparent: 0.6 }; // multiplier on how solidly a paint covers

export const PAINTS = [
  { id: 'titanium-white', blurb: "The heaviest hitter for lightening a mix. Opaque and strong: use a little at a time.", brand: 'Winsor & Newton Galeria', name: 'titanium white', code: 'PW6', hex: '#f3f3ef', opacity: 'opaque', strength: 1.0 },
  { id: 'lemon-yellow', blurb: "A cool, greenish yellow. Clean greens with blue, and bright highlights on leaves.", brand: 'Winsor & Newton Galeria', name: 'lemon yellow', hex: '#ead848', opacity: 'semi', guess: true, strength: 0.9 },
  { id: 'azo-yellow', blurb: "A warm, everyday yellow. Sunlit grass, warm skies, and oranges when mixed with red.", brand: 'Amsterdam', name: 'azo yellow medium', code: 'PY74', num: 269, hex: '#dfac46', opacity: 'semi', strength: 1.0 },
  { id: 'naples-yellow', blurb: "A soft, creamy, opaque yellow. Sun-washed walls, clouds and gentle highlights.", brand: 'Amsterdam', name: 'naples yellow light', code: 'PW6/PY42', num: 222, hex: '#d5cebd', opacity: 'opaque', strength: 0.5 },
  { id: 'naphthol-red', blurb: "A warm, strong red. Poppies, roofs and sunsets, or orange with a yellow.", brand: 'Amsterdam', name: 'naphthol red medium', code: 'PR112', num: 396, hex: '#b5332e', opacity: 'semi', strength: 1.2 },
  { id: 'permanent-magenta', blurb: "A cool red-violet that leans pink. Clean purples with blue, and sunset glows.", brand: 'Winsor & Newton Galeria', name: 'permanent magenta', hex: '#601529', opacity: 'transparent', guess: true, strength: 1.6 },
  { id: 'burnt-sienna', blurb: "A warm brown earth. Tree trunks, soil, and warming up or dulling a colour.", brand: 'Amsterdam', name: 'burnt sienna', code: 'PR101', num: 411, hex: '#622b22', opacity: 'transparent', strength: 0.8 },
  { id: 'kings-blue', blurb: "A bright mid blue, opaque. Skies and water; with yellow it makes a clean green.", brand: 'Amsterdam', name: "king's blue", code: 'PW6/PB15', num: 517, hex: '#3c79b4', opacity: 'opaque', strength: 1.2 },
  { id: 'prussian-blue-hue', blurb: "A very dark, strong blue-black. Deep shadows and night skies: go easy, it takes over.", brand: 'Winsor & Newton Galeria', name: 'prussian blue hue', hex: '#111424', opacity: 'semi', guess: true, strength: 2.0 },
];

// Palettes are just lists of ids. "my box" is what was actually on the desk: a warm triad (azo yellow, naphthol red,
// king's blue) and a cool one (lemon yellow, permanent magenta, prussian blue hue), plus white, an earth and a pale opaque yellow.
export const PALETTES = {
  'my box': ['titanium-white', 'lemon-yellow', 'azo-yellow', 'naples-yellow', 'naphthol-red', 'permanent-magenta', 'burnt-sienna', 'kings-blue', 'prussian-blue-hue'],
};

export const paintByName = (name) => PAINTS.find((p) => p.name === name || p.id === name);
