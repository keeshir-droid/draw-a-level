// Lift: photo -> the clean ink of a hand-drawn maze -> a Level. Pure array code (no browser features), runs in Node.
//
//   DL.lift.fromImage(imageData, opts?) -> Promise<{ level, preview, info }>
//     level   : a Level without start/goal (PLAN.md section 7.3), already quantised exactly as the link stores it
//               and simplified until its link fits the budget (section 6.4)
//     preview : ImageData of the clean ink in level space (transparent paper, ink in the pen's colour), covering the
//               level from (0,0) to (w,h) at preview.width / level.w pixels per unit; for the lift animation
//     info    : { timings, photo: {w,h}, map: { crop, rotated, scale, ox, oy }, inkFrac, faint, linesRemoved,
//                 linkLength, tol, stats }   (map: level (u,v) <- photo, for animating from the photo to the board)
//   Rejects with an Error {code, title, detail}: "no-ink", "too-faint", "too-busy".
//
// Steps 1-5 (paper estimate, ink amount with the photo's own noise level, ruled/grid line removal and bridging,
// the soft matte, the faint-pencil path) are copied from Day 3 Doodle Alive's cleanup.js, which is proven on real
// photos (namespace DA -> DL). The end is new: keep ALL the ink on the page (not just the biggest doodle), reject a
// page that is far too busy, crop to the ink, turn landscape to portrait, resample into level space and vectorize.
//
// Changes against Doodle Alive's copy (named in the M1 report):
//  - "no-doodle" errors are "no-ink" here.
//  - the ruled-line leftover filter also checks how dark the piece is: a long straight PEN wall (a maze's border)
//    looks exactly like a leftover ruled line by shape alone, and Doodle Alive would have dropped it.
(function () {
  const DL = (globalThis.DL = globalThis.DL || {});
  const U = function () { return DL.util; };

  // ================= paper brightness estimate =================

  function morph(src, W, H, R, wantMax) {
    const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const xa = x - R < 0 ? 0 : x - R, xb = x + R >= W ? W - 1 : x + R;
        let m = src[y * W + xa];
        for (let xx = xa + 1; xx <= xb; xx++) { const v = src[y * W + xx]; if (wantMax ? v > m : v < m) m = v; }
        tmp[y * W + x] = m;
      }
    }
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) {
        const ya = y - R < 0 ? 0 : y - R, yb = y + R >= H ? H - 1 : y + R;
        let m = tmp[ya * W + x];
        for (let yy = ya + 1; yy <= yb; yy++) { const v = tmp[yy * W + x]; if (wantMax ? v > m : v < m) m = v; }
        out[y * W + x] = m;
      }
    }
    return out;
  }

  // What would blank paper look like here? Returns a full-size Float32 map of expected paper brightness.
  function paperEstimate(gray, w, h) {
    const long = Math.max(w, h);
    const f = Math.max(2, Math.round(long / 200));
    const lw = Math.ceil(w / f), lh = Math.ceil(h / f);
    const low = new Float32Array(lw * lh);
    const step = Math.max(1, Math.round(f / 3)), buf = new Uint8Array(64);
    for (let by = 0; by < lh; by++) {
      for (let bx = 0; bx < lw; bx++) {
        let n = 0;
        const ye = Math.min(h, (by + 1) * f), xe = Math.min(w, (bx + 1) * f);
        for (let y = by * f; y < ye; y += step) {
          for (let x = bx * f; x < xe; x += step) {
            const v = gray[y * w + x];
            let j = n++;
            while (j > 0 && buf[j - 1] > v) { buf[j] = buf[j - 1]; j--; }
            buf[j] = v;
          }
        }
        low[by * lw + bx] = buf[Math.floor(0.8 * (n - 1))];
      }
    }
    const R =Math.max(2, Math.min(Math.round(0.11 * long / f), Math.floor(Math.min(lw, lh) / 2)));
    // Pad the edges first: where the light fades towards a border, carry the fade on outwards (never brighten),
    // otherwise "closing" would leave the paper estimate too bright along that border.
    const PW = lw + 2 * R, PH = lh + 2 * R;
    const pad = new Float32Array(PW * PH);
    function sideSlope(get, n) { // average fade per block, outward; only the darkening kind is used
      let a = 0, b = 0;
      for (let i = 0; i < n; i++) { a += (get(i, 0) + get(i, 1) + get(i, 2)) / 3; b += (get(i, 3) + get(i, 4) + get(i, 5)) / 3; }
      const s = (a - b) / n / 3;
      return s < 0 ? Math.max(s, -3) : 0;
    }
    if (lw > 8 && lh > 8) {
      const sT = sideSlope(function (i, k) { return low[k * lw + i]; }, lw);
      const sB = sideSlope(function (i, k) { return low[(lh - 1 - k) * lw + i]; }, lw);
      const sL = sideSlope(function (i, k) { return low[i * lw + k]; }, lh);
      const sR = sideSlope(function (i, k) { return low[i * lw + (lw - 1 - k)]; }, lh);
      for (let y = 0; y < PH; y++) {
        for (let x = 0; x < PW; x++) {
          const ix = x - R, iy = y - R;
          const cx = ix < 0 ? 0 : (ix >= lw ? lw - 1 : ix), cy = iy < 0 ? 0 : (iy >= lh ? lh - 1 : iy);
          let v = low[cy * lw + cx];
          if (iy < 0) v += sT * -iy; else if (iy >= lh) v += sB * (iy - lh + 1);
          if (ix < 0) v += sL * -ix; else if (ix >= lw) v += sR * (ix - lw + 1);
          pad[y * PW + x] = v < 0 ? 0 : v;
        }
      }
    } else {
      for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) pad[y * PW + x] = low[Math.min(lh - 1, Math.max(0, y - R)) * lw + Math.min(lw - 1, Math.max(0, x - R))];
    }
    const closedPad = morph(morph(pad, PW, PH, R, true), PW, PH, R, false); // close: grow bright, shrink back
    let closed = new Float32Array(lw * lh);
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) closed[y * lw + x] = closedPad[(y + R) * PW + x + R];
    closed =U().boxBlur(closed, lw, lh, 2, 2);
    // bilinear back up to full size
    const est = new Float32Array(w * h);
    const x0s = new Int32Array(w), fxs = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      const g = Math.min(lw - 1, Math.max(0, (x + 0.5) / f - 0.5));
      const i = Math.min(lw - 2 < 0 ? 0 : lw - 2, g | 0);
      x0s[x] = i; fxs[x] = lw > 1 ? g - i : 0;
    }
    // interpolate along x once per block row, then blend two such lines for every output row
    function lineFor(j, out) {
      const base = j * lw;
      for (let x = 0; x < w; x++) { const i = x0s[x], fx = fxs[x]; out[x] = closed[base + i] + (closed[base + (i + 1 < lw ? i + 1 : i)] - closed[base + i]) * fx; }
    }
    let la = new Float32Array(w), lb = new Float32Array(w), ja = -1, jb = -1;
    for (let y = 0; y < h; y++) {
      const g = Math.min(lh - 1, Math.max(0, (y + 0.5) / f - 0.5));
      const j = Math.min(lh - 2 < 0 ? 0 : lh - 2, g | 0), fy = lh > 1 ? g - j : 0;
      const j1 = Math.min(lh - 1, j + 1);
      if (ja !== j) { if (jb === j) { const t = la; la = lb; lb = t; ja = jb; jb = -1; } else { lineFor(j, la); ja = j; } }
      if (jb !== j1) { lineFor(j1, lb); jb = j1; }
      const o = y * w, fy0 = 1 - fy;
      for (let x = 0; x < w; x++) est[o + x] = la[x] * fy0 + lb[x] * fy;
    }
    return { est: est, low: closed, lw: lw, lh: lh, f: f };
  }

  // ================= finding the paper on a table (from Day 2) =================

  function paperRegion(gray, w, h) {
    const f = 8;
    const lw = Math.floor(w / f), lh = Math.floor(h / f);
    if (lw < 20 || lh < 20) return null;
    let cur = new Float32Array(lw * lh);
    for (let y = 0; y < lh; y++) {
      for (let x = 0; x < lw; x++) {
        let s = 0;
        for (let dy = 0; dy < f; dy += 2) for (let dx = 0; dx < f; dx += 2) s += gray[(y * f + dy) * w + x * f + dx];
        cur[y * lw + x] = s / ((f / 2) * (f / 2));
      }
    }
    for (let pass = 0; pass < 3; pass++) {
      const nxt = new Float32Array(lw * lh);
      for (let y = 0; y < lh; y++) {
        for (let x = 0; x < lw; x++) {
          let s = 0, c = 0;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const yy = y + dy, xx = x + dx;
              if (yy < 0 || yy >= lh || xx < 0 || xx >= lw) continue;
              s += cur[yy * lw + xx]; c++;
            }
          }
          nxt[y * lw + x] = s / c;
        }
      }
      cur = nxt;
    }
    const hist = new Float64Array(256);
    for (let i = 0; i < cur.length; i++) hist[Math.min(255, Math.max(0, cur[i] | 0))]++;
    const total = cur.length;
    let sumAll = 0;
    for (let t = 0; t < 256; t++) sumAll += t * hist[t];
    let wB = 0, sumB = 0, best = -1, thr = 128, gap = 0;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (!wB) continue;
      const wF = total - wB;
      if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB, mF = (sumAll - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; thr = t; gap = mF - mB; }
    }
    if (gap < 45) return null;
    const bright = new Uint8Array(lw * lh);
    for (let i = 0; i < bright.length; i++) bright[i] = cur[i] > thr ? 1 : 0;
    let borderBright = 0, borderTotal = 0;
    for (let x = 0; x < lw; x++) { borderBright += bright[x] + bright[(lh - 1) * lw + x]; borderTotal += 2; }
    for (let y = 1; y < lh - 1; y++) { borderBright += bright[y * lw] + bright[y * lw + lw - 1]; borderTotal += 2; }
    if (borderBright / borderTotal > 0.5) return null;
    const seen = new Uint8Array(lw * lh), stack = new Int32Array(lw * lh);
    let bestList = null;
    for (let s0 = 0; s0 < bright.length; s0++) {
      if (!bright[s0] || seen[s0]) continue;
      const list = [];
      let sp = 0;
      stack[sp++] = s0; seen[s0] = 1;
      while (sp) {
        const p = stack[--sp];
        list.push(p);
        const py = (p / lw) | 0, px = p - py * lw;
        if (px > 0 && bright[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
        if (px < lw - 1 && bright[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
        if (py > 0 && bright[p - lw] && !seen[p - lw]) { seen[p - lw] = 1; stack[sp++] = p - lw; }
        if (py < lh - 1 && bright[p + lw] && !seen[p + lw]) { seen[p + lw] = 1; stack[sp++] = p + lw; }
      }
      if (!bestList || list.length > bestList.length) bestList = list;
    }
    if (!bestList) return null;
    const frac = bestList.length / (lw * lh);
    if (frac < 0.25 || frac > 0.96) return null;
    let page = new Uint8Array(lw * lh);
    bestList.forEach(function (p) { page[p] = 1; });
    const outside = new Uint8Array(lw * lh);
    let osp = 0;
    function pushOutside(p) { if (!page[p] && !outside[p]) { outside[p] = 1; stack[osp++] = p; } }
    for (let x = 0; x < lw; x++) { pushOutside(x); pushOutside((lh - 1) * lw + x); }
    for (let y = 0; y < lh; y++) { pushOutside(y * lw); pushOutside(y * lw + lw - 1); }
    while (osp) {
      const p = stack[--osp];
      const py = (p / lw) | 0, px = p - py * lw;
      if (px > 0) pushOutside(p - 1);
      if (px < lw - 1) pushOutside(p + 1);
      if (py > 0) pushOutside(p - lw);
      if (py < lh - 1) pushOutside(p + lw);
    }
    for (let i = 0; i < page.length; i++) page[i] = outside[i] ? 0 : 1;
    for (let pass = 0; pass < 3; pass++) { // shrink so the paper edge and its shadow line are left out
      const nxt = new Uint8Array(lw * lh);
      for (let y = 1; y < lh - 1; y++) {
        for (let x = 1; x < lw - 1; x++) {
          const i = y * lw + x;
          if (page[i] && page[i - 1] && page[i + 1] && page[i - lw] && page[i + lw]) nxt[i] = 1;
        }
      }
      page = nxt;
    }
    let x0 = lw, y0 = lh, x1 = -1, y1 = -1;
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) if (page[y * lw + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    return { page: page, lw: lw, lh: lh, f: f, bbox: { x0: x0 * f, y0: y0 * f, x1: Math.min(w - 1, (x1 + 1) * f - 1), y1: Math.min(h - 1, (y1 + 1) * f - 1) } };
  }

  // ================= ruled and grid lines =================

  // Finds long, thin, parallel bands, per part of the page, and wipes them from `rel` (the ink amount).
  // Returns the bands found; marks wiped pixels in lineMask.
  function removeLines(rel, lineMask, w, h, lo, bbox, S, img, est, kc) {
    const data = img.data;
    const bands = [];
    const PROF = {};
    const Tmax =Math.max(7, Math.round(10 * S));

    function family(fam) {
      const nA = fam === 0 ? w : h, nB = fam === 0 ? h : w;
      const sA = fam === 0 ? 1 : w, sB = fam === 0 ? w : 1;
      const a0 = fam === 0 ? bbox.x0 : bbox.y0, a1 = fam === 0 ? bbox.x1 : bbox.y1;
      const b0 = fam === 0 ? bbox.y0 : bbox.x0, b1 = fam === 0 ? bbox.y1 : bbox.x1;
      const E = a1 - a0 + 1;
      if (E < 160 * S) return;
      // candidate pixels (every second column of the family direction)
      const P0 = U().now();
      const CAP = 400000;
      const ca = new Int32Array(CAP), cb = new Int32Array(CAP);
      let nc = 0;
      // (only light-to-medium marks: dark solid pen areas must not steer the tilt search)
      const top = 0.5;
      if (fam === 0) {
        for (let b = b0; b <= b1 && nc < CAP; b++) { const row = b * w; for (let a = a0; a <= a1; a += 2) { const r = rel[row + a]; if (r > lo && r <= top && nc < CAP) { ca[nc] = a; cb[nc] = b; nc++; } } }
      } else {
        for (let a = a0; a <= a1 && nc < CAP; a += 2) { const row = a * w; for (let b = b0; b <= b1; b++) { const r = rel[row + b]; if (r > lo && r <= top && nc < CAP) { ca[nc] = a; cb[nc] = b; nc++; } } }
      }
      PROF.scan = (PROF.scan || 0) + U().now() - P0;
      if (nc < 300) return;
      let Wl = Math.round(0.36 * E);
      Wl = Math.min(E, Math.max(Wl, Math.round(240 * S)));
      // windows: overlapping parts of the page (copes with a tilted or fanned page), plus the whole length
      // (copes with lines hidden behind a big solid doodle in some parts)
      const wins = [];
      if (Wl < E) wins.push([a0, a1 + 1]);                 // the whole length goes first: its tilt is the hint
      for (let s = a0; s + Wl <= a1 + 1; s += Math.round(Wl / 2)) wins.push([s, s + Wl]);
      if (wins.length === (Wl < E ? 1 : 0) || wins[wins.length - 1][1] < a1 - 8) wins.push([Math.max(a0, a1 + 1 - Wl), a1 + 1]);
      const nV = nA + nB + 4;
      const hist = new Float32Array(nV);
      let hint = null;

      wins.forEach(function (win, wi) {
        const ws = win[0], we = win[1], Wl = we - ws;
        const Q0 = U().now();
        let np = 0;
        for (let i = 0; i < nc; i++) if (ca[i] >= ws && ca[i] < we) np++;
        if (np < 150) return;
        const pa = new Int32Array(np), pb = new Int32Array(np);
        for (let i = 0, j = 0; i < nc; i++) if (ca[i] >= ws && ca[i] < we) { pa[j] = ca[i]; pb[j] = cb[i]; j++; }
        // search with at most ~12000 points; the final histogram uses all of them
        const sub = Math.max(1, Math.ceil(np / 12000));
        function score(deg, stride) {
          const t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
          hist.fill(0);
          for (let i = 0; i < np; i += stride) hist[((pb[i] * c - pa[i] * s) + nA) | 0]++;
          let sum = 0;
          for (let i = 0; i < nV; i++) sum += hist[i] * hist[i];
          return sum;
        }
        let best = 0, bestS = -1;
        if (hint === null || (Wl >= E)) {
          for (let d = -24; d <= 24; d += 2) { const sc = score(d, sub); if (sc > bestS) { bestS = sc; best = d; } }
          let c0 = best;
          for (let d = c0 - 2; d <= c0 + 2; d += 0.5) { const sc = score(d, sub); if (sc > bestS) { bestS = sc; best = d; } }
        } else {
          for (let d = hint - 3; d <= hint + 3; d += 0.5) { const sc = score(d, sub); if (sc > bestS) { bestS = sc; best = d; } }
        }
        let c0 = best;
        for (let d = c0 - 0.5; d <= c0 + 0.5; d += 0.125) { const sc = score(d, sub); if (sc > bestS) { bestS = sc; best = d; } }
        if (wi === 0) hint = best;
        const theta = best * Math.PI / 180, cosT = Math.cos(theta), sinT = Math.sin(theta);
        score(best, 1);
        PROF.search = (PROF.search || 0) + U().now() - Q0;
        const Q1 = U().now();
        const ncols = Math.ceil(Wl / 2), need = 0.42 * ncols;
        // runs of "busy" rows (bins), allowing a one-bin gap
        const runs = [];
        let i = 0;
        while (i < nV) {
          if (hist[i] < need) { i++; continue; }
          let j = i, last = i;
          while (j + 1 < nV && (hist[j + 1] >= need || (j + 2 < nV && hist[j + 2] >= need))) { j++; if (hist[j] >= need) last = j; }
          runs.push([i, last]);
          i = last + 1;
        }
        const cands = [];
        runs.forEach(function (r) {
          const T = r[1] - r[0] + 1;
          if (T > Tmax) return;
          cands.push({ v0: r[0] - nA - 0.5, v1: r[1] - nA + 1.5, T: T });
        });
        if (!cands.length) return;
        // is it ruled paper (regular spacing)?
        let periodic = false;
        if (cands.length >= 3) {
          const cen = cands.map(function (c) { return (c.v0 + c.v1) / 2; }).sort(function (x, y) { return x - y; });
          const gaps = [];
          for (let k = 1; k < cen.length; k++) gaps.push(cen[k] - cen[k - 1]);
          const m = U().median(gaps);
          let ok = 0;
          gaps.forEach(function (g) { const q = g / m; if (m > 8 * S && Math.abs(q - Math.round(q)) <= 0.2) ok++; });
          periodic = ok >= gaps.length - 1 && ok >= 2;
        }
        const vbuf = new Float32Array((Math.ceil(Wl / 3) + 2) * (Tmax + 8));
        cands.forEach(function (c) {
          // how dark and what colour is this line? (sampled on every third column)
          let nv = 0, dR = 0, dG = 0, dB = 0;
          const v0 = c.v0, v1 = c.v1;
          for (let a = ws; a < we; a += 3) {
            const bl = Math.max(0, Math.floor((v0 + a * sinT) / cosT) - 1), bh = Math.min(nB - 1, Math.ceil((v1 + a * sinT) / cosT) + 1);
            for (let b = bl; b <= bh; b++) {
              const v = b * cosT - a * sinT;
              if (v < v0 || v > v1) continue;
              const idx = a * sA + b * sB, r = rel[idx];
              if (r > lo && nv < vbuf.length) {
                vbuf[nv++] = r;
                const p = est[idx], o = idx * 4;
                dR += p * kc[0] - data[o]; dG += p * kc[1] - data[o + 1]; dB += p * kc[2] - data[o + 2];
              }
            }
          }
          if (nv < 20) return;
          const med = U().median(vbuf.subarray(0, nv));
          const mx = Math.max(dR, dG, dB), mn = Math.min(dR, dG, dB);
          const colourness = mx > 1 ? (mx - mn) / mx : 0;
          if (med > 0.5) return;                      // a dark pen stroke, not printed ruling
          if (!periodic && colourness < 0.3) return;  // a single grey line may be the doodle's own
          const band = { fam: fam, a0: ws, a1: we, theta: theta, v0: c.v0 - 1.2, v1: c.v1 + 1.2, med: med, colour: colourness, periodic: periodic, nA: nA, nB: nB };
          bands.push(band);
          const thr = med * 1.45 + 0.03, bv0 = band.v0, bv1 = band.v1;
          for (let a = ws; a < we; a++) {
            const bl = Math.max(0, Math.floor((bv0 + a * sinT) / cosT) - 1), bh = Math.min(nB - 1, Math.ceil((bv1 + a * sinT) / cosT) + 1);
            for (let b = bl; b <= bh; b++) {
              const v = b * cosT - a * sinT;
              if (v < bv0 || v > bv1) continue;
              const idx = a * sA + b * sB;
              if (rel[idx] <= thr) { rel[idx] = 0; lineMask[idx] = 1; }
            }
          }
        });
        PROF.apply = (PROF.apply || 0) + U().now() - Q1;
      });
    }
    family(0);
    family(1);
    if (DL.lift) DL.lift._internals.linesProf = PROF;
    return bands;
  }

  // Where a pen or pencil stroke crossed a wiped line, the stroke may have a gap: bridge it.
  function bridgeLines(alpha, lineMask, w, h, bands) {
    bands.forEach(function (bd) {
      const fam = bd.fam, nB = bd.nB;
      const sA = fam === 0 ? 1 : w, sB = fam === 0 ? w : 1;
      const cosT = Math.cos(bd.theta), sinT = Math.sin(bd.theta);
      for (let a = bd.a0 + 2; a < bd.a1 - 2; a++) {
        const bLo = Math.floor((bd.v0 + a * sinT) / cosT), bHi = Math.ceil((bd.v1 + a * sinT) / cosT);
        const up = bLo - 3, dn = bHi + 3;
        if (up < 0 || dn >= nB) continue;
        let aboveInk = false, belowInk = false;
        for (let d = -2; d <= 2; d++) {
          if (alpha[(a + d) * sA + up * sB] > 128) aboveInk = true;
          if (alpha[(a + d) * sA + dn * sB] > 128) belowInk = true;
        }
        if (!(aboveInk && belowInk)) continue;
        for (let b = Math.max(0, bLo); b <= Math.min(nB - 1, bHi); b++) {
          const idx = a * sA + b * sB;
          if (lineMask[idx] && alpha[idx] < 230) alpha[idx] = 230;
        }
      }
    });
  }

  // ================= small helpers =================

  function dilateBin(src, W, H, r) { // box dilation with prefix sums
    const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
    const pre = new Int32Array(Math.max(W, H) + 1);
    for (let y = 0; y < H; y++) {
      pre[0] = 0;
      for (let x = 0; x < W; x++) pre[x + 1] = pre[x] + (src[y * W + x] ? 1 : 0);
      for (let x = 0; x < W; x++) tmp[y * W + x] = pre[Math.min(W, x + r + 1)] - pre[Math.max(0, x - r)] > 0 ? 1 : 0;
    }
    for (let x = 0; x < W; x++) {
      pre[0] = 0;
      for (let y = 0; y < H; y++) pre[y + 1] = pre[y] + tmp[y * W + x];
      for (let y = 0; y < H; y++) out[y * W + x] = pre[Math.min(H, y + r + 1)] - pre[Math.max(0, y - r)] > 0 ? 1 : 0;
    }
    return out;
  }

  function toHex(r, g, b) {
    function h(v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? "0" : "") + v.toString(16); }
    return "#" + h(r) + h(g) + h(b);
  }
  // pen colour as seen in the photo, slightly darker and more saturated so it reads on screen
  function polishInk(r, g, b) {
    const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255;
    let l = (mx + mn) / 2, s = 0, hh = 0;
    const d = mx - mn;
    if (d > 1e-6) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      const R = r / 255, G = g / 255, B = b / 255;
      if (mx === R) hh = ((G - B) / d + (G < B ? 6 : 0)); else if (mx === G) hh = (B - R) / d + 2; else hh = (R - G) / d + 4;
      hh /= 6;
    }
    s = Math.min(1, s * 1.3 + (s > 0.05 ? 0.05 : 0));
    l = Math.min(l * 0.85, 0.42);
    function hue2(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }
    if (s < 1e-6) return toHex(l * 255, l * 255, l * 255);
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return toHex(hue2(p, q, hh + 1 / 3) * 255, hue2(p, q, hh) * 255, hue2(p, q, hh - 1 / 3) * 255);
  }

  // histogram helpers on Float values
  function histPercentile(hist, total, p, binW, min) {
    const target = p * total;
    let acc = 0;
    for (let i = 0; i < hist.length; i++) { acc += hist[i]; if (acc >= target) return min + (i + 0.5) * binW; }
    return min + hist.length * binW;
  }

  // ================= the main job =================

  // ================= the matte (Doodle Alive's steps 1-5) =================

  // paperRegion splits bright from dark. A hand or phone shadow across the page is dark too, and would be taken
  // for "the table around the paper" (its ink wiped). A shadow is the paper's own colour, only darker; a table
  // usually has a colour of its own (wood) or is far darker. Same colour and not too dark -> a shadow, not a table.
  function looksLikeShadow(region, data, w, h) {
    const f = region.f, lw = region.lw, lh = region.lh;
    const inS = [0, 0, 0, 0], outS = [0, 0, 0, 0];
    for (let by = 0; by < lh; by++) {
      for (let bx = 0; bx < lw; bx++) {
        const o = ((by * f + (f >> 1)) * w + bx * f + (f >> 1)) * 4;
        if (o + 2 >= data.length) continue;
        const s = region.page[by * lw + bx] ? inS : outS;
        s[0] += data[o]; s[1] += data[o + 1]; s[2] += data[o + 2]; s[3]++;
      }
    }
    if (inS[3] < 10 || outS[3] < 10) return false;
    const iR = inS[0] / inS[3], iG = inS[1] / inS[3], iB = inS[2] / inS[3];
    const oR = outS[0] / outS[3], oG = outS[1] / outS[3], oB = outS[2] / outS[3];
    const iL = iR + iG + iB, oL = oR + oG + oB;
    if (oL < 0.45 * iL) return false;          // far darker: a real table (or the dark floor)
    const dr = Math.abs(oR / oL - iR / iL), dg = Math.abs(oG / oL - iG / iL), db = Math.abs(oB / oL - iB / iL);
    return Math.max(dr, dg, db) < 0.025;       // the same colour, only darker: a shadow on the paper
  }

  function matte(img, T, lap) {
    const w = img.width, h = img.height, N = w * h, data = img.data;
    const S = Math.max(w, h) / 1600;

    // 1. grey
    const gray = new Uint8Array(N);
    for (let i = 0, j = 0; i < N; i++, j += 4) gray[i] = (data[j] * 77 + data[j + 1] * 151 + data[j + 2] * 28) >> 8;
    lap("grey");

    // 2. the paper: where it is, and what blank paper would look like
    let region = paperRegion(gray, w, h);
    if (region && looksLikeShadow(region, data, w, h)) region = null;
    const pe = paperEstimate(gray, w, h);
    const est = pe.est;
    let sR = 0, sG = 0, sB = 0, sL = 0;
    for (let i = 0; i < N; i += 17) {
      if (gray[i] >= est[i] * 0.94) { const o = i * 4; sR += data[o]; sG += data[o + 1]; sB += data[o + 2]; sL += gray[i]; }
    }
    const kc = sL > 0 ? [sR / sL, sG / sL, sB / sL] : [1, 1, 1];
    const paperLevel = U().median(pe.low);
    lap("paper");
    if (paperLevel < 55) throw U().error("too-faint");

    // 3. ink amount relative to the paper estimate (0 = paper, 1 = black)
    const rel = new Float32Array(N);
    const BIN = 0.002, HMIN = -0.3, HN = 750;
    const nhist = new Float64Array(HN);
    const sampIdx = new Int32Array(h * Math.ceil(w / 3) + 16);
    const inPageX = new Int32Array(w);
    if (region) for (let x = 0; x < w; x++) inPageX[x] = Math.min(region.lw - 1, (x / region.f) | 0);
    const kc0 = kc[0], kc1 = kc[1], kc2 = kc[2];
    let cnt = 0;
    for (let y = 0; y < h; y++) {
      const ly = region ? Math.min(region.lh - 1, (y / region.f) | 0) * region.lw : 0;
      for (let x = 0; x < w; x += 3) {
        if (region && !region.page[ly + inPageX[x]]) continue;
        const i = y * w + x, p = est[i], o = i * 4;
        let d = p - gray[i];
        let dm = p * kc0 - data[o];
        const dg = p * kc1 - data[o + 1], db = p * kc2 - data[o + 2];
        if (dg > dm) dm = dg; if (db > dm) dm = db;
        dm *= 0.8;
        if (dm > d) d = dm;
        const r = d / (p > 60 ? p : 60);
        let bi = ((r - HMIN) * (1 / BIN)) | 0;
        bi = bi < 0 ? 0 : (bi >= HN ? HN - 1 : bi);
        nhist[bi]++; sampIdx[cnt++] = i;
      }
    }
    const nCount = cnt;
    if (nCount < 100) throw U().error("no-ink");
    const base = histPercentile(nhist, nCount, 0.5, BIN, HMIN);
    const dev = new Float64Array(HN);
    for (let i = 0; i < HN; i++) { const v = HMIN + (i + 0.5) * BIN; dev[Math.min(HN - 1, Math.round(Math.abs(v - base) / BIN))] += nhist[i]; }
    const sigma = Math.max(0.004, histPercentile(dev, nCount, 0.5, BIN, 0) * 1.4826);
    for (let i = 0, o = 0; i < N; i++, o += 4) {
      const p = est[i];
      let d = p - gray[i];
      let dm = p * kc0 - data[o];
      const dg = p * kc1 - data[o + 1], db = p * kc2 - data[o + 2];
      if (dg > dm) dm = dg; if (db > dm) dm = db;
      dm *= 0.8;
      if (dm > d) d = dm;
      rel[i] = d / (p > 60 ? p : 60) - base;
    }
    let pageArea = N;
    if (region) {
      pageArea = 0;
      for (let y = 0; y < h; y++) {
        const ly = Math.min(region.lh - 1, (y / region.f) | 0) * region.lw;
        for (let x = 0; x < w; x++) { if (!region.page[ly + inPageX[x]]) rel[y * w + x] = 0; else pageArea++; }
      }
    }
    const lo = Math.max(0.04, Math.min(0.22, 4.2 * sigma));
    // How much of the page is plainly dark, against the page's own white (95th percentile)? Dense ink fools the
    // paper estimate (it takes the ink for paper), so "too busy" also looks at the raw picture.
    const gh = new Int32Array(256);
    let gn = 0;
    for (let y = 0; y < h; y += 3) {
      const ly = region ? Math.min(region.lh - 1, (y / region.f) | 0) * region.lw : 0;
      for (let x = 0; x < w; x += 3) { if (region && !region.page[ly + inPageX[x]]) continue; gh[gray[y * w + x]]++; gn++; }
    }
    let acc = 0, white = 255;
    for (let v = 255; v >= 0; v--) { acc += gh[v]; if (acc >= 0.05 * gn) { white = v; break; } }
    let dark = 0;
    for (let v = 0; v < Math.floor(0.5 * white); v++) dark += gh[v];
    const darkFrac = gn ? dark / gn : 0;
    lap("ink amount");

    // 4. ruled and grid lines
    const bbox = region ? region.bbox : { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
    const lineMask = new Uint8Array(N);
    const bands = removeLines(rel, lineMask, w, h, lo, bbox, S, img, est, kc);
    lap("lines");

    // 5. the matte: soft alpha from "just above noise" to "clearly ink"
    function makeAlpha(loV, relArr) {
      const HB = 300, BW = 0.005;
      const ih = new Float64Array(HB);
      let n = 0;
      for (let i = 0; i < N; i += 2) {
        const r = relArr[i];
        if (r > loV) { ih[Math.min(HB - 1, (r / BW) | 0)]++; n++; }
      }
      const p90 = n > 50 ? histPercentile(ih, n, 0.9, BW, 0) : loV + 0.1;
      const hiV = Math.max(loV + 0.05, Math.min(0.65, 0.8 * p90));
      const a = new Uint8Array(N);
      const k = 255 / (hiV - loV);
      for (let i = 0; i < N; i++) {
        const v = (relArr[i] - loV) * k;
        a[i] = v <= 0 ? 0 : (v >= 255 ? 255 : v);
      }
      return { alpha: a, hi: hiV, p90: p90, n: n };
    }
    function denoised() {
      const r2 = U().boxBlur(rel, w, h, 1, 1);
      const keepRel = new Float32Array(N), keepOne = new Float32Array(N);
      for (let i = 0; i < N; i++) { if (!lineMask[i]) { keepRel[i] = rel[i]; keepOne[i] = 1; } }
      const rb = Math.max(8, Math.round(0.025 * Math.max(w, h)));
      const num = U().boxBlur(keepRel, w, h, rb, 2), den = U().boxBlur(keepOne, w, h, rb, 2);
      const broad = num;
      for (let i = 0; i < N; i++) broad[i] = num[i] / (den[i] > 0.05 ? den[i] : 0.05);
      for (let i = 0; i < N; i++) r2[i] = lineMask[i] ? 0 : r2[i] - broad[i];
      const nh2 = new Float64Array(HN);
      for (let k = 0; k < nCount; k++) { let bi = Math.floor((r2[sampIdx[k]] - HMIN) / BIN); bi = bi < 0 ? 0 : (bi >= HN ? HN - 1 : bi); nh2[bi]++; }
      const base2 = histPercentile(nh2, nCount, 0.5, BIN, HMIN);
      const dev2 = new Float64Array(HN);
      for (let i = 0; i < HN; i++) { const v = HMIN + (i + 0.5) * BIN; dev2[Math.min(HN - 1, Math.round(Math.abs(v - base2) / BIN))] += nh2[i]; }
      const s2 = Math.max(0.003, histPercentile(dev2, nCount, 0.5, BIN, 0) * 1.4826);
      for (let i = 0; i < N; i++) r2[i] -= base2;
      return { rel: r2, sigma: s2 };
    }
    let loUse = lo;
    let A = makeAlpha(lo, rel);
    let faint = false, dn = null;
    if (A.p90 < 0.28) {
      dn = denoised();
      loUse = Math.max(0.03, Math.min(lo, 4.2 * dn.sigma));
      A = makeAlpha(loUse, dn.rel);
      faint = true;
    }
    bridgeLines(A.alpha, lineMask, w, h, bands);
    lap("matte");
    return {
      w: w, h: h, S: S, alpha: A.alpha, lo: loUse, hi: A.hi, faint: faint, bands: bands, pageArea: pageArea, region: region, darkFrac: darkFrac,
      retry: function () { // a much lower threshold, for telling "too faint" from "nothing there"
        if (!dn) dn = denoised();
        const lo2 = Math.max(0.02, 2.6 * dn.sigma);
        const A2 = makeAlpha(lo2, dn.rel);
        return { alpha: A2.alpha, lo: lo2, hi: A2.hi };
      }
    };
  }

  // ================= which ink is real (all of it, not just the biggest doodle) =================

  function detectInk(alpha, w, h, S, loV, hiV) {
    const N = w * h;
    const aF = new Float32Array(N);
    for (let i = 0; i < N; i++) aF[i] = alpha[i];
    const aS = U().boxBlur(aF, w, h, 1, 1);
    const hard = new Uint8Array(N);
    for (let i = 0; i < N; i++) hard[i] = aS[i] >= 50 ? 1 : 0;
    const lab = U().labelBlobs(hard, w, h);
    const comps = lab.comps, labels = lab.labels, nc = comps.length;
    const inkSum = new Float64Array(nc + 1);
    for (let i = 0; i < N; i++) { const l = labels[i]; if (l) inkSum[l] += alpha[i]; }
    // edge sharpness: ink goes from paper to ink within a few pixels; a leftover shadow fades over dozens
    const gSum = new Float64Array(nc + 1), gCnt = new Int32Array(nc + 1);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!hard[i] || (hard[i - 1] && hard[i + 1] && hard[i - w] && hard[i + w])) continue;
        const gx = Math.abs(alpha[i + 1] - alpha[i - 1]), gy = Math.abs(alpha[i + w] - alpha[i - w]);
        gSum[labels[i]] += (gx > gy ? gx : gy) / 510; gCnt[labels[i]]++;
      }
    }
    const minBlob = Math.max(6, Math.round(20 * S * S));
    const long = Math.max(w, h);
    const span = hiV - loV;
    const ok = new Uint8Array(nc + 1), keep = new Uint8Array(nc + 1);
    comps.forEach(function (c) {
      const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1;
      const longDim = Math.max(bw, bh), shortDim = Math.min(bw, bh);
      const meanA = inkSum[c.id] / c.area;
      // a leftover ruled line: long, thin, straight AND light (a dark pen line of the same shape is a wall)
      if (longDim >= 0.3 * long && longDim / shortDim >= 8 && meanA < 120) return;
      if (c.area >= 4 * minBlob && gCnt[c.id] > 0) {
        const sharp = ((gSum[c.id] / gCnt[c.id]) * span) / (loV + (meanA / 255) * span);
        if (sharp < 0.05) return; // soft shadow, not ink
      }
      if (c.area >= 3) ok[c.id] = 1;
    });
    // tiny pieces: keep them next to a real stroke or in a crowd (grainy pencil), drop them alone (dust)
    const near = 8 * S + 2, gw8 = Math.ceil(w / 8), gh8 = Math.ceil(h / 8);
    const cellCnt = new Int32Array(gw8 * gh8);
    const big = [];
    comps.forEach(function (c) {
      if (!ok[c.id]) return;
      const sx = c.start % w, sy = (c.start / w) | 0;
      cellCnt[(sy >> 3) * gw8 + (sx >> 3)]++;
      if (c.area >= 6 * minBlob) big.push(c);
    });
    // a coarse map of the big strokes, for the "next to a stroke" test
    const K = 16, cw = Math.ceil(w / K), ch = Math.ceil(h / K);
    const bigMap = new Uint8Array(cw * ch);
    big.forEach(function (b) {
      for (let y = Math.max(0, Math.floor((b.y0 - near) / K)); y <= Math.min(ch - 1, Math.floor((b.y1 + near) / K)); y++)
        for (let x = Math.max(0, Math.floor((b.x0 - near) / K)); x <= Math.min(cw - 1, Math.floor((b.x1 + near) / K)); x++) bigMap[y * cw + x] = 1;
    });
    // trails: faint, grainy pencil breaks into a string of specks and single dark grains a few pixels apart (too
    // small for the blurred map above). Pieces and grains that join up (within ~10 px) into a long, stroke-sized
    // group are one line, even with no big stroke nearby. Lone dust stays alone.
    const okHard = new Uint8Array(N), loose = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const l = labels[i];
      if (l && ok[l]) okHard[i] = 1;
      else if (alpha[i] >= 128 && (!l || comps[l - 1].area < 3)) { okHard[i] = 1; loose[i] = 1; }
    }
    const grp = U().labelBlobs(dilateBin(okHard, w, h, Math.max(2, Math.round(5 * S))), w, h);
    const ng = grp.comps.length;
    const gArea = new Float64Array(ng + 1), gPieces = new Int32Array(ng + 1);
    comps.forEach(function (c) { if (!ok[c.id]) return; const g = grp.labels[c.start]; gArea[g] += c.area; gPieces[g]++; });
    for (let i = 0; i < N; i++) if (loose[i]) { const g = grp.labels[i]; gArea[g]++; gPieces[g]++; }
    const trailLen = 40 * S, trail = new Uint8Array(ng + 1);
    for (let g = 1; g <= ng; g++) {
      const gc = grp.comps[g - 1];
      if (gPieces[g] >= 3 && gArea[g] >= 6 * minBlob && Math.max(gc.x1 - gc.x0, gc.y1 - gc.y0) >= trailLen) trail[g] = 1;
    }
    let kept = 0;
    comps.forEach(function (c) {
      if (!ok[c.id]) return;
      if (c.area >= minBlob) { keep[c.id] = 1; kept++; return; }
      if (trail[grp.labels[c.start]]) { keep[c.id] = 1; kept++; return; }
      const sx = c.start % w, sy = (c.start / w) | 0, cx = sx >> 3, cy = sy >> 3;
      let crowd = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = cx + dx, Y = cy + dy;
        if (X >= 0 && Y >= 0 && X < gw8 && Y < gh8) crowd += cellCnt[Y * gw8 + X];
      }
      if (crowd >= 4) { keep[c.id] = 1; kept++; return; }
      // next to a big stroke (its bounding box): a coarse check first, then the exact pixels nearby
      if (!bigMap[Math.floor(sy / K) * cw + Math.floor(sx / K)]) return;
      const r = Math.ceil(near);
      for (let y = Math.max(0, c.y0 - r); y <= Math.min(h - 1, c.y1 + r); y += 2) {
        for (let x = Math.max(0, c.x0 - r); x <= Math.min(w - 1, c.x1 + r); x += 2) {
          const l = labels[y * w + x];
          if (l && l !== c.id && ok[l] && comps[l - 1].area >= 6 * minBlob) { keep[c.id] = 1; kept++; return; }
        }
      }
    });
    // the kept ink
    const inkAlpha = new Uint8Array(N);
    let x0 = w, y0 = h, x1 = -1, y1 = -1, inkPx = 0, inkSumAll = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x, l = labels[i];
        if (loose[i] && trail[grp.labels[i]]) inkAlpha[i] = alpha[i]; // a lone grain of a pencil trail
        else if (!l || !keep[l]) continue;
        else inkAlpha[i] = alpha[i] > 0 ? alpha[i] : 40; // (the blurred edge pixels count a little)
        inkPx++; inkSumAll += alpha[i];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    return { inkAlpha: inkAlpha, kept: kept, inkPx: inkPx, ink: inkSumAll / 255, bbox: x1 >= 0 ? { x0: x0, y0: y0, x1: x1, y1: y1 } : null };
  }

  // ================= into level space =================

  // Box averages of a Uint8 field over a crop, through an integral image.
  function makeSampler(src, w, cx0, cy0, cw, ch) {
    const IW = cw + 1;
    const I = new Uint32Array(IW * (ch + 1));
    for (let y = 0; y < ch; y++) {
      let row = 0;
      const so = (cy0 + y) * w + cx0, io = (y + 1) * IW;
      for (let x = 0; x < cw; x++) { row += src[so + x]; I[io + x + 1] = I[io - IW + x + 1] + row; }
    }
    return function (x0, y0, x1, y1) { // crop pixels [x0,x1) x [y0,y1)
      if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0; if (x1 > cw) x1 = cw; if (y1 > ch) y1 = ch;
      if (x1 <= x0 || y1 <= y0) return 0;
      const s = I[y1 * IW + x1] - I[y0 * IW + x1] - I[y1 * IW + x0] + I[y0 * IW + x0];
      return s / ((x1 - x0) * (y1 - y0));
    };
  }

  // Resample the ink into a gw x gh field where one pixel is `unit` level units.
  function toLevelSpace(sample, map, gw, gh, unit) {
    const out = new Uint8Array(gw * gh);
    const s = map.scale, RW = map.RW, RH = map.RH, ch = map.ch;
    const us = new Int32Array(gw + 1), vs = new Int32Array(gh + 1);
    for (let gx = 0; gx <= gw; gx++) us[gx] = Math.round((gx * unit - map.ox) / s);
    for (let gy = 0; gy <= gh; gy++) vs[gy] = Math.round((gy * unit - map.oy) / s);
    for (let gy = 0; gy < gh; gy++) {
      let v0 = vs[gy], v1 = vs[gy + 1];
      if (v1 <= v0) v1 = v0 + 1;
      if (v1 <= 0 || v0 >= RH) continue;
      for (let gx = 0; gx < gw; gx++) {
        let u0 = us[gx], u1 = us[gx + 1];
        if (u1 <= u0) u1 = u0 + 1;
        if (u1 <= 0 || u0 >= RW) continue;
        const a = map.rotated ? sample(v0, ch - u1, v1, ch - u0) : sample(u0, v0, u1, v1);
        out[gy * gw + gx] = a > 255 ? 255 : a;
      }
    }
    return out;
  }

  // The ink field (0-255) -> walls mask. Hysteresis: clear ink (>= 80) plus the fainter ink (>= 28) touching it, so
  // light, grainy pencil stays one line; then a 1-pixel closing (2 units) mends hairline breaks. Real gaps (a maze
  // opening is at least a ball wide, 20+ units) are far wider and stay open.
  function binarize(field, w, h) {
    const N = w * h, m = new Uint8Array(N), st = [];
    for (let i = 0; i < N; i++) if (field[i] >= 80) { m[i] = 1; st.push(i); }
    while (st.length) {
      const p = st.pop(), y = (p / w) | 0, x = p - y * w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const q = Y * w + X;
        if (!m[q] && field[q] >= 28) { m[q] = 1; st.push(q); }
      }
    }
    const dil = new Uint8Array(N);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      dil[i] = (m[i] || m[i - 1] || m[i + 1] || m[i - w] || m[i + w] || m[i - w - 1] || m[i - w + 1] || m[i + w - 1] || m[i + w + 1]) ? 1 : 0;
    }
    const out = new Uint8Array(N);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      out[i] = m[i] || (dil[i - 1] && dil[i + 1] && dil[i - w] && dil[i + w] && dil[i - w - 1] && dil[i - w + 1] && dil[i + w - 1] && dil[i + w + 1] && dil[i]) ? 1 : 0;
    }
    return out;
  }

  function penColour(inkAlpha, img) {
    const data = img.data, N = inkAlpha.length;
    let mx = 0;
    for (let i = 0; i < N; i += 3) if (inkAlpha[i] > mx) mx = inkAlpha[i];
    const thr = mx >= 230 ? 230 : Math.round(mx * 0.85);
    const R = [], G = [], B = [];
    let n = 0;
    for (let i = 0; i < N; i += 3) if (inkAlpha[i] >= thr) n++;
    const stride = Math.max(1, Math.floor(n / 3000));
    let k = 0;
    for (let i = 0; i < N; i += 3) {
      if (inkAlpha[i] < thr) continue;
      if ((k++ % stride) !== 0) continue;
      const o = i * 4; R.push(data[o]); G.push(data[o + 1]); B.push(data[o + 2]);
    }
    if (!R.length) return "#1d2340";
    return polishInk(U().median(R), U().median(G), U().median(B));
  }

  // ================= the main job =================

  const UNIT = 2;          // level units per vectorizing pixel (a 500-wide field)
  const PREVIEW_W = 720;   // preview width in pixels
  const BUSY = 0.35;       // ink over ~35% of the page
  const MAX_PIECES = 450;  // separate ink pieces: more than this looks like a printed page, not a maze

  async function fromImage(img, opts) {
    opts = opts || {};
    await new Promise(function (res) { setTimeout(res, 0); }); // let the page paint a message first
    const T = {}; let tm = U().now(); const t0 = tm;
    function lap(name) { const t = U().now(); T[name] = Math.round(t - tm); tm = t; }
    if (!img || !img.width || !img.height || !img.data) throw U().error("unreadable");
    const M = matte(img, T, lap);
    const w = M.w, h = M.h, long = Math.max(w, h), S = M.S;
    if (M.darkFrac > 0.3) throw U().error("too-busy");

    let found = detectInk(M.alpha, w, h, S, M.lo, M.hi);
    lap("ink");
    function real(f) { return f.bbox && Math.max(f.bbox.x1 - f.bbox.x0 + 1, f.bbox.y1 - f.bbox.y0 + 1) >= 0.12 * long && f.ink >= 300 * S * S; }
    if (!real(found)) {
      const r2 = M.retry();
      const f2 = detectInk(r2.alpha, w, h, S, r2.lo, r2.hi);
      if (real(f2)) throw U().error("too-faint");
      throw U().error("no-ink");
    }
    const inkFrac = found.inkPx / Math.max(1, M.pageArea);
    if (inkFrac > BUSY || found.kept > MAX_PIECES) throw U().error("too-busy");

    // crop to the ink plus a margin; landscape turns to portrait
    const b = found.bbox;
    const margin = Math.round(0.035 * Math.max(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1)) + 6;
    const cx0 = Math.max(0, b.x0 - margin), cy0 = Math.max(0, b.y0 - margin);
    const cx1 = Math.min(w - 1, b.x1 + margin), cy1 = Math.min(h - 1, b.y1 + margin);
    const cw = cx1 - cx0 + 1, ch = cy1 - cy0 + 1;
    const rotated = cw > ch;
    const RW = rotated ? ch : cw, RH = rotated ? cw : ch;
    const LW = DL.LEVEL_W || 1000;
    let scale = LW / RW, ox = 0, oy = 0, LH = RH * scale;
    if (LH < 1000) { oy = (1000 - LH) / 2; LH = 1000; }
    else if (LH > 2000) { scale = 2000 / RH; ox = (LW - RW * scale) / 2; LH = 2000; }
    else { const r = Math.round(LH); oy = (r - LH) / 2; LH = r; }
    const map = { crop: { x: cx0, y: cy0, w: cw, h: ch }, rotated: rotated, scale: scale, ox: ox, oy: oy, RW: RW, RH: RH, ch: ch };
    const sample = makeSampler(found.inkAlpha, w, cx0, cy0, cw, ch);
    const gw = Math.round(LW / UNIT), gh = Math.ceil(LH / UNIT);
    const field = toLevelSpace(sample, map, gw, gh, UNIT);
    const mask = binarize(field, gw, gh);
    const ink = penColour(found.inkAlpha, img);
    lap("crop");

    // vectorize
    const V = DL.vectorize.fromMask(mask, gw, gh, UNIT, { levelW: LW, levelH: LH, field: field });
    lap("vectorize");

    // the preview: the clean ink in the pen's colour on transparent paper, only where it became part of the level
    const pu = LW / PREVIEW_W, PH = Math.round(LH / pu);
    const pf = toLevelSpace(sample, map, PREVIEW_W, PH, pu);
    const rgb = U().hexToRgb(ink);
    const pd = new Uint8ClampedArray(PREVIEW_W * PH * 4);
    const used = V.used;
    for (let y = 0, i = 0; y < PH; y++) {
      const gy = Math.min(gh - 1, Math.floor((y + 0.5) * pu / UNIT));
      for (let x = 0; x < PREVIEW_W; x++, i++) {
        const o = i * 4;
        pd[o] = rgb.r; pd[o + 1] = rgb.g; pd[o + 2] = rgb.b;
        if (!pf[i]) continue;
        const gx = Math.min(gw - 1, Math.floor((x + 0.5) * pu / UNIT));
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
          const X = gx + dx, Y = gy + dy;
          if (X >= 0 && Y >= 0 && X < gw && Y < gh && used[Y * gw + X]) { near = true; break; }
        }
        if (near) pd[o + 3] = pf[i];
      }
    }
    const preview = U().makeImageData(PREVIEW_W, PH, pd);
    lap("preview");
    if (V.walls.length > 1500) throw U().error("too-busy");
    // a maze needs a real amount of wall: dust and leftovers of notebook lines on a blank page are not one
    let wallLen = 0;
    V.walls.forEach(function (wl) { wallLen += DL.vectorize._internals.polyLength(wl.pts); });
    if (wallLen < 800 && !V.fills.length) throw U().error("no-ink");
    const raw = { v: 1, w: LW, h: LH, ink: ink, ballR: V.ballR, walls: V.walls, fills: V.fills, holes: V.holes, start: null, goal: null, challenge: null };
    const fit = await DL.codec.fit(raw, DL.codec.BUDGET, { simplify: V.simplify });
    lap("link");
    T.total = Math.round(U().now() - t0);
    const info = {
      timings: T, photo: { w: w, h: h }, map: map, inkFrac: inkFrac, darkFrac: M.darkFrac, pieces: found.kept, faint: M.faint,
      linesRemoved: M.bands.length, linkLength: fit.text.length, tol: fit.tol, stats: V.stats
    };
    if (opts.debug) info.debug = { mask: mask, gw: gw, gh: gh, unit: UNIT, alpha: M.alpha, inkAlpha: found.inkAlpha, bands: M.bands };
    return { level: fit.level, preview: preview, info: info };
  }

  DL.lift = { fromImage: fromImage, _internals: { paperEstimate: paperEstimate, paperRegion: paperRegion, detectInk: detectInk } };
})();
