/* Draw a Level: physics.js (game-builder)
 * The steel ball: fixed 120 Hz step, gravity from a tilt vector, rolling friction,
 * a top speed, circle-vs-capsule walls (each polyline segment with its stroke width),
 * filled polygons, board edges, holes and the goal. Pure: no DOM, loads in Node.
 *
 * Units are level units (width 1000). Tilt vectors are already curved: |t| <= 1.
 *
 *   DL.physics.create(level)            -> world
 *   DL.physics.reset(world)             -> ball back at the start, dropping in
 *   DL.physics.step(world, tx, ty)      -> one fixed step (1/hz s); events go to world.events
 *   DL.physics.advance(world, dt, tiltFn) -> runs whole fixed steps for dt seconds (accumulator)
 *   DL.physics.tiltFromDeg(dx, dy)      -> {x, y}: dead zone + curve, the same for tilt, touch, keys
 *   DL.physics.ballView(world)          -> { x, y, z, s, dark } for DL.board.draw
 *   DL.physics.route(level)             -> [x, y, ...] a comfortable path start -> goal (or null)
 *   DL.physics.autopilot(world)         -> (world) => {x, y}: a deterministic tilt that follows route()
 *
 * world.phase: "drop" (ball falling in, timer stopped) -> "play" -> "falling" (hole) -> "respawn"
 *              (drop at the start, timer running) -> "play" ... -> "goal" (easing in) -> "done"
 * world.time: seconds since the drop landed (simulated, so it is the same on every phone).
 */
(function (root) {
  "use strict";
  const DL = (root.DL = root.DL || {});

  // Every tuning number lives here (the one place to tune). util.js declares DL.PHYSICS with placeholder
  // values first; these replace them on the same object. Motion timings follow DL.PALETTE.motion when present.
  const DEFAULTS = {
    hz: 120,               // fixed physics steps per second
    gravity: 2100,         // units/s^2 at full tilt (maxTiltDeg). Higher = snappier, heavier ball
    friction: 0.9,         // linear damping per second (air + rolling drag). Higher = less floaty
    rollResist: 40,        // constant rolling resistance, units/s^2. Lets a slow ball come to a stop
    restitution: 0.25,     // bounce off walls (0 = dead stop, 1 = superball)
    restThreshold: 40,     // units/s: slower wall hits do not bounce at all (no jitter at rest)
    wallFriction: 0.04,    // fraction of sliding speed lost per wall contact step
    maxSpeed: 1250,        // units/s top speed
    sizeScale: 0.5,        // gravity and maxSpeed scale with (ballR/18)^sizeScale (tiny balls in tight mazes go slower)
    deadZoneDeg: 2,        // degrees of tilt ignored around the start pose
    maxTiltDeg: 25,        // degrees for full gravity
    curve: 1.35,           // tilt response curve exponent (>1 = finer control near level)
    smoothing: 0.07,       // seconds: time constant of the tilt low-pass (higher = heavier, laggier)
    clickSpeed: 120,       // units/s: wall hits faster than this click (sound / vibration)
    holeEdge: 0.2,         // fall when centre is inside hole.r - holeEdge * ballR
    holePull: 900,         // units/s^2 pull toward a hole's centre while the ball is over it
    holeFallMs: 300,       // shrink and darken
    holeHoldMs: 550,       // "Gulp." beat with no ball before it drops in at the start again
    dropMs: 550,           // the first drop at the start (fall + one small bounce)
    dropBounceMs: 170,     //   of which the bounce
    respawnMs: 220,        // the drop after a hole
    goalCatch: 1.0,        // capture when centre within goalCatch * ballR of the goal centre
    goalEaseMs: 260,       // ease into the goal's centre
    pathEveryMs: 50        // path recording interval (game.js)
  };
  const M = DL.PALETTE && DL.PALETTE.motion;
  if (M) {
    if (M.drop) { DEFAULTS.dropMs = (M.drop.fall || 380) + (M.drop.bounce || 170); DEFAULTS.dropBounceMs = M.drop.bounce || 170; }
    if (M.hole) { DEFAULTS.holeFallMs = M.hole.fall || 300; DEFAULTS.holeHoldMs = M.hole.gulpHold || 550; DEFAULTS.respawnMs = M.hole.respawn || 220; }
    if (M.finish && M.finish.ease) DEFAULTS.goalEaseMs = M.finish.ease;
    if (M.wallClickMinSpeed) DEFAULTS.clickSpeed = M.wallClickMinSpeed;
  }
  const P = (DL.PHYSICS = Object.assign(DL.PHYSICS || {}, DEFAULTS));

  const CELL = 64;

  // ---------- geometry index ----------
  function buildIndex(level, ballR, pad) {
    const w = level.w || 1000, h = level.h || 1000;
    const cols = Math.max(1, Math.ceil(w / CELL)), rows = Math.max(1, Math.ceil(h / CELL));
    const segs = []; // flat: ax, ay, bx, by, hw
    const cells = new Array(cols * rows);
    for (let i = 0; i < cells.length; i++) cells[i] = [];
    function addSeg(ax, ay, bx, by, hw) {
      const id = segs.length / 5;
      segs.push(ax, ay, bx, by, hw);
      const m = hw + ballR + pad;
      const c0 = Math.max(0, Math.floor((Math.min(ax, bx) - m) / CELL));
      const c1 = Math.min(cols - 1, Math.floor((Math.max(ax, bx) + m) / CELL));
      const r0 = Math.max(0, Math.floor((Math.min(ay, by) - m) / CELL));
      const r1 = Math.min(rows - 1, Math.floor((Math.max(ay, by) + m) / CELL));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cells[r * cols + c].push(id);
    }
    for (const wl of level.walls || []) {
      const p = wl.pts || [];
      const hw = Math.max(1, (wl.width || 6) / 2);
      if (p.length === 2) addSeg(p[0], p[1], p[0], p[1], hw);
      for (let i = 0; i + 3 < p.length; i += 2) addSeg(p[i], p[i + 1], p[i + 2], p[i + 3], hw);
    }
    const polys = []; // { pts, x0, y0, x1, y1 }
    const pcells = new Array(cols * rows);
    for (let i = 0; i < pcells.length; i++) pcells[i] = [];
    for (const f of level.fills || []) {
      const p = f.pts || [];
      if (p.length < 6) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < p.length; i += 2) {
        x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]);
        y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]);
      }
      const pid = polys.length;
      polys.push({ pts: p, x0, y0, x1, y1 });
      for (let i = 0; i < p.length; i += 2) {
        const j = (i + 2) % p.length;
        addSeg(p[i], p[i + 1], p[j], p[j + 1], 0);
      }
      const c0 = Math.max(0, Math.floor(x0 / CELL)), c1 = Math.min(cols - 1, Math.floor(x1 / CELL));
      const r0 = Math.max(0, Math.floor(y0 / CELL)), r1 = Math.min(rows - 1, Math.floor(y1 / CELL));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) pcells[r * cols + c].push(pid);
    }
    return { w, h, cols, rows, segs: new Float64Array(segs), cells, polys, pcells };
  }

  function cellOf(ix, x, y) {
    let c = Math.floor(x / CELL), r = Math.floor(y / CELL);
    if (c < 0) c = 0; else if (c >= ix.cols) c = ix.cols - 1;
    if (r < 0) r = 0; else if (r >= ix.rows) r = ix.rows - 1;
    return r * ix.cols + c;
  }

  function insidePoly(p, x, y) {
    let inside = false;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // nearest point on a polygon's outline
  function nearestOnPoly(p, x, y, out) {
    let best = Infinity;
    for (let i = 0; i < p.length; i += 2) {
      const j = (i + 2) % p.length;
      const ax = p[i], ay = p[i + 1], bx = p[j], by = p[j + 1];
      const dx = bx - ax, dy = by - ay;
      const L = dx * dx + dy * dy;
      let t = L > 0 ? ((x - ax) * dx + (y - ay) * dy) / L : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + dx * t, py = ay + dy * t;
      const d = (x - px) * (x - px) + (y - py) * (y - py);
      if (d < best) { best = d; out.x = px; out.y = py; }
    }
    return Math.sqrt(best);
  }

  // distance from (x,y) to the nearest obstacle surface (walls, fills, edges); used by route()
  function clearance(ix, x, y) {
    let d = Math.min(x, y, ix.w - x, ix.h - y);
    const S = ix.segs, list = ix.cells[cellOf(ix, x, y)];
    for (let k = 0; k < list.length; k++) {
      const o = list[k] * 5;
      const ax = S[o], ay = S[o + 1], dx = S[o + 2] - ax, dy = S[o + 3] - ay;
      const L = dx * dx + dy * dy;
      let t = L > 0 ? ((x - ax) * dx + (y - ay) * dy) / L : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + dx * t - x, py = ay + dy * t - y;
      const dd = Math.sqrt(px * px + py * py) - S[o + 4];
      if (dd < d) d = dd;
    }
    const pl = ix.pcells[cellOf(ix, x, y)];
    for (let k = 0; k < pl.length; k++) if (insidePoly(ix.polys[pl[k]].pts, x, y)) return -1;
    return d;
  }

  // ---------- world ----------
  function create(level) {
    const ballR = Math.max(4, +level.ballR || 16);
    const k = Math.pow(Math.max(0.5, Math.min(1.6, ballR / 18)), P.sizeScale);
    const w = {
      level, r: ballR, k,
      ix: buildIndex(level, ballR, ballR * 1.5),
      dt: 1 / P.hz,
      x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0,
      phase: "drop", phaseT: 0, time: 0, steps: 0, acc: 0,
      fallFrom: null, holeAt: null, goalFrom: null,
      events: [], lastClick: -1, cn: new Float64Array(12), nc: 0,
      _q: { x: 0, y: 0 }
    };
    reset(w);
    return w;
  }

  function startPoint(w) {
    const L = w.level;
    if (L.start) return { x: L.start.x, y: L.start.y };
    return { x: (L.w || 1000) / 2, y: (L.h || 1000) / 2 };
  }

  function reset(w) {
    const s = startPoint(w);
    w.x = s.x; w.y = s.y; w.vx = w.vy = 0; w.tx = w.ty = 0;
    w.phase = "drop"; w.phaseT = 0; w.time = 0; w.steps = 0; w.acc = 0;
    w.events.length = 0; w.lastClick = -1; w.nc = 0;
    w.fallFrom = w.holeAt = w.goalFrom = null;
    return w;
  }

  function emit(w, e) { w.events.push(e); }

  function collide(w) {
    const ix = w.ix, S = ix.segs, r = w.r, e = P.restitution;
    let hit = 0;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const list = ix.cells[cellOf(ix, w.x, w.y)];
      for (let k = 0; k < list.length; k++) {
        const o = list[k] * 5;
        const ax = S[o], ay = S[o + 1], dx = S[o + 2] - ax, dy = S[o + 3] - ay;
        const minD = r + S[o + 4];
        const L = dx * dx + dy * dy;
        let t = L > 0 ? ((w.x - ax) * dx + (w.y - ay) * dy) / L : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = ax + dx * t, py = ay + dy * t;
        let nx = w.x - px, ny = w.y - py;
        const d2 = nx * nx + ny * ny;
        if (d2 >= (minD + SLOP) * (minD + SLOP)) continue;
        let d = Math.sqrt(d2);
        if (d >= minD) { contact(w, nx / d, ny / d); continue; } // touching, not overlapping
        if (d < 1e-6) { // centre exactly on the line: push out along the segment normal, against the motion
          const len = Math.sqrt(L) || 1;
          nx = -dy / len; ny = dx / len;
          if (nx * w.vx + ny * w.vy > 0) { nx = -nx; ny = -ny; }
          d = 0;
        } else { nx /= d; ny /= d; }
        w.x = px + nx * minD; w.y = py + ny * minD;
        hit = Math.max(hit, resolveVel(w, nx, ny, e));
        contact(w, nx, ny);
        moved = true;
      }
      // inside a filled polygon: push out to its outline
      const pl = ix.pcells[cellOf(ix, w.x, w.y)];
      for (let k = 0; k < pl.length; k++) {
        const poly = ix.polys[pl[k]];
        if (w.x < poly.x0 || w.x > poly.x1 || w.y < poly.y0 || w.y > poly.y1) continue;
        if (!insidePoly(poly.pts, w.x, w.y)) continue;
        const q = w._q;
        nearestOnPoly(poly.pts, w.x, w.y, q);
        let nx = q.x - w.x, ny = q.y - w.y;
        const d = Math.sqrt(nx * nx + ny * ny) || 1;
        nx /= d; ny /= d;
        w.x = q.x + nx * r; w.y = q.y + ny * r;
        hit = Math.max(hit, resolveVel(w, nx, ny, e));
        contact(w, nx, ny);
        moved = true;
      }
      // board edges (the frame)
      if (w.x < r) { w.x = r; hit = Math.max(hit, resolveVel(w, 1, 0, e)); moved = true; }
      if (w.x > ix.w - r) { w.x = ix.w - r; hit = Math.max(hit, resolveVel(w, -1, 0, e)); moved = true; }
      if (w.y < r) { w.y = r; hit = Math.max(hit, resolveVel(w, 0, 1, e)); moved = true; }
      if (w.y > ix.h - r) { w.y = ix.h - r; hit = Math.max(hit, resolveVel(w, 0, -1, e)); moved = true; }
      if (!moved) break;
    }
    if (w.x < r + SLOP) contact(w, 1, 0);
    if (w.x > ix.w - r - SLOP) contact(w, -1, 0);
    if (w.y < r + SLOP) contact(w, 0, 1);
    if (w.y > ix.h - r - SLOP) contact(w, 0, -1);
    return hit;
  }

  // resting contacts found this step (wall normals), used next step so a ball pressed into a wall
  // stays still: the wall carries the push, only the sideways part has to beat rolling resistance
  const SLOP = 0.5;
  function contact(w, nx, ny) {
    if (w.nc >= 6) return;
    w.cn[2 * w.nc] = nx; w.cn[2 * w.nc + 1] = ny; w.nc++;
  }

  // remove the velocity going into the wall (n points out of the wall); returns impact speed
  function resolveVel(w, nx, ny, e) {
    const vn = w.vx * nx + w.vy * ny;
    if (vn >= 0) return 0;
    const imp = -vn;
    const k = imp > P.restThreshold ? 1 + e : 1;
    w.vx -= nx * vn * k; w.vy -= ny * vn * k;
    // a little grip along the wall
    const tvx = w.vx - nx * (w.vx * nx + w.vy * ny), tvy = w.vy - ny * (w.vx * nx + w.vy * ny);
    w.vx -= tvx * P.wallFriction; w.vy -= tvy * P.wallFriction;
    return imp;
  }

  function step(w, tiltX, tiltY) {
    const dt = w.dt;
    w.steps++;
    // the tilt low-pass, inside the fixed step so it is the same on every phone
    const a = P.smoothing > 0 ? 1 - Math.exp(-dt / P.smoothing) : 1;
    w.tx += ((+tiltX || 0) - w.tx) * a;
    w.ty += ((+tiltY || 0) - w.ty) * a;

    const ph = w.phase;
    if (ph === "done") return;
    if (ph === "play" || ph === "falling" || ph === "respawn") w.time += dt;
    w.phaseT += dt;

    if (ph === "drop" || ph === "respawn") {
      if (w.phaseT * 1000 >= (ph === "drop" ? P.dropMs : P.respawnMs)) {
        w.phase = "play"; w.phaseT = 0;
        if (ph === "drop") { w.time = 0; emit(w, { type: "drop", time: 0 }); }
      }
      return;
    }
    if (ph === "falling") {
      const k = Math.min(1, (w.phaseT * 1000) / P.holeFallMs);
      const e = 1 - Math.pow(1 - k, 2);
      w.x = w.fallFrom.x + (w.holeAt.x - w.fallFrom.x) * e;
      w.y = w.fallFrom.y + (w.holeAt.y - w.fallFrom.y) * e;
      if (w.phaseT * 1000 >= P.holeFallMs + P.holeHoldMs) {
        const s = startPoint(w);
        w.x = s.x; w.y = s.y; w.vx = w.vy = 0;
        w.phase = "respawn"; w.phaseT = 0;
      }
      return;
    }
    if (ph === "goal") {
      const k = Math.min(1, (w.phaseT * 1000) / P.goalEaseMs);
      const e = 1 - Math.pow(1 - k, 3);
      const G = w.level.goal;
      w.x = w.goalFrom.x + (G.x - w.goalFrom.x) * e;
      w.y = w.goalFrom.y + (G.y - w.goalFrom.y) * e;
      if (k >= 1) w.phase = "done";
      return;
    }

    // ---- play ----
    const g = P.gravity * w.k, vmax = P.maxSpeed * w.k;
    let ax = w.tx * g, ay = w.ty * g;
    // over a hole: the lip pulls the ball in a little (the wooden-toy tension)
    const holes = w.level.holes || [];
    for (let i = 0; i < holes.length; i++) {
      const H = holes[i];
      const dx = H.x - w.x, dy = H.y - w.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < H.r && d > 1e-6) { const f = P.holePull * (1 - d / H.r); ax += (dx / d) * f; ay += (dy / d) * f; }
    }
    w.vx += ax * dt; w.vy += ay * dt;
    // walls the ball rests against take the push into them
    for (let i = 0; i < w.nc; i++) {
      const nx = w.cn[2 * i], ny = w.cn[2 * i + 1], vn = w.vx * nx + w.vy * ny;
      if (vn < 0) { w.vx -= nx * vn; w.vy -= ny * vn; }
    }
    w.nc = 0;
    // rolling friction: linear damping plus a small constant resistance
    const damp = Math.exp(-P.friction * dt);
    w.vx *= damp; w.vy *= damp;
    let sp = Math.sqrt(w.vx * w.vx + w.vy * w.vy);
    if (sp > 0) { const f = Math.max(0, sp - P.rollResist * dt) / sp; w.vx *= f; w.vy *= f; sp *= f; }
    if (sp > vmax) { const f = vmax / sp; w.vx *= f; w.vy *= f; sp = vmax; }

    // substeps: never move more than half the radius at once (no tunnelling)
    const n = Math.max(1, Math.ceil((sp * dt) / (0.5 * w.r)));
    const sdt = dt / n;
    let hit = 0;
    for (let s = 0; s < n; s++) {
      w.x += w.vx * sdt; w.y += w.vy * sdt;
      hit = Math.max(hit, collide(w));
      // holes
      for (let i = 0; i < holes.length; i++) {
        const H = holes[i];
        const dx = H.x - w.x, dy = H.y - w.y;
        const lim = H.r - P.holeEdge * w.r;
        if (lim > 0 && dx * dx + dy * dy < lim * lim) {
          w.phase = "falling"; w.phaseT = 0;
          w.fallFrom = { x: w.x, y: w.y }; w.holeAt = { x: H.x, y: H.y };
          w.vx = w.vy = 0;
          emit(w, { type: "hole", time: w.time });
          return;
        }
      }
      // goal
      const G = w.level.goal;
      if (G) {
        const dx = G.x - w.x, dy = G.y - w.y, c = P.goalCatch * w.r;
        if (dx * dx + dy * dy < c * c) {
          w.phase = "goal"; w.phaseT = 0; w.goalFrom = { x: w.x, y: w.y };
          w.vx = w.vy = 0;
          emit(w, { type: "finish", time: w.time });
          return;
        }
      }
    }
    if (hit > P.clickSpeed && w.steps - w.lastClick > 6) {
      w.lastClick = w.steps;
      emit(w, { type: "wall", speed: hit, time: w.time });
    }
  }

  // accumulator: run whole fixed steps for dt seconds. tiltFn(world) -> {x, y}
  function advance(w, dt, tiltFn) {
    w.acc += Math.min(Math.max(0, dt), 0.25);
    let n = 0;
    while (w.acc >= w.dt) {
      const t = tiltFn ? tiltFn(w) : null;
      step(w, t ? t.x : 0, t ? t.y : 0);
      w.acc -= w.dt;
      n++;
    }
    return n;
  }

  // degrees of tilt (screen x right, y down) -> curved tilt vector, |t| <= 1
  function tiltFromDeg(dx, dy) {
    const m = Math.sqrt(dx * dx + dy * dy);
    if (!(m > P.deadZoneDeg)) return { x: 0, y: 0 };
    let k = Math.min(1, (m - P.deadZoneDeg) / Math.max(0.1, P.maxTiltDeg - P.deadZoneDeg));
    k = Math.pow(k, P.curve);
    return { x: (dx / m) * k, y: (dy / m) * k };
  }

  // what the board draws: z = height above the paper (0..1, the drop), fall = 0..1 into a hole, hidden
  function ballView(w) {
    const v = { x: w.x, y: w.y, r: w.r, z: 0, fall: 0, phase: w.phase };
    if (w.phase === "drop" || w.phase === "respawn") {
      const T = w.phase === "drop" ? P.dropMs : P.respawnMs;
      const t = w.phaseT * 1000;
      const fall = w.phase === "drop" ? Math.max(1, T - P.dropBounceMs) : T;
      // fall (accelerating), then one small bounce (drop only)
      if (t < fall) { const u = t / fall; v.z = 1 - u * u; }
      else { const u = Math.min(1, (t - fall) / Math.max(1, T - fall)); v.z = 0.14 * 4 * u * (1 - u); }
      if (w.phase === "respawn") v.z *= 0.55;
    } else if (w.phase === "falling") {
      const k = Math.min(1, (w.phaseT * 1000) / P.holeFallMs);
      v.fall = k;                                   // board maps fall 0..1 through PALETTE.ball.hole
      if (w.phaseT * 1000 >= P.holeFallMs) v.hidden = true;
    } else if (w.phase === "goal") {
      v.sink = Math.min(1, (w.phaseT * 1000) / P.goalEaseMs);
    } else if (w.phase === "done") v.sink = 1;
    return v;
  }

  // ---------- route + autopilot (autoplay, landing demo, tests) ----------
  function route(level, opts) {
    const r = Math.max(4, +level.ballR || 16);
    const ix = buildIndex(level, r, r * 3);
    const cs = Math.max(4, Math.min(10, r * 0.5));
    const cols = Math.ceil(ix.w / cs), rows = Math.ceil(ix.h / cs);
    const N = cols * rows;
    const clr = new Float32Array(N);
    const holes = level.holes || [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = (i + 0.5) * cs, y = (j + 0.5) * cs;
      let c = clearance(ix, x, y);
      for (const H of holes) c = Math.min(c, Math.hypot(H.x - x, H.y - y) - H.r - r * 0.3);
      clr[j * cols + i] = c;
    }
    const need = r * ((opts && opts.margin) || 1.08);
    const free = (k) => clr[k] >= need;
    const idx = (p) => {
      const i = Math.min(cols - 1, Math.max(0, Math.floor(p.x / cs)));
      const j = Math.min(rows - 1, Math.max(0, Math.floor(p.y / cs)));
      // nearest free cell (small spiral)
      let best = -1, bd = Infinity;
      for (let dj = -8; dj <= 8; dj++) for (let di = -8; di <= 8; di++) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= cols || b >= rows) continue;
        const k = b * cols + a;
        if (!free(k)) continue;
        const d = di * di + dj * dj;
        if (d < bd) { bd = d; best = k; }
      }
      return best;
    };
    if (!level.start || !level.goal) return null;
    const s = idx(level.start), g = idx(level.goal);
    if (s < 0 || g < 0) return null;
    // Dijkstra with a cost for hugging walls: the route runs down the middle of corridors
    const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
    const heap = [];
    const push = (k, d) => { heap.push([d, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, rr = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (rr < heap.length && heap[rr][0] < heap[m][0]) m = rr; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    dist[s] = 0; push(s, 0);
    const want = r * 2.6;
    const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
    while (heap.length) {
      const [d, k] = pop();
      if (d > dist[k]) continue;
      if (k === g) break;
      const i = k % cols, j = (k / cols) | 0;
      for (const [di, dj, c] of D) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= cols || b >= rows) continue;
        const kk = b * cols + a;
        if (!free(kk)) continue;
        const pen = 1 + 5 * Math.max(0, 1 - (clr[kk] - r) / want);
        const nd = d + c * pen;
        if (nd < dist[kk]) { dist[kk] = nd; prev[kk] = k; push(kk, nd); }
      }
    }
    if (!isFinite(dist[g])) {
      if (!opts || !opts.relaxed) return route(level, { margin: 1.0, relaxed: true });
      return null;
    }
    const out = [];
    for (let k = g, guard = 0; k >= 0 && guard < N; k = prev[k], guard++) out.push((k % cols + 0.5) * cs, (((k / cols) | 0) + 0.5) * cs);
    const pts = [];
    for (let i = out.length - 2; i >= 0; i -= 2) pts.push(out[i], out[i + 1]);
    pts.push(level.goal.x, level.goal.y);
    return pts;
  }

  // a PD controller that follows the route at a calm speed; deterministic (state only)
  function autopilot(w, opts) {
    const pts = route(w.level);
    const o = Object.assign({ speed: 330, look: 2.4, gain: 0.006 }, opts || {});
    let at = 0;
    const n = pts ? pts.length / 2 : 0;
    function f(world) {
      if (!n || world.phase !== "play") { if (world.phase === "respawn" || world.phase === "drop") at = 0; return { x: 0, y: 0 }; }
      // advance along the route to the nearest point ahead
      let best = at, bd = Infinity;
      const lim = Math.min(n - 1, at + 40);
      for (let i = at; i <= lim; i++) {
        const dx = pts[2 * i] - world.x, dy = pts[2 * i + 1] - world.y, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      }
      at = best;
      // look ahead a fixed distance along the route
      const L = world.r * o.look;
      let j = at, acc = 0;
      while (j < n - 1 && acc < L) { acc += Math.hypot(pts[2 * j + 2] - pts[2 * j], pts[2 * j + 3] - pts[2 * j + 1]); j++; }
      let dx = pts[2 * j] - world.x, dy = pts[2 * j + 1] - world.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = Math.min(o.speed, 60 + d * 6);
      const tvx = (dx / d) * sp, tvy = (dy / d) * sp;
      let tx = (tvx - world.vx) * o.gain, ty = (tvy - world.vy) * o.gain;
      const m = Math.hypot(tx, ty);
      if (m > 1) { tx /= m; ty /= m; }
      return { x: tx, y: ty };
    }
    f.route = pts;
    return f;
  }

  DL.physics = { create, reset, step, advance, tiltFromDeg, ballView, route, autopilot, clearance: (w, x, y) => clearance(w.ix, x, y) };
})(typeof globalThis !== "undefined" ? globalThis : this);
