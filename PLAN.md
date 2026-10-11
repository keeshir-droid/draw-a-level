# PLAN.md: Draw a Level (Day 8)

> **Draw a maze. Play it. Dare a friend.**
> Draw a maze on any paper with a pen and snap it. Your drawing becomes a real tilt game: a little steel ball rolls through *your* lines when you tilt your phone. Beat it, then send it to a friend: *"I drew you a level. Beat 0:14."* Free, no account, no AI, nothing uploaded.

This is the single planning file. A build session opened in this folder (`draw-a-level/`) should need only this file, the root `../CLAUDE.md` (loaded automatically), `../shared-kit/README.md` and the agents in `.claude/agents/`.

**Status (2026-10-11):** planned, nothing built. The folder holds this file, `HANDOFF.md`, the agents and `tests/real/README.md` (what photos Rishi will add). Build in a separate session, starting from `HANDOFF.md`.

**Decisions made by Rishi (2026-10-11):**
- **The idea:** your own drawing becomes a playable tilt game you send to a friend. Chosen because it passes the key test: *people can't make this themselves on paper, by texting, or with ChatGPT/Google.*
- **The level travels inside the link.** No database, no server, no storage. The site (on Vercel) is the "console"; the link is the "cartridge" (§6.4). Forwarding works forever.
- **No ghost ball** (replaying the maker's run). Not today, not in next steps unless Rishi asks.
- **One flow for both sides:** the maker draws → snaps → taps start and goal → plays → sends; the friend opens → plays → sees their time vs the maker's → "Send it back" or "Draw your own".
- **Follow the Day 7 process:** an art director sets the look first, Rishi approves it, real material before the interface, a verifier with a function layer and an aesthetic layer.

**Defaults I chose (Rishi can flip any of them before the build starts):**
- **Name:** *Draw a Level*. Folder `draw-a-level/`, address **`draw-a-level.vercel.app`**, repo `keeshir-droid/draw-a-level`, Vercel project `draw-a-level` (all free on 2026-10-11).
- **Holes are in:** a filled-in dot on the paper is a hole; fall in and the ball goes back to start. It's the classic wooden-maze tension, and costs one rule. It's also first on the cut list (§4).
- **The maker must finish their own level once before sending.** That proves it's possible and gives the time to beat.

---

## 1. Why this, and for whom

**Audience:** young (teens to 20s), expressive, non-technical people. Not developers, not content creators.

**The behaviours it builds on, which everyone already has:**
- doodling a maze in the back of a notebook (everyone did it at school)
- daring friends ("bet you can't…") and sending them little games in the group chat
- the wooden tilt-maze toy with a ball and holes, which almost everyone has played

**Why the phone is essential:** a drawing on paper can't be played. Here, your exact pen lines become walls, and your friend plays *your* drawing on *their* phone, wherever they are. Nothing else does that in two taps.

**Why people would care:**
- **It's yours.** The walls are your handwriting-wobbly lines, not a stock level.
- **It's for someone.** A challenge sent to one friend: *"I drew you a level."*
- **It loops.** Every friend who plays sees *"Draw your own"*, and the challenge comes back.
- **Fun on camera:** a hand draws a scribbly maze, snap, and a ball drops into the drawing and rolls as the phone tilts.

**The "aha" moment (the reel):** a pen draws a quick maze on a napkin. Snap. The paper "lifts" into the phone, a steel ball drops in, the phone tilts, the ball clacks against the hand-drawn wall and rolls home. *0:14.* Cut to the friend's screen: *"You beat Rishi by 2.1 s."*

**Honest risks:**
- **Messy drawings.** Shadows, pencil, gaps, notebook lines. Mitigation: Doodle Alive's proven ink-lifting engine, a path check (§5.3), and real photos at M1.
- **The feel.** If the ball feels floaty or sticky, it's dead. Physics is tuned on a real phone at M1 (needs HTTPS, so an early unannounced deploy, §8).
- **Link length.** A detailed drawing makes a longer link. Measured at M1 on real drawings (§6.4).
- **Toy risk.** It could be played once. The friend-to-friend challenge and "Draw your own" are the answer; we judge from real use.

## 2. The bar

- **Draw-to-play in under 30 seconds** after the photo.
- **The ball feels real:** weight, rolling, a satisfying stop against a wall. Nothing floaty.
- **Your drawing still looks like your drawing** in the game: same wobbly lines, your ink colour.
- **The friend never needs instructions:** link → one tap → playing.
- **Every output** carries `draw-a-level.vercel.app`.

---

## 3. The user flow

### Step 0: the reel
- **What the viewer sees:** a pen draws a maze on paper → snap → a ball drops in → tilt, roll, clack → *0:14* → a friend's screen: *"You beat Rishi."*
- **Caption hook:** *"drew a maze on paper and now my friends can't beat it"*.

### Step 1: landing (first 3 seconds)
- **Headline:** *"Draw a level."*
- **Sub-line:** *"Draw a maze on paper. Snap it. Tilt to play, then dare a friend."*
- **A live sample level** (a hand-drawn-looking maze made in code, §6.6) with the ball rolling gently by itself, as the hero.
- **Buttons:**
  - **Snap my maze** (primary): opens the phone's camera
  - **Pick a photo** (secondary)
  - **Play a sample level** (text link): goes straight to play, for people without paper nearby
- **How to draw**, three tiny drawn steps in one row: *"Pen on paper · Lines are walls · A filled dot is a hole"*.
- **Trust line:** *"Free. No account. Your photo stays on your phone."*

### Step 2: the photo
- **Snap my maze** is `<input type="file" accept="image/*" capture="environment">` (the phone's own camera app; works in Instagram/WhatsApp in-app browsers; no camera permission screen).
- **Pick a photo:** the same input without `capture`.
- Decoded on the phone (kit `decode.js`). HEIC / not-image get a friendly message.

### Step 3: "Here's your level" (the lift)
- The page lifts the ink off the paper (§5.3): shadows gone, notebook lines wiped, only the pen left.
- **On screen:** the clean level on the game board, with a short "lift" animation from the photo to the clean drawing (the second on-camera moment).
- **If the drawing is landscape,** it's turned to portrait automatically.
- **Problems, each with a friendly message and one button (Retake):**
  - no ink found (`no-ink`), too faint (`too-faint`)
  - far too much ink, like a photo of a printed page (`too-busy`)
- **Retake** and **Looks good** buttons.

### Step 4: start and goal
- *"Tap where the ball starts."* → a ball appears there (snapped to the nearest free spot).
- *"Now tap the finish."* → a goal marker appears.
- Either can be tapped again to move it.
- **The path check (§5.3):** if the ball can't get from start to goal (walls too tight or closed), show *"Your ball can't get through. Move the start or finish, or retake with wider paths."* with the blocked area hinted. The level can't be sent until a path exists.

### Step 5: play (the core)
- **iPhone:** one **Tap to play** button first (Apple requires a tap before a site can read tilt). If tilt is refused or unavailable, **touch control** takes over: drag anywhere and the board tilts toward your finger.
- **3, 2, 1:** the ball drops in at the start with a small bounce.
- **Tilt the phone:** the ball rolls with weight, stops against your lines with a soft click (and a tiny vibration on Android).
- **Holes:** roll over one and the ball drops in (shrinks and darkens), then reappears at start. The timer keeps running.
- **The timer** runs from the drop to the goal, shown small at the top (`0:14.2`).
- **Restart** (small, top corner) at any time.
- **Reach the goal:** the ball settles into it, the time lands big, a short satisfying moment.

### Step 6: the maker's result
- **Your time,** big: *"0:14.2"*.
- **Play again** (to beat your own time; the best one counts).
- **Your name** (asked once, max 16 characters, remembered in localStorage): *"So they know who to beat."*
- **Dare a friend** (primary): the share sheet with text *"I drew you a level. Beat 0:14 👇"* and the link (§6.4). Fallback: copy link.
- **Save story:** a 1080×1920 image (§5.5): your drawing on the board, your path traced in one coloured line, the time, *"Beat my level → draw-a-level.vercel.app"*.

### Step 7: the friend opens the link
- **Their screen:** *"Rishi drew you a level."* The drawing on the board. *"Time to beat: 0:14.2."* One button: **Play** (on iPhone this tap is also the tilt permission).
- They play exactly as in Step 5.

### Step 8: the friend's result
- **Won:** *"You beat Rishi by 2.1 s."* **Lost:** *"Rishi still wins. 0:14.2 vs 0:16.9."* (more lines in §5.2)
- **Try again** (best time counts).
- **Send it back** (primary): the same level, now with *their* name and time, *"Beat 0:12.1, Rishi 👀"*.
- **Draw your own level** (strong secondary): back to Step 1. This is the growth loop.
- **Save story:** the same story image with their time.

### Step 9: the loop
- Sent links get forwarded; every link is the whole level, so it keeps working.
- Every player sees "Draw your own" at the end.

---

## 4. Scope for today

### In
- Snap / pick a photo, the ink lift (copied and adapted from Doodle Alive), landscape → portrait.
- Start and goal taps, the path check, holes (filled dots).
- The game: tilt control (with the iOS permission tap), touch fallback, physics, walls, holes, goal, timer, restart, best time.
- The level link: encode / decode (§6.4), the challenge text, "Send it back" with name and time.
- The friend's flow (Steps 7–8) with win and lose lines.
- The story image (1080×1920) with the path line.
- A code-made sample level for the landing and "Play a sample level".
- Desktop: arrow keys / mouse drag as controls.
- "More from Risheek" footer, Vercel Web Analytics, README, live at its own address.

### Not today (README "next steps")
- Ghost ball (Rishi said no for now).
- Editing the level after the snap (erase a stray mark, draw extra walls on screen).
- More pen meanings (red pen = lava, arrows = speed boosts, coins to collect).
- A level library / leaderboard (needs a server).
- A replay video of your run for stories (the kit's video export could do it).
- Multiple balls, timed "hard mode", daily level.

**If the day runs short, cut in this order:**
1. holes (filled dots are then just walls)
2. the story image (keep the link share)
3. desktop controls (touch fallback still works)

The tilt play, the link share and the friend's result are never cut.

---

## 5. Design

### 5.1 The look: set by the art director in DESIGN.md
**`DESIGN.md` is the source of truth for the look.** The `art-director` writes it at M0, with `src/design-tokens.css`, `src/engine/palette.js` and `design/board.html`. PLAN.md stays the source of truth for flow, rules and the contract.

**The brief:**
- **A real object, made with care.** References: the classic wooden tilt-maze toy (warm wood frame, brass knobs, a steel ball with a highlight, dark round holes), the pocket "ball-in-a-maze" puzzle under glass, school notebooks and graph paper. Your paper sits inside the toy like its game board.
- **Playful but aesthetic.** The fun is in the ball's physics and the words, not loud visuals.
- **Not a video game.** No arcade fonts, no neon, no health bars, no glossy 3D buttons, no "LEVEL COMPLETE!!" chrome, no cartoon mascots. Not AI slop: no gradient blobs, glassmorphism, emoji-as-icons or the hero-plus-three-cards layout.
- **The drawing is the hero.** It stays legible and looks like ink on paper, in the person's real ink colour.
- **The family stays:** warm paper, serif headings, ink-blue accent, Caveat for handwriting, the "More from Risheek" footer, always light.

### 5.2 Voice and words
Short, warm, a little cheeky between friends. Never "upload", "process", "AI", "generate", "level complete".

| Moment | Words |
|---|---|
| Landing | *Draw a level.* / *Draw a maze on paper. Snap it. Tilt to play, then dare a friend.* |
| Lift done | *Here's your level.* |
| Start / goal | *Tap where the ball starts.* / *Now tap the finish.* |
| No path | *Your ball can't get through. Move the start or finish, or retake with wider paths.* |
| Tilt ask (iPhone) | *Tap to play. Then tilt your phone to roll the ball.* |
| Touch fallback | *Drag to tilt.* |
| Fell in a hole | *Gulp.* (then back to start) |
| Maker finished | *0:14.2. Nice.* / name: *So they know who to beat.* |
| Share text (maker) | *I drew you a level. Beat 0:14 👇* |
| Friend opens | *Rishi drew you a level.* / *Time to beat: 0:14.2* |
| Friend won | *You beat Rishi by 2.1 s.* (very close, under 0.5 s: *By a hair. You beat Rishi.*) |
| Friend lost | *Rishi still wins. 0:14.2 vs 0:16.9.* |
| Send it back | *Beat 0:12.1, Rishi 👀* |
| Growth | *Draw your own level* |
| Errors | `no-ink`: *Couldn't find your maze. Use a pen and fill the photo with the paper.* · `too-faint`: *Your lines are too light. Go over them with a pen.* · `too-busy`: *That's a lot of ink. Draw a simpler maze on plain paper.* · `bad-link`: *This level link is broken. Ask your friend to send it again.* |

The share-text emoji are message text, not UI. The UI itself never uses emoji (the art director draws the icons).

### 5.3 The level rules (how a photo becomes a level)
1. **Lift the ink:** copy Doodle Alive's `cleanup.js` analysis (paper estimate, ink matte, ruled/grid line removal, despeckle). Keep **all** ink on the page, not just the biggest doodle. Reject when there's no ink, too little, or too much (`too-busy`: ink over ~35% of the page).
2. **Crop and orient:** crop to the ink's bounding box plus a margin; if wider than tall, rotate 90° so play is portrait. Normalise to **level space**: width 1000 units, height 1000 × aspect (clamped to 1000–2000, centred on a paper area if the drawing is squat).
3. **Holes:** solid, roughly round filled blobs (fill ratio > 0.7, roundness > 0.6, diameter 2–8% of width) become holes `{x, y, r}`. Everything else is a wall.
4. **Walls as strokes:** thin the wall ink to centre lines (skeleton), trace them into polylines, simplify (RDP, tolerance ~2 units), and keep each stroke's width (median thickness, min 6 units). Big solid areas that aren't holes become filled polygons (outline traced, simplified). Drop specks shorter than ~12 units.
5. **The board edge is a wall** (the frame).
6. **Ball size** comes from the drawing: measure the typical corridor width (distance from free space to the nearest wall, median along the free-space skeleton); ball radius = 30% of the typical corridor width, clamped to 10–28 units.
7. **Start and goal:** tapped by the maker, snapped to the nearest spot where the ball fits.
8. **Path check:** a grid search (about 4-unit cells) over places the ball's centre can be (inflate walls and holes by the ball radius). If no path from start to goal, block sending (Step 4). The same check runs on decode, so a bad link can't trap the friend.
9. **Same level everywhere:** the game plays on the decoded vector level on both phones, so maker and friend play exactly the same walls.

### 5.4 The game rules (how it plays)
- **Fixed physics step** (120 Hz, accumulator), in level units, so every phone plays the same.
- **Gravity** from tilt: the device's `beta`/`gamma` relative to the angle the phone was held at the moment play started (so you can play lying on a bed). Dead zone of 2°, max at about 25°. Smoothed so it feels heavy, not twitchy.
- **The ball:** rolling friction, a top speed, collisions against capsules (each polyline segment with its stroke width) and polygons, with a small bounce (restitution ~0.25) and no tunnelling (substeps so it never moves more than half its radius per step).
- **Feedback:** a soft click on wall hits above a speed (Web Audio, made in code, very quiet), a 10 ms vibration on Android, the ball's highlight staying fixed while it "rolls".
- **Holes:** if the ball's centre is inside a hole's radius minus 20% of the ball radius, it falls: shrink and darken over 300 ms, then reappear at start. The timer keeps running.
- **Goal:** the ball's centre within the goal radius → it eases into the centre, the timer stops.
- **Touch fallback:** finger offset from the board centre → tilt (same gravity curve). **Desktop:** arrow keys / WASD and mouse drag.
- **Fairness:** a run only counts if it started from the drop (no pause). Times are stored to 0.1 s.
- Constants are tuned on a real phone at M1 and live in one place (`DL.PHYSICS`).

### 5.5 The story image (1080×1920)
- The board with the drawing, filling about 70% of the height, centred.
- The path: the winning run's ball positions (sampled every 50 ms), drawn as one smooth coloured line under the ball, with the start and goal marked.
- Top: *"I drew this. Beat 0:14.2"* (maker) or *"Beat Rishi's level in 0:12.1"* (friend). Bottom: *"draw-a-level.vercel.app"*.
- Everything important between y=270 and y=1540, 90 px side margins.
- File name: `draw-a-level-<name>-<YYYY-MM-DD>.jpg` (name lower case, a–z 0–9 hyphens, empty → `level`).

### 5.6 Screens (phone first at 390×844, one-handed)
| Screen | What's on it |
|---|---|
| landing | headline, sub-line, live sample board, Snap my maze, Pick a photo, Play a sample level, How to draw, trust line, footer |
| lifting | the photo → clean level animation, then Retake / Looks good |
| place | the board, the instruction line, the start ball and goal marker, Ready (enabled once both are placed and the path check passes) |
| play | the board as big as possible, the timer, restart; the iOS Tap to play overlay; "Drag to tilt" hint on fallback |
| result (maker) | time, Play again, name field, Dare a friend, Save story |
| intro (friend) | "Rishi drew you a level", the board, time to beat, Play |
| result (friend) | win/lose line, Try again, Send it back, Draw your own level, Save story |
| error | title, detail, one button |

**Keep the screen awake while playing** with the Wake Lock API where available (ignore if not). Block page scrolling and pull-to-refresh on the play screen (`touch-action: none`, `overscroll-behavior: none`).

---

## 6. Tech

Plain HTML, CSS and JavaScript, no build step, no framework, **no libraries**. Classic scripts attach to `globalThis.DL`. Every engine file must load in Node without touching `document`, `window` or `navigator` at load time.

### 6.1 Files

```
draw-a-level/
├── index.html
├── fonts/                 caveat-600.woff2 + OFL.txt (from ../shared-kit/fonts/), plus the fonts from M0
├── DESIGN.md              art-director
├── design/board.html      art-director (never deployed)
├── src/
│   ├── app.js             site-builder: screens, state, events, footer (MAKER_NAME + SIBLINGS from ../shared-kit/footer/)
│   ├── design-tokens.css  art-director
│   ├── styles.css         site-builder (starts from ../shared-kit/tokens.css + footer.css)
│   └── engine/
│       ├── util.js        level-engine, from ../shared-kit/engine/util.js (UL → DL; constants replaced with §7.3)
│       ├── palette.js     art-director: DL.PALETTE (board, wood, paper, ink, ball, holes, goal, path line)
│       ├── decode.js      level-engine, from the kit (UL → DL; DEFAULT_MAX_SIDE 1600)
│       ├── lift.js        level-engine: ink lift, adapted from ../doodle-alive/src/engine/cleanup.js
│       ├── vectorize.js   level-engine: skeleton → polylines, holes, polygons, ball size
│       ├── level.js       level-engine: the Level object, start/goal snapping, path check
│       ├── codec.js       level-engine: Level ⇄ link text (§6.4)
│       ├── sample.js      level-engine: the code-made sample level(s)
│       ├── physics.js     game-builder: the ball, collisions, holes, goal (pure, no DOM)
│       ├── input.js       game-builder: tilt (with iOS permission), touch fallback, keys
│       ├── board.js       game-builder: draws the board, drawing, holes, goal, ball (canvas)
│       ├── game.js        game-builder: the run loop, timer, path recording, events
│       ├── story.js       game-builder: the 1080×1920 story image
│       ├── export.js      level-engine: JPEG + fileName (pattern from the kit, no video)
│       └── share.js       level-engine, from the kit (UL → DL; fallback name "draw-a-level"); add shareLink(text, url)
├── tests/                 never deployed
│   ├── real/              Rishi's maze photos (gitignored)
│   ├── levels.html        level-engine: the M1 test page (§7.4)
│   ├── engine/            Node tests (codec round-trip, path check, physics no-tunnelling)
│   ├── smoke.js, page-check.js, cdp.js   integrator (adapt from ../spotted-a-cutie/tests/)
│   └── out/               (gitignored)
├── shots/                 (gitignored)
├── notes/
├── README.md, VERIFY.md
└── .gitignore, .vercelignore, .gitattributes, vercel.json   (copy from ../spotted-a-cutie/, fix names)
```

**Script order:** `util, palette, decode, lift, vectorize, level, codec, sample, physics, input, board, game, story, export, share`, then `app.js`.

**Copy, never link.** Never edit outside `draw-a-level/`.

### 6.2 Speed targets (mid-range Android)
- Photo → clean level on screen: under 2 s.
- Play: a steady 60 fps on a mid-range Android; physics under 2 ms per frame.
- Decoding a link → playable: under 300 ms.

### 6.3 Secure context (important for testing)
Tilt (`deviceorientation`) only works on **HTTPS** (and needs the tap permission on iPhone). Testing over home Wi-Fi (`http://<PC IP>:8000`) can check the camera, the lift and the touch fallback, **but not tilt**. So M1 includes an early, unannounced deploy to Vercel (HTTPS) for Rishi to feel the tilt (with his okay).

### 6.4 The level link (no server)
- **Address:** `https://draw-a-level.vercel.app/#L1.<payload>`. The level is in the part after `#`, which browsers never send to any server: private and free.
- **Payload:** a compact binary of the level, then compressed (`CompressionStream("deflate-raw")`; if missing, uncompressed with a flag), then base64url.
- **What's in it:**
  - version (1), level height, ball radius
  - ink colour (3 bytes)
  - walls: polylines (quantised to whole units, delta-encoded varints) with a width per stroke; filled polygons
  - holes `{x, y, r}`, start `{x, y}`, goal `{x, y}`
  - the challenge: name (≤16 chars, UTF-8) and best time (tenths of a second); empty for a level sent without a time
- **Budget:** aim under **2,000 characters** for a normal maze; if over **4,000**, simplify harder (raise the RDP tolerance step by step) until it fits. Report the real lengths on Rishi's photos at M1.
- **Decode:** validate everything (bounds, counts, lengths); any problem → `bad-link` screen with "Draw your own level". Never crash on a bad link.
- **Send it back** re-encodes the same level with the new name and time.
- **The link preview** in WhatsApp shows the site's own Open Graph image and title (`og-image.png`, 1200×630, made by the art director), since the level isn't visible to the server.

### 6.5 Saving and remembering
- `localStorage` (try/catch): the player's name, and best times per level (keyed by a short hash of the payload without the challenge part).
- Nothing else is stored. No IndexedDB.

### 6.6 The sample level
`DL.sample.load()` returns a ready Level that looks hand-drawn (wobbly lines, made in code with a fixed seed), with 2 holes, a start and a goal. It's used on the landing (ball rolling by itself, a slow scripted tilt) and for "Play a sample level". `DL.sample.photo()` returns a synthetic maze *photo* (paper, shadow, ruled lines) for tests only, adapted from Doodle Alive's `sample.js`. **Synthetic photos never replace Rishi's real ones as the test.**

---

## 7. The contract between screens, level engine and game

### 7.1 Who owns what
| Owner | Files |
|---|---|
| art-director | `DESIGN.md`, `design/`, `src/design-tokens.css`, `src/engine/palette.js`, `og-image.png`, `shots/board-*.png` |
| level-engine | `util, decode, lift, vectorize, level, codec, sample, export, share` in `src/engine/`; `tests/levels.html`; `tests/engine/` (its own tests) |
| game-builder | `physics, input, board, game, story` in `src/engine/`; `tests/play.html`; `tests/engine/physics-*.js` |
| site-builder | `index.html`, `src/app.js`, `src/styles.css` |
| integrator | small fixes anywhere; `fonts/` (copying), `tests/smoke.js`, `tests/page-check.js`, `tests/cdp.js`, config files |
| ui-verifier | `VERIFY.md`, `shots/` |
| main session | downloads (fonts), `tests/real/`, git, GitHub, Vercel, `README.md`, `../shared-kit/`, root `../README.md` and `../CLAUDE.md` |

### 7.2 Errors
Engine functions reject with `Error` objects carrying `{ code, title, detail }` (friendly, ready to show; words in §5.2).
Codes: `not-image`, `heic`, `unreadable`, `no-ink`, `too-faint`, `too-busy`, `no-path`, `bad-link`, `export-failed`, `cancelled` (ignored by the site).

### 7.3 Names
```js
// constants (util.js)
DL.LEVEL_W = 1000;              // level width in units
DL.STORY = { w: 1080, h: 1920 };
DL.LINK_PREFIX = "L1.";
DL.PHYSICS = { hz: 120, gravity, friction, restitution, maxSpeed, deadZoneDeg: 2, maxTiltDeg: 25, smoothing }; // tuned at M1

// Level object (plain data, JSON-safe)
// { v: 1, w: 1000, h, ink: "#1d2340", ballR, walls: [{ pts: [x0,y0,x1,y1,...], width }],
//   fills: [{ pts: [...] }], holes: [{ x, y, r }], start: { x, y } | null, goal: { x, y } | null,
//   challenge: { name, time } | null }

// level engine
DL.decode.fileToImageData(file, { maxSide }) → Promise<ImageData>
DL.lift.fromImage(imageData) → Promise<{ level, preview }>   // level without start/goal; preview = ImageData of the clean ink for the lift animation
DL.level.snap(level, x, y) → { x, y } | null                  // nearest spot the ball fits
DL.level.setStart(level, pt) / DL.level.setGoal(level, pt) → level
DL.level.pathCheck(level) → { ok, blocked?: { x, y } }
DL.level.id(level) → string                                     // short hash, ignores the challenge
DL.codec.encode(level) → Promise<string>                        // "L1.<payload>"
DL.codec.decode(text) → Promise<level>                          // rejects bad-link
DL.codec.url(level) → Promise<string>                           // full https address with #
DL.sample.load() → level ; DL.sample.photo() → ImageData (tests only)

// game
DL.input.needsPermission() → boolean
DL.input.request() → Promise<"tilt" | "touch">                  // call inside the tap
DL.input.attach(el, mode) / DL.input.detach()
DL.game.create(canvas, level, { mode, onEvent }) → game
  game.start() / game.restart() / game.stop() / game.destroy()
  onEvent({ type: "drop" | "wall" | "hole" | "finish" | "tick", time?, speed? })
  game.result() → { time, path: [x,y,...] } | null
DL.board.draw(ctx, level, { scale, ball?, path?, idle? })       // also used for landing and previews
DL.story.image(level, { time, path, name, mode: "maker" | "friend" }) → Promise<Blob>

// output
DL.export.fileName(name, date) → string
DL.share.shareLink(text, url) → Promise   // share sheet with text+url; fallback copy to clipboard; call inside the tap
DL.share.share(file) / DL.share.save(file)
```

### 7.4 Dev shortcuts (for checks and screenshots)
- `?screen=landing|lifting|place|play|result|intro|friend-result|error-no-ink|error-bad-link`
- `?sample=1`: use the sample level; `&time=142&name=Rishi` for a challenge; `&won=1` / `&won=0` for the friend result
- `&control=touch`: force the touch fallback; `&autoplay=1`: a scripted tilt that solves the sample (for screenshots and the page check)
- `tests/levels.html?set=real`: every photo in `tests/real/` → original | clean ink | vector level (with holes, ball size) | link length | path check, plus timings
- `tests/play.html?sample=1&control=touch`: the game alone, with FPS and physics timing
- The site keeps `window.__level = { screen, level, linkLength, lastResult }` current.

---

## 8. Milestones (check on a phone-sized screen after each)

**M0. Real material + the look (in parallel; Rishi approves the look).**
- **Rishi:** draws and photographs at least 4 mazes on paper (see `tests/real/README.md`) and drops them in `tests/real/`.
- **art-director step 1:** `DESIGN.md` (concept, palette, type, materials, icons, motion, screens, the board and ball, the aesthetic checklist, the font list). **Rishi says go or adjust.**
- **Fonts:** the main session downloads them with Rishi's okay (as Day 7).
- **art-director step 2:** tokens, `palette.js`, `og-image.png`, `design/board.html` (mocks of landing, place, play, result, friend intro, story) with self-critique. **Rishi approves the board.**

**M1. The level and the feel: go / no-go.**
- **level-engine:** decode, lift, vectorize, level (snap, path check), codec, sample, `tests/levels.html`. Run on every real photo; report link lengths.
- **game-builder (in parallel, on the sample level):** physics, input, board, game, `tests/play.html`.
- **Early deploy (main session, with Rishi's okay):** a preview on Vercel (HTTPS) so Rishi can feel the tilt on his phone, playing the sample and his own mazes via `tests/levels.html` links. The address isn't announced.
- **Show Rishi:** each real photo → clean level side by side, the link lengths, one link pasted into WhatsApp. **Rishi decides:** do his drawings come out right, does the ball feel good, does the link look okay? If the link looks bad, switch to the short-link plan (a separate decision; it needs a small server piece).

**M2 + M3 in parallel.** game-builder: story image, polish. site-builder: every screen in §5.6, to DESIGN.md and the board.

**Join:** integrator (smoke and page checks passing).

**Verify:** ui-verifier writes VERIFY.md (function + aesthetic). Fix loop until both are clean.

**M4. Phone test** (deployed, HTTPS): the full loop on iPhone Safari and Android Chrome, and from a WhatsApp and an Instagram DM link: snap → place → play → dare → friend plays → send back.

**M5. Ship (main session, with Rishi's okay at each step).** Analytics on, README (standard sections, demo GIF), root README row and CLAUDE.md "Where we are", then (with okay) add Draw a Level to `../shared-kit/footer/siblings.js` and older footers.

---

## 9. Risks and what we do about them

| Risk | Plan |
|---|---|
| Messy real drawings (shadows, pencil, ruled lines, gaps) | Doodle Alive's proven lift; real photos at M1; friendly errors; Retake |
| Ball slips through tiny gaps or gets stuck | Ball size from corridor width; capsule collisions with substeps; path check before sending |
| Physics feels floaty or twitchy | Tuned on a real phone at M1 via an early HTTPS deploy; one constants block |
| Tilt doesn't work (iOS refused, in-app browsers, old phones) | Touch fallback always available; `&control=touch` tested in the page check |
| Long links look spammy or break | Vector encoding + compression + adaptive simplification; measured at M1; short-link plan as fallback |
| Phone sleeps or the page scrolls during play | Wake Lock where available; `touch-action: none`, `overscroll-behavior: none` |
| Looks like a cheap mobile game | Art director first, "Never" list, board approval, aesthetic layer in VERIFY.md |
| One-time toy | Friend challenge + Send it back + Draw your own; judge from real use |

## 10. Definition of done

On top of the root `../CLAUDE.md` checklist:
- [ ] Rishi approved the board (M0), and his real drawings come out right and play well (M1)
- [ ] Draw → snap → place → play → dare works on a real iPhone (Safari) and Android (Chrome)
- [ ] A friend can open the link from WhatsApp and from an Instagram DM, play, and send it back
- [ ] The link for a normal maze is under 2,000 characters, and a broken link shows the friendly screen
- [ ] The ball feels good on both phones; touch fallback works where tilt doesn't
- [ ] The story image looks good and carries the address
- [ ] VERIFY.md clean on both layers; footer, analytics, README, root README and CLAUDE.md updated
