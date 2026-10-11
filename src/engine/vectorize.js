// Vectorize: a binary ink mask in level space -> walls (centre-line strokes with a width), filled polygons,
// holes and the ball size. Pure array code (no browser features), so it runs in Node too.
//
//   DL.vectorize.fromMask(mask, gw, gh, upx, opts?) -> {
//       walls: [{ pts: [x0,y0,x1,y1,...], width }], fills: [{ pts }], holes: [{ x, y, r }], ballR,
//       simplify(tol) -> walls (the same strokes simplified harder; used to fit the link budget),
//       stats: { strokeHalf, corridor, cores, ... } }
//     mask: Uint8Array gw x gh (1 = ink), one pixel = upx level units; the level is gw*upx wide.
//     opts.levelW (default 1000), opts.levelH (default gh*upx), opts.tol (RDP tolerance, default 2 units)
//
// PLAN.md section 5.3, steps 3-6:
//  - holes: solid, roughly round filled blobs (fill > 0.7, roundness > 0.6, diameter 2-8% of the width)
//  - big solid areas that are not holes -> filled polygons (outline traced, simplified)
//  - everything else: thinned to centre lines (Zhang-Suen, then a simple-point clean-up), traced into a graph,
//    short spurs pruned, strokes joined through junctions where they run straight on, simplified (RDP),
//    each with its median thickness (min 6 units)
//  - ball radius = 30% of the typical corridor width (median along the free-space ridges), clamped 10-28
//  - pen-lift gaps: free line ends (and dots) that face each other in line are joined when the paper gap is under
//    90% of the ball's width (the ball could never pass it anyway), so dashed pencil walls become whole walls and a
//    doorway the ball fits through is never closed; then specks shorter than ~12 units are dropped
(function () {
  const DL = (globalThis.DL = globalThis.DL || {});
  const U = function () { return DL.util; };

  const MIN_WIDTH = 6, SPECK = 12, HOLE_MIN = 0.02, HOLE_MAX = 0.08;

  // ---------- small helpers ----------
  function rdp(pts, tol) { // pts: flat [x,y,...]; returns a flat array
    const n = pts.length >> 1;
    if (n <= 2) return pts.slice();
    const keep = new Uint8Array(n);
    keep[0] = 1; keep[n - 1] = 1;
    const stack = [0, n - 1];
    const t2 = tol * tol;
    while (stack.length) {
      const b = stack.pop(), a = stack.pop();
      const ax = pts[2 * a], ay = pts[2 * a + 1], bx = pts[2 * b], by = pts[2 * b + 1];
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      let best = -1, bi = -1;
      for (let i = a + 1; i < b; i++) {
        const px = pts[2 * i] - ax, py = pts[2 * i + 1] - ay;
        let d2;
        if (l2 === 0) d2 = px * px + py * py;
        else {
          let t = (px * dx + py * dy) / l2;
          t = t < 0 ? 0 : (t > 1 ? 1 : t);
          const qx = px - t * dx, qy = py - t * dy;
          d2 = qx * qx + qy * qy;
        }
        if (d2 > best) { best = d2; bi = i; }
      }
      if (best > t2 && bi > 0) { keep[bi] = 1; stack.push(a, bi, bi, b); }
    }
    const out = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[2 * i], pts[2 * i + 1]);
    return out;
  }
  function polyLength(pts) {
    let L = 0;
    for (let i = 2; i < pts.length; i += 2) L += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
    return L;
  }
  function smooth(pts, closed) { // two passes of a 1-2-1 average, the ends stay put (unless closed)
    let cur = pts;
    const n = pts.length >> 1;
    if (n < 3) return pts.slice();
    for (let pass = 0; pass < 2; pass++) {
      const out = cur.slice();
      for (let i = 0; i < n; i++) {
        let a = i - 1, b = i + 1;
        if (closed) { if (a < 0) a = n - 2; if (b > n - 1) b = 1; }
        else if (i === 0 || i === n - 1) continue;
        out[2 * i] = (cur[2 * a] + 2 * cur[2 * i] + cur[2 * b]) / 4;
        out[2 * i + 1] = (cur[2 * a + 1] + 2 * cur[2 * i + 1] + cur[2 * b + 1]) / 4;
      }
      if (closed) { out[2 * (n - 1)] = out[0]; out[2 * (n - 1) + 1] = out[1]; }
      cur = out;
    }
    return cur;
  }

  // 8-neighbour offsets in ring order: E, NE, N, NW, W, SW, S, SE (Yokoi's order)
  function ringOffsets(w) { return [1, 1 - w, -w, -w - 1, -1, w - 1, w, w + 1]; }

  // Yokoi's 8-connectivity number of pixel i (how many separate neighbour groups it joins)
  function nc8(m, i, R) {
    const x = [];
    for (let k = 0; k < 8; k++) x.push(m[i + R[k]] ? 0 : 1); // complement
    let n = 0;
    for (let k = 0; k < 8; k += 2) n += x[k] - x[k] * x[(k + 1) & 7] * x[(k + 2) & 7];
    return n;
  }
  function count8(m, i, R) { let c = 0; for (let k = 0; k < 8; k++) if (m[i + R[k]]) c++; return c; }

  // ---------- thinning ----------
  function zhangSuen(m, w, h) {
    // m: Uint8Array, border pixels must be 0. Thinned in place.
    let list = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (m[i]) list.push(i); }
    const del = [];
    let changed = true, guard = 0;
    while (changed && guard++ < 200) {
      changed = false;
      for (let step = 0; step < 2; step++) {
        del.length = 0;
        for (let k = 0; k < list.length; k++) {
          const i = list[k];
          if (!m[i]) continue;
          const p2 = m[i - w], p3 = m[i - w + 1], p4 = m[i + 1], p5 = m[i + w + 1], p6 = m[i + w], p7 = m[i + w - 1], p8 = m[i - 1], p9 = m[i - w - 1];
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          const A = (!p2 && p3 ? 1 : 0) + (!p3 && p4 ? 1 : 0) + (!p4 && p5 ? 1 : 0) + (!p5 && p6 ? 1 : 0) +
                    (!p6 && p7 ? 1 : 0) + (!p7 && p8 ? 1 : 0) + (!p8 && p9 ? 1 : 0) + (!p9 && p2 ? 1 : 0);
          if (A !== 1) continue;
          if (step === 0) { if (p2 && p4 && p6) continue; if (p4 && p6 && p8) continue; }
          else { if (p2 && p4 && p8) continue; if (p2 && p6 && p8) continue; }
          del.push(i);
        }
        if (del.length) { changed = true; for (let k = 0; k < del.length; k++) m[del[k]] = 0; }
      }
      if (changed) list = list.filter(function (i) { return m[i]; });
    }
    // simple-point clean-up: remove pixels that join nothing (staircase corners), keep line ends
    const R = ringOffsets(w);
    for (let k = 0; k < list.length; k++) {
      const i = list[k];
      if (!m[i]) continue;
      if (count8(m, i, R) >= 2 && nc8(m, i, R) === 1) m[i] = 0;
    }
  }

  // ---------- skeleton -> graph -> chains ----------
  function traceSkeleton(sk, w, h) {
    const R = ringOffsets(w);
    const ORDER = [0, 2, 4, 6, 1, 3, 5, 7]; // 4-neighbours first
    const N = w * h;
    const isNode = new Uint8Array(N);
    const pix = [];
    for (let i = 0; i < N; i++) {
      if (!sk[i]) continue;
      pix.push(i);
      const c = count8(sk, i, R);
      if (c !== 2 || nc8(sk, i, R) !== 2) {
        // a pixel with exactly two neighbours that touch each other is still a line end
        isNode[i] = 1;
      }
    }
    // clusters of node pixels
    const cluster = new Int32Array(N).fill(-1);
    const clusters = [];
    for (let k = 0; k < pix.length; k++) {
      const s = pix[k];
      if (!isNode[s] || cluster[s] >= 0) continue;
      const id = clusters.length, members = [s];
      cluster[s] = id;
      for (let q = 0; q < members.length; q++) {
        const p = members[q];
        for (let r = 0; r < 8; r++) { const nb = p + R[r]; if (isNode[nb] && cluster[nb] < 0) { cluster[nb] = id; members.push(nb); } }
      }
      let sx = 0, sy = 0;
      members.forEach(function (p) { sx += p % w; sy += (p / w) | 0; });
      clusters.push({ id: id, members: members, x: sx / members.length, y: sy / members.length, ends: [] });
    }
    const visited = new Uint8Array(N);
    const edges = [];
    const seenPair = new Set();
    function walk(startNode, first) {
      const startC = cluster[startNode];
      const chain = [startNode, first];
      visited[first] = 1;
      let prev = startNode, cur = first;
      for (let guard = 0; guard < N; guard++) {
        let next = -1;
        // a node next to us ends the edge (don't walk past a junction)
        for (let r = 0; r < 8 && next < 0; r++) {
          const nb = cur + R[ORDER[r]];
          if (nb === prev || !sk[nb] || !isNode[nb]) continue;
          if (cluster[nb] === startC && chain.length <= 3) continue;
          next = nb;
        }
        if (next >= 0) { chain.push(next); return { a: startC, b: cluster[next], px: chain }; }
        for (let r = 0; r < 8 && next < 0; r++) {
          const nb = cur + R[ORDER[r]];
          if (nb === prev || !sk[nb] || isNode[nb] || visited[nb]) continue;
          next = nb;
        }
        if (next < 0) return { a: startC, b: -1, px: chain };
        visited[next] = 1;
        chain.push(next);
        prev = cur; cur = next;
      }
      return { a: startC, b: -1, px: chain };
    }
    for (let k = 0; k < pix.length; k++) {
      const s = pix[k];
      if (!isNode[s]) continue;
      for (let r = 0; r < 8; r++) {
        const nb = s + R[ORDER[r]];
        if (!sk[nb]) continue;
        if (isNode[nb]) {
          if (cluster[nb] === cluster[s]) continue;
          const key = Math.min(cluster[s], cluster[nb]) + ":" + Math.max(cluster[s], cluster[nb]);
          if (seenPair.has(key)) continue;
          seenPair.add(key);
          edges.push({ a: cluster[s], b: cluster[nb], px: [s, nb] });
        } else if (!visited[nb]) {
          edges.push(walk(s, nb));
        }
      }
    }
    // isolated nodes (dots, tiny knots) with no edges at all: one short piece each
    const hasEdge = new Uint8Array(clusters.length);
    edges.forEach(function (e) { if (e.a >= 0) hasEdge[e.a] = 1; if (e.b >= 0) hasEdge[e.b] = 1; });
    clusters.forEach(function (c) {
      if (hasEdge[c.id]) return;
      const mem = c.members.slice().sort(function (p, q) { return (p % w) - (q % w) || p - q; });
      edges.push({ a: -1, b: -1, px: mem.length > 1 ? [mem[0], mem[mem.length - 1]] : [mem[0]] });
    });
    // loops without any node
    for (let k = 0; k < pix.length; k++) {
      const s = pix[k];
      if (isNode[s] || visited[s]) continue;
      visited[s] = 1;
      const chain = [s];
      let prev = -1, cur = s;
      for (let guard = 0; guard < N; guard++) {
        let next = -1;
        for (let r = 0; r < 8 && next < 0; r++) {
          const nb = cur + R[ORDER[r]];
          if (nb === prev || !sk[nb] || visited[nb]) continue;
          next = nb;
        }
        if (next < 0) break;
        visited[next] = 1; chain.push(next); prev = cur; cur = next;
      }
      chain.push(s);
      edges.push({ a: -1, b: -1, px: chain, loop: true });
    }
    edges.forEach(function (e, ei) {
      e.id = ei;
      if (e.a >= 0) clusters[e.a].ends.push({ e: ei, side: 0 });
      if (e.b >= 0) clusters[e.b].ends.push({ e: ei, side: 1 });
    });
    return { clusters: clusters, edges: edges };
  }

  // pixel chain -> flat point list in pixel coordinates, junction ends moved to the cluster centre
  function edgePoints(e, clusters, w) {
    const out = [];
    for (let k = 0; k < e.px.length; k++) {
      const p = e.px[k];
      let x = p % w, y = (p / w) | 0;
      if (k === 0 && e.a >= 0 && clusters[e.a].members.length > 1) { x = clusters[e.a].x; y = clusters[e.a].y; }
      if (k === e.px.length - 1 && e.b >= 0 && clusters[e.b].members.length > 1) { x = clusters[e.b].x; y = clusters[e.b].y; }
      out.push(x, y);
    }
    return out;
  }

  function buildChains(graph, D, w, hwPx) {
    const clusters = graph.clusters;
    let edges = graph.edges.filter(function (e) { return e.px.length >= 1; });
    // prune spurs (short branches from a junction to a free end), twice
    const spurMax = 2 * hwPx + 2.5;
    for (let round = 0; round < 2; round++) {
      const deg = new Int32Array(clusters.length);
      edges.forEach(function (e) { if (e.a >= 0) deg[e.a]++; if (e.b >= 0) deg[e.b]++; });
      const before = edges.length;
      edges = edges.filter(function (e) {
        if (e.loop) return true;
        const da = e.a >= 0 ? deg[e.a] : 0, db = e.b >= 0 ? deg[e.b] : 0;
        const freeA = e.a < 0 || da === 1, freeB = e.b < 0 || db === 1;
        const len = e.px.length - 1;
        if (freeA !== freeB && len <= spurMax && Math.max(da, db) >= 3) return false;
        return true;
      });
      if (edges.length === before) break;
    }
    // per cluster: the ends, and which ends pair up (go straight on through the junction)
    const ends = clusters.map(function () { return []; });
    edges.forEach(function (e, k) {
      e.k = k;
      if (e.a >= 0) ends[e.a].push({ k: k, side: 0 });
      if (e.b >= 0 && !(e.a === e.b && e.px.length <= 2)) ends[e.b].push({ k: k, side: 1 });
    });
    const pts = edges.map(function (e) { return edgePoints(e, clusters, w); });
    function dirAway(k, side) { // unit direction leaving the cluster along edge k
      const p = pts[k], n = p.length >> 1;
      const look = Math.min(n - 1, 6);
      let ax, ay, bx, by;
      if (side === 0) { ax = p[0]; ay = p[1]; bx = p[2 * look]; by = p[2 * look + 1]; }
      else { ax = p[2 * (n - 1)]; ay = p[2 * (n - 1) + 1]; bx = p[2 * (n - 1 - look)]; by = p[2 * (n - 1 - look) + 1]; }
      const l = Math.hypot(bx - ax, by - ay) || 1;
      return [(bx - ax) / l, (by - ay) / l];
    }
    const pairOf = new Map(); // "k:side" -> {k, side}
    ends.forEach(function (list) {
      if (list.length === 2) {
        pairOf.set(list[0].k + ":" + list[0].side, list[1]);
        pairOf.set(list[1].k + ":" + list[1].side, list[0]);
        return;
      }
      if (list.length < 3) return;
      const dirs = list.map(function (en) { return dirAway(en.k, en.side); });
      const cand = [];
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        if (list[i].k === list[j].k) continue;
        const c = dirs[i][0] * dirs[j][0] + dirs[i][1] * dirs[j][1];
        if (c < -0.6) cand.push([c, i, j]);
      }
      cand.sort(function (a, b) { return a[0] - b[0]; });
      const used = new Uint8Array(list.length);
      cand.forEach(function (c) {
        if (used[c[1]] || used[c[2]]) return;
        used[c[1]] = used[c[2]] = 1;
        pairOf.set(list[c[1]].k + ":" + list[c[1]].side, list[c[2]]);
        pairOf.set(list[c[2]].k + ":" + list[c[2]].side, list[c[1]]);
      });
    });
    // walk the chains
    const done = new Uint8Array(edges.length);
    const chains = [];
    // a free end: a real line end (not a junction with other walls), so a pen-lift gap there may be bridged
    function endFree(k, side) { const c = side === 0 ? edges[k].a : edges[k].b; return c < 0 || ends[c].length <= 1; }
    function follow(k, side) { // start at edge k entering from `side`
      const out = [], pixels = [];
      let closed = false;
      const freeA = endFree(k, side);
      let lastK = k, lastExit = 1 - side;
      for (let guard = 0; guard < edges.length + 1; guard++) {
        if (done[k]) { closed = true; break; }
        done[k] = 1;
        lastK = k; lastExit = 1 - side;
        let p = pts[k];
        let px = edges[k].px;
        if (side === 1) { // reverse
          const r = [];
          for (let i = p.length - 2; i >= 0; i -= 2) r.push(p[i], p[i + 1]);
          p = r; px = px.slice().reverse();
        }
        const startI = out.length ? 2 : 0;
        for (let i = startI; i < p.length; i++) out.push(p[i]);
        for (let i = 0; i < px.length; i++) pixels.push(px[i]);
        const exitSide = 1 - side;
        const nxt = pairOf.get(k + ":" + exitSide);
        if (!nxt) break;
        k = nxt.k; side = nxt.side;
      }
      return { pts: out, px: pixels, closed: closed, freeA: !closed && freeA, freeB: !closed && endFree(lastK, lastExit) };
    }
    // start from ends that are not paired first (open chains), then whatever is left (loops)
    edges.forEach(function (e, k) {
      if (done[k]) return;
      if (!pairOf.has(k + ":0")) chains.push(follow(k, 0));
      else if (!pairOf.has(k + ":1")) chains.push(follow(k, 1));
    });
    edges.forEach(function (e, k) { if (!done[k]) chains.push(follow(k, 0)); });
    // width: median distance-to-paper along the chain
    chains.forEach(function (c) {
      const ds = [];
      for (let i = 0; i < c.px.length; i++) ds.push(D[c.px[i]]);
      c.dMed = ds.length ? U().median(ds) : 1;
    });
    return chains;
  }

  // ---------- outlines of solid blobs (Moore-neighbour tracing) ----------
  function traceOutline(m, w, h, start) {
    const DX = [-1, -1, 0, 1, 1, 1, 0, -1], DY = [0, -1, -1, -1, 0, 1, 1, 1]; // W, NW, N, NE, E, SE, S, SW (clockwise)
    function at(x, y) { return x >= 0 && y >= 0 && x < w && y < h && m[y * w + x]; }
    const sx = start % w, sy = (start / w) | 0;
    const out = [sx, sy];
    let cx = sx, cy = sy, dir = 0; // backtrack is to the west
    let second = -1;
    const maxSteps = 4 * w * h + 10;
    for (let step = 0; step < maxSteps; step++) {
      let found = -1;
      for (let i = 1; i <= 8; i++) {
        const nd = (dir + i) & 7;
        if (at(cx + DX[nd], cy + DY[nd])) { found = nd; break; }
      }
      if (found < 0) break; // a single pixel
      const bx = cx + DX[(found + 7) & 7], by = cy + DY[(found + 7) & 7];
      const nx = cx + DX[found], ny = cy + DY[found];
      if (cx === sx && cy === sy && step > 0 && ny * w + nx === second) break;
      if (step === 0) second = ny * w + nx;
      // direction from the new pixel back to the last empty spot checked
      const ddx = bx - nx, ddy = by - ny;
      let nd2 = 0;
      for (let k = 0; k < 8; k++) if (DX[k] === ddx && DY[k] === ddy) { nd2 = k; break; }
      cx = nx; cy = ny; dir = nd2;
      out.push(cx, cy);
    }
    return out;
  }

  // ---------- bridging pen-lift gaps ----------
  // Faint pencil and quick pen strokes break one wall into dashes and dots. Free line ends that face each other
  // across a small gap are joined (a dot in line with a wall joins it too), so the wall is one stroke again.
  // The safety rule: a gap is only bridged if the ball could never roll through it anyway (paper gap under 90% of
  // the ball's width). A doorway the ball fits through is never touched, however it was drawn.
  //   pieces: [{ pts (level units), width, len, freeA, freeB, closed }] -> the same kind of list, joined
  function reversePts(p) { const r = []; for (let i = p.length - 2; i >= 0; i -= 2) r.push(p[i], p[i + 1]); return r; }
  function bridgeGaps(pieces, ballR) {
    const maxClear = 0.9 * 2 * ballR;
    const LOOK = 30;
    let S = pieces.map(function (p) {
      const dot = p.len < Math.max(10, 1.5 * p.width);
      return { parts: [{ pts: p.pts, dot: dot, width: p.width, len: p.len }], free: [!!p.freeA && !p.closed, !!p.freeB && !p.closed], width: p.width, len: p.len, wl: p.width * (p.len + 1), wsum: p.len + 1 };
    });
    function flat(s) { if (s.parts.length === 1) return s.parts[0].pts; let o = []; s.parts.forEach(function (q) { o = o.concat(q.pts); }); return o; }
    function endInfo(s, si, side) {
      const p = flat(s), n = p.length >> 1;
      const step = side === 0 ? 1 : -1;
      let i = side === 0 ? 0 : n - 1;
      const x = p[2 * i], y = p[2 * i + 1];
      let arc = 0, bx = x, by = y;
      for (let j = i + step; j >= 0 && j < n; j += step) {
        arc += Math.hypot(p[2 * j] - p[2 * (j - step)], p[2 * j + 1] - p[2 * (j - step) + 1]);
        bx = p[2 * j]; by = p[2 * j + 1];
        if (arc >= LOOK) break;
      }
      const dl = Math.hypot(x - bx, y - by);
      const hasDir = arc >= Math.max(10, 1.5 * s.width) && dl > 4;
      return { si: si, side: side, x: x, y: y, w: s.width, dir: hasDir, dx: hasDir ? (x - bx) / dl : 0, dy: hasDir ? (y - by) / dl : 0, short: arc < LOOK };
    }
    for (let round = 0; round < 40; round++) {
      const ends = [];
      S.forEach(function (s, si) { for (let side = 0; side < 2; side++) if (s.free[side]) ends.push(endInfo(s, si, side)); });
      if (ends.length < 2) break;
      // a grid so only nearby ends are compared
      const cell = maxClear + 24, grid = new Map();
      ends.forEach(function (e, k) { const key = Math.floor(e.x / cell) + "," + Math.floor(e.y / cell); if (!grid.has(key)) grid.set(key, []); grid.get(key).push(k); });
      const cands = [];
      ends.forEach(function (a, ka) {
        const gx = Math.floor(a.x / cell), gy = Math.floor(a.y / cell);
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const list = grid.get((gx + ox) + "," + (gy + oy));
          if (!list) continue;
          for (let t = 0; t < list.length; t++) {
            const kb = list[t];
            if (kb <= ka) continue;
            const b = ends[kb];
            if (b.si === a.si) continue;
            const dx = b.x - a.x, dy = b.y - a.y, g = Math.hypot(dx, dy);
            const clear = g - (a.w + b.w) / 2;
            if (clear > maxClear) continue;
            const mw = Math.min(a.w, b.w);
            const tiny = clear <= Math.max(4, 0.6 * mw); // a hairline break: almost any angle (a corner)
            const near = clear <= 3 * mw + 4; // a short pen lift: a wobbly line end may hook a little
            if (!a.dir && !b.dir && !tiny && clear > 1.5 * mw + 4) continue; // two loose dots only when nearly touching
            let ca = 1, cb = 1;
            if (g > 0.5) {
              const ux = dx / g, uy = dy / g;
              if (a.dir) ca = a.dx * ux + a.dy * uy;
              if (b.dir) cb = -(b.dx * ux + b.dy * uy);
              if (!tiny) { // and not off to the side of the line
                const latMax = near ? Math.max(10, 0.6 * g) : Math.max(6, 0.3 * g);
                if (a.dir && Math.abs(a.dx * dy - a.dy * dx) > latMax) continue;
                if (b.dir && Math.abs(b.dx * dy - b.dy * dx) > latMax) continue;
              }
            }
            const need = tiny ? 0.3 : (near ? 0.7 : ((a.dir && a.short) || (b.dir && b.short) ? 0.82 : 0.9));
            if (ca < need || cb < need) continue;
            cands.push({ a: a, b: b, score: clear + 50 * (2 - ca - cb) });
          }
        }
      });
      if (!cands.length) break;
      cands.sort(function (p, q) { return p.score - q.score; });
      // pick links: each end once, a dot one link per round, no loops (union-find over pieces)
      const parent = S.map(function (_, i) { return i; });
      function root(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
      const link = new Map(); // "si:side" -> {si, side}
      const dotUsed = new Uint8Array(S.length);
      function isDot(si) { return S[si].parts.length === 1 && S[si].parts[0].dot; }
      cands.forEach(function (c) {
        const ka = c.a.si + ":" + c.a.side, kb = c.b.si + ":" + c.b.side;
        if (link.has(ka) || link.has(kb)) return;
        if ((isDot(c.a.si) && dotUsed[c.a.si]) || (isDot(c.b.si) && dotUsed[c.b.si])) return;
        const ra = root(c.a.si), rb = root(c.b.si);
        if (ra === rb) return;
        parent[ra] = rb;
        link.set(ka, { si: c.b.si, side: c.b.side }); link.set(kb, { si: c.a.si, side: c.a.side });
        dotUsed[c.a.si] = 1; dotUsed[c.b.si] = 1;
      });
      if (!link.size) break;
      // assemble the joined pieces: walk each chain of links from an unlinked end
      const seen = new Uint8Array(S.length), next = [];
      S.forEach(function (s, si) {
        if (seen[si]) return;
        let startSide = -1;
        if (!link.has(si + ":0")) startSide = 0; else if (!link.has(si + ":1")) startSide = 1;
        if (startSide < 0) return; // (can't happen without loops)
        let cur = si, entry = startSide;
        const parts = [];
        let wl = 0, wsum = 0, len = 0;
        const freeStart = S[si].free[startSide];
        let freeEnd = false;
        for (let guard = 0; guard <= S.length; guard++) {
          seen[cur] = 1;
          const sc = S[cur];
          const ps = entry === 0 ? sc.parts : sc.parts.slice().reverse().map(function (q) { return { pts: reversePts(q.pts), dot: q.dot, width: q.width, len: q.len }; });
          if (parts.length) {
            const lp = parts[parts.length - 1].pts, fp = ps[0].pts;
            len += Math.hypot(fp[0] - lp[lp.length - 2], fp[1] - lp[lp.length - 1]);
          }
          ps.forEach(function (q) { parts.push(q); });
          wl += sc.wl; wsum += sc.wsum; len += sc.len;
          const exit = 1 - entry;
          const nx = link.get(cur + ":" + exit);
          if (!nx) { freeEnd = sc.free[exit]; break; }
          cur = nx.si; entry = nx.side;
        }
        next.push({ parts: parts, free: [freeStart, freeEnd], width: wl / wsum, len: len, wl: wl, wsum: wsum });
      });
      S = next;
    }
    // a lone dot hanging off the very end of a wall by a long bridge is more likely dust than wall: let it go
    return S.map(function (s) {
      const parts = s.parts.slice();
      function gapAt(i, j) { const a = parts[i].pts, b = parts[j].pts; return Math.hypot(b[0] - a[a.length - 2], b[1] - a[a.length - 1]); }
      if (parts.length >= 2 && parts[parts.length - 1].dot && gapAt(parts.length - 2, parts.length - 1) > 2 * s.width + 4) parts.pop();
      if (parts.length >= 2 && parts[0].dot && gapAt(0, 1) > 2 * s.width + 4) parts.shift();
      let pts = [];
      parts.forEach(function (q) { pts = pts.concat(q.pts); });
      return { pts: pts, width: s.width, len: polyLength(pts), joined: parts.length };
    });
  }

  // ---------- the main job ----------
  function fromMask(mask, gw, gh, upx, opts) {
    opts = opts || {};
    const T = {}; let tm = U().now();
    function lap(n) { const t = U().now(); T[n] = Math.round(t - tm); tm = t; }
    const levelW = opts.levelW || DL.LEVEL_W || 1000;
    const levelH = opts.levelH || gh * upx;
    const tol0 = opts.tol || 2;
    const N = gw * gh;
    const w = gw, h = gh;

    // 0. tidy: clear the border, fill pinholes, drop lone pixels
    const m = new Uint8Array(N);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) m[y * w + x] = mask[y * w + x] ? 1 : 0;
    const R = ringOffsets(w);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, c = count8(m, i, R);
      if (!m[i] && c >= 7) m[i] = 1; else if (m[i] && c === 0) m[i] = 0;
    }
    lap("tidy");

    // 1. thickness: distance from every ink pixel to the paper
    const inv = new Uint8Array(N);
    for (let i = 0; i < N; i++) inv[i] = m[i] ? 0 : 1;
    const D = U().distanceToMask(inv, w, h);
    // typical stroke half-width: D along ridges of the ink
    const ridge = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!m[i]) continue;
      const d = D[i];
      let mx = 0;
      for (let r = 0; r < 8; r++) { const v = D[i + R[r]]; if (v > mx) mx = v; }
      if (d >= mx - 0.5) ridge.push(d); // the stroke's centre line (no neighbour clearly deeper inside the ink)
    }
    const hwPx = ridge.length ? Math.max(1, U().median(ridge)) : 1;
    lap("thickness");

    // 2. solid blobs = the ink "opened" by a disc clearly wider than the pen
    const minDiaUnits = HOLE_MIN * levelW;
    const Tc = Math.max(1.6 * hwPx + 1, 0.35 * minDiaUnits / upx);
    const core = new Uint8Array(N);
    let nCore = 0;
    for (let i = 0; i < N; i++) if (m[i] && D[i] >= Tc) { core[i] = 1; nCore++; }
    const holes = [], fills = [];
    const removeMask = new Uint8Array(N);
    if (nCore) {
      const dc = U().distanceToMask(core, w, h);
      const opened = new Uint8Array(N);
      for (let i = 0; i < N; i++) if (m[i] && dc[i] <= Tc + 0.5) opened[i] = 1;
      const lab = U().labelBlobs(opened, w, h);
      // moments per blob
      const nc = lab.comps.length;
      const sx = new Float64Array(nc + 1), sy = new Float64Array(nc + 1), sxx = new Float64Array(nc + 1), syy = new Float64Array(nc + 1), sxy = new Float64Array(nc + 1);
      const sf = new Float64Array(nc + 1);
      const field = opts.field || null;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const l = lab.labels[y * w + x];
        if (!l) continue;
        sx[l] += x; sy[l] += y; sxx[l] += x * x; syy[l] += y * y; sxy[l] += x * y;
        if (field) sf[l] += field[y * w + x];
      }
      const kind = new Uint8Array(nc + 1); // 1 hole, 2 fill, 3 speckle (removed, not a wall)
      lab.comps.forEach(function (c) {
        const A = c.area, l = c.id;
        // a filled dot or a coloured-in area is solid dark ink; a crowd of grainy specks (photo noise in a
        // shadow, JPEG colour noise) that the clean-up joined into a blob is not
        if (field && sf[l] / A < 110) { kind[l] = 3; return; }
        const mx = sx[l] / A, my = sy[l] / A;
        const cxx = sxx[l] / A - mx * mx, cyy = syy[l] / A - my * my, cxy = sxy[l] / A - mx * my;
        const tr = cxx + cyy, det = cxx * cyy - cxy * cxy;
        const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
        const l1 = tr / 2 + disc, l2 = Math.max(1e-6, tr / 2 - disc);
        const roundness = Math.sqrt(l2 / Math.max(l1, 1e-6));
        // fill: the blob's area against the ellipse with the same second moments (1 for a perfect ellipse)
        const ellipseA = 4 * Math.PI * Math.sqrt(l1 * l2);
        const fill = ellipseA > 0 ? A / ellipseA : 0;
        const dia = 2 * Math.sqrt(A / Math.PI) * upx;
        const areaU = A * upx * upx;
        if (fill > 0.7 && roundness > 0.6 && dia >= HOLE_MIN * levelW && dia <= HOLE_MAX * levelW) {
          kind[l] = 1;
          holes.push({ x: (mx + 0.5) * upx, y: (my + 0.5) * upx, r: dia / 2, _l: l });
        } else if (areaU >= 900) {
          kind[l] = 2;
          fills.push({ _l: l, start: c.start, comp: c });
        }
      });
      // remove holes (grown by a pixel so no ring is left) and fills from the wall ink
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const k = kind[lab.labels[i]];
        if (k) { removeMask[i] = k; continue; }
        if (!m[i]) continue;
        for (let r = 0; r < 8; r++) { if (kind[lab.labels[i + R[r]]] === 1) { removeMask[i] = 1; break; } }
      }
      fills.forEach(function (f) {
        const c = f.comp;
        const bw = c.x1 - c.x0 + 3, bh = c.y1 - c.y0 + 3;
        const sub = new Uint8Array(bw * bh);
        for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) if (lab.labels[y * w + x] === f._l) sub[(y - c.y0 + 1) * bw + (x - c.x0 + 1)] = 1;
        let st = -1;
        for (let i = 0; i < sub.length; i++) if (sub[i]) { st = i; break; }
        const o = traceOutline(sub, bw, bh, st);
        const pu = [];
        for (let i = 0; i < o.length; i += 2) pu.push((o[i] + c.x0 - 1 + 0.5) * upx, (o[i + 1] + c.y0 - 1 + 0.5) * upx);
        f.pts = rdp(pu, Math.max(2.5, tol0 * 1.25));
      });
    }
    const wall = new Uint8Array(N);
    for (let i = 0; i < N; i++) wall[i] = m[i] && !removeMask[i] ? 1 : 0;
    lap("holes");

    // 3. centre lines
    const sk = wall.slice();
    zhangSuen(sk, w, h);
    lap("thin");
    const graph = traceSkeleton(sk, w, h);
    const chains = buildChains(graph, D, w, hwPx);
    lap("trace");

    // to level units, smoothed; widths
    const pieces = [];
    chains.forEach(function (c) {
      if (!c.pts.length) return;
      const pu = [];
      for (let i = 0; i < c.pts.length; i += 2) pu.push((c.pts[i] + 0.5) * upx, (c.pts[i + 1] + 0.5) * upx);
      if (pu.length === 2) pu.push(pu[0], pu[1]);
      const sm = smooth(pu, c.closed);
      const width = Math.max(MIN_WIDTH, (2 * c.dMed - 1) * upx);
      pieces.push({ pts: sm, width: width, len: polyLength(sm), freeA: c.freeA, freeB: c.freeB, closed: c.closed });
    });

    // 4. ball size from the corridors: free space = not wall ink, not a fill (holes don't narrow a corridor)
    const solid = new Uint8Array(N);
    for (let i = 0; i < N; i++) solid[i] = (wall[i] || removeMask[i] === 2) ? 1 : 0;
    for (let x = 0; x < w; x++) { solid[x] = 1; solid[(h - 1) * w + x] = 1; }
    for (let y = 0; y < h; y++) { solid[y * w] = 1; solid[y * w + w - 1] = 1; }
    const F = U().distanceToMask(solid, w, h);
    const minHalf = 6 / upx;
    const samples = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (solid[i]) continue;
      const d = F[i];
      if (d < minHalf) continue;
      // the corridor's centre line: no neighbour is clearly further from the walls. (Medial branches running
      // into every corner climb steadily, so they fail this, and they would drag the median far down.)
      let mx = 0;
      for (let r = 0; r < 8; r++) { const v = F[i + R[r]]; if (v > mx) mx = v; }
      if (d >= mx - 0.5) samples.push(d);
    }
    // corridor width = 2 x (distance from the ridge to the wall's edge)
    const corridor = samples.length ? 2 * (U().median(samples) - 0.5) * upx : 100;
    const ballR = U().clamp(0.3 * corridor, 10, 28);
    lap("ball");

    // 5. pen-lift gaps the ball could never pass anyway are bridged; then specks go
    const raw = [];
    let bridged = 0;
    bridgeGaps(pieces, ballR).forEach(function (s) {
      if (s.joined > 1) bridged += s.joined - 1;
      if (s.len < SPECK && s.width < SPECK) return; // a speck
      raw.push(s);
    });
    raw.sort(function (a, b) { return b.len - a.len; });
    function simplify(tol) {
      return raw.map(function (s) {
        const p = rdp(s.pts, tol);
        return { pts: p, width: s.width };
      });
    }
    const walls = simplify(tol0);
    lap("simplify");

    holes.forEach(function (o) { delete o._l; });
    // what became part of the level (walls, holes, fills), for masking the preview
    const used = new Uint8Array(N);
    for (let i = 0; i < N; i++) used[i] = (wall[i] || removeMask[i] === 1 || removeMask[i] === 2) ? 1 : 0;
    return {
      used: used,
      walls: walls,
      fills: fills.filter(function (f) { return f.pts && f.pts.length >= 6; }).map(function (f) { return { pts: f.pts }; }),
      holes: holes,
      ballR: ballR,
      simplify: simplify,
      stats: { strokeHalfPx: hwPx, coreThresholdPx: Tc, corridor: corridor, ridgeSamples: samples.length, chains: chains.length, pieces: pieces.length, bridged: bridged, timings: T, levelW: levelW, levelH: levelH }
    };
  }

  DL.vectorize = { fromMask: fromMask, _internals: { rdp: rdp, zhangSuen: zhangSuen, traceSkeleton: traceSkeleton, traceOutline: traceOutline, polyLength: polyLength, bridgeGaps: bridgeGaps } };
})();
