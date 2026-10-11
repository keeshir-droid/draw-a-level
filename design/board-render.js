/* design/board-render.js: the art director's reference renderer (never deployed).
   Draws "The Desk Toy" (wood frame, brass screws, paper, the person's ink, holes, brass goal cup,
   start marker, path, steel ball, glass sheen) and the story image, reading every value from
   DL.PALETTE. game-builder may lift these functions into board.js / story.js.
   Also makes a wobbly hand-drawn-looking maze (stand-in until real photos exist). */
(function () {
  "use strict";
  var P = globalThis.DL.PALETTE;
  var R = (globalThis.DLR = {});

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- a hand-drawn-looking maze, as a Level ---------- */
  R.makeLevel = function (opt) {
    opt = opt || {};
    var rnd = rng(opt.seed || 5);
    var cols = opt.cols || 6, rows = opt.rows || 8, m = 48;
    var cw = (1000 - 2 * m) / cols;
    var h = Math.round(2 * m + rows * cw);
    // walls between cells: H[r][c] (top edge of row r), V[r][c] (left edge of col c)
    var H = [], V = [], r, c;
    for (r = 0; r <= rows; r++) { H[r] = []; for (c = 0; c < cols; c++) H[r][c] = true; }
    for (r = 0; r < rows; r++) { V[r] = []; for (c = 0; c <= cols; c++) V[r][c] = true; }
    var seen = [], stack = [[0, 0]];
    for (r = 0; r < rows; r++) seen[r] = [];
    seen[0][0] = true;
    while (stack.length) {
      var cur = stack[stack.length - 1], cr = cur[0], cc = cur[1], nb = [];
      if (cr > 0 && !seen[cr - 1][cc]) nb.push([cr - 1, cc, "n"]);
      if (cr < rows - 1 && !seen[cr + 1][cc]) nb.push([cr + 1, cc, "s"]);
      if (cc > 0 && !seen[cr][cc - 1]) nb.push([cr, cc - 1, "w"]);
      if (cc < cols - 1 && !seen[cr][cc + 1]) nb.push([cr, cc + 1, "e"]);
      if (!nb.length) { stack.pop(); continue; }
      var n = nb[Math.floor(rnd() * nb.length)];
      if (n[2] === "n") H[cr][cc] = false;
      if (n[2] === "s") H[cr + 1][cc] = false;
      if (n[2] === "w") V[cr][cc] = false;
      if (n[2] === "e") V[cr][cc + 1] = false;
      seen[n[0]][n[1]] = true;
      stack.push([n[0], n[1]]);
    }
    // a few extra openings: hand-drawn mazes are friendlier than perfect ones
    for (var k = 0; k < (opt.braid || 6); k++) {
      var rr = 1 + Math.floor(rnd() * (rows - 1)), ccx = Math.floor(rnd() * cols);
      if (rnd() < 0.5) H[rr][ccx] = false; else { var r2 = Math.floor(rnd() * rows), c2 = 1 + Math.floor(rnd() * (cols - 1)); V[r2][c2] = false; }
    }
    // solve (BFS over cells) for the path mock
    var prev = {}, q = [[0, 0]], key = function (a, b) { return a + "," + b; };
    prev[key(0, 0)] = null;
    while (q.length) {
      var p = q.shift(), pr = p[0], pc = p[1];
      if (pr === rows - 1 && pc === cols - 1) break;
      var mv = [];
      if (pr > 0 && !H[pr][pc]) mv.push([pr - 1, pc]);
      if (pr < rows - 1 && !H[pr + 1][pc]) mv.push([pr + 1, pc]);
      if (pc > 0 && !V[pr][pc]) mv.push([pr, pc - 1]);
      if (pc < cols - 1 && !V[pr][pc + 1]) mv.push([pr, pc + 1]);
      mv.forEach(function (t) { var kk = key(t[0], t[1]); if (!(kk in prev)) { prev[kk] = p; q.push(t); } });
    }
    var cells = [], at = [rows - 1, cols - 1];
    while (at) { cells.unshift(at); at = prev[key(at[0], at[1])]; }
    var cx = function (cc2) { return m + (cc2 + 0.5) * cw; }, cy = function (rr2) { return m + (rr2 + 0.5) * cw; };

    // merge wall runs into strokes, then wobble them like a pen
    var strokes = [];
    for (r = 1; r < rows; r++) {
      c = 0;
      while (c < cols) { if (!H[r][c]) { c++; continue; } var s0 = c; while (c < cols && H[r][c]) c++; strokes.push([m + s0 * cw, m + r * cw, m + c * cw, m + r * cw]); }
    }
    for (c = 1; c < cols; c++) {
      r = 0;
      while (r < rows) { if (!V[r][c]) { r++; continue; } var t0 = r; while (r < rows && V[r][c]) r++; strokes.push([m + c * cw, m + t0 * cw, m + c * cw, m + r * cw]); }
    }
    var walls = strokes.map(function (s) { return { pts: wobble(s[0], s[1], s[2], s[3], rnd, true), width: 7 + rnd() * 3.5 }; });
    // the border: one pen loop, a little overshoot where the pen lifted
    var b = [[m, m], [1000 - m, m], [1000 - m, h - m], [m, h - m], [m, m + 26]];
    var border = [];
    for (var i = 0; i < b.length - 1; i++) {
      var seg = wobble(b[i][0], b[i][1], b[i + 1][0], b[i + 1][1], rnd, false);
      if (i > 0) seg = seg.slice(2);
      border = border.concat(seg);
    }
    walls.unshift({ pts: border, width: 8.5 });

    // holes: beside the path (so you pass close) and one in a dead end
    var holes = [];
    var pick = [Math.floor(cells.length * 0.35), Math.floor(cells.length * 0.68)];
    pick.forEach(function (ix, j) {
      var a = cells[ix], bb = cells[ix + 1] || cells[ix - 1];
      var horiz = a[0] === bb[0];
      var off = (j ? -1 : 1) * cw * 0.3;
      holes.push({ x: cx(a[1]) + (horiz ? 0 : off), y: cy(a[0]) + (horiz ? off : 0), r: 21 + rnd() * 3, avoid: { ix: ix, horiz: horiz, off: off } });
    });
    for (r = rows - 1; r >= 0 && holes.length < 3; r--) for (c = 0; c < cols && holes.length < 3; c++) {
      var onPath = cells.some(function (q2) { return q2[0] === r && q2[1] === c; });
      var opens = (!H[r][c]) + (!H[r + 1] || !H[r + 1][c] ? 0 : 0) + (r < rows - 1 && !H[r + 1][c]) + (!V[r][c]) + (c < cols - 1 && !V[r][c + 1]);
      if (!onPath && opens === 1 && r > 2) holes.push({ x: cx(c), y: cy(r), r: 22 });
    }
    // the run's path: cell centres, nudged away from holes, plus a little hand
    var path = [];
    cells.forEach(function (q3, ix) {
      var x = cx(q3[1]), y = cy(q3[0]);
      holes.forEach(function (ho) { if (ho.avoid && ho.avoid.ix === ix) { if (ho.avoid.horiz) y -= ho.avoid.off * 0.95; else x -= ho.avoid.off * 0.95; } });
      path.push(x + (rnd() - 0.5) * 16, y + (rnd() - 0.5) * 16);
    });
    var level = {
      v: 1, w: 1000, h: h, ink: opt.ink || "#26357a", ballR: 28,
      walls: walls, fills: [], holes: holes.map(function (o) { return { x: o.x, y: o.y, r: o.r }; }),
      start: { x: cx(0), y: cy(0) }, goal: { x: cx(cols - 1), y: cy(rows - 1) }, challenge: null
    };
    level._path = path;
    level._cells = cells.map(function (q4) { return [cx(q4[1]), cy(q4[0])]; });
    return level;
  };

  function wobble(x0, y0, x1, y1, rnd, ends) {
    var dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    if (ends) { var a = (rnd() - 0.3) * 22, b = (rnd() - 0.3) * 22; x0 -= ux * a; y0 -= uy * a; x1 += ux * b; y1 += uy * b; len += a + b; }
    var px = -uy, py = ux, n = Math.max(2, Math.ceil(len / 24));
    var ph1 = rnd() * 6.28, ph2 = rnd() * 6.28, bow = (rnd() - 0.5) * 18, amp = 3.5 + rnd() * 2.5, out = [];
    for (var i = 0; i <= n; i++) {
      var t = i / n, d = len * t;
      var w = amp * (0.6 * Math.sin(d / 95 + ph1) + 0.4 * Math.sin(d / 33 + ph2)) * Math.min(1, t * 6, (1 - t) * 6 + 0.3) + bow * Math.sin(Math.PI * t);
      out.push(Math.round(x0 + ux * d + px * w), Math.round(y0 + uy * d + py * w));
    }
    return out;
  }

  /* ---------- helpers ---------- */
  function rr(ctx, x, y, w, h, r, keep) {
    if (!keep) ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function rgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }
  function withAlpha(col, a) { return col.charAt(0) === "#" ? rgba(col, a) : col.replace(/rgb\(([^)]+)\)/, "rgba($1," + a + ")"); }

  var toothCache = {};
  function toothPattern(ctx, cell, alpha, seed) {
    var k = cell + ":" + alpha + ":" + seed;
    if (!toothCache[k]) {
      var c = document.createElement("canvas"); c.width = c.height = 160;
      var g = c.getContext("2d"), rnd = rng(seed);
      for (var y = 0; y < 160; y += cell) for (var x = 0; x < 160; x += cell) {
        var v = rnd();
        g.fillStyle = v < 0.5 ? "rgba(90,70,40," + (alpha * (0.5 - v) * 2) + ")" : "rgba(255,255,255," + (alpha * (v - 0.5) * 2.4) + ")";
        g.fillRect(x, y, cell, cell);
      }
      // a few fibres
      for (var i = 0; i < 40; i++) {
        g.strokeStyle = "rgba(120,95,60," + alpha * 0.9 + ")"; g.lineWidth = 0.5;
        var fx = rnd() * 160, fy = rnd() * 160, fa = rnd() * 6.28, fl = 3 + rnd() * 6;
        g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + Math.cos(fa) * fl, fy + Math.sin(fa) * fl); g.stroke();
      }
      toothCache[k] = c;
    }
    return ctx.createPattern(toothCache[k], "repeat");
  }

  /* ---------- the wood ---------- */
  function drawWood(ctx, ox, oy, BW, BH, f, s) {
    var W = P.wood, rnd = rng(W.seed);
    var sides = [
      { poly: [[0, 0], [BW, 0], [BW - f, f], [f, f]], horiz: true, a: 0, b: f, len: BW },
      { poly: [[0, BH], [BW, BH], [BW - f, BH - f], [f, BH - f]], horiz: true, a: BH - f, b: BH, len: BW },
      { poly: [[0, 0], [f, f], [f, BH - f], [0, BH]], horiz: false, a: 0, b: f, len: BH },
      { poly: [[BW, 0], [BW - f, f], [BW - f, BH - f], [BW, BH]], horiz: false, a: BW - f, b: BW, len: BH }
    ];
    sides.forEach(function (sd, si) {
      ctx.save();
      ctx.beginPath();
      sd.poly.forEach(function (p, i) { var X = ox + p[0] * s, Y = oy + p[1] * s; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
      ctx.closePath(); ctx.clip();
      // base, a touch different per board piece (four pieces of wood)
      ctx.fillStyle = W.base; ctx.fillRect(ox, oy, BW * s, BH * s);
      var tone = [0.0, 0.05, -0.04, 0.03][si];
      ctx.fillStyle = tone > 0 ? rgba(W.light, tone * 3) : rgba(W.dark, -tone * 3);
      ctx.fillRect(ox, oy, BW * s, BH * s);
      // the figure: broad soft bands along the piece
      for (var bnd = 0; bnd < 3; bnd++) {
        var pos = sd.a + (sd.b - sd.a) * rnd(), wid = (sd.b - sd.a) * (0.25 + rnd() * 0.4);
        var g = sd.horiz ? ctx.createLinearGradient(0, oy + (pos - wid) * s, 0, oy + (pos + wid) * s) : ctx.createLinearGradient(ox + (pos - wid) * s, 0, ox + (pos + wid) * s, 0);
        var col = bnd % 2 ? W.dark : W.light;
        g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.5, rgba(col, W.figureAlpha * 2.2)); g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g; ctx.fillRect(ox, oy, BW * s, BH * s);
      }
      // grain lines
      var lines = Math.round(W.linesPer100 * (sd.b - sd.a) / 100);
      for (var i = 0; i < lines; i++) {
        var base = sd.a + (sd.b - sd.a) * ((i + 0.2 + rnd() * 0.6) / lines);
        var late = i % 5 === 3;
        ctx.strokeStyle = rgba(W.grain, Math.min(0.6, W.grainAlpha * (0.5 + rnd() * 0.8) * (late ? 1.8 : 1)));
        ctx.lineWidth = Math.max(W.minLinePx, (late ? 1.5 : 0.9) * s);
        var ph = rnd() * 6.28, ph2 = rnd() * 6.28, amp = W.wobble * (0.5 + rnd());
        ctx.beginPath();
        for (var d = -10; d <= sd.len + 10; d += 12) {
          var off = base + amp * Math.sin(d / W.wavelength * 6.28 + ph) + amp * 0.35 * Math.sin(d / (W.wavelength * 0.37) + ph2);
          var X = sd.horiz ? ox + d * s : ox + off * s, Y = sd.horiz ? oy + off * s : oy + d * s;
          if (d === -10) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
        }
        ctx.stroke();
      }
      ctx.restore();
    });
    // mitre joints
    ctx.save();
    ctx.strokeStyle = rgba(P.frame.mitre.color, P.frame.mitre.alpha); ctx.lineWidth = Math.max(0.6, P.frame.mitre.width * s);
    [[0, 0, f, f], [BW, 0, BW - f, f], [BW, BH, BW - f, BH - f], [0, BH, f, BH - f]].forEach(function (l) {
      ctx.beginPath(); ctx.moveTo(ox + l[0] * s, oy + l[1] * s); ctx.lineTo(ox + l[2] * s, oy + l[3] * s); ctx.stroke();
    });
    ctx.restore();
  }

  function drawScrew(ctx, x, y, r, angDeg) {
    var S = P.screws;
    var g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, S.light); g.addColorStop(0.55, S.mid); g.addColorStop(1, S.dark);
    ctx.beginPath(); ctx.arc(x, y + r * 0.12, r * 1.05, 0, 6.283); ctx.fillStyle = "rgba(60,38,14,0.35)"; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = Math.max(0.5, r * 0.08); ctx.strokeStyle = rgba(S.dark, 0.7); ctx.stroke();
    var a = angDeg * Math.PI / 180, dx = Math.cos(a) * r * 0.78, dy = Math.sin(a) * r * 0.78;
    ctx.lineCap = "round";
    ctx.strokeStyle = rgba(S.light, 0.7); ctx.lineWidth = Math.max(0.6, r * 0.2);
    ctx.beginPath(); ctx.moveTo(x - dx, y - dy + r * 0.1); ctx.lineTo(x + dx, y + dy + r * 0.1); ctx.stroke();
    ctx.strokeStyle = S.slot; ctx.lineWidth = Math.max(0.6, r * 0.2);
    ctx.beginPath(); ctx.moveTo(x - dx, y - dy); ctx.lineTo(x + dx, y + dy); ctx.stroke();
  }

  /* ---------- pieces on the paper ---------- */
  R.drawInk = function (ctx, level, X, Y, s) {
    var I = P.ink, col = P.inkFor(level.ink);
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.shadowColor = withAlpha(I.raise.color, I.raise.alpha); ctx.shadowOffsetY = I.raise.dy * s; ctx.shadowBlur = I.raise.blur * s;
    ctx.strokeStyle = rgba(col, I.alpha);
    level.walls.forEach(function (w) {
      var p = w.pts; ctx.lineWidth = Math.max(I.minPx, w.width * s);
      ctx.beginPath(); ctx.moveTo(X(p[0]), Y(p[1]));
      for (var i = 2; i < p.length; i += 2) ctx.lineTo(X(p[i]), Y(p[i + 1]));
      ctx.stroke();
    });
    ctx.shadowColor = "transparent";
    ctx.fillStyle = rgba(col, I.pool.alpha);
    level.walls.forEach(function (w) {
      var p = w.pts, rad = Math.max(I.minPx, w.width * s) * I.pool.scale;
      [[p[0], p[1]], [p[p.length - 2], p[p.length - 1]]].forEach(function (e) { ctx.beginPath(); ctx.arc(X(e[0]), Y(e[1]), rad, 0, 6.283); ctx.fill(); });
    });
    ctx.restore();
  };

  R.drawHole = function (ctx, x, y, r) {
    var Ho = P.hole;
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y + r * 0.04, r * (1 + Ho.rimWidth + Ho.halo.width), 0, 6.283); ctx.fillStyle = rgba(Ho.halo.color, Ho.halo.alpha); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r * (1 + Ho.rimWidth), 0, 6.283); ctx.fillStyle = rgba(Ho.rim, 0.55); ctx.fill();
    var g = ctx.createRadialGradient(x, y + r * 0.15, 0, x, y, r);
    g.addColorStop(0, Ho.deep); g.addColorStop(0.7, Ho.deep); g.addColorStop(1, Ho.wall);
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fillStyle = g; ctx.fill();
    ctx.clip();
    // the near (top) wall in shadow
    ctx.beginPath(); ctx.rect(x - r * 2, y - r * 2, r * 4, r * 4); ctx.arc(x, y + Ho.crescent.dy * r, r, 0, 6.283, true);
    ctx.fillStyle = "rgba(0,0,0," + Ho.crescent.alpha + ")"; ctx.fill("evenodd");
    // the lit far (bottom) lip
    ctx.lineCap = "round"; ctx.lineWidth = Math.max(0.8, Ho.lipWidth * r);
    ctx.strokeStyle = rgba(Ho.lip, Ho.lipAlpha);
    ctx.beginPath(); ctx.arc(x, y, r - ctx.lineWidth / 2, Math.PI * 0.18, Math.PI * 0.82); ctx.stroke();
    ctx.restore();
  };

  R.drawGoal = function (ctx, x, y, Rg, gleam) {
    var G = P.goal;
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y + Rg * 0.06, Rg * 1.04, 0, 6.283); ctx.fillStyle = "rgba(70,45,15,0.28)"; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, Rg, 0, 6.283); ctx.fillStyle = G.dark; ctx.fill();
    var g = ctx.createLinearGradient(x - Rg, y - Rg, x + Rg, y + Rg);
    g.addColorStop(0, G.light); g.addColorStop(0.45, G.mid); g.addColorStop(1, G.dark);
    ctx.beginPath(); ctx.arc(x, y, Rg * 0.965, 0, 6.283); ctx.fillStyle = g; ctx.fill();
    // engraved line
    ctx.lineWidth = Math.max(0.6, Rg * 0.025); ctx.strokeStyle = rgba(G.engrave.color, G.engrave.alpha);
    ctx.beginPath(); ctx.arc(x, y, Rg * G.engrave.r, 0, 6.283); ctx.stroke();
    ctx.strokeStyle = "rgba(255,240,200,0.35)";
    ctx.beginPath(); ctx.arc(x, y + ctx.lineWidth, Rg * G.engrave.r, 0, 6.283); ctx.stroke();
    // the dish
    var rd = Rg * (1 - G.ringWidth);
    var dg = ctx.createLinearGradient(x + rd, y + rd, x - rd, y - rd);
    dg.addColorStop(0, G.light); dg.addColorStop(0.5, G.mid); dg.addColorStop(1, G.dark);
    ctx.beginPath(); ctx.arc(x, y, rd, 0, 6.283); ctx.fillStyle = dg; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, rd * 0.9, 0, 6.283); ctx.fillStyle = G.dish; ctx.fill();
    ctx.clip();
    var sg = ctx.createLinearGradient(0, y - rd, 0, y + rd * 0.2);
    sg.addColorStop(0, withAlpha(G.dishShadow.color, G.dishShadow.alpha)); sg.addColorStop(1, withAlpha(G.dishShadow.color, 0));
    ctx.fillStyle = sg; ctx.fillRect(x - rd, y - rd, rd * 2, rd * 2);
    ctx.restore();
    if (gleam != null) {
      ctx.save();
      var a = -2.4 + gleam * 6.28;
      ctx.lineCap = "round"; ctx.lineWidth = Rg * G.ringWidth * 0.5;
      var gg = ctx.createRadialGradient(x + Math.cos(a) * Rg * 0.85, y + Math.sin(a) * Rg * 0.85, 0, x + Math.cos(a) * Rg * 0.85, y + Math.sin(a) * Rg * 0.85, Rg * 0.7);
      gg.addColorStop(0, "rgba(255,248,225," + G.gleam.alpha + ")"); gg.addColorStop(1, "rgba(255,248,225,0)");
      ctx.strokeStyle = gg; ctx.beginPath(); ctx.arc(x, y, Rg * 0.85, a - 0.6, a + 0.6); ctx.stroke();
      ctx.restore();
    }
  };

  R.drawStart = function (ctx, x, y, br, s, mode) {
    var St = P.start;
    ctx.save();
    ctx.globalAlpha = mode === "place" ? St.alphaPlace : St.alphaPlay;
    ctx.strokeStyle = St.color; ctx.lineWidth = Math.max(1.2, St.width * s); ctx.lineCap = "round";
    ctx.setLineDash([St.dash[0] * s, St.dash[1] * s]);
    ctx.beginPath(); ctx.arc(x, y, br * St.rScale, 0, 6.283); ctx.stroke();
    if (mode === "place") {
      ctx.setLineDash([]); var t = br * St.tick;
      ctx.beginPath(); ctx.moveTo(x - t, y - t); ctx.lineTo(x + t, y + t); ctx.moveTo(x + t, y - t); ctx.lineTo(x - t, y + t); ctx.stroke();
    }
    ctx.restore();
  };

  R.drawPath = function (ctx, pts, X, Y, br) {
    var Pa = P.path;
    ctx.save();
    ctx.strokeStyle = rgba(Pa.color, Pa.alpha); ctx.lineWidth = Math.max(Pa.minPx, br * Pa.widthScale);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(X(pts[0]), Y(pts[1]));
    for (var i = 2; i < pts.length - 2; i += 2) {
      var mx = (X(pts[i]) + X(pts[i + 2])) / 2, my = (Y(pts[i + 1]) + Y(pts[i + 3])) / 2;
      ctx.quadraticCurveTo(X(pts[i]), Y(pts[i + 1]), mx, my);
    }
    ctx.lineTo(X(pts[pts.length - 2]), Y(pts[pts.length - 1]));
    ctx.stroke();
    ctx.fillStyle = rgba(Pa.color, Pa.alpha);
    ctx.beginPath(); ctx.arc(X(pts[0]), Y(pts[1]), br * Pa.startDot, 0, 6.283); ctx.fill();
    ctx.restore();
  };

  R.drawBall = function (ctx, x, y, r, o) {
    o = o || {};
    var B = P.ball, sc = o.scale || 1, dark = o.dark || 0, lift = o.lift || 0; // lift 0..1 = how high above the paper (drop)
    var rr2 = r * sc;
    ctx.save();
    // cast shadow (radial gradient: works everywhere, no ctx.filter)
    var grow = 1 + lift * (B.drop.shadowGrow - 1);
    var sx = x + B.shadow.dx * r * grow, sy = y + B.shadow.dy * r * grow, sr = r * (1 + B.shadow.blur * grow);
    var sa = B.shadow.alpha * (1 - dark) * (1 - lift * 0.5);
    var g = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
    g.addColorStop(0, withAlpha(B.shadow.color, sa)); g.addColorStop(0.55, withAlpha(B.shadow.color, sa * 0.6)); g.addColorStop(1, withAlpha(B.shadow.color, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, 6.283); ctx.fill();
    if (!lift) {
      var cg = ctx.createRadialGradient(x, y + r * 0.12, 0, x, y + r * 0.12, r * 1.02);
      cg.addColorStop(0, "rgba(30,20,10," + B.contact.alpha * (1 - dark) + ")"); cg.addColorStop(B.contact.r, "rgba(30,20,10," + B.contact.alpha * 0.8 * (1 - dark) + ")"); cg.addColorStop(1, "rgba(30,20,10,0)");
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(x, y + r * 0.12, r * 1.02, 0, 6.283); ctx.fill();
    }
    // body
    var bg = ctx.createRadialGradient(x + B.highlight.x * rr2, y + B.highlight.y * rr2, 0, x, y, rr2);
    bg.addColorStop(0, B.base); bg.addColorStop(0.55, B.mid); bg.addColorStop(1, B.dark);
    ctx.beginPath(); ctx.arc(x, y, rr2, 0, 6.283); ctx.fillStyle = bg; ctx.fill();
    ctx.save(); ctx.clip();
    var by = y + B.band.y * rr2, bh = B.band.h * rr2;
    var bandG = ctx.createLinearGradient(0, by - bh / 2, 0, by + bh / 2);
    bandG.addColorStop(0, rgba(B.band.color, 0)); bandG.addColorStop(0.5, rgba(B.band.color, B.band.alpha)); bandG.addColorStop(1, rgba(B.band.color, 0));
    ctx.fillStyle = bandG; ctx.fillRect(x - rr2, by - bh / 2, rr2 * 2, bh);
    var ub = ctx.createRadialGradient(x + B.bounce.x * rr2, y + B.bounce.y * rr2, 0, x + B.bounce.x * rr2, y + B.bounce.y * rr2, B.bounce.r * rr2);
    ub.addColorStop(0, rgba(B.bounce.color, B.bounce.alpha)); ub.addColorStop(1, rgba(B.bounce.color, 0));
    ctx.fillStyle = ub; ctx.fillRect(x - rr2, y - rr2, rr2 * 2, rr2 * 2);
    var hx = x + B.highlight.x * rr2, hy = y + B.highlight.y * rr2;
    var hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, B.highlight.r * rr2);
    hg.addColorStop(0, "rgba(255,255,255," + B.highlight.alpha + ")"); hg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = hg; ctx.fillRect(x - rr2, y - rr2, rr2 * 2, rr2 * 2);
    var gx = x + B.glint.x * rr2, gy = y + B.glint.y * rr2;
    var gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, B.glint.r * rr2);
    gg.addColorStop(0, "rgba(255,255,255,1)"); gg.addColorStop(0.6, "rgba(255,255,255,0.9)"); gg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gg; ctx.fillRect(x - rr2, y - rr2, rr2 * 2, rr2 * 2);
    if (dark) { ctx.fillStyle = "rgba(16,11,8," + dark + ")"; ctx.fillRect(x - rr2, y - rr2, rr2 * 2, rr2 * 2); }
    ctx.restore();
    ctx.beginPath(); ctx.arc(x, y, rr2 - B.rimWidth * rr2 / 2, 0, 6.283);
    ctx.lineWidth = Math.max(0.6, B.rimWidth * rr2); ctx.strokeStyle = rgba(B.rim, 0.55); ctx.stroke();
    ctx.restore();
  };

  /* ---------- the whole toy ----------
     o: { x, y, s, ball: {x,y,scale,dark,lift}|null, path, start: "place"|"play"|null, goal: true,
          glass: true, blocked: {x,y}|null, gleam: 0..1|null, shadow: true } */
  R.size = function (level, s) { var f = P.frame.width; return { w: (1000 + 2 * f) * s, h: (level.h + 2 * f) * s }; };
  R.fitScale = function (level, availW, availH) { var f = P.frame.width; return Math.min(availW / (1000 + 2 * f), availH / (level.h + 2 * f)); };

  R.drawBoard = function (ctx, level, o) {
    var F = P.frame, f = F.width, s = o.s, ox = o.x || 0, oy = o.y || 0;
    var BW = 1000 + 2 * f, BH = level.h + 2 * f;
    var X = function (v) { return ox + (f + v) * s; }, Y = function (v) { return oy + (f + v) * s; };
    var br = level.ballR * s;
    ctx.save();
    // 1. the toy's shadow on the page
    if (o.shadow !== false) {
      ctx.save();
      ctx.shadowColor = F.outerShadow.color; ctx.shadowBlur = F.outerShadow.blur * s; ctx.shadowOffsetY = F.outerShadow.dy * s;
      rr(ctx, ox, oy, BW * s, BH * s, F.radiusOuter * s); ctx.fillStyle = P.wood.dark; ctx.fill();
      ctx.shadowColor = "rgba(60,38,14,0.25)"; ctx.shadowBlur = 3 * s; ctx.shadowOffsetY = 2 * s; ctx.fill();
      ctx.restore();
    }
    // 2. wood
    ctx.save(); rr(ctx, ox, oy, BW * s, BH * s, F.radiusOuter * s); ctx.clip();
    drawWood(ctx, ox, oy, BW, BH, f, s);
    ctx.restore();
    // bevel light on the outer edge, from the top left
    ctx.save();
    var bl = ctx.createLinearGradient(ox, oy, ox + BW * s, oy + BH * s);
    bl.addColorStop(0, F.bevelLight.color); bl.addColorStop(0.5, "rgba(255,238,205,0.12)"); bl.addColorStop(1, "rgba(80,50,20,0.25)");
    ctx.lineWidth = Math.max(1, F.bevelLight.width * s);
    rr(ctx, ox + ctx.lineWidth / 2, oy + ctx.lineWidth / 2, BW * s - ctx.lineWidth, BH * s - ctx.lineWidth, F.radiusOuter * s - ctx.lineWidth / 2);
    ctx.strokeStyle = bl; ctx.stroke();
    rr(ctx, ox, oy, BW * s, BH * s, F.radiusOuter * s); ctx.lineWidth = 1; ctx.strokeStyle = "rgba(90,58,26,0.45)"; ctx.stroke();
    ctx.restore();
    // screws
    var Sc = P.screws, corners = [[Sc.inset, Sc.inset], [BW - Sc.inset, Sc.inset], [BW - Sc.inset, BH - Sc.inset], [Sc.inset, BH - Sc.inset]];
    corners.forEach(function (c, i) { drawScrew(ctx, ox + c[0] * s, oy + c[1] * s, Sc.r * s, Sc.angles[i]); });

    // 3. the paper
    var px = X(0), py = Y(0), pw = 1000 * s, ph = level.h * s, pr = F.radiusInner * s;
    ctx.save();
    rr(ctx, px, py, pw, ph, pr); ctx.clip();
    ctx.fillStyle = P.board.paper; ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = toothPattern(ctx, P.board.tooth.cell, P.board.tooth.alpha * 2.2, P.board.tooth.seed); ctx.fillRect(px, py, pw, ph);
    var vr = Math.max(pw, ph) * 0.75;
    var vg = ctx.createRadialGradient(px + pw / 2, py + ph / 2, vr * (1 - P.board.vignette.reach * 1.6), px + pw / 2, py + ph / 2, vr);
    vg.addColorStop(0, rgba(P.board.paperEdge, 0)); vg.addColorStop(1, rgba("#c9b48c", P.board.vignette.alpha * 1.6));
    ctx.fillStyle = vg; ctx.fillRect(px, py, pw, ph);
    if (o.lifted !== false) R.drawInk(ctx, level, X, Y, s);
    if (o.path) R.drawPath(ctx, o.path, X, Y, br);
    level.holes.forEach(function (h) { R.drawHole(ctx, X(h.x), Y(h.y), h.r * s); });
    if (o.blocked) {
      var bgc = ctx.createRadialGradient(X(o.blocked.x), Y(o.blocked.y), 0, X(o.blocked.x), Y(o.blocked.y), br * P.blocked.r);
      bgc.addColorStop(0, rgba(P.blocked.color, P.blocked.alpha)); bgc.addColorStop(1, rgba(P.blocked.color, 0));
      ctx.fillStyle = bgc; ctx.fillRect(px, py, pw, ph);
    }
    if (o.start && level.start) R.drawStart(ctx, X(level.start.x), Y(level.start.y), br, s, o.start);
    if (o.goal !== false && level.goal) R.drawGoal(ctx, X(level.goal.x), Y(level.goal.y), br * P.goal.rScale, o.gleam);
    // the frame's shadow falling onto the paper
    var IS = P.board.innerShadow;
    ctx.save();
    ctx.shadowColor = IS.color; ctx.shadowBlur = IS.blur * s; ctx.shadowOffsetY = IS.dy * s;
    ctx.beginPath(); ctx.rect(px - 200, py - 200, pw + 400, ph + 400); rr(ctx, px, py, pw, ph, pr, true);
    ctx.fillStyle = "#000"; ctx.fill("evenodd");
    ctx.restore();
    if (o.ball) R.drawBall(ctx, X(o.ball.x), Y(o.ball.y), br, o.ball);
    // glass: one faint straight sheen
    if (o.glass !== false) {
      var Gl = P.board.glass;
      ctx.save();
      ctx.translate(px + pw / 2, py + ph / 2); ctx.rotate(Gl.angle * Math.PI / 180);
      var bw = Gl.band * pw, bx = (Gl.offset - 0.5) * pw;
      ctx.fillStyle = "rgba(255,255,255," + Gl.alpha + ")"; ctx.fillRect(bx, -ph * 1.5, bw, ph * 3);
      ctx.fillStyle = "rgba(255,255,255," + Gl.alpha * 0.7 + ")"; ctx.fillRect(bx + bw * 1.25, -ph * 1.5, bw * 0.22, ph * 3);
      ctx.restore();
    }
    ctx.restore();
    // 4. the lip where wood steps down to paper
    rr(ctx, px, py, pw, ph, pr); ctx.lineWidth = Math.max(1, F.lip.width * s); ctx.strokeStyle = rgba(F.lip.color, 0.75); ctx.stroke();
    rr(ctx, px - ctx.lineWidth, py - ctx.lineWidth, pw + ctx.lineWidth * 2, ph + ctx.lineWidth * 2, pr + ctx.lineWidth);
    ctx.lineWidth = Math.max(0.6, 1.2 * s); ctx.strokeStyle = "rgba(255,232,195,0.35)"; ctx.stroke();
    ctx.restore();
  };

  /* ---------- the story image ---------- */
  R.drawStory = function (ctx, level, o) {
    var S = P.story;
    ctx.fillStyle = S.bg; ctx.fillRect(0, 0, S.w, S.h);
    ctx.fillStyle = toothPattern(ctx, S.tooth.cell, S.tooth.alpha * 1.6, S.tooth.seed); ctx.fillRect(0, 0, S.w, S.h);
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = S.title.color; ctx.font = S.title.font;
    ctx.fillText(o.mode === "friend" ? "Beat " + o.name + "’s level in" : "I drew this.", S.w / 2, S.title.y);
    // line 2: ("Beat " in the title size) + the time, big, centred together on one baseline
    var pre = o.mode === "friend" ? "" : "Beat ";
    ctx.font = S.title.font; var wp = ctx.measureText(pre).width;
    ctx.font = S.time.font; var wt = ctx.measureText(o.time).width;
    var x0 = (S.w - wp - wt) / 2;
    ctx.textAlign = "left"; ctx.fillStyle = S.time.color;
    ctx.font = S.title.font; ctx.fillText(pre, x0, S.time.y);
    ctx.font = S.time.font; ctx.fillText(o.time, x0 + wp, S.time.y);
    ctx.textAlign = "center";
    var s = R.fitScale(level, S.board.maxW, S.board.bottom - S.board.top), sz = R.size(level, s);
    R.drawBoard(ctx, level, { x: (S.w - sz.w) / 2, y: S.board.top + (S.board.bottom - S.board.top - sz.h) / 2, s: s, path: o.path, ball: o.ball, glass: false });
    ctx.save();
    ctx.translate(S.w / 2, S.hand.y); ctx.rotate(S.hand.rotate * Math.PI / 180);
    ctx.font = S.hand.font; ctx.fillStyle = S.hand.color; ctx.textAlign = "center";
    var hw = ctx.measureText("beat my level").width;
    ctx.fillText("beat my level", -16, 0);
    // a small drawn arrow, hooking down to the address
    ctx.strokeStyle = S.hand.color; ctx.lineWidth = 3.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
    var ax = hw / 2;
    ctx.beginPath(); ctx.moveTo(ax - 4, -22); ctx.bezierCurveTo(ax + 26, -26, ax + 40, -4, ax + 30, 22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ax + 18, 12); ctx.lineTo(ax + 30, 24); ctx.lineTo(ax + 40, 9); ctx.stroke();
    ctx.restore();
    ctx.font = S.address.font; ctx.fillStyle = S.address.color; ctx.textAlign = "center";
    ctx.fillText("draw-a-level.vercel.app", S.w / 2, S.address.y);
  };
})();
