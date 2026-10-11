// The lift on the synthetic maze photos (DL.sample.CASES). One case per run keeps the load light:
//   node tests/engine/lift-synthetic.js            -> every case, one after the other
//   node tests/engine/lift-synthetic.js holes      -> one case
// Synthetic photos only catch regressions. Rishi's real photos (tests/real/, on tests/levels.html) are the test.
const { DL, check, done } = require("./load.js");

const EXPECT = { // what each case should give
  "neat": { ok: true },
  "messy": { ok: true },
  "ruled": { ok: true },
  "holes": { ok: true, holes: 4 },
  "landscape": { ok: true, holes: 2, rotated: true },
  "pencil": { ok: true },
  "desk-marker": { ok: true, holes: 2 },
  "dense": { ok: true, holes: 3 },
  "busy": { error: "too-busy" },
  "blank": { error: "no-ink" }
};

(async function () {
  const only = process.argv[2];
  const names = only ? [only] : Object.keys(DL.sample.CASES);
  for (const name of names) {
    const t0 = Date.now();
    const img = DL.sample.photo(DL.sample.CASES[name]);
    const tPhoto = Date.now() - t0;
    const exp = EXPECT[name] || {};
    let res = null, err = null;
    try { res = await DL.lift.fromImage(img); } catch (e) { err = e; }
    console.log("\n" + name + "  (photo " + img.width + "x" + img.height + " made in " + tPhoto + " ms)");
    if (err) {
      console.log("  error: " + (err.code || err.message));
      if (!err.code) console.log(err.stack);
      check(name + ": " + (exp.error ? "rejects with " + exp.error : "lifts"), exp.error ? err.code === exp.error : false, err.code);
      continue;
    }
    const L = res.level, I = res.info;
    const pts = L.walls.reduce(function (a, w) { return a + w.pts.length / 2; }, 0);
    console.log("  level " + L.w + "x" + L.h + "  ink " + L.ink + "  ballR " + L.ballR + "  walls " + L.walls.length + " (" + pts + " pts)  fills " + L.fills.length + "  holes " + L.holes.length + "  " + JSON.stringify(L.holes));
    console.log("  link " + I.linkLength + " chars (tol " + I.tol + ")  inkFrac " + I.inkFrac.toFixed(3) + "  pieces " + I.pieces + "  lines removed " + I.linesRemoved + "  faint " + I.faint + "  rotated " + I.map.rotated);
    console.log("  corridor " + I.stats.corridor.toFixed(1) + "  strokeHalfPx " + I.stats.strokeHalfPx + "  timings " + JSON.stringify(I.timings) + "  vec " + JSON.stringify(I.stats.timings));
    DL.level.autoPlace(L);
    const pc = DL.level.pathCheck(L);
    console.log("  auto start " + JSON.stringify(L.start) + " goal " + JSON.stringify(L.goal) + " path " + JSON.stringify(pc));
    check(name + ": lifts", !exp.error);
    if (exp.holes != null) check(name + ": " + exp.holes + " holes", L.holes.length === exp.holes, "found " + L.holes.length);
    if (exp.rotated) check(name + ": turned to portrait", I.map.rotated);
    check(name + ": link under 4000", I.linkLength <= 4000, I.linkLength + "");
    check(name + ": path start -> goal", pc.ok);
    const text = await DL.codec.encode(L);
    const back = await DL.codec.decode(text);
    check(name + ": link round trip", JSON.stringify(back) === JSON.stringify(DL.codec.normalize(L)));
  }
  done();
})();
