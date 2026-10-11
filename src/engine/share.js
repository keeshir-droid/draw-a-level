// Share sheet and saving. Copied from ../shared-kit/engine/share.js (Day 4 Underline, from Day 3 Doodle Alive),
// namespace UL -> DL, fallback file name "draw-a-level". Added shareLink(text, url) for the level link.
//
//   DL.share.platform()             -> "ios" | "android" | "desktop"
//   DL.share.canShare(file)         -> boolean
//   DL.share.share(file)            -> Promise<"shared" | "cancelled" | "failed">          call directly inside a tap, file already made
//   DL.share.save(file)             -> Promise<"saved" | "shared" | "cancelled" | "failed">  on iPhone this opens the share sheet
//   DL.share.shareLink(text, url)   -> Promise<"shared" | "copied" | "cancelled" | "failed">
//                                      the share sheet with text + url (call directly inside the tap);
//                                      no share sheet (or it failed): copies "text url" to the clipboard -> "copied"
(function () {
  const DL = (globalThis.DL = globalThis.DL || {});

  function platform() {
    try {
      const nav = (typeof navigator !== "undefined") ? navigator : null;
      if (!nav) return "desktop";
      const ua = nav.userAgent || "";
      if (/iPad|iPhone|iPod/.test(ua)) return "ios";
      if (nav.platform === "MacIntel" && nav.maxTouchPoints > 1) return "ios"; // iPad asking for the desktop site
      if (/Android/i.test(ua)) return "android";
    } catch (e) { /* fall through */ }
    return "desktop";
  }

  function canShare(file) {
    try { return !!(file && typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: [file] })); }
    catch (e) { return false; }
  }

  function isCancel(e) { return !!e && (e.name === "AbortError" || e.code === 20); }

  // The file only: some apps drop the file when text or a link comes with it.
  async function share(file) {
    if (!canShare(file) || typeof navigator.share !== "function") return "failed";
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (e) {
      return isCancel(e) ? "cancelled" : "failed";
    }
  }

  function download(file) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url; a.download = file.name || "draw-a-level";
    a.style.display = "none";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  async function save(file) {
    // iPhone: a plain download lands in the Files app, which confuses people. The share sheet's Save Image goes to Photos.
    if (platform() === "ios" && canShare(file)) {
      const r = await share(file);
      if (r !== "failed") return r;
      // the sheet would not open (for example the tap was too long ago): fall back to a download
    }
    try { download(file); return "saved"; }
    catch (e) { return "failed"; }
  }

  // ---------- the level link ----------
  function copyOld(str) { // for browsers without the async clipboard (old WebViews): a hidden textarea + execCommand
    try {
      if (typeof document === "undefined") return false;
      const ta = document.createElement("textarea");
      ta.value = str;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed"; ta.style.top = "0"; ta.style.left = "0"; ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { ta.setSelectionRange(0, str.length); } catch (e) { /* ignore */ }
      const ok = document.execCommand && document.execCommand("copy");
      ta.remove();
      return !!ok;
    } catch (e) { return false; }
  }
  async function copyText(str) {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(str);
        return true;
      }
    } catch (e) { /* try the old way */ }
    return copyOld(str);
  }

  // Desktop browsers with a share sheet (Windows, macOS) are fine to use too; the fallback is the clipboard.
  async function shareLink(text, url) {
    text = String(text || ""); url = String(url || "");
    const nav = (typeof navigator !== "undefined") ? navigator : null;
    if (nav && typeof nav.share === "function") {
      const data = { text: text, url: url };
      let ok = true;
      try { if (nav.canShare && !nav.canShare(data)) ok = false; } catch (e) { ok = false; }
      if (ok) {
        try {
          await nav.share(data);
          return "shared";
        } catch (e) {
          if (isCancel(e)) return "cancelled";
          // not allowed (no fresh tap) or not supported: copy instead
        }
      }
    }
    const both = (text ? text + " " : "") + url;
    return (await copyText(both)) ? "copied" : "failed";
  }

  DL.share = { platform: platform, canShare: canShare, share: share, save: save, shareLink: shareLink, copyText: copyText };
})();
