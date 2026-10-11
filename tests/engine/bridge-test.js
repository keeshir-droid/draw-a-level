// Pen-lift gaps: dashed walls are joined, real doorways stay open.
//   node tests/engine/bridge-test.js
// 1. DL.vectorize._internals.bridgeGaps on hand-made pieces (fast).
// 2. The lift on synthetic photos, checked against where the walls really are (DL.sample.photo(...).truth):
//    faint pencil walls must come out whole (no break the ball could roll through), the messy maze's small
//    pen-lift gaps are joined, and the same gaps drawn doorway-wide stay open.
// Synthetic photos only catch regressions. Rishi's real photos (tests/real/) are the real test.
const { DL, check, done } = require("./load.js");
const bridge = DL.vectorize._internals.bridgeGaps;
const polyLength = DL.vectorize._internals.polyLength;

function piece(pts, width, opts) {
  opts = opts || {};
  return { pts: pts, width: width || 7, len: polyLength(pts), freeA: opts.freeA !== false, freeB: opts.freeB !== false, closed: false };
}
// distance from (x, y) to the nearest wall's edge (negative = inside the ink)
function clearance(walls, x, y) {
  let best = Infinity;
  walls.forEach(function (w) {
    const p = w.pts.length >= 4 ? w.pts : w.pts.concat(w.pts);
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], ay = p[i + 1], dx = p[i + 2] - ax, dy = p[i + 3] - ay, l2 = dx * dx + dy * dy;
      let t = l2 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(ax + t * dx - x, ay + t * dy - y) - w.width / 2;
      if (d < best) best = d;
    }
  });
  return best;
}

(async function () {
  // ---- 1. bridgeGaps on its own (ball radius 28: a gap must be under ~50 units of paper to be joined) ----
  const R = 28;
  // a dashed line: 12 dashes of 22 units with 14-unit gaps, plus loose dots in line
  const dashes = [];
  for (let k = 0; k < 12; k++) { const x = 100 + k * 36; dashes.push(piece([x, 300 + (k % 2), x + 11, 300, x + 22, 301 - (k % 2)], 7)); }
  dashes.push(piece([100 + 12 * 36 + 14, 300, 100 + 12 * 36 + 14, 300], 6)); // a dot carrying the line on
  dashes.push(piece([100 + 12 * 36 + 36, 300, 100 + 12 * 36 + 60, 300], 7));
  let out = bridge(dashes, R);
  check("dashed line (14 dashes and a dot) -> one stroke", out.length === 1, out.length + " strokes");
  // a doorway the ball fits through: 70 units of paper between two collinear walls
  out = bridge([piece([100, 500, 300, 500]), piece([377, 500, 600, 500])], R);
  check("doorway 70 units (ball 56 wide) stays open", out.length === 2);
  // a pen lift the ball can't pass: 30 units
  out = bridge([piece([100, 500, 300, 500]), piece([337, 501, 600, 500])], R);
  check("pen lift 30 units -> joined", out.length === 1);
  // a pen lift right at the limit: 49 units joined, 52 units stays (90% of the ball's 56)
  out = bridge([piece([100, 500, 300, 500]), piece([356, 500, 600, 500])], R);
  check("gap 49 units -> joined", out.length === 1, out.length + "");
  out = bridge([piece([100, 500, 300, 500]), piece([359, 500, 600, 500])], R);
  check("gap 52 units -> stays", out.length === 2, out.length + "");
  // two walls at a right angle with a 30-unit gap: not in line, not joined
  out = bridge([piece([100, 500, 300, 500]), piece([330, 540, 330, 800])], R);
  check("corner gap 30 units, not in line -> stays", out.length === 2);
  // side by side, parallel, offset sideways (a corridor end): not joined
  out = bridge([piece([100, 500, 300, 500]), piece([320, 540, 600, 540])], R);
  check("parallel walls 40 apart -> stay apart", out.length === 2);
  // a junction end is not a free end
  out = bridge([piece([100, 500, 300, 500], 7, { freeB: false }), piece([320, 500, 600, 500])], R);
  check("an end at a junction is never bridged", out.length === 2);
  // dust in a doorway: one speck 30 units from a wall end, the other wall 120 away: the doorway stays passable
  out = bridge([piece([100, 500, 300, 500]), piece([337, 500, 337, 500], 6), piece([460, 500, 700, 500])], R);
  const open = clearance(out.filter(function (s) { return s.len >= 12; }), 360, 500);
  check("dust in a doorway does not narrow it below the ball", open >= R, "clearance " + open.toFixed(1));
  // a smaller ball (dense maze): the same 40-unit gap is now a doorway
  out = bridge([piece([100, 500, 300, 500]), piece([347, 500, 600, 500])], 18);
  check("ball 18: a 40-unit gap stays open", out.length === 2);

  // ---- 2. the lift, against the truth ----
  function toLevel(map, x, y) {
    const u = x - map.crop.x, v = y - map.crop.y;
    if (!map.rotated) return [u * map.scale + map.ox, v * map.scale + map.oy];
    return [(map.ch - v) * map.scale + map.ox, u * map.scale + map.oy];
  }
  async function lift(opts) {
    const img = DL.sample.photo(opts);
    const res = await DL.lift.fromImage(img);
    return { img: img, L: res.level, info: res.info };
  }

  // 2a. faint pencil: every wall the person drew is there, with no break wider than the ball
  {
    const r = await lift(DL.sample.CASES.pencil);
    const L = r.L, map = r.info.map;
    let n = 0, covered = 0, worstRun = 0;
    r.img.truth.runs.forEach(function (run) {
      const len = Math.hypot(run[2] - run[0], run[3] - run[1]), steps = Math.ceil(len / 6);
      let gapStart = -1, worst = 0;
      for (let k = 0; k <= steps; k++) {
        const t = k / steps, p = toLevel(map, run[0] + (run[2] - run[0]) * t, run[1] + (run[3] - run[1]) * t);
        const ok = clearance(L.walls, p[0], p[1]) <= 10; // the wall passes within 10 units of where it was drawn
        n++; if (ok) covered++;
        if (!ok && gapStart < 0) gapStart = t * len;
        if ((ok || k === steps) && gapStart >= 0) { worst = Math.max(worst, t * len - gapStart); gapStart = -1; }
      }
      worstRun = Math.max(worstRun, worst * map.scale);
    });
    const cov = covered / n;
    console.log("  pencil: " + L.walls.length + " strokes, " + r.info.pieces + " ink pieces, ballR " + L.ballR + ", link " + r.info.linkLength + ", bridged " + r.info.stats.bridged);
    check("pencil: 98% of the drawn walls are walls", cov >= 0.98, (100 * cov).toFixed(1) + "%");
    check("pencil: no break in a wall the ball could pass", worstRun < 2 * L.ballR, "longest break " + worstRun.toFixed(0) + " units, ball " + 2 * L.ballR);
    check("pencil: a handful of strokes, not dashes", L.walls.length <= 20, L.walls.length + " strokes (was 36)");
  }

  // 2b. messy: its 4 small pen-lift gaps (14 px in the photo, ~8 units of paper, far under the ball) are joined
  // 2c. the same maze with the 4 gaps drawn doorway-wide (85 px, ~78 units of paper, wider than the ball) keeps them
  for (const variant of [{ name: "messy", gapW: 0.012, open: false }, { name: "messy, doorway-wide gaps", gapW: 0.07, open: true }]) {
    const r = await lift(Object.assign({}, DL.sample.CASES.messy, { gapW: variant.gapW }));
    const L = r.L, map = r.info.map, T = r.img.truth, gaps = T.gaps;
    const cl = gaps.map(function (g) { const p = toLevel(map, g[0], g[1]); return clearance(L.walls, p[0], p[1]); });
    // a gap that happens to fall where another wall meets this one (a T) is not a doorway: skip it
    const atJunction = gaps.map(function (g) {
      return T.runs.some(function (run) {
        const dx = run[2] - run[0], dy = run[3] - run[1], l2 = dx * dx + dy * dy;
        if (Math.abs((dx * g[2] + dy * g[3]) / Math.sqrt(l2)) > 0.5) return false; // runs along the same line
        let t = ((g[0] - run[0]) * dx + (g[1] - run[1]) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        return Math.hypot(run[0] + t * dx - g[0], run[1] + t * dy - g[1]) < T.gapPx / 2 + T.width;
      });
    });
    console.log("  " + variant.name + ": " + L.walls.length + " strokes, ballR " + L.ballR + ", gap clearances " + cl.map(function (c, i) { return c.toFixed(0) + (atJunction[i] ? " (at a T)" : ""); }).join(", ") + ", bridged " + r.info.stats.bridged);
    check(variant.name + ": 4 gaps drawn", gaps.length === 4, gaps.length + "");
    const doors = cl.filter(function (c, i) { return !atJunction[i]; });
    if (variant.open) check(variant.name + ": every doorway still lets the ball through", doors.length >= 3 && doors.every(function (c) { return c >= L.ballR; }), doors.length + " doorways, clearances " + doors.map(function (c) { return c.toFixed(0); }).join(", ") + " (ball radius " + L.ballR + ")");
    else check(variant.name + ": every pen-lift gap is joined", cl.every(function (c) { return c <= 2; }), cl.map(function (c) { return c.toFixed(0); }).join(", "));
    DL.level.autoPlace(L);
    check(variant.name + ": still a path start -> goal", DL.level.pathCheck(L).ok);
  }
  done();
})();
