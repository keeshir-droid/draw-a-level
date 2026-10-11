/* Draw a Level: story.js (game-builder)
 * The 1080×1920 story image (PLAN.md §5.5, DESIGN.md §8): warm paper, the title and the time, the
 * board with the run's path and the ball in the cup, "beat my level" in Caveat and the address.
 *
 *   DL.story.image(level, { time, path, name, mode: "maker" | "friend" }) -> Promise<Blob> (image/jpeg)
 *     time  seconds (14.2) or a ready string ("0:14.2"); path [x, y, ...] level units (game.result().path)
 *     name  maker mode: unused in the words; friend mode: the maker's name ("Beat Rishi’s level in")
 *   DL.story.render(ctx, level, opts)   draws onto a 1080×1920 context (used by image(); handy for previews)
 *   DL.story.formatTime(seconds) -> "0:14.2"
 * Layout values come from DL.PALETTE.story. Canvas only inside the functions (loads in Node).
 */
(function (root) {
  "use strict";
  const DL = (root.DL = root.DL || {});
  const ADDRESS = "draw-a-level.vercel.app";

  function formatTime(t) {
    if (typeof t === "string") return t;
    const v = Math.max(0, Math.round((+t || 0) * 10) / 10);
    const m = Math.floor(v / 60), s = v - m * 60;
    return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1);
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

  function makeCanvas(w, h) {
    if (typeof document !== "undefined" && document.createElement) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
    if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
    throw new Error("no canvas");
  }

  // the page's paper tooth (same recipe as the board's, at the story's cell size)
  function tooth(ctx, T) {
    const c = makeCanvas(160, 160), g = c.getContext("2d"), rnd = rng(T.seed), a = T.alpha * 1.6;
    for (let y = 0; y < 160; y += T.cell) for (let x = 0; x < 160; x += T.cell) {
      const v = rnd();
      g.fillStyle = v < 0.5 ? "rgba(90,70,40," + a * (0.5 - v) * 2 + ")" : "rgba(255,255,255," + a * (v - 0.5) * 2.4 + ")";
      g.fillRect(x, y, T.cell, T.cell);
    }
    return ctx.createPattern(c, "repeat");
  }

  function fitText(ctx, text, maxW, font) {
    ctx.font = font;
    const w = ctx.measureText(text).width;
    if (w <= maxW) return;
    const m = /(\d+(?:\.\d+)?)px/.exec(font);
    if (m) ctx.font = font.replace(m[0], Math.floor((+m[1] * maxW) / w) + "px");
  }

  function render(ctx, level, o) {
    const P = DL.PALETTE, S = P.story;
    const W = S.w, H = S.h;
    o = o || {};
    const friend = o.mode === "friend";
    ctx.save();
    ctx.fillStyle = S.bg; ctx.fillRect(0, 0, W, H);
    if (S.tooth) { ctx.fillStyle = tooth(ctx, S.tooth); ctx.fillRect(0, 0, W, H); }

    // line 1: the title. line 2: ("Beat " at the title size) + the time, big, centred together on one baseline
    const name = String(o.name || "").trim();
    const title = friend ? (name ? "Beat " + name + "’s level in" : "Beat this level in") : "I drew this.";
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    fitText(ctx, title, W - 2 * S.margin, S.title.font);
    ctx.fillStyle = S.title.color; ctx.fillText(title, W / 2, S.title.y);
    const pre = friend ? "" : "Beat ", tstr = formatTime(o.time);
    ctx.font = S.title.font; const wp = pre ? ctx.measureText(pre).width : 0;
    ctx.font = S.time.font; const wt = ctx.measureText(tstr).width;
    const x0 = (W - wp - wt) / 2;
    ctx.textAlign = "left";
    if (pre) { ctx.font = S.title.font; ctx.fillStyle = S.title.color; ctx.fillText(pre, x0, S.time.y); }
    ctx.font = S.time.font; ctx.fillStyle = S.time.color; ctx.fillText(tstr, x0 + wp, S.time.y);
    ctx.textAlign = "center";

    // the board: frame included, no glass, the path and the ball home in the cup
    const box = S.board, availH = box.bottom - box.top;
    const lay = DL.board.layout(level, Math.min(box.maxW, W - 2 * S.margin), availH, 0);
    const bx = (W - lay.w) / 2, by = box.top + (availH - lay.h) / 2;
    const ball = level.goal ? { x: level.goal.x, y: level.goal.y, sink: 1 } : null;
    DL.board.draw(ctx, level, { scale: lay.scale, x: bx, y: by, path: o.path && o.path.length >= 4 ? o.path : null, ball, glass: false });

    // "beat my level" in the maker's hand, with a small drawn arrow toward the address
    ctx.save();
    ctx.translate(W / 2 - 60, S.hand.y - 18); ctx.rotate((S.hand.rotate * Math.PI) / 180);
    ctx.font = S.hand.font; ctx.fillStyle = S.hand.color; ctx.textAlign = "right";
    ctx.fillText(friend ? "beat my time" : "beat my level", 70, 0);
    ctx.strokeStyle = S.hand.color; ctx.lineWidth = 3.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(88, -14); ctx.bezierCurveTo(120, -20, 148, -6, 170, 14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(152, 14); ctx.lineTo(172, 16); ctx.lineTo(168, -4); ctx.stroke();
    ctx.restore();

    ctx.font = S.address.font; ctx.fillStyle = S.address.color; ctx.textAlign = "center";
    ctx.fillText(ADDRESS, W / 2, S.address.y);
    ctx.restore();
  }

  async function image(level, opts) {
    const S = DL.PALETTE.story;
    try {
      if (typeof document !== "undefined" && document.fonts && document.fonts.load) {
        await Promise.race([
          Promise.all([document.fonts.load(S.hand.font, "beat my level"), document.fonts.load(S.title.font), document.fonts.load(S.time.font, "0:14.2")]),
          new Promise((r) => setTimeout(r, 1500))
        ]);
      }
    } catch (e) { /* draw with fallbacks */ }
    const c = makeCanvas(S.w, S.h);
    render(c.getContext("2d"), level, opts);
    const fail = () => {
      const e = DL.util && DL.util.error ? DL.util.error("export-failed") : new Error("export-failed");
      e.code = e.code || "export-failed";
      return e;
    };
    if (c.convertToBlob) return c.convertToBlob({ type: "image/jpeg", quality: 0.9 }).catch(() => { throw fail(); });
    return new Promise((resolve, reject) => {
      try { c.toBlob((b) => (b ? resolve(b) : reject(fail())), "image/jpeg", 0.9); } catch (e) { reject(fail()); }
    });
  }

  DL.story = { image, render, formatTime };
})(typeof globalThis !== "undefined" ? globalThis : this);
