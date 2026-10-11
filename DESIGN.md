# DESIGN.md: Draw a Level

The look, feel and motion. PLAN.md wins on flow, rules and the contract; this file wins on the look.
Values live in code: `src/design-tokens.css` (`--dl-*`, the site) and `src/engine/palette.js` (`DL.PALETTE`, the board, ball, holes, goal, path, story). A reference renderer of the board is in `design/board-render.js` (used by `design/board.html` and `design/og.html`); game-builder may lift its drawing code into `board.js`.

**Decisions taken without a review round (speed was asked for):** fonts are system stacks plus the kit's Caveat (no downloads); concept, palette and every number below are final unless Rishi says otherwise. No real maze photos were in `tests/real/` yet, so the board mocks use a wobbly maze drawn in code; re-check the board against Rishi's photos at M1.

---

## 1. Concept: "The Desk Toy"

**One sentence:** *your notebook page, set into a small, well-made wooden tilt-maze toy, under glass.*

The person's paper is the hero; everything else is the toy built around it: a honey-wood frame with mitred corners and four brass screws, a sheet of glass, a heavy steel ball, holes cut cleanly through the paper, and one brass cup at the finish. The site around the toy is the family's calm warm-paper page. The toy is the only "object" on screen, so it reads as precious, not busy.

**References (in words):**
1. The classic wooden labyrinth tilt game: light beech, brass knobs, a steel ball, round black holes.
2. The pocket "ball-in-a-maze" dexterity puzzle from a museum shop: a tiny printed maze under a glass lid in a brass rim.
3. A notebook doodle from the back of a school exercise book: blue biro, wobbly lines, filled-in dots.
4. A framed pressed flower / a shadow-box frame: something small and personal, kept under glass on purpose.
5. An old stopwatch face: brass, small exact numerals; that's the timer's manner.

**Why it fits:** this audience keeps things (journals, film photos, tickets, pressed flowers). Framing their own scribble like a keepsake is flattering and makes them want to draw a better one. It's tactile and analogue, the opposite of a mobile game: nothing glows, nothing shouts, the fun is the ball's weight and the words.

**What every decision traces back to:** *would this be on a real, nicely made wooden toy, or on the page of a notebook?* If neither, it doesn't go in.

---

## 2. Palette

| Role | Token | Hex | Share of a screen |
|---|---|---|---|
| Page (family) | `--dl-page` | `#f6f2ea` | ~55% |
| Card (family) | `--dl-card` | `#fffdf8` | ~5% |
| Paper inset (the person's page) | `--dl-paper` | `#fbf7ee` | ~25% (play: ~70%) |
| Text (family) | `--dl-text` | `#1c2433` | text |
| Text 2 / muted | `--dl-text-2` / `--dl-muted` | `#3a4252` / `#6c6a64` | text |
| Accent: ink-blue (family) | `--dl-accent` | `#1f3a5f` | ~4%: one primary button per screen, links, start marker |
| Wood | `--dl-wood` / light / dark / grain | `#c99a62` / `#dcb27c` / `#a87545` / `#7d5330` | ~8%: the frame only |
| **Special: brass** | `--dl-brass` / light / dark | `#c4913f` / `#efd59a` / `#7f5a1e` | ~1%: goal cup, screws, path line, time-to-beat tag |
| Brass for text | `--dl-brass-text` | `#8a5a1f` | the "time to beat" label |
| Path line | `--dl-path` | `#a8641e` | story + result board only |
| Steel (ball) | `--dl-steel` / dark | `#8d96a1` / `#2f353d` | the ball |
| Hole | `--dl-hole` | `#100b08` | holes |
| Bad | `--dl-bad` / soft | `#a33a2b` / `#fbe7e3` | errors, blocked hint |

Wood is never used for UI. Brass is never used for buttons. Ink-blue is the only button colour. No other colours exist on the site except the person's ink.

**Contrast checked (WCAG):** text on page 14.6:1 · text-2 9.4:1 · muted 4.8:1 · accent on page 10.6:1 · white on accent 11.9:1 · brass-text on page 5.3:1 · bad on page 6.2:1 · path on paper 4.4:1 (game element, needs 3) · brass mid on paper 3.0:1 (the goal also has a dark rim `#7f5a1e`, 6.1:1) · hole on paper 18:1 · ball body (`#7f8893` mid + `#1f242a` rim) on paper 3.6:1 / 15:1 · start marker (ink-blue) on paper 11:1 · wood on page 2.2:1 (decorative, the board's outer shadow carries its edge).

**The person's ink:** the level carries it (`level.ink`). Draw it as-is at 95% opacity, unless it's lighter than 4.5:1 on the paper (pencil, light blue gel): then `DL.PALETTE.inkFor(hex)` darkens it, keeping its hue, until it passes. Blue biro stays blue, black stays black, pencil becomes a dark graphite. Walls get a whisper of shadow (1.1 L down, alpha 0.14) so they read as raised walls without stopping looking like ink.

**The path line:** burnt brass `#a8641e`, 0.42 × ball radius wide, round caps, smoothed. It never gets confused with blue or black ink and belongs to the brass family (the goal), so path + goal read as one story: "here's how I got home".

---

## 3. Type

**No downloads.** One self-hosted face (Caveat 600 from the kit, already in `fonts/`) plus two system stacks. That keeps the page tiny and stays inside the family exactly. Three faces max on any screen, and these are the three.

| Slot | Stack | Weights | Used for |
|---|---|---|---|
| Serif | `"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif` | 600 | headlines, the big result time, story title |
| Sans | `system-ui, -apple-system, "Segoe UI", Roboto, …` | 400, 500, 600 | body, buttons, the play timer, small print |
| Hand | `Caveat` (kit, `fonts/caveat-600.woff2`) | 600 | the person's voice and the maker's notes: names, "Nice.", "Gulp.", "So they know who to beat.", countdown, how-to-draw captions, "beat my level" |

**Font download list: none.** (Caveat is copied from `../shared-kit/fonts/` with its `OFL.txt`.)

**Scale (phone):** hero `clamp(2.6rem, 12vw, 3.2rem)` serif 600, line-height 1.08, letter-spacing -0.01em · h1 `clamp(1.7rem, 7.2vw, 2.05rem)` · result time `clamp(3.6rem, 19vw, 4.75rem)` serif 600 · body 1rem/1.5 sans · small 0.875rem sans · hand 1.55rem / large 2.1rem Caveat · play timer 1.3rem sans 600.

**Numerals:** every time uses `font-variant-numeric: tabular-nums lining-nums` so digits don't jump. The play timer is sans (system UIs all have true tabular figures); the big result time is serif (it's a "printed" result). Format `0:14.2`, with the decimal in the same size (no tiny decimals, no colons in another colour).

**Rules:** headlines left-aligned, sentence case, ending with a full stop like the copy ("Draw a level."). Never uppercase tracking labels (game-y / SaaS-y). Caveat never for anything longer than ~6 words, never for buttons, never below 1.3rem.

---

## 4. Materials (numbers in `DL.PALETTE`)

Units: **L** = level units (level is 1000 L wide; draw with scale `s = innerPx / 1000`), **r** = × the level's ball radius.

### The board
- **Structure, outside in:** outer shadow on the page → wooden frame (`frame.width` 62 L each side, outer corner radius 34 L) → a dark lip line (3.5 L, `#4e3219`) where the wood steps down → the paper inset (inner radius 8 L) with the frame's shadow falling 5 L onto it (blur 14 L) → the ink → holes, goal, start, path → the ball → one faint glass sheen band (alpha 0.055, straight edges, -28°) on top.
- **Scaling to levels of different heights:** the paper is always exactly the level (1000 × h L). The frame is a fixed 62 L, so it scales with width only: a tall level is a tall toy, never letterboxed paper. To fit a screen, compute `s = min(availW / (1000 + 2·62), availH / (h + 2·62))` and centre it.
- **Brass screws** in the four frame corners (r 8.5 L, at 29 L from each outer corner), radial brass gradient and one slot at a different angle on each (22°, -38°, 71°, 8°). They replace "brass knobs" (knobs would read as controls).
- **Mitre joints:** a thin 45° line at each corner (alpha 0.35) so the frame reads as four pieces of wood glued together.

### Wood
Honey beech. Each side is a mitred trapezoid filled `wood.base`, with a broad "figure" (two or three soft light/dark bands, alpha 0.08) and grain lines running along the side: 22 lines per 100 L of width (≈ 13 across the frame; every 5th a darker late-wood line), each a thin `wood.grain` line (min 0.6 px) at alpha 0.20 × (0.5–1.3, seeded), drifting sideways by up to 2.4 L over a 210 L wavelength. Top and bottom sides run horizontally, left and right vertically. Then a bevel highlight on the outer top/left edge (2.5 L, warm white 0.55). Draw the wood once per size to an offscreen canvas and cache it. No bitmap textures.

### Paper
`#fbf7ee`, with tooth: a cached offscreen of 1.5 px cells of ±luminance noise at alpha 0.035 (seeded, drawn in code) and a soft vignette toward `#efe6d3` (alpha 0.10) at the edges. No ruled or grid lines on the board (they'd compete with walls). The paper is a touch brighter than the page so the drawing pops.

### The ball (all × r; drawn radius = exactly the physics radius)
- **Body:** radial gradient centred at (-0.34, -0.38): `#c3cad2` → `#7f8893` (55%) → `#2f353d` (100%), then a 0.06 rim in `#1f242a`.
- **Horizon band:** a soft dark band across the middle (y 0.10, height 0.34, `#3f464f` alpha 0.30): steel reflects the room, and this is what makes it read as metal, not a grey dot.
- **Highlight:** a soft white radial at (-0.34, -0.38), r 0.30, alpha 0.95, plus a tiny hard glint r 0.09. **The highlight never moves**: the light is fixed in the room, so when the ball rolls only its shadow and position move. That's what makes it look like a real ball rolling, not a sprite spinning.
- **Bounce light:** warm paper light on the underside at (0.22, 0.50), r 0.42, `#f3e3c4` alpha 0.45.
- **Shadows:** a contact shadow (r 0.80, alpha 0.26, directly under) plus a cast shadow offset (0.18, 0.32), blur 0.55, alpha 0.34, warm brown not black.
- **Never:** a face, a trail, motion blur, a glow, a colour.

### Holes (× hole.r, from the person's filled dots)
A clean cut through the paper: radial fill from `#100b08` (centre) to `#3a2d22` (edge), a dark crescent at the top (the near wall in shadow, offset 0.20, alpha 0.80), a lit lip on the bottom edge (`#fff6e3`, 0.16 wide, alpha 0.85: light falling on the far wall), a hairline worn edge (`#6b5440`, 0.05), and just outside it a thin halo of lighter paper (`#fffaf0`, 0.12 wide): the cut edge catching light. The lit lip and halo are what make a 7 px hole read as a hole, not an ink dot. Drawn over the ink dot, so the person's dot becomes the hole. At 390 px a hole is matte, dark and lit from below; the ball is grey, shiny and lit from above. They never read as the same thing.

### The goal: a shallow brass cup
Outer radius **1.45 × ballR** (visual; physics' catch radius is game-builder's, suggested 1.0 × ballR from the centre). Ring 0.30 of the goal radius: a conic-ish brass gradient (light `#efd59a` top-left, `#c4913f`, dark `#7f5a1e` bottom-right), one fine engraved circle at 0.86 r, and a dark outer hairline. The dish inside is `#efe2c2` with a soft shadow from the top rim. On finish, one soft light travels once round the ring (650 ms). That's the whole celebration.

### The start marker
A dashed ink-blue pencil circle (1.35 × ballR, 3 L line, dash 7/6 L). Place screen: 90% opacity with a small centre cross. Play: 32% opacity (so you can see where you'll respawn). Never a flag or an arrow.

### The path line
`#a8641e`, width 0.42 × ballR (min 3 px), alpha 0.92, round joins, smoothed through the 50 ms samples (Catmull-Rom or quadratic midpoints), a filled dot at the start (0.55 × ballR), ending in the goal cup. Drawn on the paper under the ball and holes' lips.

### Blocked hint (place screen)
A soft red pencil smudge (`#a33a2b` at 22%, radius 3.2 × ballR) at `pathCheck().blocked`.

---

## 5. Icons

Inline SVG, 24×24 viewBox, `fill="none"`, `stroke="currentColor"`, **stroke-width 1.75**, round caps and joins. Drawn as if with a fine pen: lines have a very slight curve (control points 0.3–0.6 off straight), no perfect circles larger than 6 units (use 4-point paths with uneven handles), no fills except dots (r 1.1). Optical size 22–24 px in buttons, 20 px in the top bar. Colour: currentColor (ink-blue on page, white on primary). The set (paths in `design/board.html`, id `icons`, copy them from there):

camera, photo, restart, play, share, save, retake, back, close, tilt-phone, finger-drag, pen.

Plus three tiny **how-to-draw** pictograms (48×48, same stroke at 1.75 × 2 scale): a pen nib making a line; two wobbly lines (a corridor); a filled dot.

---

## 6. Motion

All timings in `DL.PALETTE.motion`. One overshoot curve exists (`settle`), used only by the ball drop and the finish settle.

| Moment | What happens | Timing |
|---|---|---|
| **The lift** (photo → level) | 1) the photo sits in the board; its paper washes to the clean board paper while the ink stays (crossfade photo → preview over the paper colour). 2) the ink layer rises: translateY -4 px, shadow grows to 0 6px 10px rgba(60,40,20,.18). 3) the ink settles back onto fresh paper as the wooden frame closes around it (frame opacity 0→1, scale 1.035→1). Then "Here's your level." writes in (fade + 6 px up). | wash 500, rise 450, settle 450 (overlapping, total 1400), ease-out |
| **Ball drop** | Caveat 3, 2, 1 pencilled in the middle of the board (each fades in 120 ms, scale 1.06→1, fades out; 700 ms per step). Then the ball appears at 1.6× (near the glass) with a large faint shadow, falls to 1× with gravity easing while the shadow tightens, one small bounce (`settle`), a click. Timer starts at contact. | fall 380 (gravity), bounce 170 (settle) |
| **Wall hit** | no visual effect. Soft click above 120 L/s, 10 ms vibration on Android. | |
| **Hole** | ball slides to the hole centre, shrinks to 0.55, darkens 85%, shadow fades. *Gulp.* in Caveat appears next to the hole (fade in 120 ms, hold 550, fade 300). Ball reappears at start: fade in + 1.25→1 (a mini drop). | fall 300, respawn 220 |
| **Finish** | the ball eases into the cup centre (260 ms, ease-out), sinks a hair (scale 0.96, shadow tightens), the gleam travels round the brass ring (650 ms). The timer freezes. No sound fanfare, one soft lower click. | ~900 total, then the reveal |
| **Result reveal** | the board shrinks and slides up to its result position (520 ms, ease-out); the time fades up 8 px (420 ms); then the rest staggered 70 ms. Caveat "Nice." appears last, rotated -4°. | 520 / 420 / 70 |
| **Small** | buttons press to scale .98 (120 ms); screens crossfade 240 ms; the landing ball rolls by itself on a slow scripted tilt (a 9 s loop, gentle). | |

**Reduced motion** (`prefers-reduced-motion: reduce`): no scale or translate anywhere. Lift = 200 ms crossfade. Drop = the ball fades in at the start (150 ms), countdown numbers swap without scaling. Hole = ball fades out 150 ms, "Gulp." shown 700 ms, fades in at start. Finish = no gleam. Reveal = 200 ms crossfade. The landing sample ball is still (placed mid-maze). Physics and the run itself are unchanged.

No confetti. No screen shake. No pulsing buttons.

---

## 7. Screens (390 × 844 first)

Shared: page `--dl-page`, gutter 20 px, one primary button per screen (ink-blue pill, 56 px), secondary = ink-blue outline pill (56 px), tertiary = underlined text link (min 44 px tall). Footer "More from Risheek" (kit) on landing, results, intro and error only, never on play or place.

### landing
Top-down, left-aligned: **"Draw a level."** (hero serif) / sub-line (body, text-2, max 32ch) / **the sample board** (full content width, 350 px, sample level ≈ 1000×1150 → ~420 px tall, rotated -1.5° like an object on a desk, ball rolling by itself) / **Snap my maze** (primary, camera icon, full width) / **Pick a photo** (secondary, photo icon, full width, 12 px gap) / **Play a sample level** (text link, centred). Below the fold: **How to draw**: three drawn pictograms in one row, each with a Caveat caption under ("Pen on paper", "Lines are walls", "A filled dot is a hole"), on a card. Then the trust line (small, muted, centred). Footer. Above the fold at 390×844: headline, sub, board, both buttons.

### lifting
The board (as big as the play board) with the lift animation. Under it: **"Here's your level."** (h1) and two buttons in a row: **Retake** (secondary, retake icon) and **Looks good** (primary). Errors replace the board with the error layout (see error).

### place
Top: the instruction in Caveat, large (2.1rem, ink-blue): *"Tap where the ball starts."* → *"Now tap the finish."*. Then the board as big as possible (same size as play). Bottom bar: **Back** (icon button, 44 px) + **Ready** (primary, flex 1; disabled until both placed and the path check passes: page-tinted fill `#e9e2d4`, text muted). When the path check fails: the instruction line is replaced by the no-path sentence in body sans, `--dl-bad`, and the blocked smudge shows on the board. Tapping an existing marker's area moves it.

### play
- **Board:** max size. `availW = 100vw - 2×8 px`; `availH = 100svh - topbar 52 px - safe areas - hint row 36 px - 16 px`. Scale with the formula in §4. Centred. The board's outer shadow stays visible.
- **Top bar** (52 px + safe-top): **Restart** icon button left (44×44, ink-blue icon, no background), **timer** centred (sans 600 1.3rem tabular, text colour, no box), **Close** icon button right (back to the previous screen).
- **Under the board:** the hint row, only in touch fallback: finger-drag icon + Caveat *"Drag to tilt."* at 60% opacity, fades out after the first 3 s of dragging.
- **iOS Tap to play overlay:** over the board only, the warm scrim (`--dl-scrim`, no blur) and a card at the board's centre (card bg, radius 20, `--dl-shadow-float`, 24 px padding, max 300 px): the tilt-phone icon (40 px, ink-blue), *"Tap to play."* (h1 serif) and *"Then tilt your phone to roll the ball."* (body, text-2). The whole overlay is the tap target; also a primary "Play" button inside the card for clarity.
- No score, no lives, no level name, no pause button. `touch-action: none; overscroll-behavior: none` on the page.

### result (maker)
Board shrunk to ~62% width (≈240 px), top-centred, with the path line drawn and the ball in the cup. Under it, left-aligned in the content column: **time** (serif, `--dl-fs-time`), Caveat *"Nice."* to its right, rotated -4°, ink-blue. Then the **name field**: a label-like field (card bg, 1px line, radius 12, 52 px tall, Caveat 1.5rem input text so the name looks written; placeholder "Your name" in sans muted) with *"So they know who to beat."* in small muted sans above it. Then **Dare a friend** (primary, share icon), then a row: **Play again** (secondary, restart icon) + **Save story** (secondary, save icon), 12 px gap. Footer.

### intro (friend)
**"Rishi drew you a level."** with *Rishi* in Caveat (2.4rem, ink-blue) and the rest serif h1, i.e. their name looks signed. The board (as large as fits above the button, ~60% of the height). Then the **time-to-beat tag**: a small brass-soft card (`--dl-brass-soft`, radius 12, padding 10/14) with "Time to beat" (small sans, brass-text) and the time (serif 1.6rem, text). Then **Play** (primary, full width, play icon). Footer below the fold.

### result (friend)
Line in serif h1: *"You beat Rishi by 2.1 s."* (name in Caveat, ink-blue) or *"Rishi still wins."* + the two times in a small two-column compare (serif numerals: "You 0:16.9" / "Rishi 0:14.2"). Board ~55% width with the path. **Send it back** (primary, share icon), **Draw your own level** (secondary, pen icon, full width: it's the growth loop so it's a real button, not a link), then a row: **Try again** + **Save story** as text links with icons. Footer.

### error
A small drawn icon (pen for ink errors, close for bad link) at 48 px in ink-blue, the title (h1 serif), the detail (body text-2), one primary button (Retake / Draw your own level). Left-aligned, top third of the screen, not centred like a modal. Footer.

---

## 8. The story image (1080 × 1920) and the OG image (1200 × 630)

**Story** (`DL.PALETTE.story`): page paper with tooth. Top, centred: *"I drew this."* serif 600 64 px at y 340 (friend: *"Beat Rishi's level in"*), then line 2 at y 458: *"Beat "* at 64 px + the time at 112 px on one baseline, centred together (friend: the time alone). The board (frame included, no glass sheen) fitted into the box y 500–1440, max 900 px wide, centred, with the path line and the ball in the cup. Bottom: Caveat *"beat my level"* 50 px in ink-blue, rotated -2°, at y 1494 with a small drawn arrow hooking down, then `draw-a-level.vercel.app` in sans 500 34 px muted at y 1538. Everything important sits inside y 270–1540 and 90 px side margins. No logo, no frame around the image, no gradient.

**OG image** (`og-image.png`, made from `design/og.html`): page paper. Left: the sample board (≈ 330 × 500 px area, rotated -3°) with the ball mid-maze and the brass goal. Right, left-aligned: *"Draw a level."* serif 600 88 px, the sub-line in sans 28 px text-2 (*"Draw a maze on paper. Tilt to play. Dare a friend."*), then `draw-a-level.vercel.app` in Caveat ink-blue 36 px. Keep the key content inside the centre 1080 × 560 (WhatsApp crops).

---

## 9. Voice on screen

The words are PLAN.md §5.2's, unchanged. How they sit:
- Headlines are serif, sentence case, with the full stop. One per screen.
- The person and their friend speak in Caveat: names, "Nice.", "Gulp.", "Drag to tilt.", "So they know who to beat." is the one exception (it's an instruction, so small sans above the field).
- Instructions to act on the board ("Tap where the ball starts.") are Caveat, ink-blue, above the board, because they read like a note pencilled on the toy.
- Times are always printed (serif or tabular sans), never handwritten: they're facts.
- Errors are plain sans, never jokey, never red headlines (only the detail line's icon may use `--dl-bad`).
- No exclamation marks anywhere in the UI.

---

## 10. The aesthetic checklist (for the ui-verifier)

1. The drawing (board) is the largest element on the place, play, intro and result screens, and above the fold on landing at 390×844.
2. On play at 390×844 the board's inner paper is at least 330 px wide (8 px gutters, 62 L frame; about 333 px is the most the frame leaves at 390 wide) and nothing but the top bar and the hint row compete with it.
3. No more than 3 typefaces on any screen: the serif stack, the sans stack, Caveat.
4. Every time shown uses tabular lining numerals; the timer doesn't jitter in width while running.
5. Only ink-blue buttons: one primary per screen; brass and wood never appear on a button.
6. The wooden frame shows visible grain lines, mitred corners and four brass screws with differently angled slots; no bitmap texture files are loaded.
7. The paper has a visible but subtle tooth and vignette; it's not flat `#fff`.
8. The ball has a fixed top-left highlight, a dark horizon band and a warm soft shadow; it is clearly a steel ball, not a grey dot.
9. At 390 px, the ball and every hole are distinguishable at a glance (ball: shiny, light from above; hole: matte, dark, lit lip at the bottom).
10. Walls keep the person's ink colour (blue stays blue) and their wobble; nothing is straightened or recoloured except lighter-than-4.5:1 inks darkened in hue.
11. The goal is a brass cup with an engraved line, not a flag, star, checkered square or coloured target.
12. Contrast: body text ≥ 4.5:1; walls, ball, holes, goal ring, path ≥ 3:1 against the paper.
13. The start marker is a dashed ink-blue circle; it's faint during play.
14. The path line on the result and story is one smooth burnt-brass line, not dots, arrows or a gradient.
15. Finish: the ball settles into the cup and the ring gleams once; no confetti, stars, banners, shake, or "Level complete".
16. Hole fall: the ball shrinks and darkens into the hole and "Gulp." is handwritten; no red flash, no "Game over".
17. With prefers-reduced-motion, nothing scales or slides; only short fades.
18. All icons are from the drawn set (24 grid, 1.75 stroke, round caps), no emoji or icon-font glyphs anywhere in the UI.
19. Headlines are left-aligned serif (not a centred hero); the landing is not hero + three cards.
20. Shadows only on: the board, cards, the floating Tap to play card. Buttons have no drop shadow.
21. No blur/backdrop-filter anywhere; the Tap to play scrim is a flat warm tint.
22. Caveat is never used for buttons, body copy or times, and never below 1.3rem.
23. The story image: the drawing and the time are readable at 25% size; the address is inside y ≤ 1540 and 90 px margins.
24. The page is always light (`color-scheme: light`), the footer "More from Risheek" is present on landing, results, intro and error.
25. Nothing on any screen says "level complete", "AI", "magic", "generate", "upload" or "process".

**Plus the Never list (each is a FAIL):** arcade/pixel fonts, neon, glow, "LEVEL COMPLETE!", stars-out-of-three, health/XP bars, glossy 3D buttons, joystick graphics, primary red/yellow/blue game palettes · purple/blue/pink gradients, glassmorphism, mesh blobs, aurora · emoji or sparkles as UI or decoration · thick black cartoon outlines, mascots, faces on the ball, kawaii anything · centred hero + three feature cards, drop shadows on everything, everything a pill · Inter/Roboto-everything, more than three typefaces on a screen · bounce/elastic on everything, confetti for everything, motion without purpose · stock illustration filler, lorem ipsum, "magic", "AI", "generate".

---

## Proposed PLAN changes

1. **Story board size (§5.5):** "board about 70% of the height" and "everything important between y=270 and y=1540" can't both hold once the title and time are inside the safe zone. I fitted the board to the box y 500–1440 (≈ 49% of the height, up to 900 px wide); the safe zone wins. No flow change.
2. **Goal size (§5.4/§7.3):** the level has no goal radius. I set the visual cup at 1.45 × ballR (`DL.PALETTE.goal.rScale`) and suggest the catch radius = 1.0 × ballR from the goal centre so the ball visibly drops into the cup. Game-builder decides.
3. Nothing else: the flow suits the look.

---

## The board (step 2) and self-critique

**Files:** `design/board.html` (390 px, stacked; `?part=1..5` shows one section), `design/board-render.js` (reference renderer + the code-drawn wobbly maze), `design/og.html` (source of `og-image.png`). Screenshots: `shots/board-1.png` (system: concept, palette, type, icons, buttons/fields, materials), `board-2.png` + `board-6.png` (landing, place; before/after), `board-3.png` (play mid-run near a hole; iPhone Tap to play), `board-4.png` + `board-7.png` (maker result, friend intro, friend won; after), `board-5.png` + `board-8.png` (story at 1/3; before/after). The local server wasn't running, so the board was rendered from `file:///` (same Edge flags).

**What I changed after looking (as a sceptical 20-year-old designer):**
1. Round 1, the paper rendered solid black (a path bug in the frame's inner shadow); fixed. The page also laid out wider than 390 px in headless Edge; pinned the board to 390.
2. The maze looked computer-drawn (too straight, too open). Doubled the pen wobble and bow, longer overshoots at stroke ends, fewer extra openings. Now it reads as a biro doodle.
3. Holes read as ink dots at phone size. Added the lit paper halo, a wider lit lip and a lighter inner wall. They now read as cut holes next to the shiny ball.
4. The wood read as a flat brown picture frame. Denser, darker grain (22 lines per 100 L, late-wood lines), frame 58 → 62 L.
5. The goal cup looked like a big gold coin. Shrunk from 1.55 to 1.45 × ballR.
6. The maker result board was small with an empty bottom half. Board 250 → 300 px wide; the drawing is now the biggest thing on the screen.
7. The story title split awkwardly ("I drew this. Beat / 0:14.2"). It's now "I drew this." / "Beat **0:14.2**", and the "beat my level" arrow hooks down to the address.
8. Place and play centre the board vertically between the instruction/top bar and the bottom, instead of leaving a gap at the bottom.

**Least sure about:**
1. **Ball size at phone scale.** PLAN's rule (30% of the corridor, clamped to 28 L) gives a ball of ~19 px on a 374 px board. It reads as steel, but it's small next to big hand-drawn corridors. If real mazes have wide corridors, consider raising the clamp to ~34 L (game rule, so level-engine/game-builder call).
2. **The frame vs picture-frame read.** At 20 px the wood with four brass screws reads as "a nice wooden thing" more than "the labyrinth toy" specifically. A thicker frame would sell the toy better but costs play area. Check with Rishi on a real phone.
3. **System serif on Android.** Iowan/Palatino don't exist on Android, so headlines fall to Noto Serif / Georgia-like faces. It stays in the family (same choice as the kit), but the hero will look plainer there than in these Windows/iOS renders.
