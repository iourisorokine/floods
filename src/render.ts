// Canvas renderer — everything is drawn in logical pixels (TILE_PX per square)
// and scaled up with CSS `image-rendering: pixelated` for the retro look.
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
  TRACTOR_RIGHT,
  TRACTOR_PALETTE,
  HOUSE,
  HOUSE_PALETTE,
  TREE,
  TREE_PALETTE,
  orient,
  DIGITS,
} from "./sprites.ts";
import type { Palette } from "./sprites.ts";
import type { GameState, Point, Terrain } from "./types.ts";

type Ctx = CanvasRenderingContext2D;

const T = CONFIG.TILE_PX;

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

// ---- layers ----------------------------------------------------------------
export function drawSoil(ctx: Ctx, s: Terrain): void {
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const b = s.base[idx(s, x, y)];
      const X = x * T,
        Y = y * T;
      if (b === 0) {
        px(ctx, X, Y, T, T, "#1f4f9a");
        continue;
      }
      const col = soilColor(b);
      px(ctx, X, Y, T, T, col);
      // texture: pebbles for soil, grass tufts for grass
      const n = 7;
      for (let k = 0; k < n; k++) {
        const sx = Math.floor(hash(x, y, k) * (T - 2)) + 1;
        const sy = Math.floor(hash(x, y, k + 20) * (T - 2)) + 1;
        if (b <= 2) {
          px(ctx, X + sx, Y + sy, 1, 1, shade(col, k % 2 ? 0.78 : 1.22));
        } else {
          px(ctx, X + sx, Y + sy, 1, 2, shade(col, 0.8));
          px(ctx, X + sx + 1, Y + sy - 1, 1, 2, shade(col, 1.18));
        }
      }
    }
  }
}

export function drawRelief(ctx: Ctx, s: Terrain): void {
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const b = s.base[idx(s, x, y)];
      if (b === 0) continue;
      const X = x * T,
        Y = y * T;
      const col = soilColor(b);
      const at = (xx: number, yy: number) =>
        inBounds(s, xx, yy) ? s.base[idx(s, xx, yy)] : b;
      // cliff face towards a lower square below
      if (at(x, y + 1) < b) px(ctx, X, Y + T - 2, T, 2, shade(col, 0.6));
      // right edge darker towards lower square on the right
      if (at(x + 1, y) < b) px(ctx, X + T - 1, Y, 1, T, shade(col, 0.72));
      // highlight on left edge when higher than left neighbour
      if (at(x - 1, y) < b) px(ctx, X, Y, 1, T, shade(col, 1.2));
      // shadows cast by higher neighbours above / left
      if (at(x, y - 1) > b) px(ctx, X, Y, T, 2, "rgba(0,0,0,0.28)");
      if (at(x - 1, y) > b) px(ctx, X, Y, 2, T, "rgba(0,0,0,0.2)");
    }
  }
}

function drawRoads(ctx: Ctx, s: Terrain): void {
  const isRoad = (x: number, y: number) =>
    inBounds(s, x, y) && s.objects[idx(s, x, y)] === "road";
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      if (!isRoad(x, y)) continue;
      const X = x * T,
        Y = y * T;
      const L = isRoad(x - 1, y),
        R = isRoad(x + 1, y),
        U = isRoad(x, y - 1),
        D = isRoad(x, y + 1);
      const horiz = L || R || !(U || D);
      const vert = U || D;
      const asphalt = "#565b63",
        edge = "#3b3f45",
        dash = "#e7c94a";
      // centre block
      px(ctx, X + 3, Y + 3, 10, 10, asphalt);
      if (horiz) {
        px(
          ctx,
          X + (L ? 0 : 3),
          Y + 3,
          (L ? 3 : 0) + 10 + (R ? 3 : 0),
          10,
          asphalt,
        );
      }
      if (vert) {
        px(
          ctx,
          X + 3,
          Y + (U ? 0 : 3),
          10,
          (U ? 3 : 0) + 10 + (D ? 3 : 0),
          asphalt,
        );
      }
      // edges
      if (!U) px(ctx, X + 3, Y + 3, 10, 1, edge);
      if (!D) px(ctx, X + 3, Y + 12, 10, 1, edge);
      if (!L) px(ctx, X + 3, Y + 3, 1, 10, edge);
      if (!R) px(ctx, X + 12, Y + 3, 1, 10, edge);
      // dashes
      if (L || R) {
        if (L) px(ctx, X, Y + 7, 2, 1, dash);
        px(ctx, X + 6, Y + 7, 4, 1, dash);
        if (R) px(ctx, X + 14, Y + 7, 2, 1, dash);
      }
      if ((U || D) && !(L || R)) {
        if (U) px(ctx, X + 7, Y, 1, 2, dash);
        px(ctx, X + 7, Y + 6, 1, 4, dash);
        if (D) px(ctx, X + 7, Y + 14, 1, 2, dash);
      }
    }
  }
}

// White tube (flood barrier). Stacked tubes are drawn higher on screen.
// A tube segment is drawn along a "u" axis (its length) and a "v" axis (its
// thickness); for vertical tubes the two axes are swapped.
const TUBE = {
  OUT: "#5d6376",
  BODY: "#f4f6fa",
  SHADE: "#c3c9d6",
  HI: "#ffffff",
  STRAP: "#9aa2b4",
};
const TUBE_THICK = 8;

type Put = (u: number, v: number, w: number, h: number, color: string) => void;

function tubeSegment(
  put: Put,
  len: number,
  capA: boolean,
  capB: boolean,
): void {
  const { OUT, BODY, SHADE, HI, STRAP } = TUBE;
  const t = TUBE_THICK;
  const a = capA ? 1 : 0; // first column inside rounded cap
  const b = capB ? len - 1 : len;
  // outline top/bottom
  put(a, 0, b - a, 1, OUT);
  put(a, t - 1, b - a, 1, OUT);
  // caps
  if (capA) put(0, 1, 1, t - 2, OUT);
  if (capB) put(len - 1, 1, 1, t - 2, OUT);
  // body with shading
  put(a, 1, b - a, t - 2, BODY);
  put(a, t - 3, b - a, 2, SHADE);
  put(a + (capA ? 1 : 0), 1, b - a - (capA ? 1 : 0) - (capB ? 1 : 0), 1, HI);
  if (capA) put(1, 2, 1, t - 4, SHADE);
  if (capB) put(len - 2, 2, 1, t - 4, SHADE);
  // straps
  for (const u of [4, 11]) if (u > a && u < b - 1) put(u, 1, 1, t - 2, STRAP);
}

export function drawTubes(ctx: Ctx, s: Terrain): void {
  const tubes = (x: number, y: number): number =>
    inBounds(s, x, y) ? s.tubes[idx(s, x, y)] : 0;
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const n = tubes(x, y);
      if (!n) continue;
      const X = x * T,
        Y = y * T;
      const hasH = tubes(x - 1, y) || tubes(x + 1, y);
      const hasV = tubes(x, y - 1) || tubes(x, y + 1);
      const vertical = hasV && !hasH;
      // ground shadow
      if (vertical)
        px(ctx, X + 5, Y + 2, TUBE_THICK, T - 2, "rgba(0,0,0,0.25)");
      else px(ctx, X + 1, Y + 7, T - 1, TUBE_THICK - 1, "rgba(0,0,0,0.25)");
      for (let k = 0; k < n; k++) {
        const off = k * 3; // stacked tubes appear higher
        if (!vertical) {
          const cl = tubes(x - 1, y) > k,
            cr = tubes(x + 1, y) > k;
          const x0 = X + (cl ? 0 : 1);
          const y0 = Y + 5 - off;
          const L = T - (cl ? 0 : 1) - (cr ? 0 : 1);
          tubeSegment(
            (u, v, w, h, c) => px(ctx, x0 + u, y0 + v, w, h, c),
            L,
            !cl,
            !cr,
          );
        } else {
          const cu = tubes(x, y - 1) > k,
            cd = tubes(x, y + 1) > k;
          const y0 = Y - off + (cu ? 0 : 1);
          const L = T - (cu ? 0 : 1) - (cd ? 0 : 1);
          const x0 = X + 4;
          tubeSegment(
            (u, v, w, h, c) => px(ctx, x0 + v, y0 + u, h, w, c),
            L,
            !cu,
            !cd,
          );
        }
      }
    }
  }
}

export function drawHouses(ctx: Ctx, s: Terrain): void {
  const house = sprite("house", HOUSE, HOUSE_PALETTE);
  const tree = sprite("tree", TREE, TREE_PALETTE);
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const o = s.objects[idx(s, x, y)];
      if (o === "house") ctx.drawImage(house, x * T, y * T);
      if (o === "tree") ctx.drawImage(tree, x * T, y * T);
    }
  }
}

// Tutorial hint squares (pulsing yellow frame) — hidden once a tube is there
function drawMarks(ctx: Ctx, s: GameState, time: number): void {
  const step = currentTutorial(s);
  if (!step?.mark || s.phase === "done") return;
  const pulse = Math.floor(time / 200) % 2;
  for (const [x, y] of step.mark) {
    if (!inBounds(s, x, y) || s.tubes[idx(s, x, y)] > 0) continue;
    const X = x * T,
      Y = y * T;
    ctx.globalAlpha = pulse ? 0.9 : 0.45;
    ctx.fillStyle = "#ffd23f";
    ctx.fillRect(X, Y, T, 2);
    ctx.fillRect(X, Y + T - 2, T, 2);
    ctx.fillRect(X, Y, 2, T);
    ctx.fillRect(X + T - 2, Y, 2, T);
    ctx.globalAlpha = pulse ? 0.25 : 0.1;
    ctx.fillRect(X + 2, Y + 2, T - 4, T - 4);
    ctx.globalAlpha = 1;
  }
}

// Build / remove progress bar above the target square
function drawAction(ctx: Ctx, s: GameState, time: number): void {
  const a = s.action;
  if (!a) return;
  const X = a.x * T,
    Y = a.y * T;
  const p = Math.min(1, a.elapsed / a.total);
  // ghost tube blinking on the target square
  if (a.type === "build" && Math.floor(time / 150) % 2) {
    ctx.globalAlpha = 0.5;
    px(
      ctx,
      X + 1,
      Y + 5 - s.tubes[idx(s, a.x, a.y)] * 3,
      T - 2,
      TUBE_THICK,
      "#ffffff",
    );
    ctx.globalAlpha = 1;
  }
  const by = a.y === 0 ? Y + T - 4 : Y - 4;
  px(ctx, X + 1, by, T - 2, 4, "#000000");
  px(
    ctx,
    X + 2,
    by + 1,
    Math.round((T - 4) * p),
    2,
    a.type === "build" ? "#7CFC5A" : "#ff9f43",
  );
}

export function drawWater(ctx: Ctx, s: Terrain, time: number): void {
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const i = idx(s, x, y);
      if (!s.water[i]) continue;
      const X = x * T,
        Y = y * T;
      const depth = Math.max(0, s.waterLevel - heightAt(s, x, y));
      const col =
        CONFIG.WATER_COLORS[Math.min(depth, CONFIG.WATER_COLORS.length - 1)];
      const isSea = s.base[i] === 0;
      // new flooding fades in
      let a = isSea ? 1 : 0.78;
      if (s.floodedAt[i] >= 0)
        a *= Math.min(1, (s.clock - s.floodedAt[i]) / 350);
      ctx.globalAlpha = a;
      px(ctx, X, Y, T, T, col);
      // moving wave glints
      for (let k = 0; k < 2; k++) {
        const wy = Math.floor(hash(x, y, k + 40) * 12) + 2;
        const wx = Math.floor(
          (hash(x, y, k + 60) * 16 + time / (260 + k * 90)) % 16,
        );
        px(
          ctx,
          X + wx,
          Y + wy,
          Math.min(4, 16 - wx),
          1,
          "rgba(210,235,255,0.55)",
        );
      }
      // foam where water meets dry land
      const foam = (xx: number, yy: number) =>
        inBounds(s, xx, yy) && !s.water[idx(s, xx, yy)];
      const flick = Math.floor(time / 300 + x + y) % 2;
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      if (foam(x, y - 1))
        for (let k = flick; k < T; k += 3) ctx.fillRect(X + k, Y, 2, 1);
      if (foam(x, y + 1))
        for (let k = flick; k < T; k += 3) ctx.fillRect(X + k, Y + T - 1, 2, 1);
      if (foam(x - 1, y))
        for (let k = flick; k < T; k += 3) ctx.fillRect(X, Y + k, 1, 2);
      if (foam(x + 1, y))
        for (let k = flick; k < T; k += 3) ctx.fillRect(X + T - 1, Y + k, 1, 2);
      ctx.globalAlpha = 1;
      // lost object: blinking bubbles
      if (s.lost[i] && Math.floor(time / 400) % 2) {
        px(ctx, X + 4, Y + 5, 2, 2, "#dff3ff");
        px(ctx, X + 9, Y + 8, 2, 2, "#dff3ff");
        px(ctx, X + 6, Y + 11, 1, 1, "#dff3ff");
      }
    }
  }
}

function drawCursor(ctx: Ctx, s: GameState, time: number): void {
  if (s.phase === "done" || s.phase === "intro" || s.tractor.stuck || s.action)
    return;
  const { x, y } = frontCell(s);
  if (!inBounds(s, x, y)) return;
  if (Math.floor(time / 250) % 3 === 0) return; // blink
  const ok = !buildBlocker(s);
  const c = ok ? "#ffffff" : "#ff4d4d";
  const X = x * T,
    Y = y * T;
  const L = 4;
  px(ctx, X, Y, L, 1, c);
  px(ctx, X, Y, 1, L, c);
  px(ctx, X + T - L, Y, L, 1, c);
  px(ctx, X + T - 1, Y, 1, L, c);
  px(ctx, X, Y + T - 1, L, 1, c);
  px(ctx, X, Y + T - L, 1, L, c);
  px(ctx, X + T - L, Y + T - 1, L, 1, c);
  px(ctx, X + T - 1, Y + T - L, 1, L, c);
}

function drawTractor(ctx: Ctx, s: GameState, pos: Point, time: number): void {
  const dir = s.tractor.dir;
  const img = sprite(
    "tractor-" + dir,
    orient(TRACTOR_RIGHT, dir),
    TRACTOR_PALETTE,
  );
  const X = Math.round(pos.x * T),
    Y = Math.round(pos.y * T);
  // lift the tractor a bit when standing on tubes
  const lift = s.tubes[idx(s, s.tractor.x, s.tractor.y)] * 1;
  px(ctx, X + 2, Y + 3, 13, 13, "rgba(0,0,0,0.25)");
  ctx.drawImage(img, X, Y - lift);
  if (s.tractor.stuck) {
    ctx.globalAlpha = 0.55;
    px(ctx, X, Y + 6, T, T - 6, CONFIG.WATER_COLORS[1]);
    ctx.globalAlpha = 1;
    if (Math.floor(time / 300) % 2) px(ctx, X + 7, Y + 2, 2, 2, "#dff3ff");
  }
}

function drawHeights(ctx: Ctx, s: Terrain): void {
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const d = DIGITS[heightAt(s, x, y)] ?? DIGITS[9];
      const X = x * T + 1,
        Y = y * T + 1;
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

export function render(ctx: Ctx, s: GameState, view: RenderView): void {
  const { time, tractorPos, showHeights } = view;
  ctx.imageSmoothingEnabled = false;
  drawSoil(ctx, s);
  drawRelief(ctx, s);
  drawRoads(ctx, s);
  drawTubes(ctx, s);
  drawHouses(ctx, s);
  drawWater(ctx, s, time);
  drawMarks(ctx, s, time);
  drawCursor(ctx, s, time);
  drawTractor(ctx, s, tractorPos, time);
  drawAction(ctx, s, time);
  if (showHeights) drawHeights(ctx, s);
}
