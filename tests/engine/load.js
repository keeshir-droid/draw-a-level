// Loads the level engine into Node (classic scripts attaching to globalThis.DL). Used by the tests in this folder.
const path = require("path");
const ROOT = path.join(__dirname, "..", "..", "src", "engine");
["util", "decode", "lift", "vectorize", "level", "codec", "sample", "export", "share"].forEach(function (f) {
  require(path.join(ROOT, f + ".js"));
});
let failures = 0, passes = 0;
function check(name, ok, extra) {
  if (ok) { passes++; console.log("  ok   " + name + (extra ? "  (" + extra + ")" : "")); }
  else { failures++; console.log("  FAIL " + name + (extra ? "  (" + extra + ")" : "")); }
}
function done() {
  console.log("\n" + passes + " passed, " + failures + " failed");
  if (failures) process.exitCode = 1;
}
module.exports = { DL: globalThis.DL, check: check, done: done };
