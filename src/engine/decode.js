// Photo in: File -> ImageData, respecting the phone's rotation, long side capped.
// Copied from ../shared-kit/engine/decode.js (Day 4 Underline, from Day 3 Doodle Alive), namespace UL -> DL,
// maxSide default 1600 (pen mazes don't need more, and it keeps the lift under 2 s on a phone).
//
//   DL.decode.fileToImageData(file, opts?) -> Promise<ImageData>     opts.maxSide (default 1600)
//   Throws an Error with {code: "not-image" | "heic" | "unreadable", title, detail}.
(function () {
  const DL = (globalThis.DL = globalThis.DL || {});

  const DEFAULT_MAX_SIDE = 1600;

  async function decodeImage(file) {
    // 1) the modern way (respects the rotation flag), 2) without options, 3) an <img> element
    if (typeof createImageBitmap === "function") {
      try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (e) { /* next way */ }
      try { return await createImageBitmap(file); } catch (e) { /* next way */ }
    }
    if (typeof Image === "undefined" || typeof URL === "undefined") throw new Error("cannot decode here");
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    }
  }

  function looksLikeHeic(file) {
    return /heic|heif/i.test((file.type || "") + " " + (file.name || ""));
  }

  function isDefinitelyNotImage(file) {
    if (file.type) return file.type.indexOf("image/") !== 0;
    // some phones give an empty type: judge by the name
    return /\.(pdf|txt|docx?|zip|mp4|mov|mp3|html?|json)$/i.test(file.name || "");
  }

  // Draws the bitmap onto a canvas at about the wanted size, halving step by step so thin lines
  // don't get lost in one big jump.
  function drawScaled(src, sw, sh, w, h) {
    let cur = src, cw = sw, ch = sh;
    while (cw / 2 >= w && ch / 2 >= h) {
      const nw = Math.max(w, Math.floor(cw / 2)), nh = Math.max(h, Math.floor(ch / 2));
      const c = DL.util.createCanvas(nw, nh);
      const x = c.getContext("2d");
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
      x.drawImage(cur, 0, 0, nw, nh);
      cur = c; cw = nw; ch = nh;
    }
    const out = DL.util.createCanvas(w, h);
    const ctx = out.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(cur, 0, 0, w, h);
    return ctx;
  }

  async function fileToImageData(file, opts) {
    const maxSide = (opts && opts.maxSide) || DEFAULT_MAX_SIDE;
    if (!file || isDefinitelyNotImage(file)) throw DL.util.error("not-image");
    let bmp;
    try {
      bmp = await decodeImage(file);
    } catch (e) {
      throw DL.util.error(looksLikeHeic(file) ? "heic" : "unreadable");
    }
    try {
      const w0 = bmp.width || bmp.naturalWidth, h0 = bmp.height || bmp.naturalHeight;
      if (!w0 || !h0) throw new Error("empty image");
      const k = Math.min(1, maxSide / Math.max(w0, h0));
      const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
      const ctx = drawScaled(bmp, w0, h0, w, h);
      return ctx.getImageData(0, 0, w, h);
    } catch (e) {
      throw DL.util.error(looksLikeHeic(file) ? "heic" : "unreadable");
    } finally {
      if (bmp && bmp.close) bmp.close();
    }
  }

  DL.decode = { fileToImageData: fileToImageData, DEFAULT_MAX_SIDE: DEFAULT_MAX_SIDE };
})();
