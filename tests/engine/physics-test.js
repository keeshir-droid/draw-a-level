/* Physics tests (game-builder). Run: node tests/engine/physics-test.js
   1 no tunnelling  2 rest without jitter  3 holes (fall / skim)  4 autoplay deterministic  5 speed */
"use strict";
const path = require("path");
const fs = require("fs");
const ROOT = path.join(__dirname, "..", "..");
const load = (f) => { const p = path.join(ROOT, f); if (fs.existsSync(p)) { require(p); return true; } return false; };
load("src/engine/util.js");
load("src/engine/palette.js");
const hasSample = ["src/engine/level.js", "src/engine/sample.js"].map(load)[1];
load("src/engine/physics.js");
const DL = globalThis.DL;
const PH = DL.physics, P = DL.PHYSICS;
const STAND_IN = require("./physics-level.js");

let fails = 0;
function check(name, ok, info) {
  console.log((ok ? "PASS " : "FAIL ") + name + (info ? "  (" + info + ")" : ""));
  if (!ok) fails++;
}
function lvl(extra) {
  return Object.assign({ v: 1, w: 1000, h: 1000, ink: "#1d2340", ballR: 18, walls: [], fills: [], holes: [], start: { x: 100, y: 100 }, goal: null, challenge: null }, extra);
}
function play(w) { w.phase = "play"; w.phaseT = 0; w.time = 0; }
function settleTilt(w, tx, ty) { w.tx = tx; w.ty = ty; }

// ---- 1. no tunnelling: max speed at a thin wall (width 6) from 200 angles, small and big balls
{
  let crossed = 0, runs = 0, worst = 0;
  for (const R of [10, 18, 28]) {
    for (const side of [-1, 1]) {
      for (let i = 0; i < 100; i++) {
        const ang = (-80 + (160 * i) / 99) * Math.PI / 180;
        const L = lvl({ ballR: R, walls: [{ pts: [500, 0, 503, 330, 497, 660, 500, 1000], width: 6 }] });
        const w = PH.create(L);
        play(w);
        w.x = 500 - side * (R + 3 + 40); w.y = 500;
        const vmax = P.maxSpeed * w.k;
        w.vx = side * Math.cos(ang) * vmax; w.vy = Math.sin(ang) * vmax;
        settleTilt(w, side, 0);
        runs++;
        for (let s = 0; s < 120; s++) {
          PH.step(w, side, 0);
          const pen = side > 0 ? w.x - 500 : 500 - w.x; // > 0 means the centre is past the wall line
          if (pen > worst) worst = pen;
          if (pen > 0) { crossed++; break; }
        }
      }
    }
  }
  check("no tunnelling: " + runs + " shots at max speed into a width-6 wall (ballR 10/18/28)", crossed === 0, "crossed " + crossed);

  // a diagonal thin wall and a thin filled triangle
  let bad = 0;
  for (let i = 0; i < 200; i++) {
    const ang = (i / 200) * Math.PI * 2;
    const L = lvl({ ballR: 10, walls: [{ pts: [0, 0, 1000, 1000], width: 6 }] });
    const w = PH.create(L); play(w);
    // start below the diagonal (y > x side), fire in every direction at max speed with tilt the same way
    w.x = 300; w.y = 420;
    const vmax = P.maxSpeed * w.k;
    w.vx = Math.cos(ang) * vmax; w.vy = Math.sin(ang) * vmax;
    for (let s = 0; s < 240; s++) {
      PH.step(w, Math.cos(ang), Math.sin(ang));
      if (w.y - w.x < 0) { bad++; break; }
    }
  }
  check("no tunnelling: 200 angles against a diagonal width-6 wall, full tilt for 2 s", bad === 0, "crossed " + bad);
}

// ---- 2. comes to rest against a wall under constant tilt (no jitter beyond 0.1 over 2 s)
{
  const cases = [
    ["vertical stroke", { walls: [{ pts: [600, 0, 600, 1000], width: 8 }] }, 0.6, 0, 400, 500],
    ["wobbly stroke, diagonal tilt into a corner", { walls: [{ pts: [600, 0, 604, 300, 597, 600, 600, 1000], width: 8 }, { pts: [0, 700, 1000, 700], width: 10 }] }, 0.5, 0.5, 300, 400],
    ["board edge", {}, 0, 1, 500, 500],
    ["filled polygon", { fills: [{ pts: [550, 300, 800, 300, 800, 700, 550, 700] }] }, 0.7, 0, 300, 500],
    ["slight tilt along a wall (below rolling resistance)", { walls: [{ pts: [600, 0, 600, 1000], width: 8 }] }, 0.6, 0.015, 400, 500]
  ];
  for (const [name, extra, tx, ty, x, y] of cases) {
    const w = PH.create(lvl(extra)); play(w);
    w.x = x; w.y = y;
    for (let s = 0; s < 2 * P.hz; s++) PH.step(w, tx, ty);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let s = 0; s < 2 * P.hz; s++) {
      PH.step(w, tx, ty);
      x0 = Math.min(x0, w.x); x1 = Math.max(x1, w.x); y0 = Math.min(y0, w.y); y1 = Math.max(y1, w.y);
    }
    const j = Math.max(x1 - x0, y1 - y0);
    check("rest: " + name, j <= 0.1 && w.events.filter((e) => e.type === "wall").length < 3, "moved " + j.toFixed(4) + " units over 2 s at (" + w.x.toFixed(1) + "," + w.y.toFixed(1) + ")");
  }
}

// ---- 3. holes
{
  const H = { x: 500, y: 500, r: 26 };
  function roll(offset, speed, tilt) {
    const w = PH.create(lvl({ holes: [H] })); play(w);
    w.x = 200; w.y = H.y + offset; w.vx = speed; w.vy = 0;
    let fell = false;
    for (let s = 0; s < 2 * P.hz && !fell; s++) {
      PH.step(w, tilt, 0);
      if (w.events.some((e) => e.type === "hole")) fell = true;
      if (w.x > 800) break;
    }
    return fell;
  }
  check("hole: rolling straight over it (slow tilt) falls", roll(0, 0, 0.25) === true);
  check("hole: fast through the middle still falls", roll(0, P.maxSpeed, 1) === true);
  check("hole: centre inside r - 0.2R (offset r - 0.3R) falls", roll(H.r - 0.3 * 18, 300, 0.2) === true);
  check("hole: skimming the rim (centre just outside r) rolls past", roll(H.r + 1, 400, 0) === false);
  check("hole: skimming the rim (offset -1) rolls past", roll(-(H.r + 1), 600, 0.1) === false);
  // after a hole the ball comes back at the start and the timer keeps running
  const w = PH.create(lvl({ holes: [H], start: { x: 100, y: 500 } })); play(w);
  w.x = 492; w.y = 500;
  let back = false;
  const t0 = w.time;
  for (let s = 0; s < 3 * P.hz; s++) { PH.step(w, 0, 0); if (w.phase === "play" && Math.hypot(w.x - 100, w.y - 500) < 1 && s > 10) { back = true; break; } }
  check("hole: ball returns to start, timer kept running", back && w.time > t0 + 0.9, "time " + w.time.toFixed(2) + " s");
}

// ---- 4. autoplay reaches the goal, deterministic (also across frame rates)
function autoRun(level, frameDt) {
  const w = PH.create(level);
  const pilot = PH.autopilot(w);
  if (!pilot.route) return { route: false };
  let frames = 0, holes = 0, walls = 0;
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  while (w.phase !== "done" && w.time < 120 && frames < 200000) {
    const dt = frameDt === "jitter" ? 0.008 + rnd() * 0.03 : frameDt;
    PH.advance(w, dt, pilot);
    for (const e of w.events) { if (e.type === "hole") holes++; if (e.type === "wall") walls++; }
    w.events.length = 0;
    frames++;
  }
  return { route: true, done: w.phase === "done", time: w.time, steps: w.steps, holes, walls };
}
const levels = [["stand-in level", STAND_IN]];
if (hasSample && DL.sample && DL.sample.load) levels.unshift(["DL.sample.load()", DL.sample.load()]);
else console.log("note: src/engine/sample.js not present yet; autoplay checked on the stand-in level only");
for (const [name, L] of levels) {
  const a = autoRun(L, 1 / 60), b = autoRun(L, 1 / 60), c = autoRun(L, "jitter"), d = autoRun(L, 1 / 120);
  check("autoplay on " + name + ": finds a route", a.route);
  if (!a.route) continue;
  check("autoplay on " + name + ": reaches the goal", a.done, "time " + a.time.toFixed(3) + " s, holes " + a.holes + ", wall clicks " + a.walls);
  check("autoplay on " + name + ": same time every run (60 fps, jittery fps, 120 fps)",
    a.time === b.time && a.time === c.time && a.time === d.time, [a.time, b.time, c.time, d.time].map((t) => t.toFixed(4)).join(" / "));
}

// ---- 5. speed: 10,000 steps on the sample level
for (const [name, L] of levels) {
  const w = PH.create(L); play(w);
  let ang = 0;
  // warm up the JIT, then time
  for (let s = 0; s < 2000; s++) { ang += 0.004; PH.step(w, Math.cos(ang), Math.sin(ang)); if (w.phase === "done") { PH.reset(w); play(w); } }
  const t0 = process.hrtime.bigint();
  for (let s = 0; s < 10000; s++) {
    ang += 0.004;
    PH.step(w, Math.cos(ang), Math.sin(ang));
    w.events.length = 0;
    if (w.phase === "done") { PH.reset(w); play(w); }
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  check("speed: 10,000 steps on " + name + " under 50 ms", ms < 50, ms.toFixed(1) + " ms = " + (ms / 10000 * 1000).toFixed(2) + " us/step");
  const t1 = process.hrtime.bigint();
  PH.route(L);
  console.log("      route() on " + name + ": " + (Number(process.hrtime.bigint() - t1) / 1e6).toFixed(1) + " ms");
}

// ---- 6. the tilt curve and the pose maths (input.js)
{
  load("src/engine/input.js");
  const T = PH.tiltFromDeg;
  const a = T(1.9, 0), b = T(25, 0), c = T(60, 0), d = T(13.5, 0), e = T(0, -25);
  check("tilt: inside the 2 degree dead zone is still", a.x === 0 && a.y === 0);
  check("tilt: full at 25 degrees, capped beyond", Math.abs(b.x - 1) < 1e-9 && Math.abs(c.x - 1) < 1e-9);
  check("tilt: half way is gentler than linear (fine control)", d.x > 0.3 && d.x < 0.5, d.x.toFixed(3));
  check("tilt: direction kept (up)", e.y === -1 && e.x === 0);
  const pose = DL.input._pose;
  const p1 = pose(10, 0), p2 = pose(0, 10), p3 = pose(40, 10);
  check("pose: raising the top edge 10 degrees = pitch 10, roll 0", Math.abs(p1.pitch - 10) < 1e-9 && Math.abs(p1.roll) < 1e-9);
  check("pose: right edge down 10 degrees = roll 10", Math.abs(p2.roll - 10) < 1e-9 && Math.abs(p2.pitch) < 1e-9);
  check("pose: held at 40 degrees, roll still reads 10", Math.abs(p3.roll - 10) < 1e-9, "pitch " + p3.pitch.toFixed(2));
}

console.log(fails ? "\n" + fails + " FAILED" : "\nall passed");
process.exitCode = fails ? 1 : 0;
