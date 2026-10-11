# Draw a Level

Draw a maze on paper, snap it, and tilt your phone to roll a steel ball through your own drawing. Then dare a friend to beat your time. Made for people who send little handmade things to friends.

**Live:** https://draw-a-level.vercel.app (not deployed yet)

**Demo:** _GIF to add after the phone test._

## The story

Day 8 of 21 Days of Creative Tech. I wanted the old wooden tilt-maze toy, but with a maze you drew yourself in a notebook. Drawing is the physical part, the phone camera brings it in, and the level then travels to a friend inside the link.

## How it works

1. **Snap.** The photo is read on your phone and never uploaded. The page picks out the pen lines from the paper (shadows, ruled lines and a wobbly hand included).
2. **Level.** The lines become walls, filled dots become holes, and the ball is sized to fit your corridors. You tap a start and a finish. The site checks there is a way through.
3. **Play.** Tilt the phone (or drag, if tilt is refused) to roll the ball. Falling in a hole sends it back to the start.
4. **Dare a friend.** The whole level is squeezed into the link itself (about 400 to 1,000 characters), so there is no server and no account. Your friend opens the link, plays your exact drawing, and sends it back with their time.

No AI is used anywhere. The look comes from design and craft: wood, paper, brass and steel drawn in code.

## What broke

- A big hand shadow across the page was mistaken for the table, wiping the ink inside it. Fixed with a paper-colour check.
- Faint pencil broke into dashes the ball could slip through. Fixed by joining small gaps the ball could never fit through anyway.
- A time bug: challenge times were read as tenths instead of seconds, which would have shown times 10 times wrong.
- Not yet tested on real photos or a real phone (see below).

## Limits and next steps

- Tilt and the ball feel need a real phone over HTTPS, so they have not been tried yet. The physics constants are in one block (`DL.PHYSICS`) and `tests/play.html?sample=1&tune=1` has live sliders.
- Older iOS (before 16.4) can't open compressed links made on newer phones.
- Next: a short-link option, leaderboards between friends, more board styles.

## Run it locally

```
python -m http.server 8000
```

Checks: `node tests/smoke.js`, `node tests/page-check.js`.

## Links

Related projects: see the "More from" footer on the site. Reel: _to add_.
