// The level link: Level <-> "L1.<payload>" (PLAN.md section 6.4). No server: the whole level is in the link.
//
//   DL.codec.encode(level) -> Promise<string>      "L1.<payload>"
//   DL.codec.decode(text)  -> Promise<level>       text may be "L1.…", "#L1.…" or a whole address with "#L1.…"
//                                                  rejects with an Error {code: "bad-link", title, detail}; never anything else
//   DL.codec.url(level)    -> Promise<string>      "https://draw-a-level.vercel.app/#L1.<payload>"
//   DL.codec.normalize(level) -> level             a copy, quantised exactly as the link stores it (whole units,
//                                                  widths / ballR / hole radii to 0.5, name <= 16 characters, time to 0.1 s)
//   DL.codec.fit(level, maxLen?) -> Promise<{ level, text, tol }>   simplifies harder until the link fits (default 4000)
//
// Payload: base64url( mode byte + body ), mode 1 = deflate-raw (CompressionStream), 0 = stored (no compression
// available, or compression didn't help). Body (all integers; varints are LEB128, "z" = zig-zag signed):
//   u8 version(1) · varint h · varint ballR*2 · u8 r,g,b (ink)
//   varint nWalls · per wall: varint width*2 · varint nPts · z dx0, z dy0 (from the previous wall's last point) ·
//                   (nPts-1) x (z dx, z dy)
//   varint nFills · per fill: varint nPts · z dx0, z dy0 (from the previous point) · (nPts-1) x (z dx, z dy)
//   varint nHoles · per hole: varint x · varint y · varint r*2
//   u8 flags (1 start, 2 goal, 4 challenge) · [varint x, y] · [varint x, y] · [varint nameBytes, utf-8 bytes, varint tenths]
//   u16 check (FNV-1a of everything before, low 16 bits)
(function () {
  const DL = (globalThis.DL = globalThis.DL || {});
  const U = function () { return DL.util; };

  const VERSION = 1;
  const MAX_TEXT = 12000, MAX_BODY = 200000;
  const LIM = { walls: 4000, pts: 40000, ptsPerWall: 8000, fills: 400, ptsPerFill: 4000, holes: 120 };
  const BUDGET = 4000;

  function badLink() { return U().error("bad-link"); }

  // ---------- quantising ----------
  function half(v) { return Math.round(v * 2) / 2; }
  function cleanName(s) {
    if (s === undefined || s === null) return "";
    let str = String(s).replace(/[\u0000-\u001f\u007f]/g, "").trim();
    const cps = Array.from(str);
    if (cps.length > 16) str = cps.slice(0, 16).join("");
    return str;
  }
  function normalize(level) {
    const w = DL.LEVEL_W || 1000;
    const h = Math.round(U().clamp(+level.h || 1000, 1000, 2000));
    const cx = function (v) { return Math.round(U().clamp(+v || 0, 0, w)); };
    const cy = function (v) { return Math.round(U().clamp(+v || 0, 0, h)); };
    function pts(p) { const o = []; for (let i = 0; i + 1 < p.length; i += 2) o.push(cx(p[i]), cy(p[i + 1])); return o; }
    const out = {
      v: 1, w: w, h: h,
      ink: /^#[0-9a-f]{6}$/i.test(level.ink || "") ? level.ink.toLowerCase() : "#1d2340",
      ballR: U().clamp(half(+level.ballR || 16), 4, 40),
      walls: (level.walls || []).map(function (wl) { const p = pts(wl.pts || []); if (p.length === 2) p.push(p[0], p[1]); return { pts: p, width: U().clamp(half(+wl.width || 6), 1, 120) }; }).filter(function (wl) { return wl.pts.length >= 4; }),
      fills: (level.fills || []).map(function (f) { return { pts: pts(f.pts || []) }; }).filter(function (f) { return f.pts.length >= 6; }),
      holes: (level.holes || []).map(function (o) { return { x: cx(o.x), y: cy(o.y), r: U().clamp(half(+o.r || 10), 3, 120) }; }),
      start: level.start ? { x: cx(level.start.x), y: cy(level.start.y) } : null,
      goal: level.goal ? { x: cx(level.goal.x), y: cy(level.goal.y) } : null,
      challenge: null
    };
    if (level.challenge && isFinite(+level.challenge.time) && +level.challenge.time > 0) {
      out.challenge = { name: cleanName(level.challenge.name), time: Math.round(U().clamp(+level.challenge.time, 0.1, 35999.9) * 10) / 10 };
    }
    return out;
  }

  // ---------- bytes ----------
  function Writer() { this.b = new Uint8Array(1024); this.n = 0; }
  Writer.prototype.u8 = function (v) {
    if (this.n >= this.b.length) { const nb = new Uint8Array(this.b.length * 2); nb.set(this.b); this.b = nb; }
    this.b[this.n++] = v & 255;
  };
  Writer.prototype.vu = function (v) { v = Math.max(0, Math.round(v)) >>> 0; while (v >= 128) { this.u8((v & 127) | 128); v >>>= 7; } this.u8(v); };
  Writer.prototype.vz = function (v) { v = Math.round(v) | 0; this.vu(((v << 1) ^ (v >> 31)) >>> 0); };
  Writer.prototype.bytes = function (arr) { for (let i = 0; i < arr.length; i++) this.u8(arr[i]); };
  Writer.prototype.out = function () { return this.b.slice(0, this.n); };

  function Reader(b) { this.b = b; this.p = 0; }
  Reader.prototype.u8 = function () { if (this.p >= this.b.length) throw badLink(); return this.b[this.p++]; };
  Reader.prototype.vu = function () {
    let v = 0, shift = 0;
    for (let k = 0; k < 5; k++) {
      const c = this.u8();
      v += (c & 127) * Math.pow(2, shift);
      if (!(c & 128)) { if (v > 0xffffffff) throw badLink(); return v; }
      shift += 7;
    }
    throw badLink();
  };
  Reader.prototype.vz = function () { const u = this.vu(); return (u % 2) ? -(u + 1) / 2 : u / 2; };

  function fnv16(bytes, n) {
    let h = 0x811c9dc5;
    for (let i = 0; i < n; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
    return (h ^ (h >>> 16)) & 0xffff;
  }

  // level -> body bytes (expects a normalized level, but normalizes anyway)
  function binary(level, opts) {
    const L = normalize(level);
    const W = new Writer();
    W.u8(VERSION);
    W.vu(L.h);
    W.vu(L.ballR * 2);
    const rgb = U().hexToRgb(L.ink);
    W.u8(rgb.r); W.u8(rgb.g); W.u8(rgb.b);
    let px = 0, py = 0;
    W.vu(L.walls.length);
    L.walls.forEach(function (wl) {
      W.vu(wl.width * 2);
      const n = wl.pts.length >> 1;
      W.vu(n);
      for (let i = 0; i < n; i++) {
        const x = wl.pts[2 * i], y = wl.pts[2 * i + 1];
        W.vz(x - px); W.vz(y - py); px = x; py = y;
      }
    });
    W.vu(L.fills.length);
    L.fills.forEach(function (f) {
      const n = f.pts.length >> 1;
      W.vu(n);
      for (let i = 0; i < n; i++) {
        const x = f.pts[2 * i], y = f.pts[2 * i + 1];
        W.vz(x - px); W.vz(y - py); px = x; py = y;
      }
    });
    W.vu(L.holes.length);
    L.holes.forEach(function (o) { W.vu(o.x); W.vu(o.y); W.vu(o.r * 2); });
    const ch = (opts && opts.noChallenge) ? null : L.challenge;
    W.u8((L.start ? 1 : 0) | (L.goal ? 2 : 0) | (ch ? 4 : 0));
    if (L.start) { W.vu(L.start.x); W.vu(L.start.y); }
    if (L.goal) { W.vu(L.goal.x); W.vu(L.goal.y); }
    if (ch) {
      const nb = new TextEncoder().encode(ch.name);
      W.vu(nb.length); W.bytes(nb);
      W.vu(Math.round(ch.time * 10));
    }
    const sum = fnv16(W.b, W.n);
    W.u8(sum & 255); W.u8(sum >> 8);
    return W.out();
  }

  // body bytes -> level, validating everything (throws bad-link)
  function parse(b) {
    if (!b || b.length < 12 || b.length > MAX_BODY) throw badLink();
    const n = b.length - 2;
    if (fnv16(b, n) !== (b[n] | (b[n + 1] << 8))) throw badLink();
    const R = new Reader(b.subarray(0, n));
    if (R.u8() !== VERSION) throw badLink();
    const w = DL.LEVEL_W || 1000;
    const h = R.vu();
    if (h < 1000 || h > 2000) throw badLink();
    const ballR = R.vu() / 2;
    if (ballR < 4 || ballR > 40) throw badLink();
    const ink = "#" + [R.u8(), R.u8(), R.u8()].map(function (v) { return (v < 16 ? "0" : "") + v.toString(16); }).join("");
    let px = 0, py = 0, total = 0;
    function pt() {
      px += R.vz(); py += R.vz();
      if (px < 0 || py < 0 || px > w || py > h) throw badLink();
      return [px, py];
    }
    const nW = R.vu();
    if (nW > LIM.walls) throw badLink();
    const walls = [];
    for (let k = 0; k < nW; k++) {
      const width = R.vu() / 2;
      if (width < 1 || width > 120) throw badLink();
      const np = R.vu();
      if (np < 2 || np > LIM.ptsPerWall) throw badLink();
      total += np;
      if (total > LIM.pts) throw badLink();
      const p = [];
      for (let i = 0; i < np; i++) { const q = pt(); p.push(q[0], q[1]); }
      walls.push({ pts: p, width: width });
    }
    const nF = R.vu();
    if (nF > LIM.fills) throw badLink();
    const fills = [];
    for (let k = 0; k < nF; k++) {
      const np = R.vu();
      if (np < 3 || np > LIM.ptsPerFill) throw badLink();
      total += np;
      if (total > LIM.pts) throw badLink();
      const p = [];
      for (let i = 0; i < np; i++) { const q = pt(); p.push(q[0], q[1]); }
      fills.push({ pts: p });
    }
    const nH = R.vu();
    if (nH > LIM.holes) throw badLink();
    const holes = [];
    for (let k = 0; k < nH; k++) {
      const x = R.vu(), y = R.vu(), r = R.vu() / 2;
      if (x > w || y > h || r < 3 || r > 120) throw badLink();
      holes.push({ x: x, y: y, r: r });
    }
    const flags = R.u8();
    if (flags & ~7) throw badLink();
    let start = null, goal = null, challenge = null;
    if (flags & 1) { start = { x: R.vu(), y: R.vu() }; if (start.x > w || start.y > h) throw badLink(); }
    if (flags & 2) { goal = { x: R.vu(), y: R.vu() }; if (goal.x > w || goal.y > h) throw badLink(); }
    if (flags & 4) {
      const nb = R.vu();
      if (nb > 64) throw badLink();
      const bytes = new Uint8Array(nb);
      for (let i = 0; i < nb; i++) bytes[i] = R.u8();
      let name;
      try { name = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch (e) { throw badLink(); }
      if (Array.from(name).length > 16 || /[\u0000-\u001f\u007f]/.test(name)) throw badLink();
      const tenths = R.vu();
      if (tenths < 1 || tenths > 359999) throw badLink();
      challenge = { name: name, time: tenths / 10 };
    }
    if (R.p !== n) throw badLink();
    return { v: 1, w: w, h: h, ink: ink, ballR: ballR, walls: walls, fills: fills, holes: holes, start: start, goal: goal, challenge: challenge };
  }

  // ---------- base64url ----------
  const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const REV = (function () { const r = new Int16Array(128).fill(-1); for (let i = 0; i < 64; i++) r[ABC.charCodeAt(i)] = i; return r; })();
  function b64(bytes) {
    let s = "";
    let i = 0;
    for (; i + 2 < bytes.length; i += 3) {
      const v = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      s += ABC[v >> 18] + ABC[(v >> 12) & 63] + ABC[(v >> 6) & 63] + ABC[v & 63];
    }
    if (i < bytes.length) {
      const rest = bytes.length - i;
      const v = (bytes[i] << 16) | (rest > 1 ? bytes[i + 1] << 8 : 0);
      s += ABC[v >> 18] + ABC[(v >> 12) & 63] + (rest > 1 ? ABC[(v >> 6) & 63] : "");
    }
    return s;
  }
  function unb64(s) {
    if (s.length % 4 === 1) throw badLink();
    const out = new Uint8Array(Math.floor(s.length * 3 / 4));
    let o = 0, acc = 0, bits = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      const v = c < 128 ? REV[c] : -1;
      if (v < 0) throw badLink();
      acc = (acc << 6) | v; bits += 6;
      if (bits >= 8) { bits -= 8; out[o++] = (acc >> bits) & 255; }
    }
    return out.subarray(0, o);
  }

  // ---------- compression ----------
  function hasStreams() { return typeof CompressionStream === "function" && typeof DecompressionStream === "function" && typeof Response === "function"; }
  async function deflate(bytes) {
    const cs = new CompressionStream("deflate-raw");
    const stream = new Blob([bytes]).stream().pipeThrough(cs);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function inflate(bytes) {
    // read chunk by chunk with a size cap (a tiny link must not expand into something huge) and a time limit
    const ds = new DecompressionStream("deflate-raw");
    const writer = ds.writable.getWriter();
    writer.write(bytes).catch(function () { /* surfaced by the reader */ });
    writer.close().catch(function () { /* surfaced by the reader */ });
    const reader = ds.readable.getReader();
    const parts = [];
    let size = 0;
    const deadline = U().now() + 1500;
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.length;
      if (size > MAX_BODY || U().now() > deadline) { try { reader.cancel(); } catch (e) { /* ignore */ } throw badLink(); }
      parts.push(r.value);
    }
    const out = new Uint8Array(size);
    let o = 0;
    parts.forEach(function (p) { out.set(p, o); o += p.length; });
    return out;
  }

  async function encode(level) {
    const body = binary(level);
    let mode = 0, data = body;
    if (hasStreams()) {
      try { const z = await deflate(body); if (z.length < body.length) { mode = 1; data = z; } } catch (e) { /* stored */ }
    }
    const all = new Uint8Array(data.length + 1);
    all[0] = mode; all.set(data, 1);
    return DL.LINK_PREFIX + b64(all);
  }

  function extract(text) {
    let s = String(text);
    const hashAt = s.indexOf("#");
    if (hashAt >= 0) s = s.slice(hashAt + 1);
    s = s.trim();
    try { if (/%[0-9a-f]{2}/i.test(s)) s = decodeURIComponent(s); } catch (e) { /* keep */ }
    return s;
  }

  async function decodeInner(text) {
    if (typeof text !== "string" || text.length > MAX_TEXT + 200) throw badLink();
    const s = extract(text);
    if (s.indexOf(DL.LINK_PREFIX) !== 0) throw badLink();
    const payload = s.slice(DL.LINK_PREFIX.length);
    if (payload.length < 8 || payload.length > MAX_TEXT) throw badLink();
    const all = unb64(payload);
    if (all.length < 2) throw badLink();
    let body;
    if (all[0] === 0) body = all.subarray(1);
    else if (all[0] === 1) {
      if (!hasStreams()) throw badLink();
      body = await inflate(all.subarray(1));
    } else throw badLink();
    const level = parse(body);
    if (level.start && level.goal && DL.level && !DL.level.pathCheck(level).ok) throw badLink();
    return level;
  }

  function decode(text) {
    // never anything but bad-link; never hangs (a 3 s cap on top of the inflate's own limits)
    let timer = null;
    const guard = new Promise(function (res, rej) { timer = setTimeout(function () { rej(badLink()); }, 3000); });
    const work = decodeInner(text).then(function (l) { return l; }, function (e) {
      if (e && e.code === "bad-link") throw e;
      throw badLink();
    });
    return Promise.race([work, guard]).finally(function () { clearTimeout(timer); });
  }

  async function url(level) {
    return DL.SITE + "#" + await encode(level);
  }

  // Simplify harder (RDP tolerance up step by step, then drop the shortest strokes) until the link fits.
  // opts.simplify(tol) may supply the strokes from the unsimplified chains (lift does this).
  async function fit(level, maxLen, opts) {
    maxLen = maxLen || BUDGET;
    let L = normalize(level);
    let text = await encode(L);
    if (text.length <= maxLen) return { level: L, text: text, tol: 0 };
    const TOLS = [3, 4.5, 6.5, 9, 12];
    const rdp = DL.vectorize && DL.vectorize._internals.rdp;
    for (let k = 0; k < TOLS.length; k++) {
      const tol = TOLS[k];
      const walls = (opts && opts.simplify) ? opts.simplify(tol) : L.walls.map(function (wl) { return { pts: rdp ? rdp(wl.pts, tol) : wl.pts, width: wl.width }; });
      const cand = normalize(Object.assign({}, L, { walls: walls }));
      text = await encode(cand);
      if (text.length <= maxLen) return { level: cand, text: text, tol: tol };
      L = cand;
    }
    // still too long: drop the shortest strokes
    const P = DL.vectorize ? DL.vectorize._internals.polyLength : function () { return 0; };
    const order = L.walls.map(function (wl, i) { return [P(wl.pts), i]; }).sort(function (a, b) { return a[0] - b[0]; });
    let cut = Math.max(1, Math.ceil(order.length * 0.1));
    for (let guard = 0; guard < 64 && order.length > 1; guard++) {
      if (cut > order.length - 1) cut = order.length - 1;
      const drop = new Set(order.slice(0, cut).map(function (o) { return o[1]; }));
      const cand = Object.assign({}, L, { walls: L.walls.filter(function (wl, i) { return !drop.has(i); }) });
      text = await encode(cand);
      if (text.length <= maxLen) return { level: normalize(cand), text: text, tol: TOLS[TOLS.length - 1], dropped: cut };
      if (cut === order.length - 1) break;
      cut = Math.ceil(cut * 1.3);
    }
    return { level: L, text: await encode(L), tol: -1 };
  }

  DL.codec = { encode: encode, decode: decode, url: url, normalize: normalize, fit: fit, BUDGET: BUDGET, _binary: binary, _parse: parse, _b64: b64, _unb64: unb64 };
})();
