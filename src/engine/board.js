/* Draw a Level: board.js (game-builder)
 * Draws "The Desk Toy" (DESIGN.md §4): the wooden frame with brass screws, the paper under glass, the
 * person's ink walls, fills, holes, the brass goal cup, the start mark, the path line and the steel ball.
 * Ported from the art director's reference renderer (design/board-render.js); every colour and size
 * comes from DL.PALETTE.
 *
 *   DL.board.layout(level, w, h, margin?) -> { scale, w, h, x, y, frame }
 *        fit the whole board (frame included) in w×h CSS px, centred, margin px kept free around it
 *   DL.board.size(level, scale) -> { w, h, frame }   board size in px (frame included)
 *   DL.board.draw(ctx, level, { scale, ball?, path?, idle?, x?, y?, placing?, blocked?, gleam?, glass?, start?, goal? })
 *        draws the board with its outer top-left at (x, y) (default 0, 0) in the ctx's current units.
 *        scale   px per level unit (from layout)
 *        ball    DL.physics.ballView(world) or { x, y } in level units (z = drop height 0..1,
 *                fall = 0..1 into a hole, sink = 0..1 settling in the cup, hidden)
 *        path    [x, y, ...] level units (result + story)
 *        idle    landing / previews: no start marker
 *        placing place screen: strong start marker with its centre cross
 *        blocked {x, y}: the "can't get through" smudge
 *        gleam   0..1: the finish light travelling once round the brass ring
 *        glass   false hides the glass sheen (story)
 *        start / goal: false to hide them
 *   DL.board.toBoard(level, scale, px, py) -> {x, y}  board px (from the board's top-left) -> level units
 *   DL.board.goalR(level) -> visual goal radius in level units
 *   DL.board.clearCache()
 * Static layers (frame, paper, ink / holes, goal, start, the frame's inner shadow, lip) are cached per
 * level, scale and pixel ratio in offscreen canvases; each frame draws one cached image, then the ball
 * (a cached sprite) and the glass. With a path, the path goes between the ink and the holes.
 */
(function (root) {
  "use strict";
  const DL = (root.DL = root.DL || {});
  const TAU = Math.PI * 2;

  function PAL() {
    if (!DL.PALETTE) throw new Error("DL.PALETTE missing: load src/engine/palette.js before board.js");
    return DL.PALETTE;
  }

  function makeCanvas(w, h) {
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    if (typeof document !== "undefined" && document.createElement) {
      const c = document.createElement("canvas"); c.width = w; c.height = h; return c;
    }
    if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
    throw new Error("no canvas");
  }

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rgba(hex, a) {
    const n = parseInt(String(hex).slice(1), 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }
  function withAlpha(col, a) { return col.charAt(0) === "#" ? rgba(col, a) : col.replace(/rgba?\(([^,]+),([^,]+),([^,)]+)(,[^)]*)?\)/, "rgba($1,$2,$3," + a + ")"); }
  function rr(ctx, x, y, w, h, r, keep) {
    if (!keep) ctx.beginPath();
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---------- geometry ----------
  function frameW() { return PAL().frame.width; }
  function size(level, scale) {
    const F = frameW();
    return { w: (level.w + 2 * F) * scale, h: (level.h + 2 * F) * scale, frame: F * scale };
  }
  function layout(level, w, h, margin) {
    const F = frameW(), m = margin == null ? 0 : margin;
    const scale = Math.max(0.01, Math.min((w - 2 * m) / (level.w + 2 * F), (h - 2 * m) / (level.h + 2 * F)));
    const s = size(level, scale);
    return { scale, w: s.w, h: s.h, x: (w - s.w) / 2, y: (h - s.h) / 2, frame: s.frame };
  }
  function toBoard(level, scale, px, py) { const F = frameW(); return { x: px / scale - F, y: py / scale - F }; }
  function goalR(level) { return PAL().goal.rScale * level.ballR; }

  // ---------- caches ----------
  let cache = new WeakMap();
  const spriteCache = new Map();
  let toothCache = {};
  function clearCache() { cache = new WeakMap(); spriteCache.clear(); toothCache = {}; }
  function deviceScale(ctx) {
    try { const t = ctx.getTransform(); return Math.max(0.25, Math.hypot(t.a, t.b)); } catch (e) { return 1; }
  }
  function shadowPad(s) { const O = PAL().frame.outerShadow; return Math.ceil((O.blur * 1.2 + O.dy) * s) + 2; }

  function layer(level, s, dpr, key, paint) {
    let per = cache.get(level);
    if (!per) { per = new Map(); cache.set(level, per); }
    const k = key + "|" + s.toFixed(4) + "|" + dpr.toFixed(3);
    let c = per.get(k);
    if (c) return c;
    if (per.size > 8) per.clear();
    const pad = shadowPad(s), sz = size(level, s);
    const canvas = makeCanvas((sz.w + 2 * pad) * dpr, (sz.h + 2 * pad) * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, pad * dpr, pad * dpr);
    paint(ctx);
    c = { canvas, pad };
    per.set(k, c);
    return c;
  }
  function blit(ctx, L, dpr, ox, oy) {
    ctx.drawImage(L.canvas, ox - L.pad, oy - L.pad, L.canvas.width / dpr, L.canvas.height / dpr);
  }

  // ---------- the wood ----------
  function drawWood(ctx, BW, BH, f, s) {
    const W = PAL().wood, rnd = rng(W.seed);
    const sides = [
      { poly: [[0, 0], [BW, 0], [BW - f, f], [f, f]], horiz: true, a: 0, b: f, len: BW },
      { poly: [[0, BH], [BW, BH], [BW - f, BH - f], [f, BH - f]], horiz: true, a: BH - f, b: BH, len: BW },
      { poly: [[0, 0], [f, f], [f, BH - f], [0, BH]], horiz: false, a: 0, b: f, len: BH },
      { poly: [[BW, 0], [BW - f, f], [BW - f, BH - f], [BW, BH]], horiz: false, a: BW - f, b: BW, len: BH }
    ];
    sides.forEach(function (sd, si) {
      ctx.save();
      ctx.beginPath();
      sd.poly.forEach(function (p, i) { if (i) ctx.lineTo(p[0] * s, p[1] * s); else ctx.moveTo(p[0] * s, p[1] * s); });
      ctx.closePath(); ctx.clip();
      ctx.fillStyle = W.base; ctx.fillRect(0, 0, BW * s, BH * s);
      const tone = [0.0, 0.05, -0.04, 0.03][si]; // four pieces of wood, each a touch different
      ctx.fillStyle = tone > 0 ? rgba(W.light, tone * 3) : rgba(W.dark, -tone * 3);
      ctx.fillRect(0, 0, BW * s, BH * s);
      for (let bnd = 0; bnd < 3; bnd++) {
        const pos = sd.a + (sd.b - sd.a) * rnd(), wid = (sd.b - sd.a) * (0.25 + rnd() * 0.4);
        const g = sd.horiz ? ctx.createLinearGradient(0, (pos - wid) * s, 0, (pos + wid) * s) : ctx.createLinearGradient((pos - wid) * s, 0, (pos + wid) * s, 0);
        const col = bnd % 2 ? W.dark : W.light;
        g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.5, rgba(col, W.figureAlpha * 2.2)); g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, BW * s, BH * s);
      }
      const lines = Math.round((W.linesPer100 * (sd.b - sd.a)) / 100);
      for (let i = 0; i < lines; i++) {
        const base = sd.a + (sd.b - sd.a) * ((i + 0.2 + rnd() * 0.6) / lines);
        const late = i % 5 === 3;
        ctx.strokeStyle = rgba(W.grain, Math.min(0.6, W.grainAlpha * (0.5 + rnd() * 0.8) * (late ? 1.8 : 1)));
        ctx.lineWidth = Math.max(W.minLinePx || 0.6, (late ? 1.5 : 0.9) * s);
        const ph = rnd() * TAU, ph2 = rnd() * TAU, amp = W.wobble * (0.5 + rnd());
        ctx.beginPath();
        for (let d = -10; d <= sd.len + 10; d += 12) {
          const off = base + amp * Math.sin((d / W.wavelength) * TAU + ph) + amp * 0.35 * Math.sin(d / (W.wavelength * 0.37) + ph2);
          const X = sd.horiz ? d * s : off * s, Y = sd.horiz ? off * s : d * s;
          if (d === -10) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
        }
        ctx.stroke();
      }
      ctx.restore();
    });
    const Fr = PAL().frame;
    ctx.save();
    ctx.strokeStyle = rgba(Fr.mitre.color, Fr.mitre.alpha); ctx.lineWidth = Math.max(0.6, Fr.mitre.width * s);
    [[0, 0, f, f], [BW, 0, BW - f, f], [BW, BH, BW - f, BH - f], [0, BH, f, BH - f]].forEach(function (l) {
      ctx.beginPath(); ctx.moveTo(l[0] * s, l[1] * s); ctx.lineTo(l[2] * s, l[3] * s); ctx.stroke();
    });
    ctx.restore();
  }

  function drawScrew(ctx, x, y, r, angDeg) {
    const S = PAL().screws;
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, S.light); g.addColorStop(0.55, S.mid); g.addColorStop(1, S.dark);
    ctx.beginPath(); ctx.arc(x, y + r * 0.12, r * 1.05, 0, TAU); ctx.fillStyle = withAlpha(PAL().frame.outerShadow.color, 0.35); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = Math.max(0.5, r * 0.08); ctx.strokeStyle = rgba(S.dark, 0.7); ctx.stroke();
    const a = (angDeg * Math.PI) / 180, dx = Math.cos(a) * r * 0.78, dy = Math.sin(a) * r * 0.78;
    ctx.lineCap = "round";
    ctx.strokeStyle = rgba(S.light, 0.7); ctx.lineWidth = Math.max(0.6, r * 0.2);
    ctx.beginPath(); ctx.moveTo(x - dx, y - dy + r * 0.1); ctx.lineTo(x + dx, y + dy + r * 0.1); ctx.stroke();
    ctx.strokeStyle = S.slot; ctx.lineWidth = Math.max(0.6, r * 0.2);
    ctx.beginPath(); ctx.moveTo(x - dx, y - dy); ctx.lineTo(x + dx, y + dy); ctx.stroke();
  }

  function toothPattern(ctx, cell, alpha, seed) {
    const k = cell + ":" + alpha + ":" + seed;
    if (!toothCache[k]) {
      const c = makeCanvas(160, 160);
      const g = c.getContext("2d"), rnd = rng(seed);
      for (let y = 0; y < 160; y += cell) for (let x = 0; x < 160; x += cell) {
        const v = rnd();
        g.fillStyle = v < 0.5 ? "rgba(90,70,40," + alpha * (0.5 - v) * 2 + ")" : "rgba(255,255,255," + alpha * (v - 0.5) * 2.4 + ")";
        g.fillRect(x, y, cell, cell);
      }
      for (let i = 0; i < 40; i++) { // a few fibres
        g.strokeStyle = "rgba(120,95,60," + alpha * 0.9 + ")"; g.lineWidth = 0.5;
        const fx = rnd() * 160, fy = rnd() * 160, fa = rnd() * TAU, fl = 3 + rnd() * 6;
        g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + Math.cos(fa) * fl, fy + Math.sin(fa) * fl); g.stroke();
      }
      toothCache[k] = c;
    }
    return ctx.createPattern(toothCache[k], "repeat");
  }

  // ---------- layer 1: frame, paper, ink ----------
  function paintUnder(ctx, level, s, dpr, shadow) {
    const P = PAL(), F = P.frame, f = F.width;
    const BW = level.w + 2 * f, BH = level.h + 2 * f;
    if (shadow !== false) {
      ctx.save();
      ctx.shadowColor = F.outerShadow.color; ctx.shadowBlur = F.outerShadow.blur * s; ctx.shadowOffsetY = F.outerShadow.dy * s;
      rr(ctx, 0, 0, BW * s, BH * s, F.radiusOuter * s); ctx.fillStyle = P.wood.dark; ctx.fill();
      ctx.shadowColor = withAlpha(F.outerShadow.color, 0.25); ctx.shadowBlur = 3 * s; ctx.shadowOffsetY = 2 * s; ctx.fill();
      ctx.restore();
    }
    ctx.save(); rr(ctx, 0, 0, BW * s, BH * s, F.radiusOuter * s); ctx.clip();
    drawWood(ctx, BW, BH, f, s);
    ctx.restore();
    // bevel light on the outer edge, from the top left
    ctx.save();
    const bl = ctx.createLinearGradient(0, 0, BW * s, BH * s);
    bl.addColorStop(0, F.bevelLight.color); bl.addColorStop(0.5, withAlpha(F.bevelLight.color, 0.12)); bl.addColorStop(1, rgba(F.lip.color, 0.25));
    ctx.lineWidth = Math.max(1, F.bevelLight.width * s);
    rr(ctx, ctx.lineWidth / 2, ctx.lineWidth / 2, BW * s - ctx.lineWidth, BH * s - ctx.lineWidth, F.radiusOuter * s - ctx.lineWidth / 2);
    ctx.strokeStyle = bl; ctx.stroke();
    rr(ctx, 0, 0, BW * s, BH * s, F.radiusOuter * s); ctx.lineWidth = 1; ctx.strokeStyle = rgba(F.mitre.color, 0.45); ctx.stroke();
    ctx.restore();
    const Sc = P.screws;
    [[Sc.inset, Sc.inset], [BW - Sc.inset, Sc.inset], [BW - Sc.inset, BH - Sc.inset], [Sc.inset, BH - Sc.inset]]
      .forEach(function (c, i) { drawScrew(ctx, c[0] * s, c[1] * s, Sc.r * s, Sc.angles[i]); });

    // the paper
    const px = f * s, py = f * s, pw = level.w * s, ph = level.h * s, pr = F.radiusInner * s;
    ctx.save();
    rr(ctx, px, py, pw, ph, pr); ctx.clip();
    ctx.fillStyle = P.board.paper; ctx.fillRect(px, py, pw, ph);
    const T = P.board.tooth;
    ctx.fillStyle = toothPattern(ctx, T.cell, T.alpha * 2.2, T.seed); ctx.fillRect(px, py, pw, ph);
    const vr = Math.max(pw, ph) * 0.75;
    const vg = ctx.createRadialGradient(px + pw / 2, py + ph / 2, vr * (1 - P.board.vignette.reach * 1.6), px + pw / 2, py + ph / 2, vr);
    vg.addColorStop(0, rgba(P.board.paperEdge, 0)); vg.addColorStop(1, rgba(P.board.vignetteColor || "#c9b48c", P.board.vignette.alpha * 1.6));
    ctx.fillStyle = vg; ctx.fillRect(px, py, pw, ph);
    ctx.translate(px, py);
    drawInk(ctx, level, s, dpr);
    ctx.restore();
  }

  // the person's ink as pen strokes: round caps and joins, slight pressure variation along each stroke,
  // drawn opaque into a layer, then laid on the paper at ink.alpha with a whisper of raise shadow
  function drawInk(ctx, level, s, dpr) {
    const P = PAL(), I = P.ink, col = P.inkFor ? P.inkFor(level.ink) : level.ink || I.fallback;
    const lw = level.w * s, lh = level.h * s;
    const lay = makeCanvas(lw * dpr, lh * dpr), x = lay.getContext("2d");
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.fillStyle = col; x.strokeStyle = col; x.lineCap = "round"; x.lineJoin = "round";
    (level.walls || []).forEach(function (wl, si) {
      const p = wl.pts || [];
      const base = Math.max(I.minPx, (wl.width || 6) * s);
      if (p.length === 2) { x.beginPath(); x.arc(p[0] * s, p[1] * s, base / 2, 0, TAU); x.fill(); return; }
      const seed = si * 1.618 + p[0] * 0.013 + p[1] * 0.007;
      let along = 0;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const ax = p[i], ay = p[i + 1], bx = p[i + 2], by = p[i + 3];
        const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(L / 12));
        for (let k = 0; k < n; k++) {
          const t0 = k / n, t1 = (k + 1) / n, a = along + (L * (t0 + t1)) / 2;
          const fct = 1 + 0.08 * Math.sin(a / 41 + seed) + 0.04 * Math.sin(a / 13 + seed * 3.1);
          x.lineWidth = Math.max(I.minPx, base * fct);
          x.beginPath();
          x.moveTo((ax + (bx - ax) * t0) * s, (ay + (by - ay) * t0) * s);
          x.lineTo((ax + (bx - ax) * t1) * s, (ay + (by - ay) * t1) * s);
          x.stroke();
        }
        along += L;
      }
    });
    (level.fills || []).forEach(function (fl) {
      const p = fl.pts || [];
      if (p.length < 6) return;
      x.beginPath(); x.moveTo(p[0] * s, p[1] * s);
      for (let i = 2; i < p.length; i += 2) x.lineTo(p[i] * s, p[i + 1] * s);
      x.closePath(); x.fill(); x.lineWidth = Math.max(I.minPx, 2 * s); x.stroke();
    });
    ctx.save();
    ctx.shadowColor = withAlpha(I.raise.color, I.raise.alpha);
    ctx.shadowOffsetY = I.raise.dy * s * dpr; ctx.shadowBlur = I.raise.blur * s * dpr; // shadows ignore the transform
    ctx.globalAlpha = I.alpha;
    ctx.drawImage(lay, 0, 0, lw, lh);
    ctx.restore();
    ctx.save();
    ctx.fillStyle = rgba(col, I.pool.alpha);
    (level.walls || []).forEach(function (wl) {
      const p = wl.pts || [];
      if (p.length < 4) return;
      const rad = Math.max(I.minPx, (wl.width || 6) * s) * I.pool.scale;
      [[p[0], p[1]], [p[p.length - 2], p[p.length - 1]]].forEach(function (e) { ctx.beginPath(); ctx.arc(e[0] * s, e[1] * s, rad, 0, TAU); ctx.fill(); });
    });
    ctx.restore();
  }

  // ---------- layer 2: holes, start, goal, the frame's shadow on the paper, the lip ----------
  function paintOver(ctx, level, s, startMode, showGoal) {
    const P = PAL(), F = P.frame, f = F.width;
    const px = f * s, py = f * s, pw = level.w * s, ph = level.h * s, pr = F.radiusInner * s;
    const br = level.ballR * s;
    ctx.save();
    rr(ctx, px, py, pw, ph, pr); ctx.clip();
    ctx.translate(px, py);
    (level.holes || []).forEach(function (h) { drawHole(ctx, h.x * s, h.y * s, h.r * s); });
    if (startMode && level.start) drawStart(ctx, level.start.x * s, level.start.y * s, br, s, startMode);
    if (showGoal && level.goal) drawGoal(ctx, level.goal.x * s, level.goal.y * s, br * P.goal.rScale);
    ctx.translate(-px, -py);
    const IS = P.board.innerShadow;
    ctx.shadowColor = IS.color; ctx.shadowBlur = IS.blur * s; ctx.shadowOffsetY = IS.dy * s;
    ctx.beginPath(); ctx.rect(px - 200, py - 200, pw + 400, ph + 400); rr(ctx, px, py, pw, ph, pr, true);
    ctx.fillStyle = "#000"; ctx.fill("evenodd");
    ctx.restore();
  }
  function paintLip(ctx, level, s) {
    const F = PAL().frame, f = F.width;
    const px = f * s, py = f * s, pw = level.w * s, ph = level.h * s, pr = F.radiusInner * s;
    ctx.save();
    rr(ctx, px, py, pw, ph, pr); ctx.lineWidth = Math.max(1, F.lip.width * s); ctx.strokeStyle = rgba(F.lip.color, 0.75); ctx.stroke();
    rr(ctx, px - ctx.lineWidth, py - ctx.lineWidth, pw + ctx.lineWidth * 2, ph + ctx.lineWidth * 2, pr + ctx.lineWidth);
    ctx.lineWidth = Math.max(0.6, 1.2 * s); ctx.strokeStyle = withAlpha(F.bevelLight.color, 0.35); ctx.stroke();
    ctx.restore();
  }

  function drawHole(ctx, x, y, r) {
    const Ho = PAL().hole;
    ctx.save();
    if (Ho.halo) { ctx.beginPath(); ctx.arc(x, y + r * 0.04, r * (1 + Ho.rimWidth + Ho.halo.width), 0, TAU); ctx.fillStyle = rgba(Ho.halo.color, Ho.halo.alpha); ctx.fill(); }
    ctx.beginPath(); ctx.arc(x, y, r * (1 + Ho.rimWidth), 0, TAU); ctx.fillStyle = rgba(Ho.rim, 0.55); ctx.fill();
    const g = ctx.createRadialGradient(x, y + r * 0.15, 0, x, y, r);
    g.addColorStop(0, Ho.deep); g.addColorStop(0.7, Ho.deep); g.addColorStop(1, Ho.wall);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = g; ctx.fill();
    ctx.clip();
    ctx.beginPath(); ctx.rect(x - r * 2, y - r * 2, r * 4, r * 4); ctx.arc(x, y + Ho.crescent.dy * r, r, 0, TAU, true);
    ctx.fillStyle = "rgba(0,0,0," + Ho.crescent.alpha + ")"; ctx.fill("evenodd");
    ctx.lineCap = "round"; ctx.lineWidth = Math.max(0.8, Ho.lipWidth * r);
    ctx.strokeStyle = rgba(Ho.lip, Ho.lipAlpha);
    ctx.beginPath(); ctx.arc(x, y, r - ctx.lineWidth / 2, Math.PI * 0.18, Math.PI * 0.82); ctx.stroke();
    ctx.restore();
  }

  function drawGoal(ctx, x, y, Rg) {
    const G = PAL().goal;
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y + Rg * 0.06, Rg * 1.04, 0, TAU); ctx.fillStyle = withAlpha(G.dishShadow.color, 0.28); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, Rg, 0, TAU); ctx.fillStyle = G.dark; ctx.fill();
    const g = ctx.createLinearGradient(x - Rg, y - Rg, x + Rg, y + Rg);
    g.addColorStop(0, G.light); g.addColorStop(0.45, G.mid); g.addColorStop(1, G.dark);
    ctx.beginPath(); ctx.arc(x, y, Rg * 0.965, 0, TAU); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = Math.max(0.6, Rg * 0.025); ctx.strokeStyle = rgba(G.engrave.color, G.engrave.alpha);
    ctx.beginPath(); ctx.arc(x, y, Rg * G.engrave.r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = withAlpha(G.light, 0.35);
    ctx.beginPath(); ctx.arc(x, y + ctx.lineWidth, Rg * G.engrave.r, 0, TAU); ctx.stroke();
    const rd = Rg * (1 - G.ringWidth);
    const dg = ctx.createLinearGradient(x + rd, y + rd, x - rd, y - rd);
    dg.addColorStop(0, G.light); dg.addColorStop(0.5, G.mid); dg.addColorStop(1, G.dark);
    ctx.beginPath(); ctx.arc(x, y, rd, 0, TAU); ctx.fillStyle = dg; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, rd * 0.9, 0, TAU); ctx.fillStyle = G.dish; ctx.fill();
    ctx.clip();
    const sg = ctx.createLinearGradient(0, y - rd, 0, y + rd * 0.2);
    sg.addColorStop(0, withAlpha(G.dishShadow.color, G.dishShadow.alpha)); sg.addColorStop(1, withAlpha(G.dishShadow.color, 0));
    ctx.fillStyle = sg; ctx.fillRect(x - rd, y - rd, rd * 2, rd * 2);
    ctx.restore();
  }

  function drawGleam(ctx, x, y, Rg, gleam) {
    const G = PAL().goal;
    ctx.save();
    const a = -2.4 + gleam * TAU, al = G.gleam.alpha * Math.sin(Math.PI * Math.min(1, gleam));
    ctx.lineCap = "round"; ctx.lineWidth = Rg * G.ringWidth * 0.5;
    const cx = x + Math.cos(a) * Rg * 0.85, cy = y + Math.sin(a) * Rg * 0.85;
    const gg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Rg * 0.7);
    gg.addColorStop(0, "rgba(255,248,225," + al + ")"); gg.addColorStop(1, "rgba(255,248,225,0)");
    ctx.strokeStyle = gg; ctx.beginPath(); ctx.arc(x, y, Rg * 0.85, a - 0.6, a + 0.6); ctx.stroke();
    ctx.restore();
  }

  function drawStart(ctx, x, y, br, s, mode) {
    const St = PAL().start;
    ctx.save();
    ctx.globalAlpha = mode === "place" ? St.alphaPlace : St.alphaPlay;
    ctx.strokeStyle = St.color; ctx.lineWidth = Math.max(1.2, St.width * s); ctx.lineCap = "round";
    ctx.setLineDash([St.dash[0] * s, St.dash[1] * s]);
    ctx.beginPath(); ctx.arc(x, y, br * St.rScale, 0, TAU); ctx.stroke();
    if (mode === "place") {
      ctx.setLineDash([]); const t = br * St.tick;
      ctx.beginPath(); ctx.moveTo(x - t, y - t); ctx.lineTo(x + t, y + t); ctx.moveTo(x + t, y - t); ctx.lineTo(x - t, y + t); ctx.stroke();
    }
    ctx.restore();
  }

  function drawPath(ctx, pts, s, br) {
    const Pa = PAL().path;
    if (!pts || pts.length < 4) return;
    ctx.save();
    ctx.strokeStyle = rgba(Pa.color, Pa.alpha); ctx.lineWidth = Math.max(Pa.minPx, br * Pa.widthScale);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(pts[0] * s, pts[1] * s);
    for (let i = 2; i < pts.length - 2; i += 2) {
      const mx = ((pts[i] + pts[i + 2]) / 2) * s, my = ((pts[i + 1] + pts[i + 3]) / 2) * s;
      ctx.quadraticCurveTo(pts[i] * s, pts[i + 1] * s, mx, my);
    }
    ctx.lineTo(pts[pts.length - 2] * s, pts[pts.length - 1] * s);
    ctx.stroke();
    ctx.fillStyle = rgba(Pa.color, Pa.alpha);
    if (Pa.startDot) { ctx.beginPath(); ctx.arc(pts[0] * s, pts[1] * s, br * Pa.startDot, 0, TAU); ctx.fill(); }
    if (Pa.endDot) { ctx.beginPath(); ctx.arc(pts[pts.length - 2] * s, pts[pts.length - 1] * s, br * Pa.endDot, 0, TAU); ctx.fill(); }
    ctx.restore();
  }

  // ---------- the steel ball ----------
  // body, band, bounce light, highlight, glint and rim, cached per device-pixel radius
  function ballSprite(rpx) {
    const key = Math.max(1, Math.round(rpx * 2) / 2);
    let c = spriteCache.get(key);
    if (c) return c;
    if (spriteCache.size > 24) spriteCache.clear();
    const B = PAL().ball, r = key, sz = Math.ceil(r * 2 + 4), x = sz / 2, y = sz / 2;
    const cv = makeCanvas(sz, sz), ctx = cv.getContext("2d");
    const bg = ctx.createRadialGradient(x + B.highlight.x * r, y + B.highlight.y * r, 0, x, y, r);
    bg.addColorStop(0, B.base); bg.addColorStop(0.55, B.mid); bg.addColorStop(1, B.dark);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = bg; ctx.fill();
    ctx.save(); ctx.clip();
    const by = y + B.band.y * r, bh = B.band.h * r;
    const bandG = ctx.createLinearGradient(0, by - bh / 2, 0, by + bh / 2);
    bandG.addColorStop(0, rgba(B.band.color, 0)); bandG.addColorStop(0.5, rgba(B.band.color, B.band.alpha)); bandG.addColorStop(1, rgba(B.band.color, 0));
    ctx.fillStyle = bandG; ctx.fillRect(x - r, by - bh / 2, r * 2, bh);
    const ub = ctx.createRadialGradient(x + B.bounce.x * r, y + B.bounce.y * r, 0, x + B.bounce.x * r, y + B.bounce.y * r, B.bounce.r * r);
    ub.addColorStop(0, rgba(B.bounce.color, B.bounce.alpha)); ub.addColorStop(1, rgba(B.bounce.color, 0));
    ctx.fillStyle = ub; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    const hx = x + B.highlight.x * r, hy = y + B.highlight.y * r;
    const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, B.highlight.r * r);
    hg.addColorStop(0, "rgba(255,255,255," + B.highlight.alpha + ")"); hg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = hg; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    const gx = x + B.glint.x * r, gy = y + B.glint.y * r;
    const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(0.8, B.glint.r * r));
    gg.addColorStop(0, "rgba(255,255,255," + B.glint.alpha + ")"); gg.addColorStop(0.6, "rgba(255,255,255," + 0.9 * B.glint.alpha + ")"); gg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gg; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
    ctx.beginPath(); ctx.arc(x, y, r - (B.rimWidth * r) / 2, 0, TAU);
    ctx.lineWidth = Math.max(0.6, B.rimWidth * r); ctx.strokeStyle = rgba(B.rim, 0.55); ctx.stroke();
    c = { canvas: cv, half: sz / 2 };
    spriteCache.set(key, c);
    return c;
  }

  // ball: { x, y, z (drop height 0..1), fall (0..1 into a hole), sink (0..1 in the cup), hidden }
  function drawBall(ctx, level, ball, s, dpr) {
    if (!ball || ball.hidden) return;
    const B = PAL().ball, Ho = PAL().hole;
    const r = (ball.r || level.ballR) * s;
    const lift = Math.max(0, ball.z || 0), fall = Math.max(0, Math.min(1, ball.fall || 0)), sink = Math.max(0, Math.min(1, ball.sink || 0));
    const sc = (1 + (B.drop.fromScale - 1) * lift) * (1 - (1 - B.hole.endScale) * fall) * (1 - 0.04 * sink);
    const dark = B.hole.darken * fall;
    const x = ball.x * s, y = ball.y * s, rr2 = r * sc;
    ctx.save();
    // cast shadow: grows and softens while the ball is up near the glass, fades into a hole
    const grow = 1 + lift * (B.drop.shadowGrow - 1);
    const sx = x + B.shadow.dx * r * grow * (1 - 0.5 * sink), sy = y + B.shadow.dy * r * grow * (1 - 0.5 * sink), sr = r * (1 + B.shadow.blur * grow);
    const sa = B.shadow.alpha * (1 - fall) * (1 - lift * 0.5);
    if (sa > 0.005) {
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
      g.addColorStop(0, withAlpha(B.shadow.color, sa)); g.addColorStop(0.55, withAlpha(B.shadow.color, sa * 0.6)); g.addColorStop(1, withAlpha(B.shadow.color, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, TAU); ctx.fill();
    }
    const ca = B.contact.alpha * (1 - fall) * Math.max(0, 1 - lift * 4);
    if (ca > 0.005) {
      const cg = ctx.createRadialGradient(x, y + r * 0.12, 0, x, y + r * 0.12, r * 1.02);
      cg.addColorStop(0, withAlpha(B.shadow.color, ca)); cg.addColorStop(B.contact.r, withAlpha(B.shadow.color, ca * 0.8)); cg.addColorStop(1, withAlpha(B.shadow.color, 0));
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(x, y + r * 0.12, r * 1.02, 0, TAU); ctx.fill();
    }
    const sp = ballSprite(rr2 * dpr), k = 1 / dpr;
    const spriteR = Math.max(1, Math.round(rr2 * dpr * 2) / 2) * k, f = rr2 / spriteR; // exact radius after rounding
    ctx.drawImage(sp.canvas, x - sp.half * k * f, y - sp.half * k * f, sp.canvas.width * k * f, sp.canvas.height * k * f);
    if (dark > 0) { ctx.beginPath(); ctx.arc(x, y, rr2, 0, TAU); ctx.fillStyle = rgba(Ho.deep, dark); ctx.fill(); }
    ctx.restore();
  }

  function drawGlass(ctx, level, s) {
    const Gl = PAL().board.glass, F = PAL().frame;
    if (!(Gl.alpha > 0)) return;
    const pw = level.w * s, ph = level.h * s;
    ctx.save();
    rr(ctx, 0, 0, pw, ph, F.radiusInner * s); ctx.clip();
    ctx.translate(pw / 2, ph / 2); ctx.rotate((Gl.angle * Math.PI) / 180);
    const bw = Gl.band * pw, bx = (Gl.offset - 0.5) * pw;
    ctx.fillStyle = "rgba(255,255,255," + Gl.alpha + ")"; ctx.fillRect(bx, -ph * 1.5, bw, ph * 3);
    ctx.fillStyle = "rgba(255,255,255," + Gl.alpha * 0.7 + ")"; ctx.fillRect(bx + bw * 1.25, -ph * 1.5, bw * 0.22, ph * 3);
    ctx.restore();
  }

  function drawBlocked(ctx, level, b, s) {
    const Bk = PAL().blocked, br = level.ballR * s;
    const g = ctx.createRadialGradient(b.x * s, b.y * s, 0, b.x * s, b.y * s, br * Bk.r);
    g.addColorStop(0, rgba(Bk.color, Bk.alpha)); g.addColorStop(1, rgba(Bk.color, 0));
    ctx.fillStyle = g; ctx.fillRect(b.x * s - br * Bk.r, b.y * s - br * Bk.r, 2 * br * Bk.r, 2 * br * Bk.r);
  }

  // ---------- draw ----------
  function draw(ctx, level, opts) {
    const o = opts || {};
    const s = o.scale || 1, dpr = deviceScale(ctx);
    const ox = o.x || 0, oy = o.y || 0;
    const startMode = o.start === false || o.idle ? null : o.placing ? "place" : "play";
    const showGoal = o.goal !== false;
    const shadow = o.shadow !== false;
    const okey = (startMode || "-") + (showGoal ? "g" : "-");
    const F = frameW() * s;
    const under = function (c) { paintUnder(c, level, s, dpr, shadow); };
    const over = function (c) { paintOver(c, level, s, startMode, showGoal); paintLip(c, level, s); };
    if (o.path && o.path.length >= 4) {
      blit(ctx, layer(level, s, dpr, "u" + shadow, under), dpr, ox, oy);
      ctx.save();
      ctx.translate(ox + F, oy + F);
      ctx.beginPath(); rr(ctx, 0, 0, level.w * s, level.h * s, PAL().frame.radiusInner * s); ctx.clip();
      drawPath(ctx, o.path, s, level.ballR * s);
      ctx.restore();
      blit(ctx, layer(level, s, dpr, "o" + okey, over), dpr, ox, oy);
    } else {
      blit(ctx, layer(level, s, dpr, "c" + okey + shadow, function (c) { under(c); over(c); }), dpr, ox, oy);
    }
    ctx.save();
    ctx.translate(ox + F, oy + F);
    if (o.blocked) drawBlocked(ctx, level, o.blocked, s);
    if (o.gleam > 0 && o.gleam < 1 && level.goal && showGoal) drawGleam(ctx, level.goal.x * s, level.goal.y * s, goalR(level) * s, o.gleam);
    if (o.ball) drawBall(ctx, level, o.ball, s, dpr);
    if (o.glass !== false) drawGlass(ctx, level, s);
    ctx.restore();
  }

  DL.board = { draw, layout, size, toBoard, goalR, clearCache };
})(typeof globalThis !== "undefined" ? globalThis : this);
