# HANDOFF: building Draw a Level (Day 8)

## Before you start (Rishi)

1. **Draw and photograph your mazes** (at least 4) and put them in `tests/real/`. Its README says exactly which ones: neat, messy, a notebook page, and one with filled-dot holes. The build stops at M1 without them, because these photos are the real test.
2. **Open a new Claude Code session in this folder:** `C:\creative technologist projects\draw-a-level`. The six agents in `.claude/agents/` only load when the session opens here.
3. **Start the local server** in a separate terminal and leave it running. Stop any other project's server on port 8000 first.
   ```bash
   cd "C:\creative technologist projects\draw-a-level"
   ```
   ```bash
   python -m http.server 8000
   ```
4. **The look comes first.** The art director designs it before anything is built. You'll approve it twice: first the concept (DESIGN.md), then the design board.
5. **One download to approve:** the fonts the art director picks.
6. **Tilt needs HTTPS.** Over home Wi-Fi (`http://<PC IP>:8000`) you can test the camera, the lift and the touch controls, but not tilting. So at M1 the session will ask to make an early, unannounced Vercel deploy so you can feel the ball on your phone.
7. **Defaults I chose for you (say so in the new session if you want them changed):** the name *Draw a Level* (`draw-a-level.vercel.app`, free), filled dots are holes, and the maker has to finish their own level once before sending it.
8. Paste the prompt below into the new session.

---

## The prompt to paste

```
You are the main session building Draw a Level, Day 8 of my 21 Days of Creative Tech. Everything is planned. Your job is to coordinate the build with the agents in .claude/agents/ and get it right the first time.

Read first, fully: PLAN.md (the single source of truth), .claude/agents/README.md (the agents and the order), ../shared-kit/README.md (the family kit we copy from), and the root ../CLAUDE.md (project-wide rules, loaded automatically). Decisions are listed at the top of PLAN.md. Don't reopen them.

How to run the build:
- Check tests/real/ has my maze photos (see its README). Open each with Read and tell me in one line each what you see. If it's empty, remind me and start M0 meanwhile, but don't start M1 without them.
- M0 is the look, and nothing visual is built before it (PLAN.md §8). Run the art-director step 1 (DESIGN.md). Show me the concept, palette, fonts and any proposed PLAN changes in plain English and wait for my go. Then show me the font download (family, weights, the github.com/google/fonts ofl/ folder, file names, size) and wait for my okay. Convert/subset to Latin woff2 into fonts/ (check whether Python fontTools is installed; ask before installing anything) and copy Caveat from ../shared-kit/fonts/. Then the art-director step 2 (tokens, palette.js, og-image.png, the board). Show me the board screenshots and wait for my approval.
- The brief every agent holds to: really playful but aesthetic; a real object made with care (the wooden tilt-maze toy, paper, brass, a steel ball); never a cheap mobile game; not AI slop. Our audience doesn't use kiddie or game-UI things.
- M1 (go / no-go): run level-engine (on my real photos) and game-builder (on the sample level) in parallel. Then show me: each real photo next to its clean level, the link length for each, and one real link I can paste into WhatsApp. Then ask my okay for an early, unannounced Vercel preview deploy (git init with the .gitignore here, create keeshir-droid/draw-a-level, push, create the Vercel project "draw-a-level"), so I can feel the tilt on my phone with the sample level and my own mazes via tests/levels.html. Give me a short checklist of what to feel for, and tune DL.PHYSICS from my feedback. Wait for my go before M2/M3.
- Then follow .claude/agents/README.md exactly: M2 + M3 in parallel (game-builder: story and polish; site-builder: every screen) → integrator → ui-verifier (function + aesthetic) → fix loop until both layers are clean → M4 phone test → M5 ship.
- Give each agent a precise task: the milestone, the PLAN.md sections it serves, and what "done" means. Agents don't see this conversation.
- After every agent finishes, read its report and open the key screenshots yourself before telling me it's done. "It passed" isn't proof; look at the actual output.
- Keep the load on my laptop light: one heavy command at a time, never several Edge windows at once, and never start or stop the local server (I run it on port 8000).
- Stay inside this folder. Don't edit ../shared-kit/ or other projects without asking me.
- Ask me before: downloading anything, creating the GitHub repo, pushing, deploying, enabling analytics.
- If an agent's instructions conflict with PLAN.md, PLAN.md wins. Tell me about the conflict.
- Explain things to me in plain English. After each milestone, give me a short update: what works, what I should look at, and what's still unverified.

M4, phone test (deployed, HTTPS, with my okay at each step): a checklist for iPhone Safari and Android Chrome: snap my maze, the lift, place start and goal, play with tilt (and touch if tilt is refused), finish, Dare a friend to WhatsApp, open that link on the other phone, play, Send it back; then the same link opened from an Instagram DM; a broken link; Save story.

Ship (M5, with my okay at each step): Vercel Web Analytics on; README.md with the standard sections from the root CLAUDE.md (including how the link holds the level, in plain words); update the root ../README.md (Day 8 row) and the ../CLAUDE.md "Where we are" table (Day 8 live); ask me before adding Draw a Level to ../shared-kit/footer/siblings.js and the earlier sites' footers; then hand me the remaining checks from VERIFY.md "Needs a real phone".

Start now: confirm the local server answers at http://localhost:8000, check tests/real/, then do M0.
```

---

## What "done" looks like
- See PLAN.md §10.
- **The short version:** on a real phone, draw a maze → snap → tap start and finish → tilt, and the ball rolls through *your* lines → 0:14 → Dare a friend on WhatsApp → your friend opens the link, plays your exact drawing, and sends it back.
- It's live at `draw-a-level.vercel.app` with the footer, and the address is on the story image.
