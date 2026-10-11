// The Level object: start/goal snapping, the path check, a short id. Pure array code, runs in Node.
//
// Level (plain data, JSON-safe; PLAN.md section 7.3):
//   { v: 1, w: 1000, h, ink: "#1d2340", ballR, walls: [{ pts: [x0,y0,x1,y1,...], width }],
//     fills: [{ pts: [...] }], holes: [{ x, y, r }], start: { x, y } | null, goal: { x, y } | null,
//     challenge: { name, time } | null }          time is in seconds (one decimal), e.g. 14.2
//
//   DL.level.snap(level, x, y) -> { x, y } | null     nearest spot (cell centre) where the ball fits
//   DL.level.setStart(level, pt) / setGoal(level, pt) -> level   (snapped; the same object, changed, is returned)
//   DL.level.pathCheck(level) -> { ok, blocked?: { x, y } }       blocked = where the ball gets stuck nearest the goal
//   DL.level.id(level) -> string                       short hash of the level, ignoring the challenge
//   DL.level.autoPlace(level) -> level                 start near the drawing's top-left, goal near its bottom-right
//                                                      (for tests/levels.html and dev shortcuts)
//   DL.level.freeGrid(level) -> { cell, nx, ny, free: Uint8Array }   (cached; for the site's "blocked area" hint)
//
// The grid: ~4-unit cells; a cell is blocked when its centre is closer than (stroke width / 2 + ballR) to a wall,
// inside a fill or within ballR of its outline, within ballR of the board edge, or where the ball would fall
// into a hole (centre within r - 0.2 ballR, the physics rule, plus a 2-unit margin).
(function () {
  const DL = (globalThis.DL = globalThis.DL || {});

  const CELL = 4;
  const cache = new WeakMap();

  // A fingerprint of everything the grid depends on (cheap next to building the grid), so a level changed in place
  // never reuses a stale grid.
  function sig(level) {
    let h = 0x811c9dc5;
    function add(v) { h = Math.imul(h ^ (Math.round(v * 8) | 0), 0x01000193) >>> 0; }
    add(level.w || 0); add(level.h || 0); add(level.ballR || 0);
    (level.walls || []).forEach(function (wl) { add(wl.width || 0); add(-1); const p = wl.pts || []; for (let i = 0; i < p.length; i++) add(p[i]); });
    (level.fills || []).forEach(function (f) { add(-2); const p = f.pts || []; for (let i = 0; i < p.length; i++) add(p[i]); });
    (level.holes || []).forEach(function (o) { add(-3); add(o.x); add(o.y); add(o.r); });
    return h + ":" + (level.walls || []).length + ":" + (level.holes || []).length;
  }

  function markSegment(free, nx, ny, ax, ay, bx, by, R) {
    const R2 = R * R;
    const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - R) / CELL)), x1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx) + R) / CELL));
    const y0 = Math.max(0, Math.floor((Math.min(ay, by) - R) / CELL)), y1 = Math.min(ny - 1, Math.ceil((Math.max(ay, by) + R) / CELL));
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    for (let j = y0; j <= y1; j++) {
      const cy = (j + 0.5) * CELL;
      for (let i = x0; i <= x1; i++) {
        const idx = j * nx + i;
        if (!free[idx]) continue;
        const cx = (i + 0.5) * CELL;
        let t = l2 > 0 ? ((cx - ax) * dx + (cy - ay) * dy) / l2 : 0;
        t = t < 0 ? 0 : (t > 1 ? 1 : t);
        const qx = ax + t * dx - cx, qy = ay + t * dy - cy;
        if (qx * qx + qy * qy < R2) free[idx] = 0;
      }
    }
  }

  function freeGrid(level) {
    const c = cache.get(level);
    const s = sig(level);
    if (c && c.sig === s) return c.grid;
    const w = level.w || 1000, h = level.h || 1000, r = level.ballR || 16;
    const nx = Math.ceil(w / CELL), ny = Math.ceil(h / CELL);
    const free = new Uint8Array(nx * ny).fill(1);
    // the board edge
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const cx = (i + 0.5) * CELL, cy = (j + 0.5) * CELL;
      if (cx < r || cy < r || cx > w - r || cy > h - r) free[j * nx + i] = 0;
    }
    (level.walls || []).forEach(function (wl) {
      const p = wl.pts, R = (wl.width || 6) / 2 + r;
      if (p.length === 2) { markSegment(free, nx, ny, p[0], p[1], p[0], p[1], R); return; }
      for (let k = 2; k < p.length; k += 2) markSegment(free, nx, ny, p[k - 2], p[k - 1], p[k], p[k + 1], R);
    });
    (level.fills || []).forEach(function (f) {
      const p = f.pts, n = p.length >> 1;
      if (n < 3) return;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let k = 0; k < n; k++) { x0 = Math.min(x0, p[2 * k]); x1 = Math.max(x1, p[2 * k]); y0 = Math.min(y0, p[2 * k + 1]); y1 = Math.max(y1, p[2 * k + 1]); }
      const i0 = Math.max(0, Math.floor(x0 / CELL)), i1 = Math.min(nx - 1, Math.ceil(x1 / CELL));
      const j0 = Math.max(0, Math.floor(y0 / CELL)), j1 = Math.min(ny - 1, Math.ceil(y1 / CELL));
      for (let j = j0; j <= j1; j++) {
        const cy = (j + 0.5) * CELL;
        for (let i = i0; i <= i1; i++) {
          const cx = (i + 0.5) * CELL;
          let inside = false;
          for (let a = 0, b = n - 1; a < n; b = a++) {
            const ya = p[2 * a + 1], yb = p[2 * b + 1];
            if ((ya > cy) !== (yb > cy)) {
              const xa = p[2 * a], xb = p[2 * b];
              if (cx < xa + (cy - ya) * (xb - xa) / (yb - ya)) inside = !inside;
            }
          }
          if (inside) free[j * nx + i] = 0;
        }
      }
      for (let a = 0, b = n - 1; a < n; b = a++) markSegment(free, nx, ny, p[2 * b], p[2 * b + 1], p[2 * a], p[2 * a + 1], r);
    });
    (level.holes || []).forEach(function (o) {
      const R = Math.max(0, o.r - 0.2 * r) + 2;
      markSegment(free, nx, ny, o.x, o.y, o.x, o.y, R);
    });
    const grid = { cell: CELL, nx: nx, ny: ny, free: free };
    cache.set(level, { sig: s, grid: grid });
    return grid;
  }

  function nearestFree(g, x, y, maxDist, accept) {
    const ci = Math.floor(x / g.cell), cj = Math.floor(y / g.cell);
    const maxR = maxDist == null ? Math.max(g.nx, g.ny) : Math.ceil(maxDist / g.cell);
    if (ci >= 0 && cj >= 0 && ci < g.nx && cj < g.ny && g.free[cj * g.nx + ci] && (!accept || accept(cj * g.nx + ci))) return cj * g.nx + ci;
    // growing square rings; keep the closest by true distance once found
    let best = -1, bestD = Infinity;
    for (let rad = 1; rad <= maxR; rad++) {
      if (best >= 0 && (rad - 1) * g.cell > Math.sqrt(bestD)) break;
      for (let j = cj - rad; j <= cj + rad; j++) {
        if (j < 0 || j >= g.ny) continue;
        const edgeRow = j === cj - rad || j === cj + rad;
        for (let i = ci - rad; i <= ci + rad; i += edgeRow ? 1 : 2 * rad) {
          if (i < 0 || i >= g.nx) continue;
          const idx = j * g.nx + i;
          if (!g.free[idx]) continue;
          const dx = (i + 0.5) * g.cell - x, dy = (j + 0.5) * g.cell - y, d = dx * dx + dy * dy;
          if (d < bestD && (!accept || accept(idx))) { bestD = d; best = idx; }
        }
      }
    }
    return best;
  }
  function cellCentre(g, idx) {
    const j = (idx / g.nx) | 0, i = idx - j * g.nx;
    return { x: Math.round((i + 0.5) * g.cell), y: Math.round((j + 0.5) * g.cell) };
  }

  // Start and goal keep the whole ball off every hole (the path itself may skirt a hole's edge).
  function snap(level, x, y) {
    if (!level || !isFinite(x) || !isFinite(y)) return null;
    const g = freeGrid(level);
    const holes = level.holes || [], r = level.ballR || 16;
    function clearBy(extra) {
      return function (idx) {
        const c = cellCentre(g, idx);
        for (let k = 0; k < holes.length; k++) {
          const o = holes[k], R = o.r + extra;
          if ((c.x - o.x) * (c.x - o.x) + (c.y - o.y) * (c.y - o.y) < R * R) return false;
        }
        return true;
      };
    }
    const any = nearestFree(g, x, y);
    if (any < 0) return null;
    if (holes.length) { // a hole-clear spot if there's one close by (never jump into another part of the maze)
      const a = cellCentre(g, any);
      const win = Math.hypot(a.x - x, a.y - y) + 2 * r;
      const full = nearestFree(g, x, y, win, clearBy(r + 2));        // the whole ball off the hole
      if (full >= 0) return cellCentre(g, full);
      const part = nearestFree(g, x, y, win, clearBy(0.6 * r));      // at least well away from the edge
      if (part >= 0) return cellCentre(g, part);
    }
    return cellCentre(g, any);
  }
  function setStart(level, pt) { level.start = pt ? snap(level, pt.x, pt.y) : null; return level; }
  function setGoal(level, pt) { level.goal = pt ? snap(level, pt.x, pt.y) : null; return level; }

  function pathCheck(level) {
    if (!level || !level.start || !level.goal) return { ok: false };
    const g = freeGrid(level);
    const s = nearestFree(g, level.start.x, level.start.y, 2 * g.cell);
    const t = nearestFree(g, level.goal.x, level.goal.y, 2 * g.cell);
    if (s < 0) return { ok: false, blocked: { x: Math.round(level.start.x), y: Math.round(level.start.y) } };
    if (t < 0) return { ok: false, blocked: { x: Math.round(level.goal.x), y: Math.round(level.goal.y) } };
    if (s === t) return { ok: true };
    const nx = g.nx, ny = g.ny, n = nx * ny;
    const seen = new Uint8Array(n), queue = new Int32Array(n);
    let qh = 0, qt = 0;
    queue[qt++] = s; seen[s] = 1;
    while (qh < qt) {
      const p = queue[qh++];
      if (p === t) return { ok: true };
      const j = (p / nx) | 0, i = p - j * nx;
      if (i > 0 && !seen[p - 1] && g.free[p - 1]) { seen[p - 1] = 1; queue[qt++] = p - 1; }
      if (i < nx - 1 && !seen[p + 1] && g.free[p + 1]) { seen[p + 1] = 1; queue[qt++] = p + 1; }
      if (j > 0 && !seen[p - nx] && g.free[p - nx]) { seen[p - nx] = 1; queue[qt++] = p - nx; }
      if (j < ny - 1 && !seen[p + nx] && g.free[p + nx]) { seen[p + nx] = 1; queue[qt++] = p + nx; }
    }
    // stuck: the reachable spot nearest the goal
    let best = s, bestD = Infinity;
    const gx = level.goal.x, gy = level.goal.y;
    for (let k = 0; k < qt; k++) {
      const c = cellCentre(g, queue[k]), d = (c.x - gx) * (c.x - gx) + (c.y - gy) * (c.y - gy);
      if (d < bestD) { bestD = d; best = queue[k]; }
    }
    return { ok: false, blocked: cellCentre(g, best) };
  }

  // FNV-1a over the level's compact binary (without the challenge) -> 8 base-36 characters
  function id(level) {
    let bytes;
    try { bytes = DL.codec._binary(level, { noChallenge: true }); }
    catch (e) { bytes = new TextEncoder().encode(JSON.stringify([level.h, level.ballR, level.walls, level.fills, level.holes, level.start, level.goal])); }
    let hsh = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) { hsh ^= bytes[i]; hsh = Math.imul(hsh, 0x01000193) >>> 0; }
    let h2 = 0x9747b28c;
    for (let i = bytes.length - 1; i >= 0; i--) { h2 ^= bytes[i]; h2 = Math.imul(h2, 0x5bd1e995) >>> 0; }
    return (hsh.toString(36) + h2.toString(36)).slice(0, 12);
  }

  // Start near the drawing's top-left, goal near its bottom-right (inset by about half a corridor).
  function autoPlace(level) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    (level.walls || []).forEach(function (wl) {
      for (let k = 0; k < wl.pts.length; k += 2) { x0 = Math.min(x0, wl.pts[k]); x1 = Math.max(x1, wl.pts[k]); y0 = Math.min(y0, wl.pts[k + 1]); y1 = Math.max(y1, wl.pts[k + 1]); }
    });
    if (!isFinite(x0)) { x0 = 0; y0 = 0; x1 = level.w; y1 = level.h; }
    const inset = 1.7 * (level.ballR || 16) + 8;
    setStart(level, { x: x0 + inset, y: y0 + inset });
    setGoal(level, { x: x1 - inset, y: y1 - inset });
    return level;
  }

  DL.level = { snap: snap, setStart: setStart, setGoal: setGoal, pathCheck: pathCheck, id: id, autoPlace: autoPlace, freeGrid: freeGrid, CELL: CELL };
})();
