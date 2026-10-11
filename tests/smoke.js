// Contract check: loads src/engine/*.js in Node (vm, PLAN.md 6.1 order, no browser) and checks that every name
// in PLAN.md 7.3 exists with the right type, that DL.PALETTE and DL.PHYSICS exist, that the sample level is valid
// and passes the path check, that the link codec round-trips (compressed when CompressionStream exists, else the
// stored path), that garbage decodes to bad-link, that fileName follows PLAN.md 5.5, that every DL.* name used by
// app.js / index.html exists, and the script order in index.html.
//   node tests/smoke.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const ORDER = ["util", "palette", "decode", "lift", "vectorize", "level", "codec", "sample", "physics", "input", "board", "game", "story", "export", "share"];

// minimal stand-ins for the browser: nothing may be needed at load time (no document, no window, no navigator)
const sandbox = {
  console: console, setTimeout: setTimeout, clearTimeout: clearTimeout, URL: URL, Promise: Promise, Intl: Intl, Date: Date, Math: Math,
  Uint8Array: Uint8Array, Float32Array: Float32Array, Float64Array: Float64Array, Int32Array: Int32Array, Uint8ClampedArray: Uint8ClampedArray,
  Uint16Array: Uint16Array, Uint32Array: Uint32Array, WeakMap: WeakMap, Map: Map, Set: Set, JSON: JSON, File: File, Blob: Blob,
  TextEncoder: TextEncoder, TextDecoder: TextDecoder, Array: Array, Object: Object, Number: Number, String: String, Error: Error,
  CompressionStream: typeof CompressionStream !== "undefined" ? CompressionStream : undefined,
  DecompressionStream: typeof DecompressionStream !== "undefined" ? DecompressionStream : undefined,
  Response: typeof Response !== "undefined" ? Response : undefined,
  btoa: btoa, atob: atob
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

let fails = 0;
function report(ok, label, extra) {
  if (!ok) fails += 1;
  console.log((ok ? "PASS " : "FAIL ") + label + (extra ? "  (" + extra + ")" : ""));
}

for (const name of ORDER) {
  const file = path.join(ROOT, "src", "engine", name + ".js");
  try {
    vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });
    report(true, "load src/engine/" + name + ".js");
  } catch (e) {
    report(false, "load src/engine/" + name + ".js", e && e.message);
  }
}

const DL = sandbox.DL || {};
function get(p) { return p.split(".").reduce(function (o, k) { return o == null ? undefined : o[k]; }, DL); }
function has(p, type) {
  const v = get(p);
  const t = Array.isArray(v) ? "array" : typeof v;
  report(v != null && t === type, "DL." + p + " is " + type, t === type ? "" : "found " + t);
}
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); } // objects from the vm have another realm's prototypes

// ---- PLAN.md 7.3 names ----
has("LEVEL_W", "number"); has("LINK_PREFIX", "string"); has("STORY", "object"); has("PHYSICS", "object"); has("PALETTE", "object");
["decode.fileToImageData", "lift.fromImage", "level.snap", "level.setStart", "level.setGoal", "level.pathCheck", "level.id",
  "codec.encode", "codec.decode", "codec.url", "sample.load", "sample.photo",
  "input.needsPermission", "input.request", "input.attach", "input.detach",
  "game.create", "board.draw", "board.layout", "board.toBoard", "story.image",
  "export.fileName", "share.shareLink", "share.share", "share.save", "share.canShare", "util.error",
  "physics.create", "physics.route", "physics.autopilot"].forEach(function (n) { has(n, "function"); });

// ---- constants ----
report(DL.LEVEL_W === 1000, "LEVEL_W is 1000");
report(DL.LINK_PREFIX === "L1.", "LINK_PREFIX is L1.");
report(same(DL.STORY, { w: 1080, h: 1920 }), "STORY is 1080x1920");
const P = DL.PHYSICS || {};
report(["hz", "gravity", "friction", "restitution", "maxSpeed", "deadZoneDeg", "maxTiltDeg", "smoothing"].every(function (k) { return typeof P[k] === "number"; }), "PHYSICS has hz, gravity, friction, restitution, maxSpeed, deadZoneDeg, maxTiltDeg, smoothing");
report(P.hz === 120 && P.deadZoneDeg === 2 && P.maxTiltDeg === 25, "PHYSICS hz 120, deadZoneDeg 2, maxTiltDeg 25", JSON.stringify({ hz: P.hz, d: P.deadZoneDeg, m: P.maxTiltDeg }));
report(typeof P.rollResist === "number" && P.gravity === 2100, "PHYSICS is owned by physics.js (its values, not util.js placeholders)", "gravity " + P.gravity);
const utilSrc = fs.readFileSync(path.join(ROOT, "src", "engine", "util.js"), "utf8");
report(!/gravity\s*:/.test(utilSrc), "util.js does not define PHYSICS values");
report(!!(DL.PALETTE && DL.PALETTE.fonts && DL.PALETTE.frame && DL.PALETTE.story), "PALETTE has fonts, frame, story");

// ---- the sample level ----
function validLevel(L) {
  if (!L || L.v !== 1 || L.w !== 1000 || !(L.h >= 1000 && L.h <= 2000) || !(L.ballR > 0) || !/^#[0-9a-f]{6}$/i.test(L.ink)) return "header";
  if (!Array.isArray(L.walls) || !L.walls.length || !Array.isArray(L.fills) || !Array.isArray(L.holes)) return "arrays";
  for (const w of L.walls) if (!Array.isArray(w.pts) || w.pts.length < 4 || w.pts.length % 2 || !(w.width > 0)) return "wall";
  for (const f of L.fills) if (!Array.isArray(f.pts) || f.pts.length < 6) return "fill";
  for (const h of L.holes) if (!(h.r > 0) || !isFinite(h.x) || !isFinite(h.y)) return "hole";
  if (!L.start || !L.goal) return "start/goal";
  if (!("challenge" in L)) return "challenge key";
  return "";
}
let sample = null;
try { sample = DL.sample.load(); } catch (e) { report(false, "sample.load()", e.message); }
if (sample) {
  const why = validLevel(sample);
  report(!why, "sample.load() returns a valid Level object", why);
  const pc = DL.level.pathCheck(sample);
  report(pc && pc.ok === true, "sample pathCheck is ok", JSON.stringify(pc));
  report(sample.holes.length === 2, "sample has 2 holes", String(sample.holes.length));
  report(sandbox.JSON.stringify(sample).length > 100 && same(JSON.parse(JSON.stringify(sample)), sample), "sample is JSON-safe");
  const id1 = DL.level.id(sample), s2 = JSON.parse(JSON.stringify(sample)); s2.challenge = { name: "X", time: 9.9 };
  report(typeof id1 === "string" && id1.length > 3 && DL.level.id(s2) === id1, "level.id is a short hash that ignores the challenge", id1);
  const sn = DL.level.snap(sample, 500, 500);
  report(sn === null || (isFinite(sn.x) && isFinite(sn.y)), "level.snap returns a point or null");
}

// ---- the codec ----
(async function () {
  report(typeof sandbox.CompressionStream === "function", "CompressionStream exists in Node (compressed path is what is tested)", process.version);
  if (sample) {
    try {
      const withC = JSON.parse(JSON.stringify(sample)); withC.challenge = { name: "Rishi", time: 14.2 };
      const text = await DL.codec.encode(withC);
      report(typeof text === "string" && text.indexOf("L1.") === 0, "codec.encode gives L1.<payload>", text.slice(0, 12));
      const url = await DL.codec.url(withC);
      report(/^https:\/\/draw-a-level\.vercel\.app\/#L1\./.test(url), "codec.url is the full address with #L1.", url.slice(0, 40));
      console.log("INFO sample link length: " + url.length + " characters (budget 2000)");
      report(url.length <= 2000, "sample link is under 2000 characters", String(url.length));
      const back = await DL.codec.decode(text);
      report(!validLevel(back), "codec.decode returns a valid Level", validLevel(back));
      report(back.challenge && back.challenge.name === "Rishi" && back.challenge.time === 14.2, "challenge round-trips (name, time in seconds)", JSON.stringify(back.challenge));
      report(DL.level.id(back) === DL.level.id(sample), "same level id after the round trip");
      report(back.walls.length === sample.walls.length && back.holes.length === sample.holes.length && same(back.start, sample.start) && same(back.goal, sample.goal), "walls, holes, start, goal survive the round trip");
      const bn = await DL.codec.decode(url);
      report(!validLevel(bn), "codec.decode accepts a whole address");
      const noC = await DL.codec.encode(sample); const back2 = await DL.codec.decode(noC);
      report(back2.challenge === null, "a level sent without a time decodes with challenge null");
    } catch (e) { report(false, "codec round trip", e && e.message); }
    // the stored (uncompressed) path: hide CompressionStream
    try {
      const saved = sandbox.CompressionStream; const savedD = sandbox.DecompressionStream;
      sandbox.CompressionStream = undefined; sandbox.DecompressionStream = undefined;
      let stored, back3;
      try { stored = await DL.codec.encode(sample); } finally { sandbox.CompressionStream = saved; sandbox.DecompressionStream = savedD; }
      back3 = await DL.codec.decode(stored);
      report(!validLevel(back3) && DL.level.id(back3) === DL.level.id(sample), "uncompressed (flag) path round-trips", stored.length + " chars");
    } catch (e) { report(false, "uncompressed path", e && e.message); }
  }
  for (const g of ["L1.garbage", "garbage", "", "L1.", "L1.AAAA", "#L1.!!!!", "L2.abc", "L1." + "A".repeat(50)]) {
    let code = "none";
    try { await DL.codec.decode(g); } catch (e) { code = e && e.code; }
    report(code === "bad-link", "decode(" + JSON.stringify(g.slice(0, 14)) + ") -> bad-link", String(code));
  }

  // ---- fileName ----
  const d = new Date(2026, 9, 11, 12, 0, 0), fn = DL.export.fileName;
  report(fn("Rishi", d) === "draw-a-level-rishi-2026-10-11.jpg", "fileName Rishi", fn("Rishi", d));
  report(fn("", d) === "draw-a-level-level-2026-10-11.jpg", "fileName empty -> level", fn("", d));
  report(fn("Sir Larry Jr.", d) === "draw-a-level-sir-larry-jr-2026-10-11.jpg", "fileName Sir Larry Jr. -> sir-larry-jr", fn("Sir Larry Jr.", d));
  report(/^draw-a-level-[a-z0-9-]+-\d{4}-\d\d-\d\d\.jpg$/.test(fn("Dr. Müller 3rd!", d)), "fileName only a-z 0-9 and hyphens", fn("Dr. Müller 3rd!", d));

  // ---- every DL.* name used by app.js and index.html exists ----
  const src = fs.readFileSync(path.join(ROOT, "src", "app.js"), "utf8") + "\n" + fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const seen = {}, miss = [], re = /\bDL\.([A-Za-z_]+(?:\.[A-Za-z_]+)?)/g;
  let m;
  while ((m = re.exec(src))) {
    const p = m[1];
    if (seen[p]) continue; seen[p] = 1;
    let v = get(p);
    if (v === undefined && p.indexOf(".") < 0) v = get(p);
    if (v === undefined) miss.push(p);
  }
  report(miss.length === 0, "every DL.* name used by app.js exists (" + Object.keys(seen).length + " names)", miss.join(","));
  // need([...]) lists in app.js
  const need = [], re3 = /need\(\[([^\]]*)\]\)/g;
  while ((m = re3.exec(src))) m[1].split(",").forEach(function (s) { s = s.trim().replace(/^"|"$/g, ""); if (s && get(s) === undefined) need.push(s); });
  report(need.length === 0, "every need([...]) name in app.js exists", need.join(","));

  // ---- script order and css in index.html ----
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const found = [], re2 = /<script[^>]*\ssrc="([^"]+)"/g;
  while ((m = re2.exec(html))) if (/^src\//.test(m[1])) found.push(m[1].replace(/^src\/(engine\/)?/, "").replace(/\.js$/, ""));
  report(same(found, ORDER.concat(["app"])), "index.html loads scripts in PLAN.md 6.1 order", found.join(","));
  const css = [], re4 = /<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g;
  while ((m = re4.exec(html))) css.push(m[1]);
  report(same(css, ["src/design-tokens.css", "src/styles.css"]), "index.html loads design-tokens.css then styles.css", css.join(","));

  // ---- fonts ----
  const tok = fs.readFileSync(path.join(ROOT, "src", "design-tokens.css"), "utf8");
  const files = [], re5 = /url\(["']?\.\.\/(fonts\/[^"')]+)["']?\)/g;
  while ((m = re5.exec(tok))) files.push(m[1]);
  const missing = files.filter(function (f) { return !fs.existsSync(path.join(ROOT, f)); });
  report(files.length > 0 && missing.length === 0, "font files named in design-tokens.css exist (" + files.join(",") + ")", missing.join(","));
  report(fs.existsSync(path.join(ROOT, "fonts", "OFL.txt")), "fonts/OFL.txt exists");
  report(/font-family:\s*"Caveat"/.test(tok) && /Caveat/.test(JSON.stringify(DL.PALETTE.fonts)), "font family name Caveat matches in tokens and palette");

  console.log(fails === 0 ? "\nSMOKE: PASS" : "\nSMOKE: FAIL (" + fails + ")");
  process.exit(fails === 0 ? 0 : 1);
})();
