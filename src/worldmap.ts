// World map for the level progression screen: a pixel-art landscape with a
// winding path linking the main levels, and short side paths leading to the
// optional side levels. Generated from the level list, so adding levels in
// levels.ts extends the map automatically. Each world (see worlds.ts) gets
// its own landscape: countryside, mountains, town.
import { CONFIG } from "./config.ts";
import {
  drawSoil,
  drawRelief,
  drawTubes,
  drawHouses,
  drawFields,
  drawWater,
  px,
  hash,
  sprite,
} from "./render.ts";
import { TRACTOR_RIGHT, TRACTOR_PALETTE, orient } from "./sprites.ts";
import { LEVELS } from "./levels.ts";
import { MAIN_PATH, indexOfId } from "./progress.ts";
import { WORLDS } from "./worlds.ts";
import type { WorldTheme } from "./worlds.ts";
import type { ObjectType, Point, Terrain } from "./types.ts";

export type NodeStatus = "locked" | "open" | "done";

export interface World {
  w: number;
  h: number;
  /** one node per level (same index as LEVELS) */
  nodes: Point[];
  path: boolean[];
  /** path squares leading to side levels (drawn dotted) */
  sidePath: boolean[];
  bridge: boolean[];
  /** path squares between consecutive main levels, in walking order */
  pathOrder: number[][];
  /** first level index of each world, with its name */
  worldStarts: { index: number; name: string }[];
  state: Terrain;
}

const T = CONFIG.TILE_PX;
const PER_ROW = 7;
const ROW_GAP = 4;
const MAP_W = 2 + (PER_ROW - 1) * 3 + 3;

/** landscape of each main level, from the elements it contains */
function themes(): Map<number, WorldTheme> {
  const m = new Map<number, WorldTheme>();
  for (const i of MAIN_PATH) {
    const grid = LEVELS[i].objects.join("");
    const count = (codes: string) =>
      [...grid].filter((c) => codes.includes(c)).length;
    const town = count("BS");
    const mountain = count("PXO");
    m.set(i, mountain > town ? "mountains" : town > 0 ? "town" : "country");
  }
  return m;
}

export function buildWorld(): World {
  const rows = Math.ceil(MAIN_PATH.length / PER_ROW);
  const w = MAP_W;
  const h = rows * ROW_GAP + 2;
  const N = w * h;
  const at = (x: number, y: number): number => y * w + x;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;

  // ---- main levels: a snake, bottom-left to top ---------------------------
  const nodes: Point[] = LEVELS.map(() => ({ x: -1, y: -1 }));
  MAIN_PATH.forEach((li, k) => {
    const row = Math.floor(k / PER_ROW);
    const col = k % PER_ROW;
    const x = row % 2 === 0 ? 2 + col * 3 : w - 3 - col * 3;
    const y = h - 2 - row * ROW_GAP - (col % 2);
    nodes[li] = { x, y };
  });

  // ---- path between consecutive main levels (horizontal, then vertical) ---
  const path = new Array<boolean>(N).fill(false);
  const pathOrder: number[][] = [];
  MAIN_PATH.forEach((li, k) => {
    const n = nodes[li];
    path[at(n.x, n.y)] = true;
    if (k === 0) return;
    const a = nodes[MAIN_PATH[k - 1]];
    const seg: number[] = [];
    let x = a.x,
      y = a.y;
    while (x !== n.x) {
      x += Math.sign(n.x - x);
      seg.push(at(x, y));
    }
    while (y !== n.y) {
      y += Math.sign(n.y - y);
      seg.push(at(x, y));
    }
    seg.forEach((t) => (path[t] = true));
    pathOrder.push(seg);
  });

  // ---- side levels: two squares above or below their branch level -------
  const sidePath = new Array<boolean>(N).fill(false);
  const taken = (x: number, y: number) =>
    !inside(x, y) ||
    path[at(x, y)] ||
    sidePath[at(x, y)] ||
    nodes.some((n) => n.x === x && n.y === y);
  const touchesPath = (x: number, y: number) =>
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([dx, dy]) => inside(x + dx, y + dy) && path[at(x + dx, y + dy)]);
  LEVELS.forEach((lv, li) => {
    if (!lv.branchFrom) return;
    const b = nodes[indexOfId(lv.branchFrom)];
    if (!b || b.x < 0) return;
    const options = [-1, 1]
      .map((dy) => ({ x: b.x, y: b.y + 2 * dy, cy: b.y + dy }))
      .filter(
        (o) => o.y >= 1 && o.y < h - 1 && !taken(o.x, o.y) && !taken(o.x, o.cy),
      );
    const best = options.find((o) => !touchesPath(o.x, o.y)) ?? options[0];
    if (!best) return;
    nodes[li] = { x: best.x, y: best.y };
    sidePath[at(best.x, best.cy)] = true;
    sidePath[at(best.x, best.y)] = true;
  });
  const nodeAt = new Map<number, number>();
  nodes.forEach((n, i) => n.x >= 0 && nodeAt.set(at(n.x, n.y), i));

  // ---- landscape theme of each square: the theme of the nearest main level
  const themeOf = themes();
  const theme = new Array<WorldTheme>(N).fill("country");
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let best = Infinity;
      for (const li of MAIN_PATH) {
        const n = nodes[li];
        const d = Math.abs(n.x - x) + Math.abs(n.y - y) * 1.5;
        if (d < best) {
          best = d;
          theme[at(x, y)] = themeOf.get(li) ?? "country";
        }
      }
    }
  }

  // ---- terrain ------------------------------------------------------------
  const base = new Array<number>(N);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = at(x, y);
      const noise =
        (hash(x, y, 7) - 0.5) * 1.3 + Math.sin(x * 0.7 + y * 0.3) * 0.5;
      let v = 1.3 + (h - 1 - y) * 0.3 + noise;
      if (theme[i] === "mountains") v += 2.2;
      if (theme[i] === "town") v = 1.4 + noise * 0.5;
      base[i] = Math.max(1, Math.min(6, Math.round(v)));
    }
  }
  // flatten the paths so the road looks walkable
  for (let i = 0; i < N; i++)
    if (path[i] || sidePath[i])
      base[i] = Math.max(
        1,
        Math.min(base[i], theme[i] === "mountains" ? 5 : 3),
      );

  const water = new Array<boolean>(N).fill(false);
  const wet = (x: number, y: number): void => {
    if (inside(x, y) && !nodeAt.has(at(x, y)) && !sidePath[at(x, y)])
      water[at(x, y)] = true;
  };
  // sea along the top
  for (let x = 6; x < w; x++) wet(x, 0);
  // lake in the bottom-left corner
  for (let y = h - 3; y < h; y++)
    for (let x = 0; x < 3; x++)
      if (x * x * 0.8 + (y - h + 1) ** 2 < 4.5) wet(x, y);
  // a river winding from the sea down to the bottom edge, between level columns
  let prev: number | null = null;
  for (let y = 0; y < h; y++) {
    const rx = 9 + (Math.sin(y * 0.9) > 0 ? 1 : 0);
    wet(rx, y);
    if (prev !== null && prev !== rx) wet(prev, y);
    prev = rx;
  }
  for (let i = 0; i < N; i++) if (water[i]) base[i] = 0;
  const bridge = path.map((p, i) => p && water[i]);

  // ---- decoration --------------------------------------------------------------
  const objects = new Array<ObjectType | null>(N).fill(null);
  const tubes = new Array<number>(N).fill(0);
  const free = (x: number, y: number): boolean =>
    inside(x, y) &&
    !path[at(x, y)] &&
    !sidePath[at(x, y)] &&
    !water[at(x, y)] &&
    !objects[at(x, y)];
  // a dike of tubes along the sea
  for (let x = 6; x < w; x++) if (free(x, 1)) tubes[at(x, 1)] = 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!free(x, y) || tubes[at(x, y)]) continue;
      if (nodes.some((n) => Math.abs(n.x - x) + Math.abs(n.y - y) <= 1))
        continue;
      const i = at(x, y);
      const r = hash(x, y, 99);
      if (theme[i] === "country") {
        const density = base[i] >= 4 ? 0.3 : base[i] >= 3 ? 0.14 : 0.05;
        if (r < density) objects[i] = "tree";
        else if (r > 0.94) objects[i] = "house";
        else if (r > 0.88 && base[i] <= 2) objects[i] = "field";
      } else if (theme[i] === "mountains") {
        if (r < 0.34) objects[i] = "pine";
        else if (r < 0.42) objects[i] = "rock";
        else if (r > 0.97) objects[i] = "house";
      } else {
        if (r < 0.2) objects[i] = "building";
        else if (r < 0.28) objects[i] = "shop";
        else if (r < 0.4) objects[i] = "house";
        else if (r < 0.44) objects[i] = "tree";
      }
    }
  }

  const worldStarts = WORLDS.map((wd) => ({
    index: indexOfId(wd.from),
    name: wd.name,
  })).filter((s) => s.index >= 0 && nodes[s.index].x >= 0);

  const state: Terrain = {
    w,
    h,
    base,
    tubes,
    objects,
    water,
    lost: new Array<boolean>(N).fill(false),
    floodedAt: new Array<number>(N).fill(-1),
    waterLevel: 0,
    clock: 0,
  };
  return { w, h, nodes, path, sidePath, bridge, pathOrder, worldStarts, state };
}

function drawPath(
  ctx: CanvasRenderingContext2D,
  world: World,
  travelled: Set<number>,
): void {
  const { w, h, path, sidePath, bridge } = world;
  const isP = (x: number, y: number): boolean =>
    x >= 0 &&
    y >= 0 &&
    x < w &&
    y < h &&
    (path[y * w + x] || sidePath[y * w + x]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!path[i] && !sidePath[i]) continue;
      const X = x * T,
        Y = y * T;
      const L = isP(x - 1, y),
        R = isP(x + 1, y),
        U = isP(x, y - 1),
        D = isP(x, y + 1);
      if (bridge[i]) {
        const vert = U || D;
        // wooden planks with rails
        if (vert) {
          px(ctx, X + 3, Y, 10, T, "#8b5a2b");
          for (let k = 0; k < T; k += 3)
            px(ctx, X + 3, Y + k, 10, 1, "#5e3a17");
          px(ctx, X + 2, Y, 1, T, "#3d2610");
          px(ctx, X + 13, Y, 1, T, "#3d2610");
        } else {
          px(ctx, X, Y + 3, T, 10, "#8b5a2b");
          for (let k = 0; k < T; k += 3)
            px(ctx, X + k, Y + 3, 1, 10, "#5e3a17");
          px(ctx, X, Y + 2, T, 1, "#3d2610");
          px(ctx, X, Y + 13, T, 1, "#3d2610");
        }
        continue;
      }
      if (sidePath[i]) {
        // side paths: stepping stones
        const stone = "#cfc6b0";
        if (U || D) {
          px(ctx, X + 6, Y + 1, 4, 3, stone);
          px(ctx, X + 6, Y + 7, 4, 3, stone);
          px(ctx, X + 6, Y + 13, 4, 2, stone);
        } else {
          px(ctx, X + 1, Y + 6, 3, 4, stone);
          px(ctx, X + 7, Y + 6, 3, 4, stone);
          px(ctx, X + 13, Y + 6, 2, 4, stone);
        }
        continue;
      }
      const dirt = "#d8b878",
        edge = "#a7824a";
      px(ctx, X + 4, Y + 4, 8, 8, dirt);
      if (L) px(ctx, X, Y + 4, 4, 8, dirt);
      if (R) px(ctx, X + 12, Y + 4, 4, 8, dirt);
      if (U) px(ctx, X + 4, Y, 8, 4, dirt);
      if (D) px(ctx, X + 4, Y + 12, 8, 4, dirt);
      if (!U) px(ctx, X + 4, Y + 4, 8, 1, edge);
      if (!D) px(ctx, X + 4, Y + 11, 8, 1, edge);
      if (!L) px(ctx, X + 4, Y + 4, 1, 8, edge);
      if (!R) px(ctx, X + 11, Y + 4, 1, 8, edge);
      if (hash(x, y, 5) < 0.5)
        px(
          ctx,
          X + 6 + Math.floor(hash(x, y, 6) * 4),
          Y + 6 + Math.floor(hash(x, y, 8) * 4),
          1,
          1,
          edge,
        );
      if (travelled.has(i)) {
        px(ctx, X + 6, Y + 7, 2, 2, "#8a6a3a");
        px(ctx, X + 9, Y + 7, 2, 2, "#8a6a3a");
      }
    }
  }
}

function drawNodeBases(
  ctx: CanvasRenderingContext2D,
  world: World,
  statuses: NodeStatus[],
): void {
  world.nodes.forEach((n, i) => {
    if (n.x < 0) return;
    const X = n.x * T,
      Y = n.y * T;
    const st = statuses[i];
    const side = !!LEVELS[i].branchFrom;
    const rim =
      st === "locked"
        ? "#4a4e63"
        : side
          ? "#c08cff"
          : st === "done"
            ? "#e7c94a"
            : "#ffffff";
    // round stone platform
    px(ctx, X + 3, Y + 1, 10, 14, rim);
    px(ctx, X + 1, Y + 3, 14, 10, rim);
    px(ctx, X + 2, Y + 2, 12, 12, rim);
    const inner = side ? "#3a2552" : "#2a2e45";
    px(ctx, X + 4, Y + 2, 8, 12, inner);
    px(ctx, X + 2, Y + 4, 12, 8, inner);
    px(ctx, X + 3, Y + 3, 10, 10, inner);
  });
}

export function drawWorld(
  ctx: CanvasRenderingContext2D,
  world: World,
  statuses: NodeStatus[],
  current: number,
  time: number,
): void {
  ctx.imageSmoothingEnabled = false;
  const s = world.state;
  s.clock = time;
  drawSoil(ctx, s);
  drawRelief(ctx, s);
  drawWater(ctx, s, time);
  // footprints on the segments after each passed main level
  const travelled = new Set<number>();
  world.pathOrder.forEach((seg, k) => {
    if (statuses[MAIN_PATH[k]] === "done") seg.forEach((t) => travelled.add(t));
  });
  drawPath(ctx, world, travelled);
  drawFields(ctx, s);
  drawTubes(ctx, s);
  drawHouses(ctx, s);
  drawNodeBases(ctx, world, statuses);
  // the tractor waits next to the current level
  const n = world.nodes[current];
  if (n && n.x >= 0) {
    const img = sprite(
      "tractor-right",
      orient(TRACTOR_RIGHT, "right"),
      TRACTOR_PALETTE,
    );
    const bob = Math.floor(time / 300) % 2;
    const tx = n.x * T - 14,
      ty = n.y * T - 9 - bob;
    px(ctx, tx + 2, ty + 4, 13, 12, "rgba(0,0,0,0.25)");
    ctx.drawImage(img, tx, ty);
  }
}
