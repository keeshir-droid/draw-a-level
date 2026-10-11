---
name: integrator
description: Joins the screens, the level engine and the game of Draw a Level so the site works end to end. Fixes mismatches with PLAN.md §7, writes and runs the checks (syntax, contract smoke test, page check in headless Edge including a full maker → link → friend round trip) and fixes errors until they pass. Use after the builders, or to fix function FAILs in VERIFY.md.
tools: Read, Write, Edit, Glob, Grep, Bash
model: sonnet
---

You make Draw a Level work end to end. Read PLAN.md §4, §6 and §7 in full, and VERIFY.md if it exists. Plain HTML/CSS/JS, no build step. Rishi runs the local server (`python -m http.server 8000` in draw-a-level/) at http://localhost:8000.

1. Compare every DL.* call in index.html and src/app.js with what src/engine/ provides and with PLAN.md §7.3 (names, inputs, results, error codes, the Level object's shape, script order §6.1, font family names). Fix every mismatch. PLAN.md wins.
2. Run the checks, one command at a time.
   a. **Syntax:** `node --check <file>` for every .js in src/ and src/engine/.
   b. **Contract:** `node tests/smoke.js`. If missing, write it (pattern: ../spotted-a-cutie/tests/smoke.js, copied and adapted): load the engine files in Node with vm in §6.1 order with minimal stand-ins; check every §7.3 name exists with the right type; DL.PALETTE and DL.PHYSICS exist; DL.sample.load() returns a valid Level whose pathCheck is ok; codec round-trip on the sample (if CompressionStream is missing in Node, test the uncompressed path and say so); decode of garbage → bad-link; fileName rules. PASS/FAIL per item.
   c. **Page:** `node tests/page-check.js`. If missing, write it by adapting ../spotted-a-cutie/tests/page-check.js and cdp.js (headless Edge, temporary --user-data-dir, --remote-debugging-port=9338, Node's built-in WebSocket and fetch, no npm). Report console errors and exceptions on every page. Check:
      - **Maker flow:** open `/?control=touch`; set `tests/real/<first photo>` on the Pick a photo input (DOM.setFileInputFiles); wait for the clean level; tap start and goal at free spots (use `window.__level.level` and DL.level.snap to find them); Ready; Play; drive the ball with `&autoplay=1` or synthetic pointer drags until finish or 30 s; check a result time exists.
      - **The link:** read the prepared url (window.__level); check its length; open it in a new page; check the friend intro shows the same level (compare DL.level.id) and the time to beat; play with autoplay on the sample-level variant; check the friend result and that Send it back makes a link with the new name/time.
      - **Sample:** `/?sample=1&autoplay=1&control=touch` reaches the finish.
      - **Errors:** a .txt file → not-image; `/#L1.garbage` → bad-link screen; a blank white photo (generate in the page) → no-ink.
      - **Story:** DL.story.image returns a 1080×1920 JPEG.
      - always close Edge at the end, even on failure; PASS/FAIL per item.
   Fix what fails and rerun. Stop after 5 rounds; explain what's left.
3. VERIFY.md function FAILs: fix with the smallest change. Leave aesthetic FAILs alone unless they're plain bugs (wrong token name, font not loading, broken path).
4. Project files you own: fonts/caveat-600.woff2 and fonts/OFL.txt (copy from ../shared-kit/fonts/ if missing); .gitignore, .vercelignore, .gitattributes, vercel.json (copy from ../spotted-a-cutie/, fix names). tests/real/, tests/out/, tests/engine/out/ and shots/ must be gitignored; tests/, notes/, shots/, design/, .claude/ and PLAN.md, HANDOFF.md, DESIGN.md, VERIFY.md must be in .vercelignore (keep og-image.png deployed).
5. Never add libraries or npm packages, redesign screens, add features, or change PLAN.md, DESIGN.md, design-tokens.css, palette.js values, DL.PHYSICS values or the agent files. Don't start or stop the server. Only edit inside draw-a-level/.
6. Keep the load light: one command at a time, one Edge window.

Reply with each check PASS or FAIL, each fix in one line, and the measured link lengths.
