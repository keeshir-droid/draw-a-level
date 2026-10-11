// Page check: headless Edge (DevTools protocol, no npm packages) against the site at phone size 390x844.
//   node tests/page-check.js [baseUrl] [sections]
// baseUrl: argument 1 (e.g. http://localhost:8000) or the DL_BASE environment variable. With none, this script serves the
//   folder itself on http://127.0.0.1:8123 (a throwaway Node static server, stopped when the check ends; it never touches
//   the server on 8000). Set DL_PORT to change 8123.
// sections: comma list of  screens, maker, link, sample, errors, story  (default: all)
// Fails on any console error, uncaught exception or failed request (the Vercel analytics script is the one allowed 404).
// One Edge at a time, always closed. Screenshots go to shots/pc-<name>.png.
const fs = require("fs");
const path = require("path");
const http = require("http");
const { launch, sleep } = require("./cdp");

const ROOT = path.join(__dirname, "..");
const REAL = path.join(__dirname, "real");
const OUT = path.join(__dirname, "out");
const argBase = process.argv.filter(function (a) { return /^https?:/.test(a); })[0];
const argSecs = process.argv.filter(function (a) { return /^(screens|maker|link|sample|errors|story)(,|$)/.test(a); })[0];
const SECTIONS = (argSecs || "screens,maker,link,sample,errors,story").split(",");
let BASE = (argBase || process.env.DL_BASE || "").replace(/\/+$/, "");

let fails = 0;
function report(ok, label, extra) {
  if (!ok) fails += 1;
  console.log((ok ? "PASS " : "FAIL ") + label + (extra !== undefined && extra !== "" ? "  (" + extra + ")" : ""));
}
function note(s) { console.log("     " + s); }

// ---- the throwaway static server ----
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".json": "application/json", ".txt": "text/plain" };
function serve(port) {
  const srv = http.createServer(function (req, res) {
    let p = decodeURIComponent((req.url || "/").split("?")[0].split("#")[0]);
    if (p === "/") p = "/index.html";
    const f = path.join(ROOT, p);
    if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(function (resolve, reject) { srv.on("error", reject); srv.listen(port, "127.0.0.1", function () { resolve(srv); }); });
}

async function after(b, label) {
  await sleep(150);
  const errs = b.errors.slice(), exc = b.exceptions.slice(), net = b.failedRequests.slice();
  report(errs.length === 0 && exc.length === 0, label + ": no console errors or exceptions", errs.concat(exc).slice(0, 3).join(" | "));
  report(net.length === 0, label + ": no failed requests", net.slice(0, 3).join(" | "));
  b.clear();
}
const screenOf = "(window.__level && window.__level.screen)";
async function openUrl(b, qs) { await b.open(BASE + "/" + qs); await b.waitFor("document.readyState==='complete' && !!window.__level", 15); }
async function waitScreen(b, name, secs) { return b.waitFor(screenOf + "===" + JSON.stringify(name), secs || 15); }

// canvas painted check (the board has wood, paper and ink: lots of colour range)
const PAINTED = `(function(id){var c=document.getElementById(id);if(!c||!c.width||!c.height)return {ok:false,why:"no canvas"};
var x=c.getContext("2d"),w=c.width,h=c.height,d=x.getImageData(0,0,w,h).data,n=0,seen=0,lo=255,hi=0;
for(var y=0;y<h;y+=Math.max(1,h>>6))for(var i=0;i<w;i+=Math.max(1,w>>6)){var o=(y*w+i)*4;n++;if(d[o+3]>8){seen++;var l=(d[o]*3+d[o+1]*6+d[o+2])/10;if(l<lo)lo=l;if(l>hi)hi=l;}}
return {ok:seen>n*0.2&&hi-lo>40,w:w,h:h,painted:Math.round(seen/n*100)+"%",range:Math.round(hi-lo)};})`;

// where to tap on the place screen for a level point (CSS px of the viewport)
const TAP_POS = `(function(pt){var L=window.__level.level,st=document.getElementById("place-stage"),cv=document.getElementById("place-board");
var lay=DL.board.layout(L,st.clientWidth,st.clientHeight,10),r=cv.getBoundingClientRect(),F=DL.PALETTE.frame.width;
return {x:r.left+lay.x+(F+pt.x)*lay.scale,y:r.top+lay.y+(F+pt.y)*lay.scale};})`;

// pick a start and a goal that snap to free spots and have a path between them (searching a few candidates)
const PICK_PAIR = `(function(){var L=window.__level.level,W=L.w,H=L.h,c=[];
[[0.12,0.1],[0.88,0.1],[0.12,0.9],[0.88,0.9],[0.5,0.1],[0.5,0.9],[0.1,0.5],[0.9,0.5],[0.3,0.3],[0.7,0.7],[0.3,0.7],[0.7,0.3],[0.5,0.5]].forEach(function(p){var s=DL.level.snap(L,W*p[0],H*p[1]);if(s)c.push(s);});
var best=null,bd=0;
for(var i=0;i<c.length;i++)for(var j=0;j<c.length;j++){if(i===j)continue;var d=Math.hypot(c[i].x-c[j].x,c[i].y-c[j].y);if(d<bd||d<W*0.4)continue;
var t=JSON.parse(JSON.stringify(L));t.start=c[i];t.goal=c[j];if(DL.level.pathCheck(t).ok){best={start:c[i],goal:c[j]};bd=d;}}
return best||{candidates:c.length};})()`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let srv = null;
  if (!BASE) {
    const port = parseInt(process.env.DL_PORT || "8123", 10);
    srv = await serve(port);
    BASE = "http://127.0.0.1:" + port;
    note("serving " + ROOT + " on " + BASE + " (throwaway, stopped at the end)");
  }
  let b = null;
  try {
    b = await launch({ width: 390, height: 844, dpr: 1 });
    note("sections: " + SECTIONS.join(", "));

    // ===== landing + fonts + layout =====
    await openUrl(b, "?control=touch");
    report(await waitScreen(b, "landing", 10), "landing opens", String(await b.eval(screenOf)));
    await sleep(800);
    report((await b.eval("document.documentElement.scrollWidth")) <= 390, "landing: no sideways scroll at 390 wide", String(await b.eval("document.documentElement.scrollWidth")));
    report(await b.eval("document.fonts.load('600 24px Caveat').then(function(r){return r.length>0&&document.fonts.check('600 24px Caveat')})"), "font Caveat loads");
    const lp = await b.eval(PAINTED + '("landing-board")');
    report(lp.ok, "landing: the sample board is painted", JSON.stringify(lp));
    report(await b.eval("document.querySelectorAll('#s-landing .site-footer').length===1"), "landing: footer present");
    await b.shot("pc-landing.png");
    await after(b, "landing");

    // ===== every screen via the 7.4 dev shortcuts =====
    if (SECTIONS.indexOf("screens") >= 0) {
      const list = [
        ["landing", "?screen=landing", "landing"], ["lifting", "?screen=lifting", "lifting"], ["place", "?screen=place", "place"],
        ["place-placed", "?screen=place&sample=1&placed=1", "place"],
        ["play", "?screen=play&sample=1&control=touch", "play"], ["result", "?screen=result&sample=1&time=142&name=Rishi", "result"],
        ["intro", "?screen=intro&sample=1&time=142&name=Rishi", "intro"], ["friend-won", "?screen=friend-result&sample=1&time=142&name=Rishi&won=1", "friend-result"],
        ["friend-lost", "?screen=friend-result&sample=1&time=142&name=Rishi&won=0", "friend-result"],
        ["error-no-ink", "?screen=error-no-ink", "error"], ["error-bad-link", "?screen=error-bad-link", "error"]
      ];
      for (const [name, qs, want] of list) {
        await openUrl(b, qs);
        const ok = await waitScreen(b, want, 10);
        report(ok, "screen " + name + " (?" + qs.slice(1) + ")", ok ? "" : "screen is " + (await b.eval(screenOf)));
        await sleep(name === "lifting" ? 3500 : 900);
        if (name === "lifting") report(await b.eval("!document.getElementById('lift-ok').disabled"), "lifting: Looks good enabled after the lift");
        const canv = { lifting: "lift-board", place: "place-board", "place-placed": "place-board", play: "play-canvas", result: "result-board", intro: "intro-board", "friend-won": "friend-board", "friend-lost": "friend-board" }[name];
        if (canv) { const p = await b.eval(PAINTED + "(" + JSON.stringify(canv) + ")"); report(p.ok, "screen " + name + ": board canvas painted", JSON.stringify(p)); }
        if (name === "place-placed") report(await b.eval("!document.getElementById('place-ready').disabled"), "place (placed): Ready is enabled for the sample");
        if (name === "result") report(/0:14\.2/.test(await b.eval("document.getElementById('result-time').textContent")), "result: shows 0:14.2");
        if (name === "intro") report(/Rishi/.test(await b.eval("document.getElementById('intro-title').textContent")) && /0:14\.2/.test(await b.eval("document.getElementById('intro-time').textContent")), "intro: names Rishi and the time to beat 0:14.2");
        if (name === "friend-won") report(/beat/i.test(await b.eval("document.getElementById('friend-line').textContent")), "friend result (won): line says you beat", await b.eval("document.getElementById('friend-line').textContent"));
        if (name === "friend-lost") report(/still wins/i.test(await b.eval("document.getElementById('friend-line').textContent")), "friend result (lost): line says still wins", await b.eval("document.getElementById('friend-line').textContent"));
        if (name === "play") report(await b.eval("document.getElementById('play-stage').clientWidth>=380"), "play: stage fills the width", String(await b.eval("document.getElementById('play-stage').clientWidth")));
        if (name === "play") {
          const paper = await b.eval("(function(){var c=document.getElementById('play-canvas'),L=window.__level.level,lay=DL.board.layout(L,c.clientWidth,c.clientHeight,8);return Math.round(L.w*lay.scale);})()");
          report(paper >= 330, "play at 390 wide: paper at least 330 px wide (DESIGN.md checklist 2)", paper + " px");
        }
        await b.shot("pc-" + name + ".png");
        await after(b, "screen " + name);
      }
    }

    // ===== maker flow with a photo =====
    let makerLevelId = null, makerUrl = null, makerTenths = null;
    if (SECTIONS.indexOf("maker") >= 0 || SECTIONS.indexOf("link") >= 0) {
      let photo = null, photoNote = "";
      const reals = fs.existsSync(REAL) ? fs.readdirSync(REAL).filter(function (f) { return /\.(jpe?g|png|webp)$/i.test(f); }).sort() : [];
      if (reals.length) { photo = path.join(REAL, reals[0]); photoNote = "real photo " + reals[0]; }
      else {
        await openUrl(b, "?control=touch");
        const b64 = await b.eval("(function(){var im=DL.sample.photo(),c=document.createElement('canvas');c.width=im.width;c.height=im.height;c.getContext('2d').putImageData(im,0,0);return c.toDataURL('image/png').split(',')[1];})()");
        photo = path.join(OUT, "page-check-sample-photo.png"); fs.writeFileSync(photo, Buffer.from(b64, "base64"));
        photoNote = "no photos in tests/real/, so the synthetic DL.sample.photo() (NOT a real-photo test)";
      }
      note("photo: " + photoNote);
      await openUrl(b, "?control=touch&autoplay=1");
      await waitScreen(b, "landing", 10);
      const t0 = Date.now();
      await b.setFiles("#in-pick", [photo]);
      report(await waitScreen(b, "lifting", 10), "maker: photo accepted, lifting screen");
      const lifted = await b.waitFor("!document.getElementById('lift-ok').disabled", 40);
      report(lifted, "maker: clean level ready", ((Date.now() - t0) / 1000).toFixed(1) + " s incl. the 1.4 s animation");
      if (!lifted) note("error screen? " + (await b.eval("document.getElementById('err-title').textContent")));
      const info = await b.eval("(function(){var L=window.__level.level;return L?{walls:L.walls.length,fills:L.fills.length,holes:L.holes.length,ballR:L.ballR,h:L.h}:null;})()");
      report(!!info && info.walls > 0, "maker: level has walls", JSON.stringify(info));
      await b.shot("pc-maker-lifted.png");
      await b.clickEl("#lift-ok");
      report(await waitScreen(b, "place", 5), "maker: place screen");
      await sleep(400);
      const pair = await b.eval(PICK_PAIR);
      report(!!(pair && pair.start), "maker: found a free start and goal with a path", JSON.stringify(pair));
      if (pair && pair.start) {
        const ps = await b.eval(TAP_POS + "(" + JSON.stringify(pair.start) + ")");
        await b.click(ps.x, ps.y); await sleep(250);
        report(await b.eval("!!window.__level.level.start"), "maker: start placed by tapping");
        const pg = await b.eval(TAP_POS + "(" + JSON.stringify(pair.goal) + ")");
        await b.click(pg.x, pg.y); await sleep(400);
        report(await b.eval("!!window.__level.level.goal"), "maker: goal placed by tapping");
        report(await b.eval("!document.getElementById('place-ready').disabled"), "maker: Ready enabled (path check ok)");
        await b.shot("pc-maker-placed.png");
        await b.clickEl("#place-ready");
        report(await waitScreen(b, "play", 5), "maker: play screen");
        await sleep(2500);
        await b.shot("pc-maker-play.png");
        const done = await waitScreen(b, "result", 40);
        report(done, "maker: finished the level (autoplay) within 40 s", done ? "" : "screen " + (await b.eval(screenOf)) + " " + JSON.stringify(await b.eval("window.__level.lastResult && {t:window.__level.lastResult.tenths}")));
        if (done) {
          makerTenths = await b.eval("window.__level.lastResult && window.__level.lastResult.tenths");
          report(makerTenths > 0, "maker: result time exists", makerTenths != null ? (makerTenths / 10).toFixed(1) + " s" : "none");
          report(await b.eval("document.getElementById('result-time').textContent") === await b.eval("(function(t){var s=Math.floor(t/10);return Math.floor(s/60)+':'+(s%60<10?'0':'')+(s%60)+'.'+(t%10)})(" + makerTenths + ")"), "maker: result screen shows that time", await b.eval("document.getElementById('result-time').textContent"));
          // type a name
          await b.eval("document.getElementById('result-name').value=''");
          await b.clickEl("#result-name");
          await b.typeText("Rishi");
          await b.eval("document.getElementById('result-name').dispatchEvent(new Event('input',{bubbles:true}))");
          report(await b.waitFor("window.__level.linkLength>0", 10), "link: prepared before the tap");
          await sleep(900);
          makerUrl = await b.eval("window.__level.url");
          const len = makerUrl ? makerUrl.length : 0;
          note("MEASURED link length (maker flow, " + (reals.length ? "real photo " + reals[0] : "synthetic photo") + "): " + len + " characters");
          report(len > 0 && len <= 4000, "link: length within the 4000 budget", String(len));
          report(len > 0 && len <= 2000, "link: length within the 2000 aim", String(len));
          report(/^https:\/\/draw-a-level\.vercel\.app\/#L1\./.test(makerUrl || ""), "link: address shape", (makerUrl || "").slice(0, 44));
          makerLevelId = await b.eval("DL.level.id(window.__level.level)");
          await b.shot("pc-maker-result.png");
          // Dare a friend does not crash (headless has no share sheet: it falls back to copying)
          await b.clickEl("#result-dare"); await sleep(600);
          report(await b.eval("window.__level.screen==='result'"), "maker: Dare a friend tap leaves the result screen alone", await b.eval("document.getElementById('result-status').textContent"));
          // Save story
          await b.clickEl("#result-story"); await sleep(2500);
          note("save story status: " + JSON.stringify(await b.eval("document.getElementById('result-status').textContent")));
          // Play again
          await b.clickEl("#result-again");
          report(await waitScreen(b, "play", 5), "maker: Play again goes back to play");
          await b.eval("document.getElementById('play-close').click()");
          await sleep(300);
        }
      }
      await after(b, "maker flow");
    }

    // ===== the link: friend opens it =====
    if (SECTIONS.indexOf("link") >= 0 && makerUrl) {
      const local = BASE + "/?control=touch&autoplay=1" + makerUrl.slice(makerUrl.indexOf("#"));
      await b.open(local);
      await b.waitFor("document.readyState==='complete' && !!window.__level", 15);
      const here = await waitScreen(b, "intro", 10);
      report(here, "link: friend opens the link, intro screen", here ? "" : "screen " + (await b.eval(screenOf)));
      if (here) {
        const fid = await b.eval("DL.level.id(window.__level.level)");
        report(fid === makerLevelId, "link: the friend sees the same level (DL.level.id)", makerLevelId + " vs " + fid);
        const itime = await b.eval("document.getElementById('intro-time').textContent");
        report(itime.indexOf(":") > 0 && !document_hidden(await b.eval("document.getElementById('intro-tag').hidden")), "link: the time to beat is shown", itime + " (maker " + (makerTenths / 10).toFixed(1) + " s)");
        report(/Rishi/.test(await b.eval("document.getElementById('intro-title').textContent")), "link: intro names the maker");
        await b.shot("pc-friend-intro.png");
        await b.clickEl("#intro-play");
        report(await waitScreen(b, "play", 5), "link: friend taps Play");
        const fin = await waitScreen(b, "friend-result", 40);
        report(fin, "link: friend finishes (autoplay) within 40 s", fin ? "" : "screen " + (await b.eval(screenOf)));
        if (fin) {
          const line = await b.eval("document.getElementById('friend-line').textContent");
          report(/Rishi/.test(line) && /(beat|wins)/i.test(line), "link: friend result line", line);
          // name for Send it back
          await b.eval("document.getElementById('friend-name-wrap').hidden=false;var e=document.getElementById('friend-name');e.value='Sam';e.dispatchEvent(new Event('input',{bubbles:true}))");
          await sleep(900);
          const back = await b.eval("window.__level.url");
          const ft = await b.eval("window.__level.lastResult.tenths");
          const dec = await b.eval("DL.codec.decode(window.__level.url).then(function(l){return {name:l.challenge&&l.challenge.name,time:l.challenge&&l.challenge.time,id:DL.level.id(l)}})");
          report(!!back && back !== makerUrl, "link: Send it back makes a new link", back ? back.length + " chars" : "none");
          report(dec && dec.name === "Sam" && Math.abs(dec.time * 10 - ft) < 0.5, "link: the new link carries Sam and the friend's time", JSON.stringify(dec) + " friend tenths " + ft);
          report(dec && dec.id === makerLevelId, "link: the new link is the same level");
          note("MEASURED send-back link length: " + (back ? back.length : 0) + " characters");
          await b.clickEl("#friend-send"); await sleep(500);
          report(await b.eval("window.__level.screen==='friend-result'"), "link: Send it back tap does not break the screen", await b.eval("document.getElementById('friend-status').textContent"));
          await b.shot("pc-friend-result.png");
          await b.clickEl("#friend-own");
          report(await waitScreen(b, "landing", 5), "link: Draw your own level goes to the landing");
        }
      }
      await after(b, "friend link");
    }

    // the same round trip on the sample level
    if (SECTIONS.indexOf("link") >= 0) {
      await openUrl(b, "?control=touch");
      const sUrl = await b.eval("(function(){var L=DL.sample.load();L.challenge={name:'Rishi',time:14.2};return DL.codec.url(L)})()");
      note("MEASURED sample link length: " + sUrl.length + " characters");
      await b.open(BASE + "/?control=touch&autoplay=1" + sUrl.slice(sUrl.indexOf("#")));
      await b.waitFor("document.readyState==='complete' && !!window.__level", 15);
      const ok1 = await waitScreen(b, "intro", 10);
      report(ok1, "sample link: intro shows");
      if (ok1) {
        report(/0:14\.2/.test(await b.eval("document.getElementById('intro-time').textContent")), "sample link: time to beat 0:14.2");
        await b.clickEl("#intro-play");
        const fin = await waitScreen(b, "friend-result", 40);
        report(fin, "sample link: friend plays to the finish with autoplay", fin ? await b.eval("document.getElementById('friend-line').textContent") : "screen " + (await b.eval(screenOf)));
      }
      await after(b, "sample link");
    }

    // ===== sample with autoplay =====
    if (SECTIONS.indexOf("sample") >= 0) {
      await openUrl(b, "?sample=1&autoplay=1&control=touch");
      report(await waitScreen(b, "play", 8), "sample: /?sample=1&autoplay=1&control=touch opens play");
      const fin = await waitScreen(b, "result", 40);
      const t = await b.eval("window.__level.lastResult && window.__level.lastResult.tenths");
      report(fin && t > 0, "sample: reaches the finish", fin ? (t / 10).toFixed(1) + " s" : "screen " + (await b.eval(screenOf)));
      await after(b, "sample autoplay");
      // drive by real pointer drags too (the touch fallback), without autoplay
      await openUrl(b, "?sample=1&control=touch");
      await waitScreen(b, "play", 8);
      await sleep(2600);
      const before = await b.eval("(function(){var g=document.getElementById('play-timer').textContent;return g})()");
      await b.touchDrag([{ x: 195, y: 440 }, { x: 260, y: 520 }, { x: 300, y: 600 }, { x: 300, y: 640 }], 40);
      await sleep(600);
      note("touch drag: timer " + before + " -> " + (await b.eval("document.getElementById('play-timer').textContent")));
      await b.shot("pc-sample-drag.png");
      await after(b, "sample touch drag");
    }

    // ===== errors =====
    if (SECTIONS.indexOf("errors") >= 0) {
      const txt = path.join(OUT, "page-check-not-image.txt"); fs.writeFileSync(txt, "this is not a picture\n");
      await openUrl(b, "?control=touch");
      await b.setFiles("#in-pick", [txt]);
      report(await waitScreen(b, "error", 10), "errors: a .txt file shows the error screen");
      const t1 = await b.eval("document.getElementById('err-title').textContent");
      report(/photo/i.test(t1), "errors: .txt -> not-image message", t1);
      await b.shot("pc-error-not-image.png");
      b.clear();
      // blank white photo
      await openUrl(b, "?control=touch");
      const b64 = await b.eval("(function(){var c=document.createElement('canvas');c.width=900;c.height=1200;var x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,900,1200);return c.toDataURL('image/png').split(',')[1];})()");
      const white = path.join(OUT, "page-check-white.png"); fs.writeFileSync(white, Buffer.from(b64, "base64"));
      await b.setFiles("#in-pick", [white]);
      report(await waitScreen(b, "error", 30), "errors: a blank white photo shows the error screen");
      const t2 = await b.eval("document.getElementById('err-title').textContent");
      report(/find your maze/i.test(t2), "errors: blank white -> no-ink message", t2);
      await b.shot("pc-error-no-ink.png");
      b.clear();
      // bad link
      await openUrl(b, "?e=1#L1.garbage");
      const bl = await waitScreen(b, "error", 10);
      report(bl, "errors: /#L1.garbage shows the bad-link screen");
      const t3 = await b.eval("document.getElementById('err-title').textContent + ' | ' + document.getElementById('err-btn').textContent");
      report(/broken/i.test(t3) && /Draw your own level/.test(t3), "errors: bad-link words and the Draw your own level button", t3);
      await b.shot("pc-error-bad-link.png");
      await b.clickEl("#err-btn");
      report(await waitScreen(b, "landing", 5), "errors: the bad-link button goes to the landing");
      // a console.warn is expected for errors; only real errors count
      await after(b, "errors");
    }

    // ===== story =====
    if (SECTIONS.indexOf("story") >= 0) {
      await openUrl(b, "?control=touch");
      const info = await b.eval("(function(){var L=DL.sample.load();var route=DL.physics.route(L);return DL.story.image(L,{time:14.2,path:route,name:'Rishi',mode:'maker'}).then(function(bl){return createImageBitmap(bl).then(function(bm){return {type:bl.type,size:bl.size,w:bm.width,h:bm.height}})})})()");
      report(info && info.type === "image/jpeg" && info.w === 1080 && info.h === 1920, "story: DL.story.image returns a 1080x1920 JPEG", JSON.stringify(info));
      const info2 = await b.eval("(function(){var L=DL.sample.load();return DL.story.image(L,{time:12.1,path:[],name:'Rishi',mode:'friend'}).then(function(bl){return createImageBitmap(bl).then(function(bm){return {type:bl.type,w:bm.width,h:bm.height}})})})()");
      report(info2 && info2.type === "image/jpeg" && info2.w === 1080 && info2.h === 1920, "story: friend mode too", JSON.stringify(info2));
      await after(b, "story");
    }
  } catch (e) {
    report(false, "page check crashed", e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e));
  } finally {
    if (b) { try { await b.close(); } catch (e) { /* ignore */ } }
    if (srv) { try { srv.close(); } catch (e) { /* ignore */ } note("throwaway server stopped"); }
  }
  console.log(fails === 0 ? "\nPAGE CHECK: PASS" : "\nPAGE CHECK: FAIL (" + fails + ")");
  process.exit(fails === 0 ? 0 : 1);
}
function document_hidden(v) { return !!v; }
main();
