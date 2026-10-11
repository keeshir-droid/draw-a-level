# VERIFY.md: Draw a Level

Checked 2026-10-11 by the ui-verifier. Nothing was tested by hand on a real phone yet (no "tested by hand" rows existed before).

**How this was checked (and two deviations from the usual recipe):**
- The server on 8000 was not running, and it was not started. `node tests/page-check.js` ran with its own throwaway server on 8123: **PAGE CHECK: PASS** (every line PASS, including the maker → link → friend → send-back round trip).
- **The prescribed `msedge --headless=new --window-size=390,844 --screenshot` command lays the page out about 500 px wide**, so the board and buttons are cut off on the right. My first `landing-phone.png` showed this. It's a headless-Edge quirk (minimum window width), **not a site bug**: the site measures 390 px wide with no sideways scroll under real device emulation. So every screenshot below was taken through `tests/cdp.js` with DevTools device emulation (390×844, mobile, touch, dpr 1), using a throwaway static server in the scratchpad (8123, then 8124) that has since stopped. **Fix for next time:** use the CDP path in `.claude/agents/ui-verifier.md` for phone sizes.
- **There are no real maze photos in `tests/real/`** (only its README). `levels-real.png` shows "No photos found". Every "photo → level" verdict below comes from the **synthetic** cases (`levels-synthetic.png`, `levels-synthetic-full.png`) and the page check's synthetic photo. **That is not the test.** Real-photo items are UNSURE.
- Screenshots are in `shots/`. All are 390×844 unless the name says `-small` (360×640), `-laptop` (1280×800), `-full` (the whole scrolling page) or `levels-*` (1280×2600). Story images are `shots/story-maker.jpg` and `shots/story-friend.jpg` (1080×1920, from `DL.story.image` on the sample level).

---

## Function

| Item | PASS / FAIL / UNSURE | Why | Screenshot | Tested by hand |
|---|---|---|---|---|
| Pick a photo | PASS | The page check feeds a file into `#in-pick`: lifting screen, clean level in 1.9 s (including the 1.4 s animation). | pc-maker-lifted.png | |
| Snap my maze (camera) | UNSURE | `capture="environment"` opens the camera app only on a phone. | (none) | |
| Ink lift, synthetic pen photos | PASS | neat, messy, ruled, holes, desk-marker and dense all keep their lines. Ruled and grid lines are wiped (28 and 34 pieces). Shadows are gone. Ink colour is kept (blue `#234494`, red `#ae2636`). | levels-synthetic.png, levels-synthetic-full.png | |
| Ink lift, faint pencil (synthetic) | FAIL | The pencil maze comes out as 36 short dashes (236 ink pieces). Most long walls break into broken segments with gaps that aren't in the drawing, so the level is much more open than the drawing. The path check still passes, so it would be sent like that. | levels-synthetic.png (bottom row, "synthetic: pencil") | |
| Ink lift on Rishi's real photos | UNSURE | `tests/real/` is empty, so `levels-real` shows nothing. Can't judge lines kept, notebook lines gone, gaps kept, dots → holes or ball size on real drawings. | levels-real.png | |
| Landscape → portrait | PASS | The 1600×1200 red maze becomes 1000×1289, "turned to portrait". | levels-synthetic.png ("landscape") | |
| Errors: not-image, no-ink, too-busy | PASS | A .txt file gives "That doesn't look like a photo." and a blank photo gives "Couldn't find your maze." (page check). "busy" gives too-busy and "blank" gives no-ink on the levels page. Title, detail and one Retake button. | error-no-ink-phone.png, pc-error-not-image.png, levels-synthetic-full.png | |
| Start and goal taps, snapping, Ready | PASS | The page check taps start and goal on the place screen and Ready turns on. The placed state shows a ball with a dashed ring and a brass cup. Ready is disabled (page tint) before anything is placed. | place-phone.png, place-placed-phone.png, pc-maker-placed.png | |
| Path check: no-path message + blocked smudge | UNSURE | The words are in the code exactly as in §5.2, but no screenshot shows a blocked placement (there's no dev shortcut for it). | (none) | |
| Holes (filled dots) | PASS | The synthetic "holes" photo turns 4 dots into 4 holes, and "landscape" turns 2 into 2. In play, the ball shrinks and darkens and "Gulp." appears (game-builder's test-page shot). I couldn't steer the ball into a hole on the real site (shots/play-hole-try-phone.png). | levels-synthetic.png, play-hole.png | |
| Tilt control + iPhone permission tap | UNSURE | Needs HTTPS and a real phone. | (none) | |
| iOS "Tap to play" overlay (look) | PASS | A warm flat scrim over the board only, a card with the tilt-phone icon, "Tap to play." / "Then tilt your phone to roll the ball." and a Play button. | tap-to-play-phone.png | |
| Touch fallback (drag to tilt) | PASS | Real touch drags move the run (timer 0:00.1 → 0:01.1). The "Drag to tilt." hint shows under the board. | pc-sample-drag.png, play-phone.png | |
| Physics: walls, goal, finish | PASS | Autoplay finishes the sample (9.7 s), the synthetic maze (9.4 s) and the friend's run. The ball settles in the cup and the timer freezes. | play-finish-phone.png, result-after-run-phone.png | |
| Ball feel (weight, roll, stop) | UNSURE | A still can't show feel. | (none) | |
| Countdown 3, 2, 1 + drop | PASS | The Caveat ink-blue "2" and "1" are pencilled over the board. The ball waits big (near the glass) at the start. | play-countdown-phone.png, play-phone.png | |
| Timer | PASS | Top centre, sans 600 at 20.8 px, `tabular-nums lining-nums`; it reads 0:00.5 and then 0:03.0 mid-run. | play-mid-phone.png, play-mid2-phone.png | |
| Restart | UNSURE | The button is there (top left, 44 px). No check taps it mid-run. | play-phone.png | |
| Best time counts | UNSURE | Not exercised by any check. | (none) | |
| Link encode / decode, same level | PASS | The friend gets the same `DL.level.id` (`1n3px0e17tud`). Every synthetic case says "round trip identical". | pc-friend-intro.png, levels-synthetic.png | |
| Link length (§6.4 budget) | PASS | Synthetic photos 416–964 characters (dense 964), the maker flow 484, send-back 482, the sample 644. All are under the 2,000 aim. | levels-synthetic.png | |
| Link length on real drawings | UNSURE | No real photos. | levels-real.png | |
| Bad link | PASS | `/#L1.garbage` → "This level link is broken." / "Ask your friend to send it again." / **Draw your own level**, which goes to the landing. No crash, no console errors. | bad-link-hash-phone.png, error-bad-link-phone.png | |
| Dare a friend (text, copy fallback) | PASS | The text is "I drew you a level. Beat 0:14 👇" (code). Headless has no share sheet, so it fell back to "Link copied. Paste it in your chat." The address has the shape `https://draw-a-level.vercel.app/#L1.…`. | pc-maker-result.png | |
| Share sheet to WhatsApp / Instagram | UNSURE | Needs a phone. | (none) | |
| Friend intro | PASS | "*Rishi* drew you a level." (name in Caveat), the board, the brass-soft "Time to beat 0:14.2" tag and Play. | intro-phone.png, intro-phone-full.png | |
| Friend won / lost / by a hair | PASS | "You beat *Rishi* by 2.1 s." / "*Rishi* still wins." with a You 0:16.9 / Rishi 0:14.2 compare / "By a hair. You beat *Rishi*." | friend-won-phone.png, friend-lost-phone.png, friend-hair-phone.png | |
| Send it back | PASS | Makes a new link carrying "Sam" and the friend's time, same level. The text is "Beat 0:12.1, Rishi 👀" (code). It asks for a name first if there isn't one. | pc-friend-result.png | |
| Draw your own level (growth loop) | PASS | A full-width secondary button on the friend result. It goes to the landing (page check). | friend-won-phone.png | |
| Story image | PASS (function) | 1080×1920 JPEG for maker and friend, with the path line, the ball in the cup and `draw-a-level.vercel.app` at y≈1528 (inside y ≤ 1540 and 90 px margins). File name `draw-a-level-rishi-k-2026-10-11.jpg`, or `…-level-…` when there's no name. Layout drift is under Aesthetic. | story-maker.jpg, story-friend.jpg | |
| Save story on a phone (share / download) | UNSURE | Headless reports "Saved to your phone.", but iOS share-sheet saving needs a phone. | (none) | |
| Sample level + landing ball rolling by itself | PASS | The ball sits in a different place in successive shots (it rolls). It is still with reduced motion. "Play a sample level" opens play. | landing-phone.png, landing-phone-full.png | |
| Desktop controls (arrow keys / WASD, mouse drag) | UNSURE | Not exercised. play-laptop renders fine with the touch fallback forced. | play-laptop.png | |
| "More from Risheek" footer | PASS | On the landing, maker result, intro, friend result and error. Not on play, place or lifting. | landing-phone-full.png, result-phone-full.png, intro-phone.png, error-no-ink-phone.png | |
| Vercel Web Analytics | UNSURE | The `/_vercel/insights/script.js` tag is in index.html. It 404s locally as expected. Counting needs the deploy. | (none) | |
| README + live at its own address | FAIL | Not done yet (M5): there's no README.md and no deploy. | (none) | |
| Wake Lock while playing | UNSURE | In the code; needs a phone. | (none) | |
| Wall click sound + Android vibration | UNSURE | Needs a phone. | (none) | |
| No page scroll / pull-to-refresh during play | UNSURE | `touch-action: none` and `overscroll-behavior: none` are set, and touchmove is blocked on play and place. Needs a phone to feel it. | (none) | |
| Screen §5.6: landing | PASS | Headline, sub-line, live board, Snap my maze, Pick a photo, Play a sample level above the fold. How to draw, trust line and footer below. | landing-phone.png, landing-phone-full.png | |
| Screen §5.6: lifting | PASS | The clean level on the board, "Here's your level.", Retake + Looks good. The animation itself is UNSURE (row below). | lifting-phone.png | |
| Screen §5.6: lift animation (photo → clean level) | UNSURE | Motion; a still only shows the end state. | lifting-phone.png | |
| Screen §5.6: place | PASS | The instruction, a big board, Back + Ready (disabled until placed). | place-phone.png, place-placed-phone.png | |
| Screen §5.6: play | PASS | The board as big as fits (paper 333 px at 390), the timer, Restart, Close, the hint. | play-phone.png, play-mid-phone.png | |
| Screen §5.6: result (maker) | PASS | The board with the path and the ball in the cup, 0:14.2 + "Nice.", the name field, Dare a friend, Play again, Save story. | result-phone.png, result-phone-full.png | |
| Screen §5.6: intro (friend) | PASS | See the friend intro row. | intro-phone.png | |
| Screen §5.6: result (friend) | PASS | See the won/lost row. | friend-won-phone.png | |
| Screen §5.6: error | PASS | Icon, title, detail, one button, left-aligned in the top third. | error-no-ink-phone.png, error-bad-link-phone.png | |
| Words §5.2 used as written | PASS | Every line matches (landing, lift, start/goal, no-path, tilt ask, touch fallback, Gulp, Nice, name, share texts, friend lines, errors). One addition not in §5.2: the place note "Ready when you are. Tap to move either one." (see Aesthetic, item 22). | landing-phone.png, place-placed-phone.png, friend-*.png, error-*.png | |
| Story to §5.5 | PASS | It has the title, time, board, path, start and goal, the address inside the safe zone, and the file name pattern. The board takes about 49% of the height, not 70%; DESIGN §8 overrides that on purpose. | story-maker.jpg, story-friend.jpg | |
| One-handed use, big buttons | PASS | Primary and secondary buttons are 56 px tall and full width. Place and lifting keep their buttons at the bottom of the screen. Restart and Close on play are 44 px icons in the top corners, which are hard for a thumb, but they're rarely needed. | result-phone.png, place-phone.png, play-phone.png | |
| Small phone 360×640 | PASS | No sideways scroll (360). Ball (grey, shiny), holes (matte black), brass cup and navy walls are all distinct. On the landing, only Snap my maze is above the fold. | landing-small.png, place-small.png, play-small.png | |
| Laptop 1280×800 | PASS | A centred 440 px column, and the board fills the height on play. | landing-laptop.png, play-laptop.png, result-laptop.png, intro-laptop.png | |
| Speed: photo → level under 2 s on mid-range Android | UNSURE | 1.9 s including the animation on this PC (headless). The phone is unknown. | pc-maker-lifted.png | |
| Link opening from a WhatsApp / Instagram DM | UNSURE | Needs a deploy and a phone. | (none) | |

**Function totals: 35 PASS · 2 FAIL · 18 UNSURE** (55 rows).

---

## Aesthetic review

### DESIGN.md §10 checklist

| # | Item | PASS / FAIL | Evidence |
|---|---|---|---|
| 1 | The drawing is the largest element on place, play, intro and result, and above the fold on the landing | PASS | place-phone, play-phone, intro-phone, result-phone, landing-phone |
| 2 | Play paper ≥ 330 px at 390 | PASS | 333 px (page check); play-phone |
| 3 | No more than 3 typefaces | PASS | Computed on the result screen: Iowan/Palatino serif, system-ui, Caveat only; result-phone |
| 4 | Tabular lining numerals, no timer jitter | PASS | Timer and result time both compute `lining-nums tabular-nums`; play-mid-phone, result-phone |
| 5 | Only ink-blue buttons, one primary per screen, no brass or wood on buttons | PASS | Every screen has exactly one filled navy pill. The brass-soft tag is not a button. result-phone, friend-won-phone, lifting-phone |
| 6 | Wood: grain lines, mitred corners, four brass screws with angled slots, no bitmaps | PASS | Grain and mitres are clear at laptop/story size (play-laptop, story-maker.jpg). At 390 the screws are 3 px dots, so the slots can't be seen (expected). |
| 7 | Paper has subtle tooth + vignette, not flat white | PASS | Visible speckle on every board; story-maker.jpg |
| 8 | Ball: fixed top-left highlight, horizon band, warm shadow, clearly steel | PASS | play-laptop (clear band and highlight), play-mid-phone |
| 9 | Ball vs holes distinguishable at a glance at 390 | PASS | play-mid-phone, play-small: the ball is grey with a white glint, the holes are matte black. The holes' lit lip only shows at laptop size (play-laptop); at 390 they read as clean black dots. |
| 10 | Walls keep the person's ink colour and wobble | PASS | Red stays red and blue stays blue (levels-synthetic). The pencil darkening isn't visible as a problem. The *sample* maze's wobble is mild (see drift 1). |
| 11 | The goal is a brass cup with an engraved line | PASS | play-laptop, story-maker.jpg |
| 12 | Contrast (text ≥ 4.5, game parts ≥ 3) | PASS | Token values; muted small text reads fine on result-phone. "Drag to tilt." at 60% opacity is the faintest text, but it's a hint. |
| 13 | Start marker: dashed ink-blue circle, faint in play | PASS | play-mid-phone (top-left), intro-phone |
| 14 | Path line: one smooth burnt-brass line | PASS | result-after-run-phone (a real run's path, smooth). The dev-shortcut result and story use `physics.route`, which is chamfered and angular (result-phone, story-maker.jpg), but still one brass line. |
| 15 | Finish: settles into the cup, ring gleams once, no confetti / banner | PASS | play-finish-phone: the ball sits in the cup, nothing else. The gleam is motion: UNSURE, real phone. |
| 16 | Hole fall: shrinks and darkens, "Gulp." handwritten, no red flash, no "Game over" | PASS | play-hole.png (test page). Placement drift is noted below. |
| 17 | Reduced motion: nothing scales or slides | PASS | landing-reduced-motion-phone + -b: the board is not rotated and the ball stays still across 1.5 s |
| 18 | Icons from the drawn set, no emoji in the UI | PASS | camera, photo, share, restart, save, pen, play, tilt-phone, finger-drag, back, close all drawn; landing-phone-full, result-phone, tap-to-play-phone |
| 19 | Left-aligned serif headlines, not hero + three cards | PASS | landing-phone-full: "How to draw" is one card with three pictograms in a row, not a three-card grid |
| 20 | Shadows only on the board, cards and the Tap to play card | PASS | Secondary buttons use an inset 1.5 px outline, not a drop shadow (styles.css `.btn-ghost`). |
| 21 | No blur / backdrop-filter, flat scrim | PASS | 0 elements with backdrop-filter; tap-to-play-phone |
| 22 | Caveat never for buttons, body or times, never above ~6 words, never below 1.3rem | **FAIL** | place-placed-phone: "Ready when you are. Tap to move either one." is 9 words of large 2.1rem Caveat over two lines. It reads as body copy in handwriting, which is what the rule forbids. |
| 23 | Story: drawing and time readable at 25%, address inside y ≤ 1540 and 90 px margins | PASS | story-maker.jpg: the time is 112 px (28 px at 25%), the address is at y≈1528 |
| 24 | Always light, footer on landing / results / intro / error | PASS | `color-scheme: light`; landing-phone-full, result-phone-full, intro-phone, error-no-ink-phone |
| 25 | No "level complete", "AI", "magic", "generate", "upload", "process" | PASS | No such words on any screenshot |

**Aesthetic checklist totals: 24 PASS · 1 FAIL · 0 UNSURE** (the finish gleam and the lift motion are in "Needs a real phone").

### "Never" list, every screenshot

**No hits.** I checked every shot for: arcade or pixel fonts, neon or glow, "LEVEL COMPLETE", stars, health or XP bars, glossy 3D buttons, joystick graphics, primary game palettes, purple/blue/pink gradients, glassmorphism, blobs, emoji or sparkles as UI, cartoon outlines, mascots, faces on the ball, centred hero + three cards, drop shadows on everything, more than 3 typefaces, confetti or bounce on everything, and the words "magic", "AI" and "generate". The emoji in the share texts are message text, as PLAN §5.2 allows.

Two near-misses worth knowing about (not FAILs):
- **The "MORE FROM RISHEEK" label** is small caps with wide letter-spacing (landing-phone-full, result-phone-full, error-*). DESIGN §3 says "never uppercase tracking labels". It comes from the shared kit's footer, so it's family, but it's the one SaaS-y touch on the page.
- **The Tap to play scrim** turns the wood and paper a muddy grey-brown (tap-to-play-phone). It matches the approved board-3, but it's the least "nice object" moment on the site.

### Drift from the approved board

1. **The sample maze is not the board's maze.** The board (board-6, board-3) and og-image.png show a **biro-blue** doodle with heavy wobble, overshooting line ends and bowed strokes. The site's sample (`DL.sample.load()`, ink `#1d2340`) is **near-black navy with straighter, grid-aligned walls** (landing-phone, play-phone, intro-phone). It reads more "generated maze" than "doodle from the back of a notebook". The WhatsApp preview (og-image) and the landing now show two different mazes in two different inks.
2. **The story title line breaks in the wrong place.** The board (board-8) has "I drew this." / "**Beat** 0:14.2" (small "Beat" and a big time on one baseline). story-maker.jpg has "I drew this. Beat" / "0:14.2", with "Beat" left hanging at the end of line 1. That's exactly the split the art director fixed in self-critique #7.
3. **"Gulp." sits in the wrong place.** DESIGN §6 says "next to the hole". The site puts it at a fixed spot, centred, 14% down the play stage, which at 390×844 is **above the board** (y 158–216, with the board top at 211; play-gulp-position-phone.png), in text colour. When the ball falls into the bottom-right hole, the word appears ~400 px away from it.
4. **The place screen has a third note** ("Ready when you are. Tap to move either one.") that isn't on the board or in PLAN, set in big Caveat (place-placed-phone).
5. **The dev / page-check path line is angular** (chamfered corners, result-phone, story-maker.jpg) where the board's is a soft curve (board-7, board-8). Real runs are smooth (result-after-run-phone), so this only affects test shots, but a story shared from a very straight run may look like a circuit trace.
6. **The footer is three times longer than on the board.** The board showed 2 siblings; the site shows 6 cards with icon tiles. On the error screens the footer takes ~70% of the screen (error-no-ink-phone, error-bad-link-phone) and reads like an app directory.
7. **The result board is a bit smaller**: about 255 px wide (result-phone) against about 275 px on board-7. Minor.

Palette, type, icons, wood, brass, the ball and the buttons all match the board.

### Gut check: would a 20-year-old screenshot this and send it?

| Screen | Verdict | Why |
|---|---|---|
| landing (landing-phone) | Yes | A little wooden toy with a real steel ball on warm paper is charming and instantly readable. It would be a "yes!" if the sample maze looked hand-drawn in blue biro. |
| lifting (lifting-phone) | Almost | The end frame is clean, but there's a ~130 px dead gap between the board and "Here's your level." The magic is the animation (unverified). |
| place (place-phone) | Almost | Clear and calm. The board floats with ~120 px of empty page above and below, so it feels unfinished. |
| play (play-mid-phone) | Almost | The board looks like a real object, but ~160 px of blank page above and below, and a 19 px ball in 45 px corridors, make it feel small and sparse on a tall phone. |
| tap to play (tap-to-play-phone) | Almost | A nice card, but the grey scrim dulls the wood. |
| maker result (result-phone) | Yes | "0:14.2 *Nice.*" over a framed maze with a brass trail into the cup is the screenshot moment. |
| friend intro (intro-phone) | Yes | "*Rishi* drew you a level." with the name signed in ink feels personal and sendable. |
| friend won (friend-won-phone) | Yes | A bragging line with the two times side by side. |
| friend lost (friend-lost-phone) | Almost | Good, but there's nothing to brag about. "Send it back" sends "Beat 0:16.9, Rishi 👀", a slower time than Rishi's, which reads oddly. |
| by a hair (friend-hair-phone) | Yes | The best line on the site. |
| errors (error-no-ink-phone, error-bad-link-phone) | No (not meant to be sent) | Fine at the top, but the 6-card footer swamps the one button. |
| story (story-maker.jpg, story-friend.jpg) | Almost | The board is gorgeous at full size and the address is clear, but "I drew this. Beat" dangling on line 1, and the empty bottom 20%, look like a layout slip. |
| small phone (play-small, landing-small) | Yes | Everything is legible. |
| laptop (play-laptop) | Yes | The toy at full height looks lovely. |

### Ranked fixes (the 5 that would most improve the look)

1. **Make the sample maze look hand-drawn in blue biro, like the board and og-image.png.** Ink around `#2b3f8f`, the board renderer's wobble, overshoots and bowed strokes (design/board-render.js already has them). It's the landing hero, the "Play a sample level" level and every dev screenshot. Owner: **level-engine** (`sample.js`), with **art-director** sign-off.
2. **Fix the story title** to DESIGN §8: "I drew this." on line 1, then "Beat" (64 px) + the time (112 px) on one baseline on line 2. The friend version is fine. Owner: **game-builder** (`story.js`).
3. **Put "Gulp." next to the hole the ball fell into**: position it from the hole's x/y on the board, ink-blue Caveat, a slight rotation, clamped inside the paper. Owner: **site-builder** (the `#gulp` element, using the hole position from the game's `hole` event; **game-builder** to include x/y in the event if it doesn't already).
4. **Use the dead vertical space on play / place / lifting** (about 120–160 px above and below the board at 390×844). For example, sit the board right under the top bar or instruction and let the hint and buttons follow it, or (art-director call) let the frame grow taller on tall phones. Owner: **art-director** to decide, **site-builder** to build.
5. **Tidy two copy and layout slips.** (a) Replace the place note with ≤ 6 Caveat words, or move it to small sans (e.g. *"Tap either one to move it."*). (b) On the error screens, trim the footer (2–3 siblings or a single "More from Risheek" link) so the one button stays the hero. Owner: **site-builder** (b may need an **art-director** / kit decision).

---

## Other problems

- **Pencil lift breaks walls into dashes** (synthetic pencil case: 36 strokes and 236 pieces, with long walls missing in the vector level). If Rishi's real pencil or light-pen photos do the same, friends will get mazes with holes in the walls that the maker never drew. The path check passes, so nothing warns the maker. Owner: **level-engine**. Recheck on real photos at M1.
- **The ball radius is clamped at the 28 L maximum on every synthetic maze** (corridors 114–158 L, so 30% would be 34–47). On a phone that's a ~19 px ball in ~45 px corridors (play-mid-phone). DESIGN already flagged this ("consider raising the clamp to ~34 L"). Decide after real photos: **level-engine / game-builder**.
- **The friend lost → "Send it back" text** reads "Beat 0:16.9, Rishi 👀" even when the friend was slower than Rishi. That's literally PLAN's wording, but it challenges the maker to beat a time they already beat. Consider "Your turn, Rishi 👀" for the lost case (Rishi's call; it's a §5.2 change).
- **On the levels test page, the "landscape" case puts the default start ball on top of a hole** (levels-synthetic.png). Test page only; the real place screen snaps the start.
- **On the small phone (360×640) only "Snap my maze" is above the fold** on the landing (landing-small). That's acceptable (DESIGN targets 390×844), but "Pick a photo" sits just under the fold.
- **The ui-verifier's screenshot recipe** (`msedge --headless=new --window-size=390,844 --screenshot`) gives a ~500 px wide layout and cut-off screens. Switch the agent file to the CDP / device-emulation method (as tests/page-check.js does). Owner: main session (agent file).

---

## Needs a real phone

Deploy (HTTPS) first: tilt only works on HTTPS. Then on an **iPhone (Safari)** and an **Android phone (Chrome)**:

1. **Real maze photos (M1):** draw at least 4 mazes (blue biro, black pen, pencil, one with filled dots, one on lined paper), put them in `tests/real/`, open `http://localhost:8000/tests/levels.html?set=real` on the PC and check each row: lines kept, notebook lines gone, gaps kept, dots → holes, ball size, link under 2,000 characters.
2. **Snap my maze:** tap it. The camera app should open directly (no permission screen). Take a photo; the lift should take under 2 s.
3. **Lift animation:** watch the photo wash to clean paper, the ink rise, and the frame close around it (about 1.4 s, no jank).
4. **No-path message:** place the start and goal in two closed-off areas of a maze. Check for the red sentence, the soft red smudge on the board, and that Ready stays disabled.
5. **iPhone tilt permission:** open a sample level. "Tap to play" should appear, then the iOS motion prompt; allow it. Tilt: the ball should roll. Also deny it once: "Drag to tilt." should take over.
6. **Ball feel:** play for 2 minutes. Does the ball feel heavy, roll, and stop against walls (not floaty or twitchy)? Lie on a bed and check that the starting angle becomes "flat".
7. **Click and vibration:** hit a wall fast. There should be a soft click (both phones) and a tiny buzz (Android only).
8. **Hole + "Gulp.":** roll into a hole. Check the shrink and darken, where "Gulp." appears, and the respawn at the start with the timer still running.
9. **Finish gleam:** reach the cup. The ball should settle, and one light should travel once round the brass ring.
10. **Restart and Close:** tap Restart mid-run (the timer resets and the ball drops again), then Close (back to the previous screen). Can your thumb reach them one-handed?
11. **Best time:** play your level twice, slower the second time. The result and the link should keep the faster time.
12. **Wake Lock:** play without touching the screen for longer than the phone's sleep timeout. The screen should stay on.
13. **No scroll / pull-to-refresh:** drag hard downward on the play and place screens. The page must not move or reload.
14. **Dare a friend:** tap it. The share sheet should open with "I drew you a level. Beat 0:14 👇" and the link. Send it on WhatsApp and in an Instagram DM. The preview should show og-image.png and "Draw a Level".
15. **Open the link from the DM** on the other phone (inside WhatsApp's and Instagram's in-app browsers): intro → Play → tilt or drag → friend result → Send it back → it comes back with the new name and time.
16. **Save story:** tap it on both phones. iPhone should open the share sheet with "Save Image"; Android should download or share. Open the JPEG: is the address readable, and does it look good as an Instagram story (nothing under the top or bottom UI)?
17. **Desktop controls:** on a laptop, play the sample with the arrow keys / WASD and with a mouse drag.
18. **Analytics:** after the deploy, open the site and check that the visit appears in Vercel Web Analytics.
19. **Speed:** on a mid-range Android, check photo → level in under 2 s and that play stays smooth (60 fps; `tests/play.html` shows the fps).
