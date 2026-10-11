// The code-made sample level, and synthetic maze photos for tests. Plain arrays only, so it runs in Node.
//
//   DL.sample.load()        -> Level   always the same blue-biro doodle maze as og-image.png (fixed seed):
//                                       wobbly, bowed, overshooting strokes, 2 holes, a start and a goal, solvable
//   DL.sample.photo(opts?)  -> ImageData   a synthetic photo of a maze drawn on paper (tests only; never a
//                                       replacement for real photos). The drawing kit and the paper are adapted from
//                                       Day 3 Doodle Alive's sample.js.
//      opts: { w, h, seed, paper: "plain"|"lined"|"grid", shadow: "none"|"soft"|"gradient"|"strong",
//              ink: "pen"|"blue"|"red"|"pencil"|"marker", opacity, width, cols, rows, wobble, gaps, gapW, dots, dotR,
//              dotTouch, desk, tilt, dust }
//      gaps: how many wall runs get a pen-lift gap; gapW: its length as a share of the photo width (default 0.012)
//      The ImageData carries .truth = { runs, gaps: [[x, y, ux, uy]], gapPx, width } in photo pixels (for tests).
//   DL.sample.CASES          named photo cases for tests/levels.html (?set=synthetic) and the Node tests
(function () {
  const DL = (globalThis.DL = globalThis.DL || {});

  // ---------- a maze (recursive backtracker) ----------
  // right[c] = wall on the right of cell c, down[c] = wall below cell c (c = row * cols + col)
  function makeMaze(cols, rows, rnd) {
    const n = cols * rows;
    const right = new Uint8Array(n).fill(1), down = new Uint8Array(n).fill(1), seen = new Uint8Array(n);
    const stack = [0];
    seen[0] = 1;
    while (stack.length) {
      const c = stack[stack.length - 1], x = c % cols, y = (c / cols) | 0;
      const opts = [];
      if (x > 0 && !seen[c - 1]) opts.push(c - 1);
      if (x < cols - 1 && !seen[c + 1]) opts.push(c + 1);
      if (y > 0 && !seen[c - cols]) opts.push(c - cols);
      if (y < rows - 1 && !seen[c + cols]) opts.push(c + cols);
      if (!opts.length) { stack.pop(); continue; }
      const nb = opts[Math.floor(rnd() * opts.length)];
      if (nb === c + 1) right[c] = 0; else if (nb === c - 1) right[nb] = 0;
      else if (nb === c + cols) down[c] = 0; else down[nb] = 0;
      seen[nb] = 1;
      stack.push(nb);
    }
    return { cols: cols, rows: rows, right: right, down: down };
  }
  // wall runs in cell units: [x0, y0, x1, y1], merged along rows and columns
  function wallRuns(m) {
    const runs = [];
    for (let j = 0; j <= m.rows; j++) {
      let s = -1;
      for (let i = 0; i <= m.cols; i++) {
        const has = i < m.cols && (j === 0 || j === m.rows || m.down[(j - 1) * m.cols + i]);
        if (has && s < 0) s = i;
        if (!has && s >= 0) { runs.push([s, j, i, j]); s = -1; }
      }
    }
    for (let i = 0; i <= m.cols; i++) {
      let s = -1;
      for (let j = 0; j <= m.rows; j++) {
        const has = j < m.rows && (i === 0 || i === m.cols || m.right[j * m.cols + i - 1]);
        if (has && s < 0) s = j;
        if (!has && s >= 0) { runs.push([i, s, i, j]); s = -1; }
      }
    }
    return runs;
  }

  // ---------- the sample level ----------
  // The same blue-biro doodle as the art director's board and og-image.png (design/board-render.js makeLevel with
  // seed 23, 6 x 9 cells, 2 extra openings; same random numbers, so the same maze): every wall run is one pen stroke
  // with a slow double wobble, a bow, and ends that overshoot or stop short; the border is one pen loop that runs
  // past its start where the pen lifted. The two holes sit right beside the way through (tempting, never blocking).
  const SAMPLE = { seed: 23, cols: 6, rows: 9, braid: 2, margin: 48, ink: "#2b3f8f" };
  function penWobble(x0, y0, x1, y1, rnd, ends) { // (design/board-render.js wobble)
    const dx = x1 - x0, dy = y1 - y0;
    let len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    if (ends) { const a = (rnd() - 0.3) * 22, b = (rnd() - 0.3) * 22; x0 -= ux * a; y0 -= uy * a; x1 += ux * b; y1 += uy * b; len += a + b; }
    const px = -uy, py = ux, n = Math.max(2, Math.ceil(len / 24));
    const ph1 = rnd() * 6.28, ph2 = rnd() * 6.28, bow = (rnd() - 0.5) * 18, amp = 3.5 + rnd() * 2.5, out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, d = len * t;
      const w = amp * (0.6 * Math.sin(d / 95 + ph1) + 0.4 * Math.sin(d / 33 + ph2)) * Math.min(1, t * 6, (1 - t) * 6 + 0.3) + bow * Math.sin(Math.PI * t);
      out.push(Math.round(x0 + ux * d + px * w), Math.round(y0 + uy * d + py * w));
    }
    return out;
  }
  let cachedLevel = null;
  function buildLevel() {
    const rnd = DL.util.mulberry32(SAMPLE.seed);
    const cols = SAMPLE.cols, rows = SAMPLE.rows, m = SAMPLE.margin;
    const cw = (1000 - 2 * m) / cols;
    const h = Math.round(2 * m + rows * cw);
    // walls between cells: Hw[r][c] = the top edge of row r, Vw[r][c] = the left edge of column c
    const Hw = [], Vw = [];
    for (let r = 0; r <= rows; r++) { Hw[r] = []; for (let c = 0; c < cols; c++) Hw[r][c] = true; }
    for (let r = 0; r < rows; r++) { Vw[r] = []; for (let c = 0; c <= cols; c++) Vw[r][c] = true; }
    const seen = [], stack = [[0, 0]];
    for (let r = 0; r < rows; r++) seen[r] = [];
    seen[0][0] = true;
    while (stack.length) {
      const cur = stack[stack.length - 1], cr = cur[0], cc = cur[1], nb = [];
      if (cr > 0 && !seen[cr - 1][cc]) nb.push([cr - 1, cc, "n"]);
      if (cr < rows - 1 && !seen[cr + 1][cc]) nb.push([cr + 1, cc, "s"]);
      if (cc > 0 && !seen[cr][cc - 1]) nb.push([cr, cc - 1, "w"]);
      if (cc < cols - 1 && !seen[cr][cc + 1]) nb.push([cr, cc + 1, "e"]);
      if (!nb.length) { stack.pop(); continue; }
      const n = nb[Math.floor(rnd() * nb.length)];
      if (n[2] === "n") Hw[cr][cc] = false;
      if (n[2] === "s") Hw[cr + 1][cc] = false;
      if (n[2] === "w") Vw[cr][cc] = false;
      if (n[2] === "e") Vw[cr][cc + 1] = false;
      seen[n[0]][n[1]] = true;
      stack.push([n[0], n[1]]);
    }
    // a couple of extra openings: hand-drawn mazes are friendlier than perfect ones
    for (let k = 0; k < SAMPLE.braid; k++) {
      const rr = 1 + Math.floor(rnd() * (rows - 1)), ccx = Math.floor(rnd() * cols);
      if (rnd() < 0.5) Hw[rr][ccx] = false;
      else { const r2 = Math.floor(rnd() * rows), c2 = 1 + Math.floor(rnd() * (cols - 1)); Vw[r2][c2] = false; }
    }
    // the way through (cells), for placing the holes beside it
    const prev = {}, q = [[0, 0]], key = function (a, b) { return a + "," + b; };
    prev[key(0, 0)] = null;
    while (q.length) {
      const p = q.shift(), pr = p[0], pc = p[1];
      if (pr === rows - 1 && pc === cols - 1) break;
      const mv = [];
      if (pr > 0 && !Hw[pr][pc]) mv.push([pr - 1, pc]);
      if (pr < rows - 1 && !Hw[pr + 1][pc]) mv.push([pr + 1, pc]);
      if (pc > 0 && !Vw[pr][pc]) mv.push([pr, pc - 1]);
      if (pc < cols - 1 && !Vw[pr][pc + 1]) mv.push([pr, pc + 1]);
      mv.forEach(function (t) { const kk = key(t[0], t[1]); if (!(kk in prev)) { prev[kk] = p; q.push(t); } });
    }
    const cells = [];
    for (let at = [rows - 1, cols - 1]; at; at = prev[key(at[0], at[1])]) cells.unshift(at);
    const cx = function (c) { return m + (c + 0.5) * cw; }, cy = function (r) { return m + (r + 0.5) * cw; };
    // inside walls: merged runs, one pen stroke each
    const strokes = [];
    for (let r = 1; r < rows; r++) {
      let c = 0;
      while (c < cols) { if (!Hw[r][c]) { c++; continue; } const s0 = c; while (c < cols && Hw[r][c]) c++; strokes.push([m + s0 * cw, m + r * cw, m + c * cw, m + r * cw]); }
    }
    for (let c = 1; c < cols; c++) {
      let r = 0;
      while (r < rows) { if (!Vw[r][c]) { r++; continue; } const t0 = r; while (r < rows && Vw[r][c]) r++; strokes.push([m + c * cw, m + t0 * cw, m + c * cw, m + r * cw]); }
    }
    const walls = strokes.map(function (s) {
      const pts = penWobble(s[0], s[1], s[2], s[3], rnd, true);
      return { pts: pts, width: 7 + rnd() * 3.5 };
    });
    // the border: one pen loop, running a little past its start where the pen lifted
    const b = [[m, m], [1000 - m, m], [1000 - m, h - m], [m, h - m], [m, m + 26]];
    let border = [];
    for (let i = 0; i < b.length - 1; i++) {
      let seg = penWobble(b[i][0], b[i][1], b[i + 1][0], b[i + 1][1], rnd, false);
      if (i > 0) seg = seg.slice(2);
      border = border.concat(seg);
    }
    walls.unshift({ pts: border, width: 8.5 });
    // two holes right beside the way through, on alternate sides
    const holes = [Math.floor(cells.length * 0.35), Math.floor(cells.length * 0.68)].map(function (ix, j) {
      const a = cells[ix], bb = cells[ix + 1] || cells[ix - 1];
      const horiz = a[0] === bb[0], off = (j ? -1 : 1) * cw * 0.3;
      return { x: cx(a[1]) + (horiz ? 0 : off), y: cy(a[0]) + (horiz ? off : 0), r: 21 + rnd() * 3 };
    });
    const level = {
      v: 1, w: 1000, h: h, ink: SAMPLE.ink,
      ballR: Math.round(DL.util.clamp(0.3 * (cw - 8), 10, 28) * 2) / 2,
      walls: walls, fills: [], holes: holes,
      start: { x: Math.round(cx(0)), y: Math.round(cy(0)) }, goal: { x: Math.round(cx(cols - 1)), y: Math.round(cy(rows - 1)) }, challenge: null
    };
    return DL.codec ? DL.codec.normalize(level) : level;
  }
  function load() {
    if (!cachedLevel) cachedLevel = buildLevel();
    return JSON.parse(JSON.stringify(cachedLevel)); // a fresh copy every time
  }

  // ---------- synthetic photos (adapted from Doodle Alive's sample.js) ----------
  const INKS = {
    pen: { color: [28, 34, 64], opacity: 0.93, grain: 0.06 },
    marker: { color: [22, 22, 30], opacity: 0.97, grain: 0.04 },
    pencil: { color: [70, 72, 82], opacity: 0.4, grain: 0.4 },
    blue: { color: [30, 70, 170], opacity: 0.88, grain: 0.06 },
    red: { color: [200, 40, 60], opacity: 0.88, grain: 0.06 }
  };
  function Layer(W, H, ink, opacity) {
    const base = INKS[ink] || INKS.pen;
    this.W = W; this.H = H;
    this.color = base.color;
    this.opacity = opacity != null ? opacity : base.opacity;
    this.grain = base.grain;
    this.cov = new Float32Array(W * H);
  }
  Layer.prototype.segment = function (x0, y0, x1, y1, w) {
    const W = this.W, H = this.H, cov = this.cov;
    const r = w / 2 + 1;
    const xa = Math.max(0, Math.floor(Math.min(x0, x1) - r)), xb = Math.min(W - 1, Math.ceil(Math.max(x0, x1) + r));
    const ya = Math.max(0, Math.floor(Math.min(y0, y1) - r)), yb = Math.min(H - 1, Math.ceil(Math.max(y0, y1) + r));
    const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) {
        let t = l2 > 0 ? ((x - x0) * dx + (y - y0) * dy) / l2 : 0;
        t = t < 0 ? 0 : (t > 1 ? 1 : t);
        const px = x0 + t * dx - x, py = y0 + t * dy - y;
        const c = w / 2 + 0.5 - Math.sqrt(px * px + py * py);
        if (c > 0) { const i = y * W + x, v = c > 1 ? 1 : c; if (v > cov[i]) cov[i] = v; }
      }
    }
  };
  Layer.prototype.disc = function (cx, cy, r) { this.segment(cx, cy, cx, cy, r * 2); };
  // a wobbly pen stroke through pts ([[x,y],...]) in photo pixels
  function penLine(L, rnd, pts, width, amp) {
    const ph1 = rnd() * 6.28, ph2 = rnd() * 6.28, f1 = 0.012 + rnd() * 0.012, f2 = 0.03 + rnd() * 0.02;
    let dist = 0, px = null, py = null;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.ceil(len / 4));
      const nx = -(b[1] - a[1]) / (len || 1), ny = (b[0] - a[0]) / (len || 1);
      for (let k = 0; k <= n; k++) {
        const t = k / n, d = dist + len * t;
        const off = amp * (0.8 * Math.sin(d * f1 + ph1) + 0.35 * Math.sin(d * f2 + ph2));
        const X = a[0] + (b[0] - a[0]) * t + nx * off, Y = a[1] + (b[1] - a[1]) * t + ny * off;
        const w = width * (0.85 + 0.2 * Math.sin(d * 0.04 + ph1));
        if (px !== null) L.segment(px, py, X, Y, w);
        px = X; py = Y;
      }
      dist += len;
    }
  }

  function photo(opts) {
    opts = opts || {};
    const W = opts.w || 1200, H = opts.h || 1600;
    const rnd = DL.util.mulberry32(opts.seed || 20261011);
    const paperKind = opts.paper || "plain";
    const shadow = opts.shadow || "soft";
    const tilt = (opts.tilt != null ? opts.tilt : 1.2) * Math.PI / 180;
    const ink = opts.ink || "pen";
    const cols = opts.cols || (W > H ? 8 : 6), rows = opts.rows || (W > H ? 6 : 8);
    const amp = (opts.wobble != null ? opts.wobble : 1) * 2.2;
    const width = (opts.width || 1) * (ink === "marker" ? 11 : (ink === "pencil" ? 4 : 6.5));

    // the maze, fitted to the page with a margin
    const mx = W * 0.12, my = H * 0.11;
    const cell = Math.min((W - 2 * mx) / cols, (H - 2 * my) / rows);
    const ox = (W - cell * cols) / 2, oy = (H - cell * rows) / 2;
    const m = makeMaze(cols, rows, rnd);
    const layer = new Layer(W, H, ink, opts.opacity);
    const runs = wallRuns(m);
    // accidental pen-lift gaps: split a few long runs with a small gap
    const gapIdx = new Set();
    for (let g = 0; g < (opts.gaps || 0); g++) gapIdx.add(Math.floor(rnd() * runs.length));
    const truth = { runs: [], gaps: [], gapPx: (opts.gapW || 0.012) * W, width: width }; // in drawing coordinates for now
    runs.forEach(function (r, ri) {
      const a = [ox + r[0] * cell, oy + r[1] * cell], b = [ox + r[2] * cell, oy + r[3] * cell];
      truth.runs.push([a[0], a[1], b[0], b[1]]);
      // a little rotation of the whole drawing (the paper is never square to the camera)
      if (gapIdx.has(ri)) {
        const t = 0.35 + rnd() * 0.3, gap = truth.gapPx;
        const L0 = Math.hypot(b[0] - a[0], b[1] - a[1]);
        truth.gaps.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (b[0] - a[0]) / L0, (b[1] - a[1]) / L0]);
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
        const m1 = [a[0] + u[0] * (len * t - gap / 2), a[1] + u[1] * (len * t - gap / 2)];
        const m2 = [a[0] + u[0] * (len * t + gap / 2), a[1] + u[1] * (len * t + gap / 2)];
        penLine(layer, rnd, [a, m1], width, amp);
        penLine(layer, rnd, [m2, b], width, amp);
      } else {
        penLine(layer, rnd, [a, b], width, amp);
      }
    });
    // filled dots (holes) in random cells (not the corners where start and goal go)
    const dots = [];
    const nDots = opts.dots || 0;
    for (let k = 0; k < nDots; k++) {
      let c;
      do { c = Math.floor(rnd() * cols * rows); } while (c === 0 || c === cols * rows - 1 || dots.indexOf(c) >= 0);
      dots.push(c);
      const r = (opts.dotR || 0.022) * Math.min(W, H) * (0.9 + rnd() * 0.25);
      let cx = ox + (c % cols + 0.5) * cell, cy = oy + (((c / cols) | 0) + 0.5) * cell;
      if (opts.dotTouch && k === 0) cx = ox + (c % cols) * cell + r * 0.9; // this one touches a wall
      // filled in by hand: a disc plus a few scribbles around its edge
      layer.disc(cx, cy, r);
      for (let s = 0; s < 6; s++) { const an = rnd() * 6.28; layer.disc(cx + Math.cos(an) * r * 0.25, cy + Math.sin(an) * r * 0.25, r * 0.8); }
    }
    // heavy scribble all over (the "too busy" case)
    for (let k = 0; k < (opts.scribble || 0); k++) {
      const x = rnd() * W, y = rnd() * H, an = rnd() * 6.28, len = 80 + rnd() * 220;
      penLine(layer, rnd, [[x, y], [x + Math.cos(an) * len, y + Math.sin(an) * len]], width * 2.5, amp);
    }
    const layers = [layer];
    const dust = new Layer(W, H, "pen", 0.45);
    const dustN = opts.dust == null ? 14 : opts.dust;
    for (let i = 0; i < dustN; i++) dust.disc(60 + rnd() * (W - 120), 60 + rnd() * (H - 120), 1 + rnd() * 1.6);
    layers.push(dust);

    // the paper
    const G = 56, gw = Math.ceil(W / G) + 2, gh = Math.ceil(H / G) + 2;
    const lump = new Float32Array(gw * gh);
    for (let i = 0; i < lump.length; i++) lump[i] = rnd() * 2 - 1;
    const cosT = Math.cos(tilt), sinT = Math.sin(tilt);
    const spacing = 0.052 * Math.max(W, H), v0 = 0.14 * H, marginU = 0.145 * W;
    const paperRGB = opts.paperColor || [239, 235, 224];
    const lineRGB = [118, 160, 226], marginRGB = [226, 105, 105];
    const out = new Uint8ClampedArray(W * H * 4);
    const desk = !!opts.desk;
    const pr = 0.06, deskTilt = tilt * 1.6, cD = Math.cos(deskTilt), sD = Math.sin(deskTilt);
    const pcx = W / 2, pcy = H / 2, phw = W * (0.5 - pr), phh = H * (0.5 - pr);
    // the maze is drawn in page coordinates; rotate it slightly with the page
    const rc = Math.cos(-tilt * 0.6), rs = Math.sin(-tilt * 0.6);
    for (let y = 0; y < H; y++) {
      const gy = y / G, gyi = gy | 0, fy = gy - gyi;
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4;
        const gx = x / G, gxi = gx | 0, fx = gx - gxi;
        const l00 = lump[gyi * gw + gxi], l10 = lump[gyi * gw + gxi + 1], l01 = lump[(gyi + 1) * gw + gxi], l11 = lump[(gyi + 1) * gw + gxi + 1];
        const lm = (l00 * (1 - fx) + l10 * fx) * (1 - fy) + (l01 * (1 - fx) + l11 * fx) * fy;
        let illum = 1 + lm * 0.012;
        if (shadow !== "none") {
          const gd = (x / W) * 0.5 + (y / H) * 0.8;
          illum *= shadow === "gradient" ? 1.06 - 0.36 * gd : 1.0 - 0.10 * gd;
          if (shadow === "soft") {
            const dx = (x - W * 0.2) / (0.27 * W), dy = (y - H * 0.16) / (0.16 * H);
            illum *= 1 - 0.2 * Math.exp(-(dx * dx + dy * dy));
          } else if (shadow === "strong") {
            const dd = (x * 0.6 + y * 0.8) - 0.56 * (W * 0.6 + H * 0.8); // a hand's shadow edge across the page
            illum *= 1 - 0.34 / (1 + Math.exp(dd / 14));
          }
        }
        let r, g, b, onPaper = true;
        if (desk) {
          const ux = (x - pcx) * cD + (y - pcy) * sD, uy = -(x - pcx) * sD + (y - pcy) * cD;
          const ex = phw - Math.abs(ux), ey = phh - Math.abs(uy);
          if (ex < 0 || ey < 0) {
            onPaper = false;
            const grain = 0.5 + 0.5 * Math.sin(y * 0.35 + 3 * Math.sin(x * 0.012) + lm * 3);
            const wood = 0.78 + 0.22 * grain + (rnd() - 0.5) * 0.08;
            r = 122 * wood * illum; g = 84 * wood * illum; b = 52 * wood * illum;
          }
        }
        if (onPaper) {
          const nz = (rnd() - 0.5) * 7;
          r = paperRGB[0] * illum + nz; g = paperRGB[1] * illum + nz; b = paperRGB[2] * illum + nz * 1.2;
          if (paperKind !== "plain") {
            const v = y * cosT - x * sinT, u = x * cosT + y * sinT;
            let d = (v - v0) % spacing; if (d < 0) d += spacing; if (d > spacing / 2) d -= spacing;
            let la = Math.max(0, Math.min(1, 1.1 + 0.5 - Math.abs(d))) * 0.55;
            if (paperKind === "grid") {
              let e = (u - marginU) % spacing; if (e < 0) e += spacing; if (e > spacing / 2) e -= spacing;
              la = Math.max(la, Math.max(0, Math.min(1, 1.1 + 0.5 - Math.abs(e))) * 0.5);
            }
            if (la > 0) { r = r * (1 - la) + lineRGB[0] * illum * la; g = g * (1 - la) + lineRGB[1] * illum * la; b = b * (1 - la) + lineRGB[2] * illum * la; }
            if (paperKind === "lined") {
              const mm = Math.max(0, Math.min(1, 1.1 + 0.5 - Math.abs(u - marginU))) * 0.5;
              if (mm > 0) { r = r * (1 - mm) + marginRGB[0] * illum * mm; g = g * (1 - mm) + marginRGB[1] * illum * mm; b = b * (1 - mm) + marginRGB[2] * illum * mm; }
            }
          }
          // ink (the drawing is turned a touch against the photo frame)
          const qx = Math.round(pcx + (x - pcx) * rc - (y - pcy) * rs), qy = Math.round(pcy + (x - pcx) * rs + (y - pcy) * rc);
          if (qx >= 0 && qy >= 0 && qx < W && qy < H) {
            for (let li = 0; li < layers.length; li++) {
              const Ly = layers[li];
              const c = Ly.cov[qy * W + qx];
              if (c <= 0) continue;
              const a = c * Ly.opacity * (1 - Ly.grain * (rnd() * 2 - 0.4) * (Ly.grain > 0.2 ? 2 : 1));
              const aa = a < 0 ? 0 : (a > 1 ? 1 : a);
              r = r * (1 - aa) + Ly.color[0] * illum * aa; g = g * (1 - aa) + Ly.color[1] * illum * aa; b = b * (1 - aa) + Ly.color[2] * illum * aa;
            }
          }
        }
        out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
      }
    }
    const im = DL.util.makeImageData(W, H, out);
    // where the walls and pen-lift gaps ended up in the photo (the drawing is turned a touch), for the Node tests
    const toPhoto = function (x, y) { const qx = x - pcx, qy = y - pcy; return [pcx + qx * rc + qy * rs, pcy - qx * rs + qy * rc]; };
    im.truth = {
      runs: truth.runs.map(function (r) { return toPhoto(r[0], r[1]).concat(toPhoto(r[2], r[3])); }),
      gaps: truth.gaps.map(function (g) { const p = toPhoto(g[0], g[1]); return [p[0], p[1], g[2] * rc + g[3] * rs, -g[2] * rs + g[3] * rc]; }),
      gapPx: truth.gapPx, width: truth.width
    };
    return im;
  }

  // Named cases (tests only). Real photos in tests/real/ are the real test; these only catch regressions.
  const CASES = {
    "neat": { paper: "plain", shadow: "soft", ink: "pen", seed: 11 },
    "messy": { paper: "plain", shadow: "gradient", ink: "pen", seed: 12, wobble: 2.4, gaps: 4, cols: 7, rows: 9 },
    "ruled": { paper: "lined", shadow: "soft", ink: "blue", seed: 13 },
    "holes": { paper: "grid", shadow: "strong", ink: "pen", seed: 14, dots: 4, dotTouch: true },
    "landscape": { w: 1600, h: 1200, paper: "plain", shadow: "soft", ink: "red", seed: 15, dots: 2 },
    "pencil": { paper: "lined", shadow: "gradient", ink: "pencil", seed: 16 },
    "desk-marker": { desk: true, paper: "plain", ink: "marker", seed: 17, cols: 5, rows: 7, dots: 2 },
    "dense": { paper: "grid", shadow: "gradient", ink: "blue", seed: 19, cols: 11, rows: 15, wobble: 1.6, gaps: 3, dots: 3, dotR: 0.016 },
    "busy": { paper: "plain", ink: "marker", seed: 20, scribble: 900 },
    "blank": { paper: "lined", cols: 1, rows: 1, ink: "pen", opacity: 0, seed: 18 }
  };

  DL.sample = { load: load, photo: photo, CASES: CASES, _maze: makeMaze };
})();
