/* Draw a Level: input.js (game-builder)
 * Tilt (deviceorientation, with the iPhone permission), a touch / mouse-drag fallback, and keys.
 * Everything ends up as one tilt vector {x, y} (screen x right, y down, |t| <= 1) through
 * DL.physics.tiltFromDeg, so tilt, touch and keys share one curve. Smoothing happens in physics.
 *
 *   DL.input.needsPermission() -> boolean     iPhone/iPad Safari: a tap must ask first
 *   DL.input.request() -> Promise<"tilt"|"touch">   call inside the tap. Resolves "tilt" only when
 *                                             real orientation readings arrive; otherwise "touch"
 *   DL.input.attach(el, mode)                 start listening ("tilt" | "touch"); keys always work
 *   DL.input.detach()
 *   DL.input.calibrate()                      take the current pose as level (game.start calls it)
 *   DL.input.tilt() -> {x, y}                 current tilt vector (raw, curved, unsmoothed)
 *   DL.input.mode                             the attached mode
 *   DL.input.touching                         a finger / mouse is down (touch mode)
 * Nothing touches window/document/navigator at load time.
 */
(function (root) {
  "use strict";
  const DL = (root.DL = root.DL || {});

  const st = {
    el: null, mode: null, handlers: [],
    beta: null, gamma: null, base: null, readings: 0,
    px: 0, py: 0, touching: false, pointerId: null,
    keys: { l: 0, r: 0, u: 0, d: 0 }
  };

  function hasDOE() { return typeof DeviceOrientationEvent !== "undefined"; }

  function needsPermission() {
    return hasDOE() && typeof DeviceOrientationEvent.requestPermission === "function";
  }

  function isTouchDevice() {
    return typeof navigator !== "undefined" && (navigator.maxTouchPoints > 0 || "ontouchstart" in root);
  }

  // listen briefly for a real reading (desktop browsers expose the event but never fire it)
  function probe(ms) {
    return new Promise((resolve) => {
      let done = false;
      const on = (e) => {
        if (done || e.beta == null || e.gamma == null) return;
        done = true; root.removeEventListener("deviceorientation", on); resolve(true);
      };
      root.addEventListener("deviceorientation", on);
      setTimeout(() => { if (!done) { done = true; root.removeEventListener("deviceorientation", on); resolve(false); } }, ms);
    });
  }

  async function request() {
    try {
      if (!hasDOE() || !isTouchDevice()) return "touch";
      if (root.isSecureContext === false) return "touch"; // tilt needs HTTPS (PLAN.md §6.3)
      if (needsPermission()) {
        let r;
        try { r = await DeviceOrientationEvent.requestPermission(); } catch (e) { return "touch"; }
        if (r !== "granted") return "touch";
      }
      return (await probe(900)) ? "tilt" : "touch";
    } catch (e) {
      return "touch";
    }
  }

  // device pitch/roll in degrees from beta/gamma via the gravity direction (no gimbal jump near flat)
  function pose(beta, gamma) {
    const b = (beta * Math.PI) / 180, g = (gamma * Math.PI) / 180;
    // gravity in device coords (x right, y up the screen, z out of the screen)
    const dx = Math.cos(b) * Math.sin(g), dy = -Math.sin(b), dz = -Math.cos(b) * Math.cos(g);
    const pitch = (Math.atan2(-dy, -dz) * 180) / Math.PI; // + when the top edge is raised: ball rolls down the screen
    const roll = (Math.atan2(dx, -dz) * 180) / Math.PI;   // + when the right edge is lowered: ball rolls right
    return { pitch, roll };
  }

  function screenAngle() {
    try {
      if (root.screen && root.screen.orientation && typeof root.screen.orientation.angle === "number") return root.screen.orientation.angle;
      if (typeof root.orientation === "number") return root.orientation;
    } catch (e) { /* ignore */ }
    return 0;
  }

  function wrap(a) { while (a > 180) a -= 360; while (a < -180) a += 360; return a; }

  function onOrient(e) {
    if (e.beta == null || e.gamma == null) return;
    st.beta = e.beta; st.gamma = e.gamma; st.readings++;
    if (!st.base) calibrate();
  }

  function calibrate() {
    if (st.beta == null) { st.base = null; return; }
    st.base = pose(st.beta, st.gamma);
  }

  function tiltDeg() {
    if (st.beta == null || !st.base) return { x: 0, y: 0 };
    const p = pose(st.beta, st.gamma);
    const dx = wrap(p.roll - st.base.roll), dy = wrap(p.pitch - st.base.pitch); // device frame, y down the screen
    // rotate into screen coordinates (y down): the page may be shown in landscape
    const a = (screenAngle() * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    return { x: dx * c - dy * s, y: dx * s + dy * c };
  }

  // finger offset from the board centre -> degrees (full tilt at ~38% of the board's short side)
  function touchDeg() {
    if (!st.touching || !st.el) return { x: 0, y: 0 };
    const rc = st.el.getBoundingClientRect();
    const cx = rc.left + rc.width / 2, cy = rc.top + rc.height / 2;
    const full = Math.max(40, Math.min(rc.width, rc.height) * 0.38);
    const P = DL.PHYSICS || {};
    const maxDeg = P.maxTiltDeg || 25;
    return { x: ((st.px - cx) / full) * maxDeg, y: ((st.py - cy) / full) * maxDeg };
  }

  function keyDeg() {
    const k = st.keys, P = DL.PHYSICS || {};
    const m = (P.maxTiltDeg || 25) * 0.8;
    let x = (k.r - k.l), y = (k.d - k.u);
    if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
    return { x: x * m, y: y * m };
  }

  function curve(d) {
    if (DL.physics && DL.physics.tiltFromDeg) return DL.physics.tiltFromDeg(d.x, d.y);
    const m = Math.hypot(d.x, d.y);
    return m > 25 ? { x: d.x / m, y: d.y / m } : { x: d.x / 25, y: d.y / 25 };
  }

  function tilt() {
    const kd = keyDeg();
    if (kd.x || kd.y) return curve(kd);
    if (st.mode === "touch" || st.touching) {
      if (st.touching) return curve(touchDeg());
      if (st.mode === "touch") return { x: 0, y: 0 };
    }
    if (st.mode === "tilt") return curve(tiltDeg());
    return { x: 0, y: 0 };
  }

  function on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    st.handlers.push([target, type, fn, opts]);
  }

  const KEYMAP = {
    ArrowLeft: "l", KeyA: "l", ArrowRight: "r", KeyD: "r", ArrowUp: "u", KeyW: "u", ArrowDown: "d", KeyS: "d"
  };

  function attach(el, mode) {
    detach();
    st.el = el || null;
    st.mode = mode === "tilt" ? "tilt" : "touch";
    st.base = null;
    if (st.mode === "tilt") on(root, "deviceorientation", onOrient);
    if (el) {
      // touch fallback and desktop mouse drag (in tilt mode too: a finger on the board overrides tilt)
      const down = (e) => {
        if (st.mode === "tilt" && e.pointerType === "touch") return; // with tilt, touches are not steering
        st.touching = true; st.pointerId = e.pointerId; st.px = e.clientX; st.py = e.clientY;
        try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        if (e.cancelable) e.preventDefault();
      };
      const move = (e) => {
        if (!st.touching || e.pointerId !== st.pointerId) return;
        st.px = e.clientX; st.py = e.clientY;
        if (e.cancelable) e.preventDefault();
      };
      const up = (e) => { if (e.pointerId === st.pointerId) { st.touching = false; st.pointerId = null; } };
      on(el, "pointerdown", down, { passive: false });
      on(el, "pointermove", move, { passive: false });
      on(el, "pointerup", up);
      on(el, "pointercancel", up);
      on(el, "lostpointercapture", up);
    }
    if (typeof document !== "undefined") {
      on(document, "keydown", (e) => {
        const k = KEYMAP[e.code] || KEYMAP[e.key];
        if (!k) return;
        st.keys[k] = 1;
        if (e.cancelable) e.preventDefault();
      });
      on(document, "keyup", (e) => { const k = KEYMAP[e.code] || KEYMAP[e.key]; if (k) st.keys[k] = 0; });
    }
    if (typeof root.addEventListener === "function") on(root, "blur", () => { st.keys.l = st.keys.r = st.keys.u = st.keys.d = 0; st.touching = false; });
  }

  function detach() {
    for (const [t, type, fn, opts] of st.handlers) t.removeEventListener(type, fn, opts);
    st.handlers.length = 0;
    st.el = null; st.mode = null; st.touching = false; st.pointerId = null;
    st.keys.l = st.keys.r = st.keys.u = st.keys.d = 0;
  }

  DL.input = {
    needsPermission, request, attach, detach, calibrate, tilt,
    get mode() { return st.mode; },
    get touching() { return st.touching; },
    get readings() { return st.readings; },
    _pose: pose
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
