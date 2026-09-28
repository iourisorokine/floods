// Canvas renderer — 3/4 view ("fake 3D").
//
// Every square is a block: a 16 x 12 top face raised by LEVEL_PX pixels per
// elevation level, with a front wall showing the soil layers. Rows are drawn
// from the back (top of the map) to the front, so nearer blocks hide what is
// behind them. Everything is drawn in logical pixels and scaled up with CSS
// `image-rendering: pixelated` for the retro look.
import { CONFIG } from "./config.ts";
import {
  idx,
  inBounds,
  heightAt,
  frontCell,
  buildBlocker,
  currentTutorial,
} from "./engine.ts";
import {
  TRACTOR,
  TRACTOR_PALETTE,
  HOUSE,
  HOUSE_PALETTE,
  TREE,
  TREE_PALETTE,
  DIGITS,
} from "./sprites.ts";
import type { Palette } from "./sprites.ts";
import type { GameState, Point, Terrain } from "./types.ts";

type Ctx = CanvasRenderingContext2D;

export const TW = CONFIG.TILE_PX; // square width
export const TD = CONFIG.TILE_DEPTH_PX; // square depth on screen
export const LH = CONFIG.LEVEL_PX; // pixels per elevation level
const FLOOR = LH; // bedrock slab drawn under the map

// ---- small helpers ---------------------------------------------------------
export function hash(x: number, y: number, k = 0): number {
  let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

export function px(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

// Pre-render sprites into offscreen canvases once
const spriteCache = new Map<string, HTMLCanvasElement>();
export function sprite(
  key: string,
  rows: string[],
  palette: Palette,
): HTMLCanvasElement {
  const cached = spriteCache.get(key);
  if (cached) return cached;
  const c = document.createElement("canvas");
  c.width = rows[0].length;
  c.height = rows.length;
  const g = c.getContext("2d")!;
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch !== "." && palette[ch]) {
        g.fillStyle = palette[ch];
        g.fillRect(x, y, 1, 1);
      }
    });
  });
  spriteCache.set(key, c);
  return c;
}

const soilColor = (h: number): string =>
  CONFIG.SOIL_COLORS[Math.min(6, Math.max(1, h))];
const BED = "#2a4f86"; // bottom of rivers and lakes
const BEDROCK = "#2b2118";

// ---- projection ------------------------------------------------------------
export interface Scene {
  /** empty space above the first row, so tall blocks and sprites fit */
  pad: number;
  width: number;
  height: number;
}

export function sceneFor(t: Terrain): Scene {
  const maxBase = Math.max(0, ...t.base);
  const pad = (maxBase + CONFIG.MAX_TUBES_PER_SQUARE) * LH + 10;
  return { pad, width: t.w * TW, height: pad + t.h * TD + FLOOR };
}

/** y of the top edge of a square's top face, for a given height */
export const topY = (sc: Scene, y: number, height: number): number =>
  sc.pad + y * TD - height * LH;

// ---- terrain blocks ----------------------------------------------------------
function drawBlock(
  ctx: Ctx,
  sc: Scene,
  t: Terrain,
  x: number,
  y: number,
): void {
  const b = t.base[idx(t, x, y)];
  const X = x * TW;
  const Yt = topY(sc, y, b);
  const at = (xx: number, yy: number) =>
    inBounds(t, xx, yy) ? t.base[idx(t, xx, yy)] : -1;

  // front wall: one soil layer per level, then bedrock down to the floor
  const wallTop = Yt + TD;
  for (let k = 0; k < b; k++) {
    const level = b - k;
    const Y = wallTop + k * LH;
    px(ctx, X, Y, TW, LH, shade(soilColor(level), 0.62));
    px(ctx, X, Y + LH - 1, TW, 1, shade(soilColor(level), 0.48));
    // a few pebbles in the wall
    if (hash(x, y, 90 + k) < 0.6)
      px(
        ctx,
        X + Math.floor(hash(x, y, 70 + k) * 14) + 1,
        Y + 1,
        1,
        1,
        shade(soilColor(level), 0.8),
      );
  }
  const rockTop = wallTop + b * LH;
  px(ctx, X, rockTop, TW, sc.pad + (y + 1) * TD + FLOOR - rockTop, BEDROCK);

  // top face
  if (b === 0) {
    px(ctx, X, Yt, TW, TD, BED);
    return;
  }
  const col = soilColor(b);
  px(ctx, X, Yt, TW, TD, col);
  for (let k = 0; k < 6; k++) {
    const sx = Math.floor(hash(x, y, k) * (TW - 2)) + 1;
    const sy = Math.floor(hash(x, y, k + 20) * (TD - 3)) + 2;
    if (b <= 2) {
      px(ctx, X + sx, Yt + sy, 1, 1, shade(col, k % 2 ? 0.78 : 1.22));
    } else {
      px(ctx, X + sx, Yt + sy, 1, 2, shade(col, 0.8));
      px(ctx, X + sx + 1, Yt + sy - 1, 1, 2, shade(col, 1.18));
    }
  }
  // edges that suggest volume
  px(ctx, X, Yt + TD - 1, TW, 1, shade(col, 1.12)); // front lip
  if (at(x, y - 1) > b)
    px(ctx, X, Yt, TW, 2, "rgba(0,0,0,0.25)"); // shadow of a higher block behind
  else px(ctx, X, Yt, TW, 1, shade(col, 1.18)); // back edge catches the light
  if (at(x - 1, y) > b) px(ctx, X, Yt, 2, TD, "rgba(0,0,0,0.2)");
  else if (at(x - 1, y) < b) px(ctx, X, Yt, 1, TD, shade(col, 1.2));
  if (at(x + 1, y) < b) px(ctx, X + TW - 1, Yt, 1, TD, shade(col, 0.7));
}

// ---- roads (flat, on the top face) --------------------------------------------
function drawRoad(ctx: Ctx, sc: Scene, t: Terrain, x: number, y: number): void {
  const isRoad = (xx: number, yy: number) =>
    inBounds(t, xx, yy) && t.objects[idx(t, xx, yy)] === "road";
  if (!isRoad(x, y)) return;
  const X = x * TW;
  const Y = topY(sc, y, t.base[idx(t, x, y)]);
  const L = isRoad(x - 1, y),
    R = isRoad(x + 1, y),
    U = isRoad(x, y - 1),
    D = isRoad(x, y + 1);
  const asphalt = "#565b63",
    edge = "#3b3f45",
    dash = "#e7c94a";
  // horizontal band: rows 3..8, vertical band: columns 3..12
  const horiz = L || R || !(U || D);
  px(ctx, X + 3, Y + 3, 10, 6, asphalt);
  if (horiz)
    px(ctx, X + (L ? 0 : 3), Y + 3, (L ? 3 : 0) + 10 + (R ? 3 : 0), 6, asphalt);
  if (U) px(ctx, X + 3, Y, 10, 3, asphalt);
  if (D) px(ctx, X + 3, Y + 9, 10, 3, asphalt);
  if (!U)
    px(ctx, X + (L ? 0 : 3), Y + 3, (L ? 3 : 0) + 10 + (R ? 3 : 0), 1, edge);
  if (!D)
    px(ctx, X + (L ? 0 : 3), Y + 8, (L ? 3 : 0) + 10 + (R ? 3 : 0), 1, edge);
  if (!L)
    px(ctx, X + 3, Y + (U ? 0 : 3), 1, (U ? 3 : 0) + 6 + (D ? 3 : 0), edge);
  if (!R)
    px(ctx, X + 12, Y + (U ? 0 : 3), 1, (U ? 3 : 0) + 6 + (D ? 3 : 0), edge);
  if (L || R) {
    if (L) px(ctx, X, Y + 6, 2, 1, dash);
    px(ctx, X + 6, Y + 6, 4, 1, dash);
    if (R) px(ctx, X + 14, Y + 6, 2, 1, dash);
  } else if (U || D) {
    if (U) px(ctx, X + 7, Y, 1, 2, dash);
    px(ctx, X + 7, Y + 4, 1, 3, dash);
    if (D) px(ctx, X + 7, Y + 10, 1, 2, dash);
  }
}

// ---- tubes -------------------------------------------------------------------
// A tube piece is rendered once per shape from a tiny height field: every
// point of the square closer than R to the tube's centre line is lifted with a
// round profile, then drawn back to front. Joining the centre to the edges of
// the connected sides gives straight pieces, ends, rounded elbows, T and cross
// junctions from the same code. Pieces are cached per connection mask.
export const TUBE_N = 1,
  TUBE_E = 2,
  TUBE_S = 4,
  TUBE_W = 8;
const TUBE_R = 5.3; // radius on the ground, in pixels
const TUBE_H = LH + 1; // height of one tube, in pixels
const TUBE_TOP = TUBE_H + 2; // rows above the ground plane in the sprite
const TUBE_COLORS = {
  OUT: "#5d6376",
  DARK: "#9aa2b4",
  SHADE: "#c3c9d6",
  BODY: "#eef1f6",
  HI: "#ffffff",
  STRAP: "#aeb5c5",
};

const tubeCache = new Map<number, HTMLCanvasElement>();
export function tubePiece(mask: number): HTMLCanvasElement {
  const cached = tubeCache.get(mask);
  if (cached) return cached;
  const W = TW;
  const H = TUBE_TOP + TD + 1;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;

  // centre line: from the middle to each connected edge (a bit beyond, so the
  // cut at the edge is flat); a lone tube is a short capsule
  const segs: [number, number, number, number][] = [];
  if (mask & TUBE_N) segs.push([8, 8, 8, -2]);
  if (mask & TUBE_E) segs.push([8, 8, 18, 8]);
  if (mask & TUBE_S) segs.push([8, 8, 8, 18]);
  if (mask & TUBE_W) segs.push([8, 8, -2, 8]);
  if (!segs.length) segs.push([3.5, 8, 12.5, 8]);

  const srcV = new Array<number>(W * H).fill(-1); // which ground row painted each pixel
  const srcU = new Array<number>(W * H).fill(-1);
  const color = new Array<string | null>(W * H).fill(null);
  const scale = TD / 16;
  for (let v = 0; v < 16; v++) {
    for (let u = 0; u < 16; u++) {
      const pxu = u + 0.5,
        pxv = v + 0.5;
      // nearest point on the centre line
      let best = Infinity,
        nx = 0,
        ny = 0,
        along = -1,
        hub = false;
      for (const [ax, ay, bx, by] of segs) {
        const dx = bx - ax,
          dy = by - ay;
        const len2 = dx * dx + dy * dy;
        const tt = Math.max(
          0,
          Math.min(1, ((pxu - ax) * dx + (pxv - ay) * dy) / len2),
        );
        const qx = ax + tt * dx,
          qy = ay + tt * dy;
        const d = Math.hypot(pxu - qx, pxv - qy);
        if (d < best) {
          best = d;
          nx = d ? (pxu - qx) / d : 0;
          ny = d ? (pxv - qy) / d : 0;
          along = dx !== 0 ? qx : qy;
          hub = tt < 0.25 && segs.length > 1;
        }
      }
      if (best >= TUBE_R) continue;
      const k = best / TUBE_R;
      const hgt = TUBE_H * Math.sqrt(1 - k * k);
      // light from the back-left, top of the tube brightest
      const light = (1 - k) * 0.75 + (-nx * 0.35 - ny * 0.55) * k + 0.25;
      let top =
        k > 0.93
          ? TUBE_COLORS.OUT
          : light > 0.85
            ? TUBE_COLORS.HI
            : light > 0.55
              ? TUBE_COLORS.BODY
              : light > 0.3
                ? TUBE_COLORS.SHADE
                : TUBE_COLORS.DARK;
      // the front half faces away from the light
      if (ny > 0.35 && k > 0.55 && top !== TUBE_COLORS.OUT)
        top = k > 0.8 ? TUBE_COLORS.DARK : TUBE_COLORS.SHADE;
      // straps every 8 px along the tube (on the top of the tube only)
      if (!hub && k < 0.55 && Math.abs((((along % 8) + 8) % 8) - 4) < 0.6)
        top = TUBE_COLORS.STRAP;
      const ground = TUBE_TOP + (v + 0.5) * scale;
      const y0 = Math.round(ground - hgt);
      const y1 = Math.round(ground);
      for (let yy = y0; yy <= y1; yy++) {
        if (yy < 0 || yy >= H) continue;
        const p = yy * W + u;
        color[p] =
          yy === y0 ? top : k > 0.93 ? TUBE_COLORS.OUT : TUBE_COLORS.DARK;
        srcV[p] = v;
        srcU[p] = u;
      }
    }
  }
  // fill single-pixel holes left by the projection
  for (let yy = 1; yy < H - 1; yy++) {
    for (let x = 0; x < W; x++) {
      const p = yy * W + x;
      if (color[p]) continue;
      const above = color[p - W],
        below = color[p + W];
      const left = x > 0 ? color[p - 1] : null,
        right = x < W - 1 ? color[p + 1] : null;
      if (above && below) {
        color[p] = below;
        srcV[p] = srcV[p + W];
        srcU[p] = srcU[p + W];
      } else if (left && right) {
        color[p] = left;
        srcV[p] = srcV[p - 1];
        srcU[p] = srcU[p - 1];
      }
    }
  }
  // silhouette outline, except where the tube continues into the next square
  const out = color.slice();
  for (let yy = 0; yy < H; yy++) {
    for (let x = 0; x < W; x++) {
      const p = yy * W + x;
      if (!color[p]) continue;
      const open = (xx: number, y2: number) =>
        xx >= 0 && y2 >= 0 && xx < W && y2 < H && !color[y2 * W + xx];
      const up = open(x, yy - 1) && !(mask & TUBE_N && srcV[p] < 3);
      const down = open(x, yy + 1) && !(mask & TUBE_S && srcV[p] > 12);
      const left = open(x - 1, yy) && !(mask & TUBE_W && srcU[p] < 1);
      const right = open(x + 1, yy) && !(mask & TUBE_E && srcU[p] > 14);
      if (up || down || left || right) out[p] = TUBE_COLORS.OUT;
    }
  }
  out.forEach((col, p) => {
    if (!col) return;
    g.fillStyle = col;
    g.fillRect(p % W, Math.floor(p / W), 1, 1);
  });
  tubeCache.set(mask, c);
  return c;
}

function tubeMask(t: Terrain, x: number, y: number, layer: number): number {
  const has = (xx: number, yy: number) =>
    inBounds(t, xx, yy) && t.tubes[idx(t, xx, yy)] > layer;
  return (
    (has(x, y - 1) ? TUBE_N : 0) |
    (has(x + 1, y) ? TUBE_E : 0) |
    (has(x, y + 1) ? TUBE_S : 0) |
    (has(x - 1, y) ? TUBE_W : 0)
  );
}

/** Draws a tube piece whose bottom sits at `height` on square row `y` */
export function drawTubePiece(
  ctx: Ctx,
  sc: Scene,
  x: number,
  y: number,
  height: number,
  mask: number,
): void {
  ctx.drawImage(tubePiece(mask), x * TW, topY(sc, y, height) - TUBE_TOP);
}

function drawTubes(
  ctx: Ctx,
  sc: Scene,
  t: Terrain,
  x: number,
  y: number,
): void {
  const n = t.tubes[idx(t, x, y)];
  const b = t.base[idx(t, x, y)];
  for (let k = 0; k < n; k++)
    drawTubePiece(ctx, sc, x, y, b + k, tubeMask(t, x, y, k));
}

// ---- houses & trees ------------------------------------------------------------
function drawObject(
  ctx: Ctx,
  sc: Scene,
  t: Terrain,
  x: number,
  y: number,
): void {
  const o = t.objects[idx(t, x, y)];
  if (o !== "house" && o !== "tree") return;
  const img =
    o === "house"
      ? sprite("house", HOUSE, HOUSE_PALETTE)
      : sprite("tree", TREE, TREE_PALETTE);
  const Yfront = topY(sc, y, heightAt(t, x, y)) + TD;
  ctx.drawImage(img, x * TW, Yfront - img.height + (o === "tree" ? 2 : 1));
}

// ---- water ---------------------------------------------------------------------
function drawWaterAt(
  ctx: Ctx,
  sc: Scene,
  t: Terrain,
  x: number,
  y: number,
  time: number,
): void {
  const i = idx(t, x, y);
  if (!t.water[i]) return;
  const hT = heightAt(t, x, y);
  const wl = Math.max(t.waterLevel, hT);
  const X = x * TW;
  const Ys = topY(sc, y, wl);
  const depth = wl - hT;
  // one colour for the whole water surface; shallow water lets the ground show through
  const col = CONFIG.WATER_COLORS[1];
  const isSea = t.base[i] === 0;
  let a = isSea ? 0.95 : Math.min(0.92, 0.62 + depth * 0.15);
  if (t.floodedAt[i] >= 0) a *= Math.min(1, (t.clock - t.floodedAt[i]) / 350);
  ctx.globalAlpha = a;
  px(ctx, X, Ys, TW, TD, col);
  // front face of the water, when nothing stands in front of it
  const southDry =
    !inBounds(t, x, y + 1) ||
    (!t.water[idx(t, x, y + 1)] && heightAt(t, x, y + 1) < wl);
  if (southDry && depth > 0)
    px(ctx, X, Ys + TD, TW, depth * LH, shade(col, 0.75));
  // moving wave glints
  for (let k = 0; k < 2; k++) {
    const wy = Math.floor(hash(x, y, k + 40) * (TD - 3)) + 1;
    const wx = Math.floor(
      (hash(x, y, k + 60) * 16 + time / (260 + k * 90)) % 16,
    );
    px(ctx, X + wx, Ys + wy, Math.min(4, 16 - wx), 1, "rgba(210,235,255,0.55)");
  }
  // foam where the water touches dry land
  const dry = (xx: number, yy: number) =>
    inBounds(t, xx, yy) && !t.water[idx(t, xx, yy)];
  const flick = Math.floor(time / 300 + x + y) % 2;
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  if (dry(x, y - 1))
    for (let k = flick; k < TW; k += 3) ctx.fillRect(X + k, Ys, 2, 1);
  if (dry(x, y + 1))
    for (let k = flick; k < TW; k += 3) ctx.fillRect(X + k, Ys + TD - 1, 2, 1);
  if (dry(x - 1, y))
    for (let k = flick; k < TD; k += 3) ctx.fillRect(X, Ys + k, 1, 2);
  if (dry(x + 1, y))
    for (let k = flick; k < TD; k += 3) ctx.fillRect(X + TW - 1, Ys + k, 1, 2);
  ctx.globalAlpha = 1;
  // lost object: blinking bubbles
  if (t.lost[i] && Math.floor(time / 400) % 2) {
    px(ctx, X + 4, Ys + 3, 2, 2, "#dff3ff");
    px(ctx, X + 9, Ys + 6, 2, 2, "#dff3ff");
    px(ctx, X + 6, Ys + 9, 1, 1, "#dff3ff");
  }
}

// ---- the whole scene -------------------------------------------------------------
export interface SceneHooks {
  /** drawn on the top face of a square, before objects (roads, paths...) */
  surface?: (x: number, y: number) => void;
  /** drawn after the water of a square (bridges...) */
  overWater?: (x: number, y: number) => void;
  /** drawn after a whole row, e.g. moving sprites standing in that row */
  afterRow?: (y: number) => void;
}

export function drawScene(
  ctx: Ctx,
  sc: Scene,
  t: Terrain,
  time: number,
  hooks: SceneHooks = {},
): void {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, sc.width, sc.height);
  for (let y = 0; y < t.h; y++) {
    for (let x = 0; x < t.w; x++) drawBlock(ctx, sc, t, x, y);
    for (let x = 0; x < t.w; x++) {
      drawRoad(ctx, sc, t, x, y);
      hooks.surface?.(x, y);
    }
    for (let x = 0; x < t.w; x++) {
      drawTubes(ctx, sc, t, x, y);
      drawObject(ctx, sc, t, x, y);
    }
    for (let x = 0; x < t.w; x++) {
      drawWaterAt(ctx, sc, t, x, y, time);
      hooks.overWater?.(x, y);
    }
    hooks.afterRow?.(y);
  }
}

// ---- game-only layers -----------------------------------------------------------------
function frame(ctx: Ctx, X: number, Y: number, color: string, L = 4): void {
  px(ctx, X, Y, L, 1, color);
  px(ctx, X, Y, 1, L, color);
  px(ctx, X + TW - L, Y, L, 1, color);
  px(ctx, X + TW - 1, Y, 1, L, color);
  px(ctx, X, Y + TD - 1, L, 1, color);
  px(ctx, X, Y + TD - L, 1, L, color);
  px(ctx, X + TW - L, Y + TD - 1, L, 1, color);
  px(ctx, X + TW - 1, Y + TD - L, 1, L, color);
}

// Tutorial hint squares (pulsing yellow frame) — hidden once a tube is there
function drawMarks(ctx: Ctx, sc: Scene, s: GameState, time: number): void {
  const step = currentTutorial(s);
  if (!step?.mark || s.phase === "done") return;
  const pulse = Math.floor(time / 200) % 2;
  for (const [x, y] of step.mark) {
    if (!inBounds(s, x, y) || s.tubes[idx(s, x, y)] > 0) continue;
    const X = x * TW,
      Y = topY(sc, y, heightAt(s, x, y));
    ctx.globalAlpha = pulse ? 0.9 : 0.45;
    ctx.fillStyle = "#ffd23f";
    ctx.fillRect(X, Y, TW, 2);
    ctx.fillRect(X, Y + TD - 2, TW, 2);
    ctx.fillRect(X, Y, 2, TD);
    ctx.fillRect(X + TW - 2, Y, 2, TD);
    ctx.globalAlpha = pulse ? 0.25 : 0.1;
    ctx.fillRect(X + 2, Y + 2, TW - 4, TD - 4);
    ctx.globalAlpha = 1;
  }
}

// Build / remove: ghost tube and progress bar above the target square
function drawAction(ctx: Ctx, sc: Scene, s: GameState, time: number): void {
  const a = s.action;
  if (!a) return;
  const h = heightAt(s, a.x, a.y);
  const X = a.x * TW;
  const Y = topY(sc, a.y, h);
  const p = Math.min(1, a.elapsed / a.total);
  if (a.type === "build" && Math.floor(time / 150) % 2) {
    ctx.globalAlpha = 0.55;
    drawTubePiece(ctx, sc, a.x, a.y, h, 0);
    ctx.globalAlpha = 1;
  }
  const by = Y - TUBE_H - 7;
  px(ctx, X + 1, by, TW - 2, 4, "#000000");
  px(
    ctx,
    X + 2,
    by + 1,
    Math.round((TW - 4) * p),
    2,
    a.type === "build" ? "#7CFC5A" : "#ff9f43",
  );
}

function drawCursor(ctx: Ctx, sc: Scene, s: GameState, time: number): void {
  if (s.phase === "done" || s.phase === "intro" || s.tractor.stuck || s.action)
    return;
  const { x, y } = frontCell(s);
  if (!inBounds(s, x, y)) return;
  if (Math.floor(time / 250) % 3 === 0) return; // blink
  const ok = !buildBlocker(s);
  frame(
    ctx,
    x * TW,
    topY(sc, y, heightAt(s, x, y)),
    ok ? "#ffffff" : "#ff4d4d",
  );
}

// Height of the ground under a moving tractor (smooth between squares)
function groundUnder(s: GameState, pos: Point): number {
  const x0 = Math.floor(pos.x),
    y0 = Math.floor(pos.y);
  const x1 = Math.min(s.w - 1, x0 + 1),
    y1 = Math.min(s.h - 1, y0 + 1);
  const fx = pos.x - x0,
    fy = pos.y - y0;
  const h = (x: number, y: number) => heightAt(s, x, y);
  const top = h(x0, y0) * (1 - fx) + h(x1, y0) * fx;
  const bottom = h(x0, y1) * (1 - fx) + h(x1, y1) * fx;
  return top * (1 - fy) + bottom * fy;
}

export function drawTractorAt(
  ctx: Ctx,
  sc: Scene,
  dir: GameState["tractor"]["dir"],
  pos: Point,
  height: number,
): void {
  const img = sprite("tractor-" + dir, TRACTOR[dir], TRACTOR_PALETTE);
  const X = Math.round(pos.x * TW);
  const Yfront = Math.round(sc.pad + pos.y * TD - height * LH + TD);
  ctx.drawImage(img, X, Yfront - img.height + 2);
}

function drawTractor(
  ctx: Ctx,
  sc: Scene,
  s: GameState,
  pos: Point,
  time: number,
): void {
  const height = groundUnder(s, pos);
  drawTractorAt(ctx, sc, s.tractor.dir, pos, height);
  if (s.tractor.stuck) {
    const X = Math.round(pos.x * TW);
    const Y = topY(sc, pos.y, s.waterLevel);
    ctx.globalAlpha = 0.6;
    px(ctx, X, Y, TW, TD, CONFIG.WATER_COLORS[1]);
    ctx.globalAlpha = 1;
    if (Math.floor(time / 300) % 2) px(ctx, X + 7, Y - 4, 2, 2, "#dff3ff");
  }
}

function drawHeights(ctx: Ctx, sc: Scene, s: Terrain): void {
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const d = DIGITS[heightAt(s, x, y)] ?? DIGITS[9];
      const X = x * TW + 1,
        Y = topY(sc, y, heightAt(s, x, y)) + 1;
      px(ctx, X - 1, Y - 1, 5, 7, "rgba(0,0,0,0.6)");
      d.forEach((row, ry) =>
        [...row].forEach((c, rx) => {
          if (c === "1") px(ctx, X + rx, Y + ry, 1, 1, "#ffffff");
        }),
      );
    }
  }
}

export interface RenderView {
  time: number;
  tractorPos: Point;
  showHeights: boolean;
}

export function render(
  ctx: Ctx,
  sc: Scene,
  s: GameState,
  view: RenderView,
): void {
  const { time, tractorPos, showHeights } = view;
  // the tractor is drawn with the row it is moving into, so blocks in front hide it
  const tractorRow = Math.min(s.h - 1, Math.ceil(tractorPos.y - 0.001));
  drawScene(ctx, sc, s, time, {
    afterRow: (y) => {
      if (y === tractorRow) drawTractor(ctx, sc, s, tractorPos, time);
    },
  });
  drawMarks(ctx, sc, s, time);
  drawCursor(ctx, sc, s, time);
  drawAction(ctx, sc, s, time);
  if (showHeights) drawHeights(ctx, sc, s);
}
