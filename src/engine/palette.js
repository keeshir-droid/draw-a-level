/* Draw a Level: palette.js (art-director). DL.PALETTE, every value the board, ball, holes,
   goal, path and story need. Concept: "The Desk Toy": your page, set into a small wooden
   tilt-maze toy under glass. See DESIGN.md §4 for the why behind each number.

   Loads in Node and the browser (classic script, no document/window/navigator at load time).

   UNITS (read this first)
     L  = level units. The level is 1000 L wide (DL.LEVEL_W), its height is level.h.
          Draw at scale s = boardInnerPx / 1000, so 1 L = s px.
     r  = multiples of the level's ball radius (level.ballR, in L).
     px = CSS/canvas pixels at the final drawn size (used only for minimums).
     Angles in degrees, times in milliseconds, alphas 0..1, colours as "#rrggbb" or "rgba()".

   SHAPE
     DL.PALETTE = {
       page   { bg, card, text, text2, muted, line, accent, accentInk, brassText }   site colours (mirror design-tokens.css)
       board  { paper, paperEdge, tooth{cell,alpha,seed}, vignette{alpha,reach},
                innerShadow{color,blur,dy}, glass{alpha,angle,band,offset} }          the paper inset under glass
       frame  { width, radiusOuter, radiusInner, outerShadow{color,blur,dy}, bevelLight{color,width},
                lip{color,width}, mitre{color,alpha,width} }                          the wooden frame (L)
       wood   { base, light, dark, grain, grainAlpha, linesPer100, wobble, wavelength,
                figureAlpha, seed }                                                   wood grain recipe (L)
       screws { r, inset, light, mid, dark, slot, slotWidth, angles[4] }              brass corner screws (L)
       ink    { fallback, minContrast, alpha, minPx, raise{dy,blur,alpha,color}, pool{alpha,scale} }
       ball   { base, mid, dark, rim, rimWidth, band{color,alpha,y,h},
                highlight{x,y,r,alpha}, glint{x,y,r,alpha}, bounce{color,x,y,r,alpha},
                shadow{color,dx,dy,blur,alpha}, contact{r,alpha}, drop{fromScale,shadowGrow},
                hole{endScale,darken} }                                              all in r
       hole   { deep, wall, lip, lipAlpha, lipWidth, crescent{dy,alpha}, rim, rimWidth, halo{color,alpha,width} }   in × hole.r
       goal   { rScale, ringWidth, light, mid, dark, dish, dishShadow{color,blur,alpha},
                engrave{color,alpha,r}, gleam{alpha,ms} }                             rScale × ballR; rest × goal r
       start  { color, rScale, width, dash[], alphaPlace, alphaPlay, tick }           rScale × ballR; width/dash in L
       path   { color, widthScale, minPx, alpha, startDot, endDot }                    widthScale × ballR
       blocked{ color, alpha, r }                                                     the "can't get through" hint
       story  { w, h, bg, margin, safeTop, safeBottom, board{top,bottom,maxW}, title{...}, time{...},
                hand{...}, address{...}, tooth{...} }                                 1080×1920 layout (px)
       fonts  { serif, sans, hand, timer }                                           CSS font strings per slot
       motion { lift, drop, hole, finish, reveal, countdown, wallClickMinSpeed }      ms + easing as cubic-bezier arrays
       inkFor(hex) → hex                                                              the person's ink, made legible
     }

   Read every value from here; never hard-code a colour or size in board.js / story.js. */
(function () {
  "use strict";
  var DL = (globalThis.DL = globalThis.DL || {});

  var PAPER = "#fbf7ee";

  var P = {
    version: 1,

    // ----- site colours (mirror src/design-tokens.css) -----
    page: {
      bg: "#f6f2ea",        // family warm paper
      card: "#fffdf8",
      text: "#1c2433",
      text2: "#3a4252",
      muted: "#6c6a64",     // 4.8:1 on bg
      line: "#e6dfd1",
      accent: "#1f3a5f",    // family ink-blue
      accentInk: "#ffffff",
      brassText: "#8a5a1f"  // brass dark enough for text: 5.3:1 on bg
    },

    // ----- the paper inset (the person's page, under glass) -----
    board: {
      paper: PAPER,                 // slightly brighter than the page so the drawing pops
      paperEdge: "#efe6d3",         // where paper meets the frame (vignette end colour)
      tooth: { cell: 1.5, alpha: 0.035, seed: 7 },          // px cells of +/- luminance noise, drawn once to an offscreen canvas
      vignette: { alpha: 0.10, reach: 0.22 },               // radial darkening toward paperEdge; reach = fraction of the short side
      innerShadow: { color: "rgba(70,45,18,0.30)", blur: 14, dy: 5 }, // L; the frame's shadow falling onto the paper
      glass: { alpha: 0.055, angle: -28, band: 0.20, offset: 0.30 }   // one faint straight sheen band (fractions of board width); 0 alpha in story
    },

    // ----- the wooden frame (all L) -----
    frame: {
      width: 62,                     // frame thickness each side, in L (≈ 20 px on a 350 px board)
      radiusOuter: 34,
      radiusInner: 8,
      outerShadow: { color: "rgba(60,38,14,0.30)", blur: 30, dy: 14 },
      bevelLight: { color: "rgba(255,238,205,0.55)", width: 2.5 }, // light catching the outer top edge
      lip: { color: "#4e3219", width: 3.5 },                        // dark line where wood steps down to paper
      mitre: { color: "#6e4824", alpha: 0.35, width: 1.4 }          // the 45° corner joints
    },

    // ----- wood grain recipe (L). Draw each side as a mitred trapezoid, grain running along it -----
    wood: {
      base: "#c99a62",       // honey beech
      light: "#dcb27c",
      dark: "#a87545",
      grain: "#7d5330",
      grainAlpha: 0.30,      // per grain line, varied ×0.5..1.3 by the seeded random
      linesPer100: 22,       // grain lines per 100 L of frame width (≈ 13 across the frame); every 5th is a darker late-wood line (×1.8 alpha)
      minLinePx: 0.6,        // grain line width = max(minLinePx, 0.9 L × scale)
      wobble: 2.4,           // L, sideways drift of a grain line
      wavelength: 210,       // L, length of one drift wave
      figureAlpha: 0.08,     // broad light/dark bands (the figure) under the grain
      seed: 11
    },

    // ----- brass corner screws (L) -----
    screws: {
      r: 8.5,
      inset: 29,             // from each outer corner, along both axes (centre of the frame)
      light: "#f1d89c",
      mid: "#c4964a",
      dark: "#7a5520",
      slot: "#4d3510",
      slotWidth: 1.8,
      angles: [22, -38, 71, 8] // slot angle per corner: TL, TR, BR, BL (never all aligned; a person screwed them in)
    },

    // ----- the person's ink -----
    ink: {
      fallback: "#1d2340",   // when a level has no ink colour
      minContrast: 4.5,      // vs board.paper; inkFor() darkens lighter inks (keeps the hue) until it passes
      alpha: 0.95,           // ink is never 100% flat
      minPx: 1.8,            // never draw a wall thinner than this on screen
      raise: { dy: 1.1, blur: 1.6, alpha: 0.14, color: "rgb(60,40,20)" }, // L; a whisper of shadow: the lines are walls now
      pool: { alpha: 0.18, scale: 0.62 }  // a dot of extra ink at each stroke end, radius = width × scale
    },

    // ----- the steel ball (all × ballR; light comes from the top left, always) -----
    ball: {
      base: "#c3cad2",       // radial gradient: base at highlight side → mid → dark at the far edge
      mid: "#7f8893",
      dark: "#2f353d",
      rim: "#1f242a",
      rimWidth: 0.06,
      band: { color: "#3f464f", alpha: 0.30, y: 0.10, h: 0.34 },   // the dark horizon reflection across the middle
      highlight: { x: -0.34, y: -0.38, r: 0.30, alpha: 0.95 },     // soft white specular (radial, fades to 0)
      glint: { x: -0.30, y: -0.42, r: 0.09, alpha: 1 },            // tiny hard white core
      bounce: { color: "#f3e3c4", x: 0.22, y: 0.50, r: 0.42, alpha: 0.45 }, // warm paper light bouncing up into the underside
      shadow: { color: "rgb(52,36,16)", dx: 0.18, dy: 0.32, blur: 0.55, alpha: 0.34 }, // soft cast shadow
      contact: { r: 0.80, alpha: 0.26 },                            // tight dark contact shadow right under the ball
      drop: { fromScale: 1.6, shadowGrow: 2.2 },                    // ball starts 1.6× (near the glass), shadow 2.2× offset, then falls
      hole: { endScale: 0.55, darken: 0.85 }                        // falling in: shrink to 55% and darken by 85%
    },

    // ----- holes (× hole.r) -----
    hole: {
      deep: "#100b08",       // centre of the pit
      wall: "#3a2d22",       // inner wall near the edge
      lip: "#fff6e3",        // lit far (bottom) lip: light from the top left falls on the far wall
      lipAlpha: 0.85,
      lipWidth: 0.16,
      crescent: { dy: 0.20, alpha: 0.80 }, // dark crescent at the top: the near wall in shadow
      rim: "#6b5440",        // thin worn paper edge around the cut
      rimWidth: 0.05,
      halo: { color: "#fffaf0", alpha: 0.9, width: 0.12 }  // the cut paper edge catching light, just outside the rim
    },

    // ----- the goal: a shallow brass cup -----
    goal: {
      rScale: 1.45,          // visual outer radius = 1.55 × ballR (the ball sits inside with a ring of brass showing)
      ringWidth: 0.30,       // × goal r
      light: "#efd59a",
      mid: "#c4913f",
      dark: "#7f5a1e",
      dish: "#efe2c2",
      dishShadow: { color: "rgb(90,60,20)", blur: 0.25, alpha: 0.35 }, // × goal r, inner top shadow of the cup
      engrave: { color: "#8a6224", alpha: 0.45, r: 0.86 },             // one fine engraved circle on the ring
      gleam: { alpha: 0.75, ms: 650 }                                  // on finish: one soft light travelling round the ring
    },

    // ----- the start marker: a pencilled ink-blue circle -----
    start: {
      color: "#1f3a5f",
      rScale: 1.35,          // × ballR
      width: 3,              // L
      dash: [7, 6],          // L
      alphaPlace: 0.90,
      alphaPlay: 0.32,
      tick: 0.45             // × ballR: small cross at the centre while placing
    },

    // ----- the path line (story + maker result) -----
    path: {
      color: "#a8641e",      // burnt brass: 4.4:1 on paper, never confused with blue/black ink
      widthScale: 0.42,      // × ballR
      minPx: 3,
      alpha: 0.92,
      startDot: 0.55,        // × ballR, filled dot at the first point
      endDot: 0              // the goal ring marks the end
    },

    // ----- place screen: where the ball can't get through -----
    blocked: { color: "#a33a2b", alpha: 0.22, r: 3.2 }  // × ballR, a soft red pencil smudge

  };

  // ----- the story image, 1080×1920 (px) -----
  P.story = {
    w: 1080, h: 1920,
    bg: "#f6f2ea",
    tooth: { cell: 2, alpha: 0.04, seed: 3 },
    margin: 90,
    safeTop: 270, safeBottom: 1540,
    board: { top: 500, bottom: 1440, maxW: 900 },   // the board (frame included) fits inside this box, centred
    title: { y: 340, font: '600 64px "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif', color: "#1c2433" },
    time: { y: 458, font: '600 112px "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif', color: "#1c2433" },
    hand: { y: 1494, font: '600 50px Caveat,"Bradley Hand","Segoe Print",cursive', color: "#1f3a5f", rotate: -2 },
    address: { y: 1538, font: '500 34px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif', color: "#6c6a64" }
  };

  P.fonts = {
    serif: '"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif',
    sans: 'system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
    hand: 'Caveat,"Bradley Hand","Segoe Print",cursive',
    timer: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif' // use with font-variant-numeric: tabular-nums
  };

  // easing as cubic-bezier control points [x1,y1,x2,y2]
  P.motion = {
    ease: [0.2, 0.75, 0.25, 1],
    out: [0.16, 1, 0.3, 1],
    gravity: [0.5, 0, 0.9, 0.4],
    settle: [0.3, 1.25, 0.5, 1],   // the one overshoot we allow: the drop's single bounce and the finish settle
    lift: { wash: 500, rise: 450, settle: 450, total: 1400 },
    drop: { fall: 380, bounce: 170 },
    hole: { fall: 300, gulpHold: 550, gulpFade: 300, respawn: 220 },
    finish: { ease: 260, gleamDelay: 120, hold: 650 },
    reveal: { board: 520, time: 420, stagger: 70 },
    countdown: { step: 700 },
    wallClickMinSpeed: 120   // L/s: below this a wall touch is silent
  };

  // The person's ink colour, made legible on the paper (≥ minContrast) without changing its hue.
  P.inkFor = function (hex) {
    var c = parse(hex) || parse(P.ink.fallback);
    var paperL = lum(parse(PAPER));
    for (var i = 0; i < 40; i++) {
      var ratio = (paperL + 0.05) / (lum(c) + 0.05);
      if (ratio >= P.ink.minContrast) break;
      c = [c[0] * 0.92, c[1] * 0.92, c[2] * 0.92];
    }
    return "#" + c.map(function (v) { var s = Math.round(v).toString(16); return s.length < 2 ? "0" + s : s; }).join("");
  };
  function parse(h) {
    if (typeof h !== "string") return null;
    var m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function lum(c) {
    function ch(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2]);
  }

  DL.PALETTE = P;
})();
