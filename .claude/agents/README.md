# Build agents for Draw a Level

Six agents build this project. They're Claude Code subagents: each is a Markdown file in this folder, and the main session hands work to them. They load only when the session is opened **inside `draw-a-level/`**.

Compared with Day 7 (Spotted a Cutie): the art-director, site-builder, integrator and ui-verifier carry over (adapted). The engine is split in two, because this project has two hard parts that can be built in parallel:
- **level-engine:** photo → clean level → link
- **game-builder:** the ball, the tilt, the feel

There's no content-writer: the words are few and already written in PLAN.md §5.2.

| Agent | Builds / does | Owns (only edits) | Runs commands? |
|---|---|---|---|
| [`art-director`](art-director.md) | The aesthetic: concept, palette, type, materials (wood, paper, brass, steel ball, holes), icons, motion, every screen, the story image, the OG image, the aesthetic checklist; a design board, self-critiqued | `DESIGN.md`, `design/`, `src/design-tokens.css`, `src/engine/palette.js`, `og-image.png`, `shots/board-*.png` | Board screenshots only |
| [`level-engine`](level-engine.md) | Photo in, ink lift (from Doodle Alive), vectorizing, holes, ball size, start/goal snapping, path check, the link codec, the sample level, export, share; tested on Rishi's real photos | `util, decode, lift, vectorize, level, codec, sample, export, share` in `src/engine/`; `tests/levels.html`; its tests in `tests/engine/` | Node tests, headless Edge screenshots |
| [`game-builder`](game-builder.md) | The physics, tilt and touch input, drawing the board and ball, the run loop and timer, the story image | `physics, input, board, game, story` in `src/engine/`; `tests/play.html`; `tests/engine/physics-*.js` | Node tests, headless Edge screenshots |
| [`site-builder`](site-builder.md) | Every screen, to DESIGN.md and the board | `index.html`, `src/app.js`, `src/styles.css` | No |
| [`integrator`](integrator.md) | Joins everything, runs the checks, fixes function FAILs | Small fixes (not the look); `fonts/` copying; `tests/smoke.js`, `tests/page-check.js`, `tests/cdp.js`; config files | Yes |
| [`ui-verifier`](ui-verifier.md) | Two layers: function (every screen and flow, link round-trips, play) and aesthetic (DESIGN.md's checklist, the "Never" list, drift from the board). Writes VERIFY.md. Never changes code | `VERIFY.md`, `shots/` | Screenshots and curl only |

## The order

1. **Before anything:** Rishi opens the build session inside `draw-a-level/`, starts `python -m http.server 8000` there in his own terminal, and drops his maze photos in `tests/real/` (see its README).
2. **M0, the look:** `art-director` step 1 (DESIGN.md) → **Rishi: go or adjust** → fonts downloaded by the main session with Rishi's okay → `art-director` step 2 (tokens, palette, OG image, board) → **Rishi approves the board.**
3. **M1, in parallel:** `level-engine` (on the real photos) and `game-builder` (on the sample level). Then the main session makes an early HTTPS preview deploy with Rishi's okay, so he can feel the tilt. **Rishi: go / no-go** on the lift, the feel and the link length.
4. **M2 + M3, in parallel:** `game-builder` (story, polish) and `site-builder` (screens).
5. **Join:** `integrator`.
6. **Check:** `ui-verifier` (both layers).
7. **Fix loop until both layers are clean:** function FAILs go to `integrator`; aesthetic FAILs go to `site-builder` (screens) or `game-builder` (board/ball/story), with `art-director` when a fix needs a design decision; lift or link problems go to `level-engine`.
8. **M4 phone test** (deployed, HTTPS), then **M5 ship.** The main session does git, GitHub, Vercel, analytics, README and root updates, always with Rishi's okay.

**Things agents never do:** download or install anything, push, deploy, start or stop the local server, edit outside `draw-a-level/`, or edit `../shared-kit/`.

## How agents work
- Each works in its **own fresh context** and doesn't see the main conversation. Everything it needs is in its file, PLAN.md, DESIGN.md, or the task it's given.
- PLAN.md wins on flow, rules and the contract (§7); DESIGN.md wins on the look. Conflicts are reported, not silently resolved.
