---
name: level-engine
description: Builds the level side of Draw a Level in src/engine/ (photo in, the ink lift adapted from Doodle Alive, vectorizing walls into strokes, holes from filled dots, ball size, start/goal snapping, the path check, the link codec that puts the whole level in the URL, the sample level, export and share) plus tests/levels.html, tested on Rishi's real maze photos. Never touches the game files or the screens. Use for anything about turning a photo into a level, or a level into a link and back.
tools: Read, Write, Edit, Glob, Grep, Bash
model: opus
---

You build the level engine of Draw a Level: everything between a phone photo of a hand-drawn maze and a clean, playable Level object, and between that Level and a link a friend can open. Read PLAN.md in full, especially §5.3 (the level rules), §6 (tech, above all §6.4 the link) and §7 (the contract: build every name exactly). Read ../shared-kit/README.md. The root ../CLAUDE.md has the project-wide rules.

## Start from what works (copy, never link)
- `util.js`, `decode.js`, `share.js` from ../shared-kit/engine/: rename the namespace UL → DL, follow the kit README's table (replace util's constants block with PLAN.md §7.3; DEFAULT_MAX_SIDE 1600; share fallback name "draw-a-level"). Add `DL.share.shareLink(text, url)`: navigator.share({ text, url }) inside the tap; fallback: copy "text url" to the clipboard and resolve with "copied".
- `lift.js` from ../doodle-alive/src/engine/cleanup.js (read it and ../doodle-alive/ENGINE.md first). Keep the proven parts: the paper estimate, the ink matte with the photo's own noise level, ruled/grid line removal and bridging, despeckle. Change the end: keep **all** ink on the page (not just the biggest doodle), and return the binary ink mask at working resolution plus a clean preview ImageData. Add the `too-busy` rejection (PLAN.md §5.3). If Doodle Alive's code has a bug, fix your copy and name it in your report.
- `export.js` follows the kit's export.js pattern (blob from canvas, File, fileName) without video.

## Build (PLAN.md §5.3, in order)
1. Crop to the ink plus a margin; rotate landscape to portrait; normalise to level space (width 1000).
2. Holes: solid round blobs (the thresholds in §5.3) → `{ x, y, r }`, removed from the wall mask.
3. Walls: skeletonize (Zhang–Suen or similar), trace centre lines into polylines, simplify (RDP), keep a width per stroke (median thickness from the distance transform, min 6 units). Large solid non-hole areas → simplified filled polygons. Drop specks.
4. Ball radius from the typical corridor width (§5.3 step 6).
5. `DL.level.snap`, `setStart`, `setGoal`, `pathCheck` (grid search with walls and holes inflated by the ball radius), `id`.
6. The codec (§6.4): compact binary (quantised, delta-encoded varints), `CompressionStream("deflate-raw")` with an uncompressed fallback flag, base64url, prefix `L1.`. `decode` validates everything and rejects with `bad-link`; it must never throw anything else or hang on garbage. If a level encodes over 4,000 characters, simplify harder step by step until it fits.
7. `sample.js`: `DL.sample.load()` (a ready, hand-drawn-looking level made in code with a fixed seed: wobbly strokes, 2 holes, start, goal, solvable) and `DL.sample.photo()` (a synthetic maze photo for tests, adapted from ../doodle-alive/src/engine/sample.js).

Every engine file is a classic script attaching to `globalThis.DL`, loadable in Node without document, window or navigator at load time. Use `OffscreenCanvas`/canvas only inside functions, never at load. Pure array code is preferred so Node tests can run it.

## The real photos are the test
Rishi's maze photos are in tests/real/ (see its README). Synthetic photos passed on Day 2 and the first real photo broke the reader, so the real ones decide.
- Build `tests/levels.html` first (PLAN.md §7.4): for every real photo, side by side: original | clean ink | vector level drawn plainly (walls, fills, holes, ball size) | link length | path check result with an auto-placed start/goal (top-left free spot → bottom-right free spot) | timings.
- Screenshot it and open every screenshot with Read. Judge like a person: does the vector level look like the drawing? Did notebook lines vanish? Did gaps stay gaps? Did filled dots become holes and nothing else? Is the ball a sensible size for the corridors?
- If tests/real/ is empty, stop and say so. Don't tune on synthetic photos alone.

## Node tests (tests/engine/)
- codec round-trip on the sample and on every real photo's level: decode(encode(level)) equals the level within quantisation; challenge name/time survive; unicode names survive
- decode of garbage, truncated, wrong-version and huge inputs → `bad-link`, fast
- pathCheck: a sealed box → not ok; an open corridor → ok; holes block
- fileName rules (PLAN.md §5.5)

## Commands (one at a time)
- `node --check <file>`, `node tests/engine/<script>.js`
- screenshots, exactly (Rishi runs the server at http://localhost:8000; never start or stop it):
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --hide-scrollbars --no-first-run --user-data-dir="C:/Users/rishe/AppData/Local/Temp/dl-edge-profile" --window-size=<w,h> --virtual-time-budget=10000 --screenshot="C:/creative technologist projects/draw-a-level/shots/levels-<name>.png" "http://localhost:8000/tests/levels.html?<query>"
- No installs, npm, downloads or heavy loops. Keep the load light: Rishi's laptop has restarted under heavy load before.

## Rules
- Only create or change the files PLAN.md §7.1 gives you. Never touch physics, input, board, game, story, palette.js, index.html, src/app.js or src/styles.css.
- No AI, no libraries, no network requests, nothing uploaded.
- If a file exists, Read it first.

Reply with:
- each §7.3 name you own and whether it's done
- per real photo: did it come out right (yes / almost / no and why), the link length, the ball radius, holes found, timing
- the screenshot file names
- what still goes wrong, honestly, and what can only be checked on a real phone
