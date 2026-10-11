// Path check, snapping, ids, file names, shareLink fallbacks.
//   node tests/engine/level-test.js
const { DL, check, done } = require("./load.js");

function lvl(walls, holes, extra) {
  return Object.assign({ v: 1, w: 1000, h: 1000, ink: "#1d2340", ballR: 15, walls: walls, fills: [], holes: holes || [], start: null, goal: null, challenge: null }, extra || {});
}
function place(L, s, g) { L.start = s; L.goal = g; return L; }

(function () {
  console.log("path check");
  const box = [{ pts: [300, 300, 700, 300, 700, 700, 300, 700, 300, 300], width: 8 }];
  let r = DL.level.pathCheck(place(lvl(box), { x: 500, y: 500 }, { x: 100, y: 900 }));
  check("sealed box: no path", !r.ok && r.blocked && r.blocked.x > 300 && r.blocked.x < 700, JSON.stringify(r));
  // an open corridor 100 wide from the top-left to the bottom-right
  const corridor = [{ pts: [0, 400, 800, 400], width: 8 }, { pts: [200, 500, 1000, 500], width: 8 }];
  r = DL.level.pathCheck(place(lvl(corridor), { x: 100, y: 100 }, { x: 900, y: 900 }));
  check("zig-zag corridor (gap 92, ball 30): path", r.ok, JSON.stringify(r));
  r = DL.level.pathCheck(place(lvl([{ pts: [0, 500, 1000, 500], width: 8 }], [], {}), { x: 500, y: 200 }, { x: 500, y: 800 }));
  check("a wall right across the board: no path", !r.ok);
  r = DL.level.pathCheck(place(lvl([{ pts: [0, 500, 960, 500], width: 8 }]), { x: 500, y: 200 }, { x: 500, y: 800 }));
  check("…with a 36-unit gap at the edge (ball 30): path", r.ok);
  r = DL.level.pathCheck(place(lvl([{ pts: [0, 500, 975, 500], width: 8 }]), { x: 500, y: 200 }, { x: 500, y: 800 }));
  check("…with a 21-unit gap (ball 30 wide): no path", !r.ok);
  // holes: a lane 112 wide is the only way (the rest of the board is filled)
  const onlyLane = place(lvl([
    { pts: [0, 400, 1000, 400], width: 8 }, { pts: [0, 520, 1000, 520], width: 8 }
  ], [{ x: 500, y: 460, r: 50 }], { h: 1000 }), { x: 60, y: 460 }, { x: 940, y: 460 });
  // fill the rest of the board so the lane is the only way
  onlyLane.fills = [{ pts: [0, 0, 1000, 0, 1000, 396, 0, 396] }, { pts: [0, 524, 1000, 524, 1000, 1000, 0, 1000] }];
  r = DL.level.pathCheck(onlyLane);
  check("a hole across the only lane: no path", !r.ok, JSON.stringify(r));
  onlyLane.holes = [{ x: 500, y: 430, r: 22 }];
  r = DL.level.pathCheck(onlyLane);
  check("a small hole at the lane's side: path (the ball rolls past)", r.ok, JSON.stringify(r));
  onlyLane.holes = [];
  r = DL.level.pathCheck(onlyLane);
  check("the lane without holes: path", r.ok);
  check("no start/goal: not ok", !DL.level.pathCheck(lvl(corridor)).ok);

  console.log("snap");
  const S = DL.sample.load();
  check("sample level: path", DL.level.pathCheck(S).ok);
  const w0 = S.walls[0];
  const onWall = DL.level.snap(S, w0.pts[0] + 40, w0.pts[1]);
  let minD = Infinity;
  S.walls.forEach(function (wl) {
    for (let k = 2; k < wl.pts.length; k += 2) {
      const ax = wl.pts[k - 2], ay = wl.pts[k - 1], bx = wl.pts[k], by = wl.pts[k + 1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      let t = l2 ? ((onWall.x - ax) * dx + (onWall.y - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
      minD = Math.min(minD, Math.hypot(ax + t * dx - onWall.x, ay + t * dy - onWall.y) - wl.width / 2);
    }
  });
  check("a tap on a wall snaps to where the ball fits", minD >= S.ballR - 3, "clearance " + minD.toFixed(1) + " for ballR " + S.ballR);
  const out = DL.level.snap(S, -50, -50);
  check("a tap outside the board snaps inside", out && out.x >= S.ballR && out.y >= S.ballR, JSON.stringify(out));
  const L = DL.sample.load();
  DL.level.setStart(L, { x: 3, y: 3 });
  check("setStart returns the level with a snapped start", L.start && L.start.x >= L.ballR, JSON.stringify(L.start));
  DL.level.setGoal(L, null);
  check("setGoal(null) clears the goal", L.goal === null);

  console.log("file names");
  const d = new Date(2026, 9, 11);
  const cases = [
    ["Rishi", "draw-a-level-rishi-2026-10-11.jpg"], ["", "draw-a-level-level-2026-10-11.jpg"], [null, "draw-a-level-level-2026-10-11.jpg"],
    ["Zoë Ann!", "draw-a-level-zoe-ann-2026-10-11.jpg"], ["李小龙", "draw-a-level-level-2026-10-11.jpg"], ["  --Max--  ", "draw-a-level-max-2026-10-11.jpg"],
    ["R2 D2", "draw-a-level-r2-d2-2026-10-11.jpg"]
  ];
  cases.forEach(function (c) { const f = DL.export.fileName(c[0], d); check(JSON.stringify(c[0]) + " -> " + f, f === c[1]); });
  check("date as a string", DL.export.fileName("A", "2026-01-02") === "draw-a-level-a-2026-01-02.jpg");
  check("today by default", /^draw-a-level-rishi-\d{4}-\d{2}-\d{2}\.jpg$/.test(DL.export.fileName("Rishi")));
})();

(async function () {
  console.log("shareLink");
  const realNav = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  function setNav(n) { Object.defineProperty(globalThis, "navigator", { value: n, configurable: true, writable: true }); }
  let got = null;
  setNav({ share: async function (d) { got = d; }, canShare: function () { return true; } });
  let r = await DL.share.shareLink("I drew you a level. Beat 0:14 👇", "https://draw-a-level.vercel.app/#L1.x");
  check("share sheet with text + url", r === "shared" && got && got.text.indexOf("Beat 0:14") > 0 && got.url.indexOf("#L1.x") > 0, r);
  setNav({ share: async function () { const e = new Error("x"); e.name = "AbortError"; throw e; } });
  r = await DL.share.shareLink("t", "u");
  check("cancelled share sheet -> cancelled", r === "cancelled", r);
  let copied = null;
  setNav({ share: async function () { const e = new Error("x"); e.name = "NotAllowedError"; throw e; }, clipboard: { writeText: async function (s) { copied = s; } } });
  r = await DL.share.shareLink("hello", "https://x/#L1.y");
  check("share refused -> copied \"text url\"", r === "copied" && copied === "hello https://x/#L1.y", r + " " + copied);
  copied = null;
  setNav({ clipboard: { writeText: async function (s) { copied = s; } } });
  r = await DL.share.shareLink("hi", "u");
  check("no share sheet -> copied", r === "copied" && copied === "hi u", r);
  setNav({});
  r = await DL.share.shareLink("hi", "u");
  check("nothing available -> failed (no crash)", r === "failed", r);
  if (realNav) Object.defineProperty(globalThis, "navigator", realNav);
  done();
})();
