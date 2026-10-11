// Tiny PNG writer for debugging the lift in Node (grey or RGBA), no libraries: Node's zlib only.
const zlib = require("zlib"), fs = require("fs"), path = require("path");
const CRC = (function () { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
// pixels: Uint8 array, channels 1 (grey) or 4 (RGBA)
function writePng(file, w, h, pixels, channels) {
  const ch = channels || 1;
  const raw = Buffer.alloc((w * ch + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * ch + 1)] = 0; for (let i = 0; i < w * ch; i++) raw[y * (w * ch + 1) + 1 + i] = pixels[y * w * ch + i]; }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = ch === 4 ? 6 : 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}
// A level drawn plainly (walls as capsules, fills, holes) at `k` pixels per unit, grey PNG.
function writeLevelPng(file, L, k) {
  k = k || 0.5;
  const W = Math.ceil(L.w * k), H = Math.ceil(L.h * k), px = new Uint8Array(W * H).fill(250);
  function cap(ax, ay, bx, by, r, v) {
    const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - r) * k)), x1 = Math.min(W - 1, Math.ceil((Math.max(ax, bx) + r) * k));
    const y0 = Math.max(0, Math.floor((Math.min(ay, by) - r) * k)), y1 = Math.min(H - 1, Math.ceil((Math.max(ay, by) + r) * k));
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const cx = (x + 0.5) / k, cy = (y + 0.5) / k;
      let t = l2 ? ((cx - ax) * dx + (cy - ay) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + t * dx - cx, qy = ay + t * dy - cy;
      if (qx * qx + qy * qy <= r * r) px[y * W + x] = v;
    }
  }
  L.walls.forEach(function (w) { for (let i = 2; i < w.pts.length; i += 2) cap(w.pts[i - 2], w.pts[i - 1], w.pts[i], w.pts[i + 1], w.width / 2, 30); });
  L.fills.forEach(function (f) { for (let i = 0; i < f.pts.length; i += 2) { const j = (i + 2) % f.pts.length; cap(f.pts[i], f.pts[i + 1], f.pts[j], f.pts[j + 1], 2, 90); } });
  L.holes.forEach(function (o) { cap(o.x, o.y, o.x, o.y, o.r, 0); });
  if (L.start) cap(L.start.x, L.start.y, L.start.x, L.start.y, L.ballR, 160);
  if (L.goal) cap(L.goal.x, L.goal.y, L.goal.x, L.goal.y, L.ballR * 0.6, 200);
  writePng(file, W, H, px, 1);
}
module.exports = { writePng: writePng, writeLevelPng: writeLevelPng };
