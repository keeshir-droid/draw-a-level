/* Draw a Level: game.js (game-builder)
 * The run: fits the board to the canvas, drops the ball, runs the fixed-step physics in a
 * requestAnimationFrame loop, keeps the timer, records the path, plays a soft wall click and fires events.
 *
 *   const game = DL.game.create(canvas, level, { mode, onEvent, autoplay?, margin? })
 *     mode     "tilt" | "touch" (from DL.input.request()) | "demo" (landing: the ball rolls by itself, looping)
 *     onEvent  ({ type: "drop" | "wall" | "hole" | "finish" | "tick", time?, speed?, x?, y?, counts? })
 *              time in seconds (simulated, from the drop); hole/finish carry x, y in canvas CSS px
 *              finish carries counts: false if the page was hidden during the run (PLAN.md §5.4 fairness)
 *     autoplay true: a scripted tilt that solves the level (tests, screenshots, page check)
 *     pilot    optional (world) => {x, y}: any scripted tilt (tests)
 *   game.start()    calibrate tilt to the current pose, drop the ball, start the timer at contact
 *   game.restart()  back to the drop, new run
 *   game.stop()     stop the loop and input (the last frame stays on the canvas)
 *   game.destroy()  stop and remove every listener
 *   game.result()   { time, tenths, path: [x, y, ...], counts } once finished, else null
 *   game.prime() + game.advance(dt)  run frames by hand, no rAF (tests, headless screenshots)
 *   game.resize()   refit after the canvas changed size (also automatic on window resize)
 *   game.toScreen(x, y) -> { x, y } canvas CSS px for a level point; game.state() -> { phase, time, running }
 *   game.stats      { fps, physMs, drawMs } (rolling averages)
 *   game.unlockAudio() / DL.game.unlockAudio()   call inside a tap (iOS needs it for the click sound)
 * Nothing touches the DOM at load time.
 */
(function (root) {
  "use strict";
  const DL = (root.DL = root.DL || {});

  // ---------- the wall click, made in code (very quiet) ----------
  let actx = null, noiseBuf = null;
  function unlockAudio() {
    try {
      if (!actx) {
        const AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return;
        actx = new AC();
        const n = Math.floor(actx.sampleRate * 0.03);
        noiseBuf = actx.createBuffer(1, n, actx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        let seed = 7;
        for (let i = 0; i < n; i++) { seed = (seed * 16807) % 2147483647; d[i] = ((seed / 2147483647) * 2 - 1) * Math.pow(1 - i / n, 6); }
      }
      if (actx.state === "suspended") actx.resume();
    } catch (e) { actx = null; }
  }
  // a short filtered tick: wood-and-steel, not a beep. k = 0..1 loudness, low = the finish click
  function click(k, low) {
    if (!actx || actx.state !== "running") return;
    try {
      const t = actx.currentTime;
      const src = actx.createBufferSource(); src.buffer = noiseBuf;
      const bp = actx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = low ? 1100 : 2600 + 900 * k; bp.Q.value = low ? 3 : 4.5;
      const g = actx.createGain();
      const vol = (low ? 0.07 : 0.015 + 0.05 * k);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + (low ? 0.09 : 0.045));
      src.connect(bp); bp.connect(g); g.connect(actx.destination);
      src.start(t); src.stop(t + 0.1);
    } catch (e) { /* ignore */ }
  }
  function buzz() {
    try { if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10); } catch (e) { /* ignore */ }
  }
  function now() { return typeof performance !== "undefined" ? performance.now() : Date.now(); }
  function reducedMotion() {
    try { return !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; }
  }

  function create(canvas, level, opts) {
    const o = opts || {};
    const PH = DL.physics, P = DL.PHYSICS;
    const onEvent = typeof o.onEvent === "function" ? o.onEvent : function () {};
    const mode = o.mode || "touch";
    const demo = mode === "demo";
    const world = PH.create(level);
    const makePilot = () => (typeof o.pilot === "function" ? o.pilot : (o.autoplay || demo) ? PH.autopilot(world, demo ? { speed: 210 } : null) : null);
    let pilot = makePilot();
    const ctx = canvas.getContext("2d");
    let L = null, dpr = 1, cssW = 0, cssH = 0;
    let raf = 0, running = false, last = 0, destroyed = false;
    let path = [], nextPathT = 0, counts = true, finish = null, finishWall = 0, lastTenths = -1;
    let demoDoneAt = 0, attached = false, wallBuzzAt = 0;
    const stats = { fps: 0, physMs: 0, drawMs: 0 };
    const reduced = reducedMotion();
    const listeners = [];

    function on(t, type, fn, op) { t.addEventListener(type, fn, op); listeners.push([t, type, fn, op]); }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      cssW = Math.max(1, rect.width || canvas.clientWidth || canvas.width);
      cssH = Math.max(1, rect.height || canvas.clientHeight || canvas.height);
      dpr = Math.min(2, root.devicePixelRatio || 1);
      const W = Math.round(cssW * dpr), H = Math.round(cssH * dpr);
      if (canvas.width !== W) canvas.width = W;
      if (canvas.height !== H) canvas.height = H;
      L = DL.board.layout(level, cssW, cssH, o.margin == null ? 2 : o.margin);
      draw();
    }

    function toScreen(x, y) {
      if (!L) resize();
      const F = L.frame;
      return { x: L.x + F + x * L.scale, y: L.y + F + y * L.scale };
    }

    function view() {
      const v = PH.ballView(world);
      if (reduced) {
        v.z = 0;
        if (v.fall > 0) { v.hidden = v.fall > 0.5; v.fall = 0; }
      }
      return v;
    }

    function gleamNow() {
      if (!finish || reduced) return 0;
      const M = (DL.PALETTE && DL.PALETTE.motion) || {}, G = (DL.PALETTE && DL.PALETTE.goal) || {};
      const t0 = finishWall + ((M.finish && M.finish.ease) || 260) + ((M.finish && M.finish.gleamDelay) || 120);
      const k = (now() - t0) / ((G.gleam && G.gleam.ms) || 650);
      return k > 0 && k < 1 ? k : 0;
    }

    function draw() {
      if (!L) return;
      const t0 = now();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      DL.board.draw(ctx, level, { scale: L.scale, x: L.x, y: L.y, ball: view(), idle: demo, gleam: gleamNow() });
      stats.drawMs += (now() - t0 - stats.drawMs) * 0.1;
    }

    function tilt(w) {
      if (pilot) return pilot(w);
      return DL.input ? DL.input.tilt() : { x: 0, y: 0 };
    }

    function handle(e) {
      if (e.type === "wall") {
        const k = Math.min(1, (e.speed - P.clickSpeed) / Math.max(1, P.maxSpeed * 0.6));
        if (!demo) {
          click(k, false);
          const t = now();
          if (t - wallBuzzAt > 80) { buzz(); wallBuzzAt = t; }
          onEvent({ type: "wall", speed: e.speed, time: e.time });
        }
      } else if (e.type === "hole") {
        path = []; nextPathT = world.time; // the path shows the attempt that got home
        const p = toScreen(world.holeAt.x, world.holeAt.y);
        if (!demo) onEvent({ type: "hole", time: e.time, x: p.x, y: p.y });
      } else if (e.type === "drop") {
        path = []; nextPathT = 0;
        if (!demo) { click(0.2, false); onEvent({ type: "drop", time: 0 }); }
      } else if (e.type === "finish") {
        finish = { time: e.time };
        finishWall = now();
        if (level.goal) path.push(Math.round(world.x), Math.round(world.y), level.goal.x, level.goal.y);
        const p = level.goal ? toScreen(level.goal.x, level.goal.y) : { x: 0, y: 0 };
        if (!demo) { click(0.5, true); onEvent({ type: "finish", time: round1(e.time), x: p.x, y: p.y, counts }); }
        else demoDoneAt = now();
      }
    }

    function frame() {
      if (!running) return;
      raf = root.requestAnimationFrame(frame);
      const t = now();
      let dt = (t - last) / 1000;
      last = t;
      if (dt > 0 && dt < 1) stats.fps += (1 / dt - stats.fps) * 0.05;
      logic(dt, t);
    }

    // one frame of the run without the rAF loop (tests / screenshots fast-forward with it)
    function advance(dt) {
      if (!L) resize();
      if (!demo && !attached && DL.input && !pilot) { DL.input.attach(canvas, mode === "tilt" ? "tilt" : "touch"); attached = true; }
      logic(dt, now());
    }

    function logic(dt, t) {
      const p0 = now();
      PH.advance(world, dt, tilt);
      stats.physMs += (now() - p0 - stats.physMs) * 0.1;
      for (let i = 0; i < world.events.length; i++) handle(world.events[i]);
      world.events.length = 0;
      // path: one sample every pathEveryMs of run time
      if (world.phase === "play") {
        while (world.time >= nextPathT) { path.push(Math.round(world.x), Math.round(world.y)); nextPathT += P.pathEveryMs / 1000; }
      }
      if (!demo && world.phase !== "drop" && !finish) {
        const tenths = Math.floor(world.time * 10 + 1e-6);
        if (tenths !== lastTenths) { lastTenths = tenths; onEvent({ type: "tick", time: tenths / 10 }); }
      }
      if (demo && demoDoneAt && t - demoDoneAt > 1600) { begin(); }
      draw();
      // once the ball has settled and the ring has gleamed, stop spending battery (input stays attached)
      if (!demo && finish && t - finishWall > 1500 && running) loop(false);
    }

    function begin() {
      PH.reset(world);
      if (pilot && !o.pilot) pilot = makePilot();
      path = []; nextPathT = 0; counts = true; finish = null; lastTenths = -1; demoDoneAt = 0;
      if (DL.input && DL.input.calibrate) DL.input.calibrate();
    }

    // keep the screen awake while the ball is rolling (PLAN.md §5.6); ignored where unsupported
    let wake = null;
    function wakeLock(on) {
      try {
        if (on && !wake && !demo && typeof navigator !== "undefined" && navigator.wakeLock) {
          navigator.wakeLock.request("screen").then((l) => { if (running) wake = l; else l.release(); }).catch(() => {});
        } else if (!on && wake) { wake.release().catch(() => {}); wake = null; }
      } catch (e) { /* ignore */ }
    }

    function loop(onOff) {
      if (onOff && !running && !destroyed) {
        running = true; last = now();
        raf = root.requestAnimationFrame(frame);
        wakeLock(true);
      } else if (!onOff && running) {
        running = false;
        if (raf) root.cancelAnimationFrame(raf);
        raf = 0;
        wakeLock(false);
      }
    }

    function start() {
      if (destroyed) return;
      if (!L) resize();
      if (!demo && !attached && DL.input) { DL.input.attach(canvas, mode === "tilt" ? "tilt" : "touch"); attached = true; }
      unlockAudio();
      begin();
      loop(true);
    }
    function restart() { start(); }
    function stop() {
      loop(false);
      if (attached && DL.input) { DL.input.detach(); attached = false; }
      draw();
    }
    function destroy() {
      stop();
      destroyed = true;
      for (const [t, type, fn, op] of listeners) t.removeEventListener(type, fn, op);
      listeners.length = 0;
    }
    function round1(t) { return Math.round(t * 10) / 10; }
    function result() {
      if (!finish) return null;
      return { time: round1(finish.time), tenths: Math.round(finish.time * 10), path: path.slice(), counts };
    }
    function state() { return { phase: world.phase, time: world.time, running }; }

    // the page hidden mid-run: pause (the timer is simulated, so it pauses too) and the run stops counting
    if (typeof document !== "undefined") {
      on(document, "visibilitychange", function () {
        if (document.hidden) {
          if (running) { loop(false); if (!finish && world.phase !== "drop") counts = false; canvas.__dlPaused = true; }
        } else if (canvas.__dlPaused) { canvas.__dlPaused = false; loop(true); }
      });
    }
    on(root, "resize", function () { resize(); });
    on(canvas, "pointerdown", unlockAudio);

    resize();
    // begin a run without starting the rAF loop (pair with advance(dt))
    function prime() { if (!L) resize(); begin(); }
    const game = { start, restart, stop, destroy, result, resize, toScreen, state, stats, unlockAudio, advance, prime, world, get layout() { return L; } };
    return game;
  }

  DL.game = { create, unlockAudio };
})(typeof globalThis !== "undefined" ? globalThis : this);
