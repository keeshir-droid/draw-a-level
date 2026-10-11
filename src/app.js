// ===== from ../shared-kit/footer/siblings.js (Draw a Level itself dropped) =====
const MAKER_NAME = "Risheek";
const SIBLINGS = [
  { name: "Handwriting → Font", url: "https://handwriting-font-converter.vercel.app", blurb: "Type in your own handwriting.", icon: "aa" },
  { name: "Doodle Alive", url: "https://doodle-alive.vercel.app", blurb: "Snap a doodle, watch it come alive.", icon: "doodle" },
  { name: "Underline", url: "https://underline-it.vercel.app", blurb: "Highlight the line you love, without ruining your book.", icon: "underline" },
  { name: "Look Up", url: "https://look-up-sky.vercel.app", blurb: "Saw a shape in the clouds? Send it to someone.", icon: "cloud" },
  { name: "Spotted a Cutie", url: "https://spotted-a-cutie.vercel.app", blurb: "Snap a street animal, get a card for a friend.", icon: "cutie" },
  { name: "Pocket Booth", url: "https://the-pocket-booth.vercel.app", blurb: "A photo booth strip from your phone.", icon: "booth" }
];

// ===== from ../shared-kit/footer/footer.js (two icons added for the two newer siblings) =====
var SIB_SVG = {
  aa: "Aa",
  doodle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 16c2-5 4-5 5-1s3 3 4-2 3-6 4-2 2 5 3 3"/><path d="M19 4l.8 1.8L21.6 6.6 19.8 7.4 19 9.2 18.2 7.4 16.4 6.6 18.2 5.8z"/></svg>',
  underline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 8h14M5 12h10"/><path d="M4 17.5c3-.8 6 .6 9-.2s5-.6 7 .2" stroke-width="3" opacity=".55"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M7 18h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 9.6 4.2 4.2 0 0 0 7 18z"/></svg>',
  cutie: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 19V8l3.5 2.5h7L19 8v11z"/><path d="M9.5 14h.01M14.5 14h.01"/></svg>',
  booth: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="7" y="3" width="10" height="18" rx="1.5"/><path d="M10 6.5h4M10 10.5h4M10 14.5h4"/></svg>'
};

function footerEsc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function footerCompactHTML() {
  var links = SIBLINGS.map(function (s) {
    return '<a href="' + footerEsc(s.url) + '" target="_blank" rel="noopener">' + footerEsc(s.name) + "</a>";
  }).join(" · ");
  return '<footer class="site-footer compact"><p class="more-from-line">More from ' + footerEsc(MAKER_NAME) + ": " + links + "</p></footer>";
}
function footerHTML() {
  var cards = SIBLINGS.map(function (s) {
    return '<a class="sib-card" href="' + footerEsc(s.url) + '" target="_blank" rel="noopener">' +
      '<span class="sib-ico" aria-hidden="true">' + (SIB_SVG[s.icon] || "") + "</span>" +
      '<span class="sib-text"><strong>' + footerEsc(s.name) + "</strong><span>" + footerEsc(s.blurb) + "</span></span></a>";
  }).join("");
  return '<footer class="site-footer"><p class="more-from">More from ' + footerEsc(MAKER_NAME) + "</p>" + cards + "</footer>";
}
function fillFooter() {
  Array.prototype.forEach.call(document.querySelectorAll("[data-footer]"), function (el) { el.innerHTML = el.getAttribute("data-footer") === "compact" ? footerCompactHTML() : footerHTML(); });
}

// ===== Draw a Level: screens and flow =====
(function () {
  "use strict";

  var DL = window.DL || {};
  var $ = function (id) { return document.getElementById(id); };
  var reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  var state = {
    level: null,          // the clean level being placed / played
    photo: null,          // ImageData of the photo while lifting
    mode: "maker",        // "maker" | "friend"
    control: null,        // "tilt" | "touch" once decided
    name: "",             // the player's own name
    last: null,           // { tenths, path } the latest finished run
    bestRun: null,        // { tenths, path } the best run this session
    best: null,           // best time in tenths (stored per level)
    url: null, urlSeq: 0, urlPromise: null,
    screen: "",
    token: 0,             // cancels a countdown / start when the player leaves play
    origChallenge: null,  // the maker's challenge on a friend link
    backFn: null
  };
  var dbg = window.__level = { screen: "", level: null, linkLength: 0, lastResult: null, url: null, mode: "maker" };
  function syncDebug() { dbg.screen = state.screen; dbg.level = state.level; dbg.lastResult = state.last; dbg.linkLength = state.url ? state.url.length : 0; dbg.url = state.url; dbg.mode = state.mode; }

  // ---------- small helpers ----------
  var NAME_KEY = "dl-name";
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* works without storage */ } }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function cleanName(s) { return String(s || "").replace(/\s+/g, " ").trim().slice(0, 16); }
  function getName() { return cleanName(load(NAME_KEY)); }
  function levelKey(level) { try { return DL.level.id(level); } catch (e) { return null; } }
  function readBest(level) { var k = levelKey(level); var v = k ? parseInt(load(k), 10) : NaN; return isNaN(v) ? null : v; }
  function writeBest(level, t) { var k = levelKey(level); if (k) store(k, String(t)); }
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function fmtT(tenths) { // 142 -> 0:14.2
    var t = Math.max(0, Math.round(tenths)); var s = Math.floor(t / 10), d = t % 10;
    return Math.floor(s / 60) + ":" + pad2(s % 60) + "." + d;
  }
  function fmtWhole(tenths) { var s = Math.floor(Math.max(0, tenths) / 10); return Math.floor(s / 60) + ":" + pad2(s % 60); }
  function chTenths(c) { return c && c.time != null ? Math.round(c.time * 10) : null; } // Level.challenge.time (seconds) -> tenths
  function fmtSec(sec) { return fmtT(Math.floor(Math.max(0, sec) * 10)); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function raf() { return new Promise(function (r) { requestAnimationFrame(function () { r(); }); }); }
  function dpr() { return Math.min(window.devicePixelRatio || 1, 3); }
  function iconSvg(id, cls) { return '<svg class="' + (cls || "ico") + '"><use href="#' + id + '"/></svg>'; }
  function withChallenge(level, name, tenths) {
    var l = clone(level);
    l.challenge = tenths != null ? { name: cleanName(name), time: tenths / 10 } : null; // Level.challenge.time is in seconds
    return l;
  }
  function need(names) { // engine pieces that must exist for an action
    for (var i = 0; i < names.length; i++) {
      var parts = names[i].split("."); var o = window.DL;
      for (var j = 0; o && j < parts.length; j++) o = o[parts[j]];
      if (!o) { var e = new Error("missing " + names[i]); e.code = "engine-missing"; throw e; }
    }
  }

  // ---------- canvases ----------
  function setCanvas(canvas, w, h) {
    var d = dpr();
    canvas.width = Math.max(1, Math.round(w * d)); canvas.height = Math.max(1, Math.round(h * d));
    canvas.style.width = w + "px"; canvas.style.height = h + "px";
    var ctx = canvas.getContext("2d"); ctx.setTransform(d, 0, 0, d, 0, 0);
    return ctx;
  }
  // tight: the canvas hugs the board (landing, intro, results)
  function drawTight(canvas, level, maxW, maxH, margin, opts) {
    var lay = DL.board.layout(level, maxW, maxH, margin);
    var w = Math.ceil(lay.w + 2 * margin), h = Math.ceil(lay.h + 2 * margin);
    var ctx = setCanvas(canvas, w, h);
    DL.board.draw(ctx, level, Object.assign({ scale: lay.scale, x: margin, y: margin }, opts || {}));
    return { ctx: ctx, scale: lay.scale, x: margin, y: margin, w: w, h: h };
  }
  // stage: the canvas fills a box and the board sits centred in it (lifting, place)
  function drawStage(canvas, stage, level, margin, opts) {
    var W = stage.clientWidth, H = stage.clientHeight;
    var lay = DL.board.layout(level, W, H, margin);
    var ctx = setCanvas(canvas, W, H);
    DL.board.draw(ctx, level, Object.assign({ scale: lay.scale, x: lay.x, y: lay.y }, opts || {}));
    return { ctx: ctx, lay: lay, W: W, H: H };
  }
  function colWidth() { return Math.min(480, document.documentElement.clientWidth) - 40; }

  // ---------- screens ----------
  var cleanup = null;
  var LOCKED = { lifting: 1, place: 1, play: 1 };
  function show(name) {
    if (cleanup) { var c = cleanup; cleanup = null; try { c(); } catch (e) { /* ignore */ } }
    Array.prototype.forEach.call(document.querySelectorAll(".screen"), function (s) { s.classList.toggle("is-active", s.getAttribute("data-screen") === name); });
    state.screen = name;
    document.body.className = (LOCKED[name] ? "locked " : "") + "screen-" + name;
    if (!LOCKED[name]) window.scrollTo(0, 0);
    syncDebug();
  }

  // ---------- errors ----------
  var ERR_TEXT = {
    "no-ink": ["Couldn't find your maze.", "Use a pen and fill the photo with the paper."],
    "too-faint": ["Your lines are too light.", "Go over them with a pen."],
    "too-busy": ["That's a lot of ink.", "Draw a simpler maze on plain paper."],
    "bad-link": ["This level link is broken.", "Ask your friend to send it again."],
    "not-image": ["That isn't a photo.", "Pick a photo of your maze."],
    "heic": ["That photo is in a format we can't open.", "Take a new photo with the camera instead."],
    "unreadable": ["Couldn't open that photo.", "Try another one, or take a new photo."],
    "no-path": ["Your ball can't get through.", "Move the start or finish, or retake with wider paths."],
    "export-failed": ["Couldn't make that image.", "Try again in a moment."],
    "engine-missing": ["The game didn't finish loading.", "Refresh the page and try again."]
  };
  var PHOTO_CODES = { "no-ink": 1, "too-faint": 1, "too-busy": 1, "not-image": 1, "heic": 1, "unreadable": 1, "no-path": 1 };
  function showError(err, kind) {
    var code = err && err.code;
    if (code === "cancelled") return;
    var t = ERR_TEXT[code] || ["That didn't work.", "Something went sideways. Give it another go."];
    var title = (err && err.title) || t[0], detail = (err && err.detail) || t[1];
    if (!kind) kind = code === "bad-link" ? "draw" : PHOTO_CODES[code] ? "retake" : code === "engine-missing" ? "reload" : "home";
    $("err-title").textContent = title; $("err-detail").textContent = detail;
    $("err-ico").innerHTML = '<use href="#' + (kind === "retake" ? "i-pen" : "i-close") + '"/>';
    var b = $("err-btn");
    b.innerHTML = kind === "retake" ? iconSvg("i-retake") + "Retake" : kind === "draw" ? iconSvg("i-pen") + "Draw your own level" : kind === "reload" ? iconSvg("i-restart") + "Refresh" : "Back to start";
    b.onclick = function () {
      if (kind === "retake") $("in-snap").click();
      else if (kind === "reload") location.reload();
      else goHome();
    };
    if (window.console && err) console.warn("[draw-a-level]", code || "", err);
    show("error");
  }

  function goHome() {
    try { if (location.hash) history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* ignore */ }
    state.level = null; state.origChallenge = null; state.last = null; state.bestRun = null; state.mode = "maker";
    showLanding();
  }

  // ---------- landing ----------
  var idleRaf = 0;
  function showLanding() {
    show("landing");
    var sample;
    try { need(["sample.load", "board.draw", "board.layout"]); sample = DL.sample.load(); } catch (e) { return showError(e, "reload"); }
    var canvas = $("landing-board");
    function render(t) {
      var info = drawTight(canvas, sample, colWidth(), 460, 10, { idle: true });
      return info;
    }
    var info = render();
    var route = null;
    try { route = DL.physics && DL.physics.route ? DL.physics.route(sample) : null; } catch (e) { route = null; }
    var stopped = false;
    function ballAt(d, segs, total) { // distance along the route -> point
      d = Math.max(0, Math.min(total, d));
      for (var i = 0; i < segs.length; i++) {
        if (d <= segs[i].end) { var u = (d - segs[i].start) / (segs[i].len || 1); return { x: segs[i].ax + (segs[i].bx - segs[i].ax) * u, y: segs[i].ay + (segs[i].by - segs[i].ay) * u }; }
      }
      var s = segs[segs.length - 1]; return { x: s.bx, y: s.by };
    }
    if (route && route.length >= 4) {
      var segs = [], total = 0;
      for (var i = 0; i + 3 < route.length; i += 2) {
        var len = Math.hypot(route[i + 2] - route[i], route[i + 3] - route[i + 1]);
        segs.push({ ax: route[i], ay: route[i + 1], bx: route[i + 2], by: route[i + 3], len: len, start: total, end: total + len }); total += len;
      }
      var frame = function (draw) {
        info.ctx.clearRect(0, 0, info.w, info.h);
        DL.board.draw(info.ctx, sample, { scale: info.scale, x: info.x, y: info.y, idle: true, ball: draw });
      };
      if (reduced) {
        frame(ballAt(total * 0.4, segs, total));
      } else {
        var t0 = performance.now(), SPEED = 230, HOLD = 1400, LEAD = 700;
        var loop = function (now) {
          if (stopped) return;
          var el = now - t0, travel = total / SPEED * 1000, cycle = LEAD + travel + HOLD;
          var m = el % cycle, p;
          if (m < LEAD) p = { x: segs[0].ax, y: segs[0].ay };
          else if (m < LEAD + travel) { var u = (m - LEAD) / travel; u = u * u * (3 - 2 * u) * 0.35 + u * 0.65; p = ballAt(u * total, segs, total); }
          else p = { x: segs[segs.length - 1].bx, y: segs[segs.length - 1].by };
          if (m >= LEAD + travel) p.sink = Math.min(1, (m - LEAD - travel) / 260);
          frame(p);
          idleRaf = requestAnimationFrame(loop);
        };
        idleRaf = requestAnimationFrame(loop);
      }
    }
    var onResize = function () { if (state.screen === "landing") { info = render(); } };
    window.addEventListener("resize", onResize);
    cleanup = function () { stopped = true; cancelAnimationFrame(idleRaf); window.removeEventListener("resize", onResize); };
  }

  // ---------- photo -> lifting ----------
  var liftRun = 0;
  async function handleFile(file) {
    if (!file) return;
    var run = ++liftRun;
    $("lift-title").textContent = "Lifting your lines.";
    $("lift-ok").disabled = true; $("lift-retake").disabled = false;
    $("lift-board").style.transition = "none"; $("lift-board").style.opacity = "0";
    $("lift-photo").style.transition = "none"; $("lift-photo").style.opacity = "0";
    show("lifting");
    await raf();
    try {
      need(["decode.fileToImageData", "lift.fromImage"]);
      var img = await DL.decode.fileToImageData(file, { maxSide: 1600 });
      if (run !== liftRun) return;
      await playLift(img, DL.lift.fromImage(img), run);
    } catch (e) { if (run === liftRun) showError(e, "retake"); }
  }

  async function playLift(img, liftPromise, run) {
    var stage = $("lift-stage"), photo = $("lift-photo"), board = $("lift-board");
    // the photo sits on the stage, contained
    var W = stage.clientWidth, H = stage.clientHeight, m = 16;
    var sc = Math.min((W - 2 * m) / img.width, (H - 2 * m) / img.height);
    var pw = Math.round(img.width * sc), ph = Math.round(img.height * sc);
    var tmp = document.createElement("canvas"); tmp.width = img.width; tmp.height = img.height;
    tmp.getContext("2d").putImageData(img, 0, 0);
    var pctx = setCanvas(photo, pw, ph);
    pctx.drawImage(tmp, 0, 0, pw, ph);
    photo.style.left = Math.round((W - pw) / 2) + "px"; photo.style.top = Math.round((H - ph) / 2) + "px";
    photo.style.transition = "none"; photo.style.opacity = "1";
    var res = await liftPromise;
    if (run !== liftRun) return;
    state.level = res.level; state.mode = "maker"; state.last = null; state.bestRun = null; state.best = null;
    state.photo = img; syncDebug();
    var info = drawStage(board, stage, state.level, 10, { idle: true });
    board.style.transition = "none"; board.style.opacity = "0";
    board.style.transform = reduced ? "none" : "scale(1.035)";
    await raf();
    var d1 = reduced ? 200 : 500, d2 = reduced ? 200 : 900;
    photo.style.transition = "opacity " + d1 + "ms ease-out"; photo.style.opacity = "0";
    board.style.transition = "opacity " + d2 + "ms ease-out " + (reduced ? 0 : 450) + "ms, transform " + d2 + "ms cubic-bezier(.16,1,.3,1) " + (reduced ? 0 : 450) + "ms";
    board.style.opacity = "1"; board.style.transform = "none";
    await wait(reduced ? 220 : 1400);
    if (run !== liftRun) return;
    $("lift-title").textContent = "Here's your level.";
    $("lift-title").classList.remove("reveal"); void $("lift-title").offsetWidth; $("lift-title").classList.add("reveal");
    $("lift-ok").disabled = false;
    var onResize = function () { if (state.screen === "lifting") drawStage(board, stage, state.level, 10, { idle: true }); };
    window.addEventListener("resize", onResize);
    cleanup = function () { window.removeEventListener("resize", onResize); };
  }

  // ---------- place ----------
  function showPlace() {
    var level = state.level;
    show("place");
    var stage = $("place-stage"), canvas = $("place-board"), note = $("place-note"), ready = $("place-ready");
    var info = null, blocked = null, msg = "";
    function render() {
      info = drawStage(canvas, stage, level, 10, { placing: true, blocked: blocked || undefined, ball: level.start ? { x: level.start.x, y: level.start.y } : undefined });
    }
    function update() {
      blocked = null; msg = "";
      var ok = false;
      if (level.start && level.goal) {
        var pc = DL.level.pathCheck(level);
        ok = !!pc.ok;
        if (!ok) { blocked = pc.blocked || null; msg = "Your ball can't get through. Move the start or finish, or retake with wider paths."; }
      }
      note.className = "note" + (msg ? " bad" : "");
      note.textContent = msg || (!level.start ? "Tap where the ball starts." : !level.goal ? "Now tap the finish." : "Tap to move either one.");
      ready.disabled = !ok;
      render(); syncDebug();
    }
    var onTap = function (e) {
      var r = canvas.getBoundingClientRect();
      var pt = DL.board.toBoard(level, info.lay.scale, e.clientX - r.left - info.lay.x, e.clientY - r.top - info.lay.y);
      if (pt.x < 0 || pt.y < 0 || pt.x > level.w || pt.y > level.h) return;
      var which;
      if (!level.start) which = "start";
      else if (!level.goal) {
        which = Math.hypot(pt.x - level.start.x, pt.y - level.start.y) < level.ballR * 2.5 ? "start" : "goal";
      } else {
        var ds = Math.hypot(pt.x - level.start.x, pt.y - level.start.y), dg = Math.hypot(pt.x - level.goal.x, pt.y - level.goal.y);
        which = ds <= dg ? "start" : "goal";
      }
      var prev = level[which];
      if (which === "start") DL.level.setStart(level, pt); else DL.level.setGoal(level, pt);
      if (!level[which]) { level[which] = prev; update(); note.className = "note bad"; note.textContent = "No room for the ball there. Try a spot on the paper."; return; }
      update();
    };
    canvas.onpointerdown = onTap;
    $("place-back").onclick = function () { showLifting(); };
    ready.onclick = function () { state.mode = "maker"; beginPlay(function () { showPlace(); }); };
    var onResize = function () { if (state.screen === "place") update(); };
    window.addEventListener("resize", onResize);
    cleanup = function () { window.removeEventListener("resize", onResize); canvas.onpointerdown = null; };
    raf().then(update);
  }
  function showLifting() { // back from place: the same level, already lifted
    show("lifting");
    $("lift-title").textContent = "Here's your level.";
    $("lift-ok").disabled = false;
    $("lift-photo").style.opacity = "0"; $("lift-board").style.transition = "none"; $("lift-board").style.opacity = "1"; $("lift-board").style.transform = "none";
    raf().then(function () { drawStage($("lift-board"), $("lift-stage"), state.level, 10, { idle: true }); });
  }

  // ---------- play ----------
  var game = null, wakeLock = null, playHintTimer = 0;
  async function takeWakeLock() {
    try { if (navigator.wakeLock && !wakeLock) { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener && wakeLock.addEventListener("release", function () { wakeLock = null; }); } } catch (e) { wakeLock = null; }
  }
  function dropWakeLock() { try { if (wakeLock) wakeLock.release(); } catch (e) { /* ignore */ } wakeLock = null; }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && state.screen === "play") takeWakeLock(); });

  function stopPlay() {
    state.token++;
    clearTimeout(playHintTimer);
    if (game) { try { game.stop(); } catch (e) { /* ignore */ } try { game.destroy(); } catch (e) { /* ignore */ } game = null; }
    try { if (DL.input && DL.input.detach) DL.input.detach(); } catch (e) { /* ignore */ }
    dropWakeLock();
  }

  // Called straight from a tap: asks for tilt inside the tap (iPhone), then opens play.
  function beginPlay(backFn) {
    state.backFn = backFn;
    var ctrl = null;
    var q = new URLSearchParams(location.search);
    if (q.get("control") === "touch") state.control = "touch";
    if (state.control == null) {
      try { ctrl = DL.input.request(); } catch (e) { ctrl = Promise.resolve("touch"); }
    }
    enterPlay(ctrl);
  }

  async function enterPlay(ctrlPromise, showTapCard) {
    var token = ++state.token;
    show("play");
    var level = state.level;
    var stage = $("play-stage"), canvas = $("play-canvas");
    var timer = $("play-timer"), cd = $("countdown"), hint = $("play-hint"), scrim = $("play-scrim"), card = $("tap-card");
    timer.textContent = "0:00.0"; hint.hidden = true; hint.classList.remove("fade"); cd.className = "countdown hand"; cd.textContent = "";
    card.hidden = true; scrim.hidden = true;
    takeWakeLock();
    await raf();
    if (token !== state.token) return;

    var W = stage.clientWidth, H = stage.clientHeight;
    var lay = DL.board.layout(level, W, H, 8);
    var ctx = setCanvas(canvas, W, H);
    DL.board.draw(ctx, level, { scale: lay.scale, x: lay.x, y: lay.y, ball: level.start ? { x: level.start.x, y: level.start.y } : undefined });

    $("play-close").onclick = function () { closePlay(); };
    $("play-restart").onclick = function () { restartRun(); };
    $("tap-go").onclick = function () {
      var p; try { p = DL.input.request(); } catch (e) { p = Promise.resolve("touch"); }
      card.hidden = true; scrim.hidden = true;
      enterPlay(p);
    };

    var q = new URLSearchParams(location.search), auto = q.get("autoplay") === "1";
    if (!ctrlPromise && state.control == null && !auto && !q.get("control")) {
      // no tap yet (a direct link into play): the iPhone card asks for it
      var needs = false; try { needs = DL.input.needsPermission(); } catch (e) { needs = false; }
      if (needs || showTapCard !== false) {
        scrim.style.cssText = "left:" + lay.x + "px;top:" + lay.y + "px;width:" + lay.w + "px;height:" + lay.h + "px";
        scrim.hidden = false; card.hidden = false; return;
      }
    }
    if (ctrlPromise) { try { state.control = await ctrlPromise; } catch (e) { state.control = "touch"; } }
    if (auto || q.get("control") === "touch") state.control = state.control || "touch";
    if (token !== state.token) return;
    if (state.control !== "tilt") { hint.hidden = false; }

    try {
      need(["game.create"]);
    } catch (e) { return showError(e, "home"); }

    try {
      game = DL.game.create(canvas, level, { mode: state.control === "tilt" ? "tilt" : "touch", autoplay: auto, margin: 8, onEvent: onGameEvent });
      DL.input.attach(canvas, state.control === "tilt" ? "tilt" : "touch");
    } catch (e) { return showError(e, "home"); }

    if (state.control !== "tilt") {
      canvas.onpointerdown = function () { clearTimeout(playHintTimer); playHintTimer = setTimeout(function () { hint.classList.add("fade"); }, 3000); };
    } else canvas.onpointerdown = null;

    await runCountdown(token);
    if (token !== state.token || !game) return;
    game.start();
  }

  async function runCountdown(token) {
    var cd = $("countdown");
    for (var n = 3; n >= 1; n--) {
      cd.textContent = String(n);
      cd.className = "countdown hand"; void cd.offsetWidth; cd.className = "countdown hand tick";
      await wait(700);
      if (token !== state.token) return;
    }
    cd.className = "countdown hand"; cd.textContent = "";
  }

  function onGameEvent(e) {
    if (!e || state.screen !== "play") return;
    if (e.type === "tick") { if (e.time != null) $("play-timer").textContent = fmtSec(e.time); }
    else if (e.type === "hole") {
      var g = $("gulp"); g.classList.remove("on");
      var st = $("play-stage"), gw = st.clientWidth || 300, gx = typeof e.x === "number" ? e.x : gw / 2, gy = typeof e.y === "number" ? e.y : (st.clientHeight || 400) * .14;
      g.style.left = Math.max(40, Math.min(gw - 40, gx)) + "px";
      g.style.top = Math.max(0, gy - 44) + "px";
      g.classList.add("placed"); void g.offsetWidth; g.classList.add("on");
    } else if (e.type === "finish") onFinish(e);
  }

  function restartRun() {
    if (!game) return;
    $("play-timer").textContent = "0:00.0";
    try { game.restart(); } catch (e) { /* ignore */ }
  }

  async function onFinish(e) {
    var res = null;
    try { res = game && game.result ? game.result() : null; } catch (er) { res = null; }
    var secs = res && res.time != null ? res.time : (e && e.time != null ? e.time : 0);
    if (state.screen !== "play") return;
    var tenths = Math.max(1, Math.round(secs * 10));
    $("play-timer").textContent = fmtT(tenths);
    var token = state.token;
    var path = res && res.path ? res.path : null;
    state.last = { tenths: tenths, path: path };
    var prev = state.best != null ? state.best : readBest(state.level);
    if (prev == null || tenths < prev) {
      state.best = tenths; writeBest(state.level, tenths); state.bestRun = { tenths: tenths, path: path };
    } else state.best = prev;
    syncDebug();
    await wait(reduced ? 500 : 1000);
    if (token !== state.token) return;
    stopPlay();
    if (state.mode === "friend") showFriendResult(); else showMakerResult();
  }

  function closePlay() {
    stopPlay();
    var b = state.backFn; state.backFn = null;
    if (b) b(); else showLanding();
  }

  // ---------- links (prepared before the tap) ----------
  function prepareLink(level, name, tenths) {
    var seq = ++state.urlSeq;
    state.url = null;
    var lv = withChallenge(level, name, tenths);
    try {
      state.urlPromise = DL.codec.url(lv).then(function (u) { if (seq === state.urlSeq) { state.url = u; syncDebug(); } return u; });
      state.urlPromise.catch(function () { /* shown when the player taps */ });
    } catch (e) { state.urlPromise = Promise.reject(e); state.urlPromise.catch(function () {}); }
    return state.urlPromise;
  }

  // ---------- story button ----------
  function storyButton(btn, getArgs, statusEl) {
    var label = btn.querySelector("span"), file = null, wantTap = false, seq = 0, ready = false;
    function setLabel(t) { label.textContent = t; }
    var api = {
      prepare: function () {
        var my = ++seq; file = null; ready = false; wantTap = false; setLabel("Save story");
        var a = getArgs();
        if (!a) return;
        try {
          need(["story.image", "export.fileName"]);
          DL.story.image(a.level, a.opts).then(function (blob) {
            if (my !== seq) return;
            file = new File([blob], DL.export.fileName(a.opts.name), { type: blob.type || "image/jpeg" });
            ready = true;
            if (wantTap) { wantTap = false; setLabel("Share now"); statusEl.textContent = "Your story is ready."; }
          }).catch(function (e) { if (my === seq) { ready = false; file = null; if (wantTap) { wantTap = false; setLabel("Save story"); statusEl.className = "status bad"; statusEl.textContent = (e && e.detail) || "Couldn't make that image. Try again in a moment."; } } });
        } catch (e) { /* engine part missing: the button explains on tap */ }
      },
      tap: function () {
        statusEl.className = "status";
        if (!file) {
          if (!DL.story || !DL.story.image) { statusEl.className = "status bad"; statusEl.textContent = "The story image isn't ready yet. Try again in a moment."; return; }
          var wasWaiting = wantTap;
          setLabel("Making it..."); statusEl.textContent = "";
          if (wasWaiting) return;
          api.prepare(); wantTap = true; setLabel("Making it..."); return; // (prepare resets both, so set them after)
        }
        var f = file, p;
        try { p = DL.share.canShare(f) ? DL.share.share(f) : DL.share.save(f); } catch (e) { p = Promise.resolve("failed"); }
        p.then(function (r) {
          if (r === "failed" && DL.share.canShare(f)) return DL.share.save(f);
          return r;
        }).then(function (r) {
          setLabel("Save story");
          if (r === "saved") statusEl.textContent = "Saved to your phone.";
          else if (r === "failed") { statusEl.className = "status bad"; statusEl.textContent = "Couldn't save it. Try again."; }
        });
      }
    };
    btn.onclick = api.tap;
    return api;
  }

  // ---------- maker result ----------
  var makerStory = null, nameTimer = 0;
  function showMakerResult() {
    var level = state.level, last = state.last;
    show("result");
    var best = state.best != null ? state.best : (last ? last.tenths : null);
    var status = $("result-status"); status.className = "status"; status.textContent = "";
    $("result-time").textContent = last ? fmtT(last.tenths) : (best != null ? fmtT(best) : "0:00.0");
    var bl = $("result-best");
    if (best != null && last && best < last.tenths) { bl.hidden = false; bl.textContent = "Your best: " + fmtT(best); } else bl.hidden = true;
    var nameEl = $("result-name"); nameEl.value = getName();
    var runPath = state.bestRun && state.bestRun.tenths === best ? state.bestRun.path : (last && last.tenths === best ? last.path : null);

    var info = null;
    function drawBoard() {
      var cw = Math.min(300, colWidth());
      info = drawTight($("result-board"), level, cw, 340, 10, {
        path: runPath || undefined, start: false,
        ball: level.goal ? { x: level.goal.x, y: level.goal.y, sink: 1 } : undefined
      });
    }
    drawBoard();
    Array.prototype.forEach.call(document.querySelectorAll("#s-result .time-row, #s-result .btn, #s-result .name-input"), function (el, i) {
      el.classList.remove("reveal"); void el.offsetWidth; el.style.animationDelay = (i * 70) + "ms"; el.classList.add("reveal");
    });

    function prep() { return prepareLink(level, nameEl.value, best); }
    prep();
    makerStory = storyButton($("result-story"), function () {
      if (best == null) return null;
      var lv = withChallenge(level, cleanName(nameEl.value), best);
      return { level: lv, opts: { time: best / 10, path: runPath || [], name: cleanName(nameEl.value), mode: "maker" } };
    }, status);
    var storyTimer = setTimeout(function () { makerStory.prepare(); }, 600);

    nameEl.oninput = function () {
      var n = cleanName(nameEl.value); store(NAME_KEY, n); state.name = n;
      clearTimeout(nameTimer);
      nameTimer = setTimeout(function () { prep(); makerStory.prepare(); }, 350);
    };

    $("result-dare").onclick = function () {
      status.className = "status"; status.textContent = "";
      var text = "I drew you a level. Beat " + fmtWhole(best != null ? best : 0) + " 👇";
      var go = function (url) {
        if (!url) { status.className = "status bad"; status.textContent = "Couldn't make the link. Try again."; return; }
        DL.share.shareLink(text, url).then(function (r) {
          if (r === "copied") status.textContent = "Link copied. Paste it in your chat.";
          else if (r === "failed") { status.className = "status bad"; status.textContent = "Couldn't share. Try again."; }
        });
      };
      try { need(["share.shareLink"]); } catch (e) { return showError(e, "home"); }
      if (state.url) go(state.url);
      else state.urlPromise.then(go, function (e) { showError(e, "home"); });
    };
    $("result-again").onclick = function () { beginPlay(function () { showMakerResult(); }); };

    var onResize = function () { if (state.screen === "result") drawBoard(); };
    window.addEventListener("resize", onResize);
    cleanup = function () { clearTimeout(storyTimer); clearTimeout(nameTimer); window.removeEventListener("resize", onResize); nameEl.oninput = null; };
  }

  // ---------- friend ----------
  function makerName() { var c = state.origChallenge; return c && c.name ? c.name : ""; }
  function showIntro() {
    var level = state.level, c = level.challenge || null;
    state.mode = "friend"; state.origChallenge = c;
    state.last = null; state.bestRun = null; state.best = null;
    show("intro");
    var nm = makerName();
    var title = $("intro-title"); title.textContent = "";
    if (nm) {
      var s = document.createElement("span"); s.className = "hand"; s.textContent = nm; title.appendChild(s);
      title.appendChild(document.createTextNode(" drew you a level."));
    } else title.textContent = "A friend drew you a level.";
    $("intro-tag").hidden = !(c && c.time != null);
    if (c && c.time != null) $("intro-time").textContent = fmtT(chTenths(c));
    var drawBoard = function () {
      var maxH = Math.max(240, Math.min(window.innerHeight * 0.5, 460));
      drawTight($("intro-board"), level, colWidth(), maxH, 10, {});
    };
    drawBoard();
    $("intro-play").onclick = function () { beginPlay(function () { showIntro2(); }); };
    var onResize = function () { if (state.screen === "intro") drawBoard(); };
    window.addEventListener("resize", onResize);
    cleanup = function () { window.removeEventListener("resize", onResize); };
    syncDebug();
  }
  function showIntro2() { // back from play to the intro without resetting what the friend did
    var keepLast = state.last, keepBest = state.best, keepRun = state.bestRun;
    showIntro(); state.last = keepLast; state.best = keepBest; state.bestRun = keepRun;
  }

  var friendStory = null;
  function showFriendResult() {
    var level = state.level, c = state.origChallenge, last = state.last;
    show("friend-result");
    var best = state.best != null ? state.best : (last ? last.tenths : readBest(level));
    var status = $("friend-status"); status.className = "status"; status.textContent = "";
    var nm = makerName(), shown = nm || "your friend";
    var line = $("friend-line"); line.textContent = "";
    function addName(prefix, suffix) {
      line.appendChild(document.createTextNode(prefix));
      var s = document.createElement("span"); s.className = "hand"; s.textContent = shown; line.appendChild(s);
      line.appendChild(document.createTextNode(suffix));
    }
    var cmp = $("friend-compare");
    if (c && c.time != null) {
      var ct = chTenths(c), diff = ct - best;
      if (best < ct) {
        if (diff < 5) addName("By a hair. You beat ", "."); else addName("You beat ", " by " + (diff / 10).toFixed(1) + " s.");
      } else addName("", " still wins.");
      cmp.hidden = false;
      $("cmp-you").textContent = fmtT(best); $("cmp-them").textContent = fmtT(ct);
      $("cmp-who-label").textContent = nm || "Them";
    } else {
      line.textContent = "Done in " + fmtT(best) + ".";
      cmp.hidden = true;
    }
    var runPath = state.bestRun && state.bestRun.tenths === best ? state.bestRun.path : (last && last.tenths === best ? last.path : null);
    var drawBoard = function () {
      drawTight($("friend-board"), level, Math.min(250, colWidth()), 300, 10, { path: runPath || undefined, start: false, ball: level.goal ? { x: level.goal.x, y: level.goal.y, sink: 1 } : undefined });
    };
    drawBoard();

    var nameEl = $("friend-name"), nameWrap = $("friend-name-wrap");
    nameEl.value = getName(); nameWrap.hidden = !!getName();
    function myName() { return cleanName(nameEl.value) || getName(); }
    function prep() { return prepareLink(level, myName(), best); }
    prep();
    friendStory = storyButton($("friend-story"), function () {
      if (best == null) return null;
      return { level: level, opts: { time: best / 10, path: runPath || [], name: myName(), mode: "friend" } };
    }, status);
    var storyTimer = setTimeout(function () { friendStory.prepare(); }, 600);
    nameEl.oninput = function () {
      var n = cleanName(nameEl.value); store(NAME_KEY, n); state.name = n;
      clearTimeout(nameTimer);
      nameTimer = setTimeout(function () { prep(); friendStory.prepare(); }, 350);
    };

    $("friend-send").onclick = function () {
      status.className = "status"; status.textContent = "";
      if (!myName()) {
        nameWrap.hidden = false; nameEl.focus();
        status.className = "status bad"; status.textContent = "Add your name first, so they know who played.";
        return;
      }
      var text = "Beat " + fmtT(best) + (nm ? ", " + nm : "") + " 👀";
      var go = function (url) {
        if (!url) { status.className = "status bad"; status.textContent = "Couldn't make the link. Try again."; return; }
        DL.share.shareLink(text, url).then(function (r) {
          if (r === "copied") status.textContent = "Link copied. Paste it in your chat.";
          else if (r === "failed") { status.className = "status bad"; status.textContent = "Couldn't share. Try again."; }
        });
      };
      try { need(["share.shareLink"]); } catch (e) { return showError(e, "home"); }
      if (state.url) go(state.url); else state.urlPromise.then(go, function (e) { showError(e, "home"); });
    };
    $("friend-own").onclick = function () { goHome(); };
    $("friend-again").onclick = function () { beginPlay(function () { showFriendResult(); }); };

    var onResize = function () { if (state.screen === "friend-result") drawBoard(); };
    window.addEventListener("resize", onResize);
    cleanup = function () { clearTimeout(storyTimer); clearTimeout(nameTimer); window.removeEventListener("resize", onResize); nameEl.oninput = null; };
  }

  // ---------- opening a link ----------
  async function openLink() {
    try {
      need(["codec.decode"]);
      var level = await DL.codec.decode(location.hash.slice(1));
      state.level = level;
      showIntro();
    } catch (e) {
      if (e && e.code === "engine-missing") return showError(e, "reload");
      var err = e && e.code === "bad-link" ? e : Object.assign(new Error("bad-link"), { code: "bad-link" });
      showError(err, "draw");
    }
  }

  // ---------- dev shortcuts (PLAN.md section 7.4) ----------
  async function devScreen(q) {
    var s = q.get("screen"), level;
    try {
      level = DL.sample.load();
    } catch (e) { return showError(e, "reload"); }
    var name = q.get("name"), tm = parseInt(q.get("time"), 10);
    if (name != null || !isNaN(tm)) level.challenge = { name: cleanName(name || ""), time: isNaN(tm) ? null : tm / 10 };
    if (s === "lifting") {
      state.level = null;
      try {
        need(["lift.fromImage", "sample.photo"]);
        var run = ++liftRun;
        show("lifting"); await raf();
        await playLift(DL.sample.photo(), DL.lift.fromImage(DL.sample.photo()), run);
      } catch (e) { showError(e, "retake"); }
      return;
    }
    state.level = level;
    if (s === "landing") return showLanding();
    if (s === "place") {
      if (q.get("placed") !== "1") { level.start = null; level.goal = null; }
      return showPlace();
    }
    if (s === "play") {
      state.mode = "maker"; state.backFn = function () { showLanding(); };
      var ctrl = q.get("autoplay") === "1" || q.get("control") === "touch" ? Promise.resolve("touch") : null;
      return enterPlay(ctrl, ctrl ? false : undefined);
    }
    var route = null; try { route = DL.physics.route(level); } catch (e) { route = null; }
    if (s === "result") {
      state.mode = "maker";
      var t = isNaN(tm) ? 142 : tm;
      state.last = { tenths: t, path: route }; state.best = t; state.bestRun = { tenths: t, path: route };
      return showMakerResult();
    }
    if (s === "intro") {
      if (!level.challenge) level.challenge = { name: "Rishi", time: 14.2 };
      return showIntro();
    }
    if (s === "friend-result") {
      if (!level.challenge) level.challenge = { name: "Rishi", time: 14.2 };
      state.mode = "friend"; state.origChallenge = level.challenge;
      var ct0 = chTenths(level.challenge);
      var mine = q.get("won") === "0" ? ct0 + 27 : ct0 - 21;
      if (q.get("won") === "hair") mine = ct0 - 2;
      state.last = { tenths: mine, path: route }; state.best = mine; state.bestRun = { tenths: mine, path: route };
      return showFriendResult();
    }
    if (s === "error-no-ink") { var e1; try { e1 = DL.util.error("no-ink"); } catch (e) { e1 = { code: "no-ink" }; } return showError(e1, "retake"); }
    if (s === "error-bad-link") { var e2; try { e2 = DL.util.error("bad-link"); } catch (e) { e2 = { code: "bad-link" }; } return showError(e2, "draw"); }
    showLanding();
  }

  // ---------- wiring ----------
  function wire() {
    var snap = $("in-snap"), pick = $("in-pick");
    function onPick(input) {
      return function () {
        var f = input.files && input.files[0];
        input.value = ""; // so the same photo can be picked again
        if (f) handleFile(f);
      };
    }
    snap.addEventListener("change", onPick(snap));
    pick.addEventListener("change", onPick(pick));
    $("btn-snap").onclick = function () { snap.click(); };
    $("btn-pick").onclick = function () { pick.click(); };
    $("btn-sample").onclick = function () {
      try { need(["sample.load"]); } catch (e) { return showError(e, "reload"); }
      state.level = DL.sample.load(); state.mode = "maker"; state.last = null; state.bestRun = null; state.best = null;
      beginPlay(function () { showLanding(); });
    };
    $("lift-retake").onclick = function () { liftRun++; snap.click(); };
    $("lift-ok").onclick = function () { showPlace(); };
    window.addEventListener("hashchange", function () {
      if (location.hash.indexOf("#L1.") === 0) { if (state.screen === "play") stopPlay(); openLink(); }
    });
    // a stray touchmove must never scroll or pull-to-refresh while playing
    document.addEventListener("touchmove", function (e) { if (state.screen === "play" || state.screen === "place") e.preventDefault(); }, { passive: false });
  }

  function boot() {
    try { fillFooter(); } catch (e) { /* footer is a nicety */ }
    window.DL = window.DL || {};
    DL = window.DL;
    wire();
    var core = ["board.draw", "board.layout", "sample.load", "level.pathCheck", "codec.decode"];
    try { need(core); } catch (e) { return showError(e, "reload"); }
    state.name = getName();
    var q = new URLSearchParams(location.search);
    if (q.get("screen")) return devScreen(q);
    if (q.get("sample") === "1") { q.set("screen", "play"); return devScreen(q); }
    if (location.hash.indexOf("#L1.") === 0) return openLink();
    showLanding();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
