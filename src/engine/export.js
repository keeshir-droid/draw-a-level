// Image out. Follows the pattern of ../shared-kit/engine/export.js (blob from a canvas, a File, fileName), no video.
//
//   DL.export.fileName(name, date?)          -> "draw-a-level-<name>-<YYYY-MM-DD>.jpg"   (PLAN.md section 5.5)
//                                               name: lower case, a-z 0-9 and hyphens; empty -> "level"
//                                               date: a Date (default today, local time) or a "YYYY-MM-DD" string
//   DL.export.blobFromCanvas(canvas, type?, quality?) -> Promise<Blob>     JPEG 0.92 by default
//   DL.export.toFile(blob, name, date?)      -> File (named by fileName)
//   DL.export.storyFile(level, opts)         -> Promise<File>   DL.story.image(...) wrapped into a named File
//                                               opts: { time, path, name, mode } as DL.story.image takes
// Errors: "export-failed" (an Error with {code, title, detail}).
(function () {
  const DL = (globalThis.DL = globalThis.DL || {});
  const U = function () { return DL.util; };

  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function dateStr(date) {
    if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    const d = (date instanceof Date && !isNaN(date.getTime())) ? date : new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function slug(s) { // lower case, a-z 0-9 and hyphens, at most 40 characters
    s = String(s === undefined || s === null ? "" : s);
    try { s = s.normalize("NFKD").replace(/[̀-ͯ]/g, ""); } catch (e) { /* keep as is */ }
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
  }
  function fileName(name, date) {
    return "draw-a-level-" + (slug(name) || "level") + "-" + dateStr(date) + ".jpg";
  }

  function failed(e) {
    if (typeof console !== "undefined" && e) console.error(e);
    return U().error("export-failed");
  }

  async function blobFromCanvas(canvas, type, quality) {
    type = type || "image/jpeg";
    quality = quality == null ? 0.92 : quality;
    try {
      const blob = await new Promise(function (res) {
        if (canvas.toBlob) canvas.toBlob(res, type, quality);
        else if (canvas.convertToBlob) canvas.convertToBlob({ type: type, quality: quality }).then(res, function () { res(null); });
        else res(null);
      });
      if (!blob) throw new Error("toBlob gave nothing");
      return blob;
    } catch (e) {
      throw failed(e);
    }
  }

  function toFile(blob, name, date) {
    try {
      return new File([blob], fileName(name, date), { type: blob.type || "image/jpeg" });
    } catch (e) {
      throw failed(e);
    }
  }

  async function storyFile(level, opts) {
    try {
      if (!DL.story || typeof DL.story.image !== "function") throw new Error("no story");
      const blob = await DL.story.image(level, opts || {});
      if (!blob) throw new Error("no blob");
      return toFile(blob, opts && opts.name);
    } catch (e) {
      if (e && e.code) throw e;
      throw failed(e);
    }
  }

  DL.export = { fileName: fileName, blobFromCanvas: blobFromCanvas, toFile: toFile, storyFile: storyFile, _slug: slug };
})();
