// Tiny helper for the page checks (adapted from ../look-up/tests/cdp.js): starts one headless Edge with a temporary profile,
// talks to it over the DevTools protocol using Node's built-in WebSocket and fetch (no npm packages), and always closes Edge again.
//   const { launch } = require("./cdp");
//   const b = await launch({ width: 390, height: 844, dpr: 1 });
//   await b.open(url); await b.eval("1+1"); await b.shot("file.png"); await b.close();
// The DevTools port is 9338 (override with the DL_CDP_PORT environment variable).
const { spawn, execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const EDGE = process.env.DL_EDGE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = parseInt(process.env.DL_CDP_PORT || "9338", 10);
const SHOTS = path.join(__dirname, "..", "shots");
const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

async function launch(opts) {
  opts = opts || {};
  if (typeof WebSocket === "undefined") throw new Error("this Node has no global WebSocket (needs Node 22+): " + process.version);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "dl-edge-"));
  const proc = spawn(EDGE, [
    "--headless=new", "--disable-gpu", "--disable-http-cache", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check",
    "--user-data-dir=" + profile, "--remote-debugging-port=" + PORT, "--window-size=" + (opts.width || 390) + "," + (opts.height || 844),
    "about:blank"
  ], { stdio: "ignore" });
  let ws = null;
  let closed = false;
  const b = { logs: [], errors: [], exceptions: [], failedRequests: [], ignored: [], downloads: [], profile: profile };
  const listeners = {};

  b.close = async function () {
    if (closed) return;
    closed = true;
    try { if (ws) ws.close(); } catch (e) { /* ignore */ }
    try { execFileSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" }); } catch (e) { try { proc.kill(); } catch (e2) { /* ignore */ } }
    await sleep(600);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  };
  const bail = function () { b.close(); };
  process.on("exit", bail);

  // the one allowed failure: the Vercel analytics script does not exist on a local server (404). Anything else still counts.
  const isAnalytics = function (url) { return /\/_vercel\/insights\/script\.js/.test(url || ""); };

  try {
    let target = null;
    for (let i = 0; i < 60 && !target; i++) {
      await sleep(500);
      try {
        const list = await (await fetch("http://127.0.0.1:" + PORT + "/json/list")).json();
        target = list.filter(function (t) { return t.type === "page"; })[0] || null;
      } catch (e) { /* not up yet */ }
    }
    if (!target) throw new Error("Edge did not start");
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(function (res, rej) { ws.onopen = res; ws.onerror = function () { rej(new Error("ws error")); }; });
    let id = 0;
    const waiting = {};
    const requests = {};
    ws.onmessage = function (m) {
      const d = JSON.parse(m.data);
      if (d.id && waiting[d.id]) { waiting[d.id](d); delete waiting[d.id]; return; }
      if (d.method && listeners[d.method]) listeners[d.method].forEach(function (fn) { try { fn(d.params); } catch (e) { /* ignore */ } });
      if (d.method === "Runtime.consoleAPICalled") {
        const text = d.params.args.map(function (a) { return a.value !== undefined ? a.value : (a.description || a.type); }).join(" ");
        b.logs.push({ type: d.params.type, text: text });
        if (d.params.type === "error") b.errors.push(text);
      } else if (d.method === "Runtime.exceptionThrown") {
        const x = d.params.exceptionDetails;
        b.exceptions.push((x.exception && x.exception.description) || x.text);
      } else if (d.method === "Log.entryAdded") {
        const e = d.params.entry;
        if (isAnalytics(e.url)) b.ignored.push(e.url);
        else if (e.level === "error") b.errors.push("[" + e.source + "] " + e.text + (e.url ? " " + e.url : ""));
      } else if (d.method === "Network.requestWillBeSent") {
        requests[d.params.requestId] = d.params.request.url;
      } else if (d.method === "Network.responseReceived") {
        const r = d.params.response;
        if (r.status >= 400) { if (isAnalytics(r.url)) b.ignored.push(r.url); else b.failedRequests.push(r.status + " " + r.url); }
      } else if (d.method === "Network.loadingFailed") {
        const url = requests[d.params.requestId] || "";
        if (d.params.canceled) return;
        if (isAnalytics(url)) b.ignored.push(url); else b.failedRequests.push("failed " + url + " " + d.params.errorText);
      } else if (d.method === "Browser.downloadWillBegin" || d.method === "Page.downloadWillBegin") {
        if (!b.downloads.some(function (x) { return x.url === d.params.url; })) b.downloads.push({ name: d.params.suggestedFilename, url: d.params.url }); // Browser.* and Page.* both report it
      }
    };
    b.on = function (method, fn) { (listeners[method] = listeners[method] || []).push(fn); };
    b.send = function (method, params) {
      return new Promise(function (res) { const i = ++id; waiting[i] = res; ws.send(JSON.stringify({ id: i, method: method, params: params || {} })); });
    };
    // evaluate in the page; promises are awaited; returns the value (or throws with the page's message)
    b.eval = async function (expr) {
      const r = await b.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.result && r.result.exceptionDetails) {
        const x = r.result.exceptionDetails;
        throw new Error((x.exception && x.exception.description) || x.text);
      }
      return r.result && r.result.result ? r.result.result.value : undefined;
    };
    b.waitFor = async function (expr, seconds) {
      const t0 = Date.now();
      while (Date.now() - t0 < (seconds || 20) * 1000) {
        let v = false;
        try { v = await b.eval(expr); } catch (e) { v = false; }
        if (v) return true;
        await sleep(250);
      }
      return false;
    };
    b.open = async function (url) {
      b.clear();
      await b.send("Page.navigate", { url: url });
      await sleep(300);
    };
    b.clear = function () { b.errors.length = 0; b.exceptions.length = 0; b.logs.length = 0; b.failedRequests.length = 0; };
    b.shot = async function (name, o) {
      o = o || {};
      fs.mkdirSync(SHOTS, { recursive: true });
      const params = { format: "png" };
      if (o.full) {
        const lm = await b.send("Page.getLayoutMetrics", {});
        const cs = lm.result.cssContentSize || lm.result.contentSize;
        params.captureBeyondViewport = true;
        params.clip = { x: 0, y: 0, width: cs.width, height: cs.height, scale: 1 };
      }
      const r = await b.send("Page.captureScreenshot", params);
      const file = path.join(SHOTS, name);
      fs.writeFileSync(file, Buffer.from(r.result.data, "base64"));
      return file;
    };
    // put files into an <input type=file> the way a person's picker would (fires the change event)
    b.setFiles = async function (selector, files) {
      const doc = await b.send("DOM.getDocument", {});
      const q = await b.send("DOM.querySelector", { nodeId: doc.result.root.nodeId, selector: selector });
      await b.send("DOM.setFileInputFiles", { nodeId: q.result.nodeId, files: files });
    };
    // real touch events (they become pointer events with pointerType "touch"): pts are [{x,y}] in CSS px of the viewport
    b.touchDrag = async function (pts, stepMs) {
      const gap = stepMs || 16;
      await b.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: pts[0].x, y: pts[0].y, id: 1 }] });
      for (let i = 1; i < pts.length; i++) {
        await sleep(gap);
        await b.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: pts[i].x, y: pts[i].y, id: 1 }] });
      }
      await sleep(gap);
      await b.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    };
    b.click = async function (x, y) {
      await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x, y: y });
      await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x: x, y: y, button: "left", clickCount: 1 });
      await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x, y: y, button: "left", clickCount: 1 });
    };
    // a real click at the centre of an element (so the page's own handlers run exactly as for a finger)
    b.clickEl = async function (selector) {
      const r = await b.eval("(function(){var e=document.querySelector(" + JSON.stringify(selector) + ");if(!e)return null;e.scrollIntoView({block:'center'});var r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()");
      if (!r) throw new Error("no element " + selector);
      await b.click(r.x, r.y);
    };
    b.typeText = async function (text) { await b.send("Input.insertText", { text: text }); };
    b.viewport = async function (w, h, dpr) {
      await b.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr || 1, mobile: opts.mobile !== false });
    };
    b.sleep = sleep;
    await b.send("Runtime.enable");
    await b.send("Page.enable");
    await b.send("Log.enable");
    await b.send("DOM.enable");
    await b.send("Network.enable");
    try {
      const dl = path.join(profile, "downloads");
      fs.mkdirSync(dl, { recursive: true });
      b.downloadDir = dl;
      await b.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: dl, eventsEnabled: true });
    } catch (e) { /* downloads are then checked another way */ }
    await b.viewport(opts.width || 390, opts.height || 844, opts.dpr || 1);
    if (opts.mobile !== false) await b.send("Emulation.setTouchEmulationEnabled", { enabled: true });
    return b;
  } catch (e) {
    await b.close();
    throw e;
  }
}

module.exports = { launch: launch, sleep: sleep };
