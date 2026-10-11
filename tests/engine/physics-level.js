/* Stand-in level for the game tests (game-builder), until/besides DL.sample.load().
   A small hand-written Level (PLAN.md §7.3 shape): wobbly strokes, one filled blob, one hole,
   start and goal. Loads in Node (module.exports) and the browser (globalThis.DL_TEST_LEVEL). */
(function () {
  function wobbly(x0, y0, x1, y1, seed, amp) {
    const pts = [];
    const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(len / 40));
    const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const o = (i === 0 || i === n ? 0.3 : 1) * amp * Math.sin(seed * 1.7 + t * 9.1 + Math.sin(seed + t * 4.3));
      pts.push(Math.round(x0 + (x1 - x0) * t + nx * o), Math.round(y0 + (y1 - y0) * t + ny * o));
    }
    return pts;
  }
  const level = {
    v: 1, w: 1000, h: 1400, ink: "#1d2a5a", ballR: 18,
    walls: [
      { pts: wobbly(0, 300, 780, 310, 1, 5), width: 9 },
      { pts: wobbly(220, 620, 1000, 610, 2, 6), width: 11 },
      { pts: wobbly(0, 940, 760, 950, 3, 5), width: 8 },
      { pts: wobbly(760, 950, 770, 1180, 4, 4), width: 8 },
      { pts: wobbly(330, 1160, 520, 1400, 5, 3), width: 6 },
      { pts: wobbly(420, 120, 430, 300, 6, 3), width: 7 }
    ],
    fills: [{ pts: [600, 1250, 680, 1235, 700, 1300, 640, 1330, 590, 1300] }],
    holes: [{ x: 520, y: 790, r: 26 }],
    start: { x: 110, y: 150 },
    goal: { x: 880, y: 1300 },
    challenge: null
  };
  if (typeof module !== "undefined" && module.exports) module.exports = level;
  if (typeof globalThis !== "undefined") globalThis.DL_TEST_LEVEL = level;
})();
