// The level link: round trips, challenge names and times, garbage in -> "bad-link" (fast), the link budget.
//   node tests/engine/codec-test.js
// (Real photos' levels are round-tripped on tests/levels.html, which shows "round trip identical" per photo.)
const { DL, check, done } = require("./load.js");
const zlib = require("zlib");

function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
async function rejectsBadLink(text) {
  const t0 = Date.now();
  try { await DL.codec.decode(text); return { ok: false, ms: Date.now() - t0, why: "decoded" }; }
  catch (e) { return { ok: e && e.code === "bad-link", ms: Date.now() - t0, why: e && (e.code || e.message) }; }
}
function randomLevel(seed, nWalls, ptsPer) {
  const rnd = DL.util.mulberry32(seed);
  const h = 1000 + Math.floor(rnd() * 1000);
  const walls = [];
  for (let k = 0; k < nWalls; k++) {
    const p = [];
    let x = rnd() * 1000, y = rnd() * h;
    for (let i = 0; i < ptsPer; i++) { x = Math.min(1000, Math.max(0, x + (rnd() - 0.5) * 80)); y = Math.min(h, Math.max(0, y + (rnd() - 0.5) * 80)); p.push(x, y); }
    walls.push({ pts: p, width: 6 + rnd() * 10 });
  }
  return { v: 1, w: 1000, h: h, ink: "#1d2340", ballR: 10 + rnd() * 18, walls: walls,
    fills: [{ pts: [100.4, 100.2, 160.7, 110.1, 130.3, 170.9] }], holes: [{ x: 500.3, y: 600.6, r: 30.26 }],
    start: null, goal: null, challenge: null };
}

(async function () {
  console.log("round trips");
  const S = DL.sample.load();
  const sText = await DL.codec.encode(S);
  check("sample: decode(encode) is identical", same(await DL.codec.decode(sText), S), sText.length + " chars");
  check("sample: starts with L1.", sText.indexOf("L1.") === 0);
  check("sample: under 2000 characters", sText.length < 2000, sText.length + "");
  const u = await DL.codec.url(S);
  check("url(): https address with #L1.", u.indexOf("https://draw-a-level.vercel.app/#L1.") === 0);
  check("decode accepts the whole address", same(await DL.codec.decode(u), S));
  check("decode accepts #L1.…", same(await DL.codec.decode("#" + sText), S));

  for (let s = 1; s <= 25; s++) {
    const L = randomLevel(s, 1 + (s % 9) * 3, 2 + (s % 7) * 4);
    const N = DL.codec.normalize(L);
    const back = await DL.codec.decode(await DL.codec.encode(L));
    let maxErr = 0;
    L.walls.forEach(function (w, i) { w.pts.forEach(function (v, j) { maxErr = Math.max(maxErr, Math.abs(v - back.walls[i].pts[j])); }); });
    const ok = same(back, N) && maxErr <= 0.5 && Math.abs(back.ballR - L.ballR) <= 0.25 && Math.abs(back.holes[0].r - 30.26) <= 0.25;
    if (!ok || s === 25) check("random level " + s + ": equal within quantisation (max point error " + maxErr.toFixed(2) + ")", ok);
    else if (!ok) break;
  }

  console.log("challenge");
  const names = ["Rishi", "Zoë", "李小龙", "जय हो", "😀🎈 party", "Ana-María O'Neil", ""];
  for (const n of names) {
    const L = Object.assign(DL.sample.load(), { challenge: { name: n, time: 14.2 } });
    const back = await DL.codec.decode(await DL.codec.encode(L));
    check("name " + JSON.stringify(n) + " and time 14.2 survive", back.challenge && back.challenge.name === n && back.challenge.time === 14.2);
  }
  {
    const L = Object.assign(DL.sample.load(), { challenge: { name: "abcdefghijklmnopqrstuvwxyz", time: 9.96 } });
    const back = await DL.codec.decode(await DL.codec.encode(L));
    check("long names cut to 16 characters, time to 0.1 s", back.challenge.name === "abcdefghijklmnop" && back.challenge.time === 10, JSON.stringify(back.challenge));
    const E = Object.assign(DL.sample.load(), { challenge: { name: "😀".repeat(20), time: 3 } });
    const b2 = await DL.codec.decode(await DL.codec.encode(E));
    check("16 emoji (not 16 bytes) kept", Array.from(b2.challenge.name).length === 16);
    const id1 = DL.level.id(S), id2 = DL.level.id(L);
    check("id ignores the challenge", id1 === id2, id1);
    const M = DL.sample.load(); M.walls[0].pts[0] += 5;
    check("id changes with the walls", DL.level.id(M) !== id1);
  }

  console.log("no compression available");
  {
    const CS = globalThis.CompressionStream;
    globalThis.CompressionStream = undefined;
    const t = await DL.codec.encode(S);
    globalThis.CompressionStream = CS;
    check("stored (uncompressed) link round trips", same(await DL.codec.decode(t), S), t.length + " chars stored vs " + sText.length + " compressed");
  }

  console.log("bad links -> bad-link, fast");
  const bad = [
    ["empty", ""], ["prefix only", "L1."], ["not base64", "L1.!!!!$$$$%%%%"], ["wrong prefix", "L2." + sText.slice(3)],
    ["no prefix", sText.slice(3)], ["huge", "L1." + "A".repeat(50000)], ["null", null], ["number", 12345], ["object", {}],
    ["unicode junk", "L1.ééééééééééééé"], ["just a url", "https://draw-a-level.vercel.app/"]
  ];
  for (const b of bad) { const r = await rejectsBadLink(b[1]); check(b[0], r.ok && r.ms < 200, r.why + ", " + r.ms + " ms"); }
  let worst = 0, allOk = true;
  for (let cut = 4; cut < sText.length; cut += 7) { const r = await rejectsBadLink(sText.slice(0, cut)); worst = Math.max(worst, r.ms); if (!r.ok) { allOk = false; console.log("    truncated at " + cut + ": " + r.why); } }
  check("every truncation of the sample link", allOk, "worst " + worst + " ms");
  allOk = true; worst = 0;
  const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  for (let i = 5; i < sText.length; i += 5) {
    const ch = sText[i] === "A" ? "B" : "A";
    const r = await rejectsBadLink(sText.slice(0, i) + ch + sText.slice(i + 1));
    worst = Math.max(worst, r.ms); if (!r.ok) { allOk = false; console.log("    changed char " + i + ": " + r.why); }
  }
  check("one character changed anywhere", allOk, "worst " + worst + " ms");
  const rnd = DL.util.mulberry32(7);
  allOk = true; worst = 0;
  for (let k = 0; k < 300; k++) {
    let s = "L1."; const n = 4 + Math.floor(rnd() * 3000);
    for (let i = 0; i < n; i++) s += ABC[Math.floor(rnd() * 64)];
    const r = await rejectsBadLink(s); worst = Math.max(worst, r.ms); if (!r.ok) allOk = false;
  }
  check("300 random base64 payloads", allOk, "worst " + worst + " ms");
  {
    // a valid body with version 2 (checksum right, so only the version check catches it)
    const body = DL.codec._binary(S); body[0] = 2;
    let hsh = 0x811c9dc5; for (let i = 0; i < body.length - 2; i++) { hsh ^= body[i]; hsh = Math.imul(hsh, 0x01000193) >>> 0; }
    const sum = (hsh ^ (hsh >>> 16)) & 0xffff; body[body.length - 2] = sum & 255; body[body.length - 1] = sum >> 8;
    const all = new Uint8Array(body.length + 1); all.set(body, 1);
    const r = await rejectsBadLink("L1." + DL.codec._b64(all)); check("wrong version", r.ok, r.why);
    // a compressed bomb: 4 MB of zeros, deflated
    const bomb = zlib.deflateRawSync(Buffer.alloc(4 * 1024 * 1024));
    const ab = new Uint8Array(bomb.length + 1); ab[0] = 1; ab.set(bomb, 1);
    const r2 = await rejectsBadLink("L1." + DL.codec._b64(ab)); check("deflate bomb (" + bomb.length + " bytes -> 4 MB)", r2.ok && r2.ms < 500, r2.why + ", " + r2.ms + " ms");
    // a level whose start can't reach its goal
    const sealed = { v: 1, w: 1000, h: 1000, ink: "#000000", ballR: 15, holes: [], fills: [], challenge: null,
      walls: [{ pts: [300, 300, 700, 300, 700, 700, 300, 700, 300, 300], width: 8 }], start: { x: 500, y: 500 }, goal: { x: 100, y: 900 } };
    const r3 = await rejectsBadLink(await DL.codec.encode(sealed)); check("a level with no path from start to goal", r3.ok, r3.why);
  }

  console.log("link budget");
  {
    const big = randomLevel(99, 300, 40); // 12,000 points of scribble
    const raw = await DL.codec.encode(big);
    const f = await DL.codec.fit(big);
    check("an over-detailed level is simplified until it fits 4000", f.text.length <= 4000, raw.length + " -> " + f.text.length + " chars (tol " + f.tol + (f.dropped ? ", dropped " + f.dropped : "") + ")");
    check("…and the fitted level round trips", same(await DL.codec.decode(f.text), f.level));
  }
  done();
})();
