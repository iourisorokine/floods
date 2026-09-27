// World map for the level progression screen: a pixel-art landscape with a
// winding path linking the levels. Generated from the number of levels, so
// adding levels in levels.ts extends the map automatically.
import { CONFIG } from "./config.ts";
import {
  drawSoil,
  drawRelief,
  drawTubes,
  drawHouses,
  drawWater,
  px,
  hash,
  sprite,
} from "./render.ts";
import { TRACTOR_RIGHT, TRACTOR_PALETTE, orient } from "./sprites.ts";
import type { ObjectType, Point, Terrain } from "./types.ts";

export type NodeStatus = "locked" | "open" | "done";

export interface World {
  w: number;
  h: number;
  nodes: Point[];
  path: boolean[];
  bridge: boolean[];
  /** path tiles between consecutive levels, in walking order */
  pathOrder: number[][];
  state: Terrain;
}

const T = CONFIG.TILE_PX;
const PER_ROW = 6;
const MAP_W = 20;

export function buildWorld(count: number): World {
  const rows = Math.ceil(count / PER_ROW);
  const w = MAP_W;
  const h = rows * 3 + 2;
  const N = w * h;
  const at = (x: number, y: number): number => y * w + x;

  // ---- level nodes: a snake, bottom-left to top ----------------------------
  const nodes: Point[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / PER_ROW);
    const col = i % PER_ROW;
    const x = row % 2 === 0 ? 2 + col * 3 : w - 3 - col * 3;
    const y = h - 2 - row * 3 - (col % 2);
    nodes.push({ x, y });
  }

  // ---- path between consecutive nodes (horizontal, then vertical) ---------
  const path = new Array<boolean>(N).fill(false);
  const pathOrder: number[][] = []; // tiles in walking order, for the dotted "progress" trail
  nodes.forEach((n, i) => {
    path[at(n.x, n.y)] = true;
    if (i === 0) return;
    const a = nodes[i - 1];
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
    seg.forEach((t) => {
      path[t] = true;
    });
    pathOrder.push(seg);
  });
  const nodeAt = new Map<number, number>(
    nodes.map((n, i): [number, number] => [at(n.x, n.y), i]),
  );

  // ---- terrain: low near the start, hilly towards the end ----------------
  const base = new Array<number>(N);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v =
        1.3 +
        (h - 1 - y) * 0.42 +
        (hash(x, y, 7) - 0.5) * 1.3 +
        Math.sin(x * 0.7 + y * 0.3) * 0.5;
      base[at(x, y)] = Math.max(1, Math.min(6, Math.round(v)));
    }
  }
  // flatten path & nodes a bit so the road looks walkable
  for (let i = 0; i < N; i++)
    if (path[i]) base[i] = Math.max(1, Math.min(base[i], 4));

  const water = new Array<boolean>(N).fill(false);
  const wet = (x: number, y: number): void => {
    if (x >= 0 && y >= 0 && x < w && y < h && !nodeAt.has(at(x, y)))
      water[at(x, y)] = true;
  };
  // sea along the top, on the hard side
  for (let x = 7; x < w; x++) wet(x, 0);
  // lake in the bottom-left corner
  for (let y = h - 3; y < h; y++)
    for (let x = 0; x < 3; x++)
      if (x * x * 0.8 + (y - h + 1) ** 2 < 4.5) wet(x, y);
  // a river winding from the sea down to the bottom edge
  let prev: number | null = null;
  for (let y = 0; y < h; y++) {
    const rx = 9 + (Math.sin(y * 0.9) > 0 ? 1 : 0); // stays between the level columns
    wet(rx, y);
    if (prev !== null && prev !== rx) wet(prev, y);
    prev = rx;
  }
  for (let i = 0; i < N; i++) if (water[i]) base[i] = 0;
  const bridge = path.map((p, i) => p && water[i]);

  // ---- decoration: houses near some levels, trees, a dike on the coast ----
  const objects = new Array<ObjectType | null>(N).fill(null);
  const tubes = new Array<number>(N).fill(0);
  const free = (x: number, y: number): boolean =>
    x >= 0 &&
    y >= 0 &&
    x < w &&
    y < h &&
    !path[at(x, y)] &&
    !water[at(x, y)] &&
    !objects[at(x, y)];
  nodes.forEach((n, i) => {
    const spots = [
      [1, -1],
      [-1, 1],
      [1, 1],
      [-1, -1],
    ];
    const count = i % 3 === 0 ? 1 : 0;
    let placed = 0;
    for (const [dx, dy] of spots) {
      if (placed >= count) break;
      if (free(n.x + dx, n.y + dy) && hash(n.x, n.y, dx * 3 + dy) < 0.8) {
        objects[at(n.x + dx, n.y + dy)] = "house";
        placed++;
      }
    }
  });
  for (let x = 7; x < w; x++)
    if (free(x, 1) && base[at(x, 1)] > 0) tubes[at(x, 1)] = 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!free(x, y) || tubes[at(x, y)]) continue;
      const nearNode = nodes.some(
        (n) => Math.abs(n.x - x) + Math.abs(n.y - y) <= 1,
      );
      if (nearNode) continue;
      const density =
        base[at(x, y)] >= 4 ? 0.3 : base[at(x, y)] >= 3 ? 0.14 : 0.05;
      if (hash(x, y, 99) < density) objects[at(x, y)] = "tree";
    }
  }

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
  return { w, h, nodes, path, bridge, pathOrder, state };
}

function drawPath(
  ctx: CanvasRenderingContext2D,
  world: World,
  doneUpTo: number,
): void {
  const { w, h, path, bridge } = world;
  const isP = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < w && y < h && path[y * w + x];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!path[i]) continue;
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
      const dirt = "#d8b878",
        edge = "#a7824a";
      px(ctx, X + 4, Y + 4, 8, 8, dirt);
      if (L) px(ctx, X, Y + 4, 4, 8, dirt);
      if (R) px(ctx, X + 12, Y + 4, 4, 8, dirt);
      if (U) px(ctx, X + 4, Y, 8, 4, dirt);
      if (D) px(ctx, X + 4, Y + 12, 8, 4, dirt);
      // edges
      if (!U) px(ctx, X + 4, Y + 4, 8, 1, edge);
      if (!D) px(ctx, X + 4, Y + 11, 8, 1, edge);
      if (!L) px(ctx, X + 4, Y + 4, 1, 8, edge);
      if (!R) px(ctx, X + 11, Y + 4, 1, 8, edge);
      // pebbles
      if (hash(x, y, 5) < 0.5)
        px(
          ctx,
          X + 6 + Math.floor(hash(x, y, 6) * 4),
          Y + 6 + Math.floor(hash(x, y, 8) * 4),
          1,
          1,
          edge,
        );
    }
  }
  // footprints on the part of the path already travelled
  world.pathOrder.forEach((seg, k) => {
    if (k >= doneUpTo) return;
    seg.forEach((i) => {
      if (bridge[i]) return;
      const X = (i % w) * T,
        Y = Math.floor(i / w) * T;
      px(ctx, X + 6, Y + 7, 2, 2, "#8a6a3a");
      px(ctx, X + 9, Y + 7, 2, 2, "#8a6a3a");
    });
  });
}

function drawNodeBases(
  ctx: CanvasRenderingContext2D,
  world: World,
  statuses: NodeStatus[],
): void {
  world.nodes.forEach((n, i) => {
    const X = n.x * T,
      Y = n.y * T;
    const st = statuses[i];
    const rim =
      st === "locked" ? "#4a4e63" : st === "done" ? "#e7c94a" : "#ffffff";
    // round stone platform
    px(ctx, X + 3, Y + 1, 10, 14, rim);
    px(ctx, X + 1, Y + 3, 14, 10, rim);
    px(ctx, X + 2, Y + 2, 12, 12, rim);
    px(ctx, X + 4, Y + 2, 8, 12, "#2a2e45");
    px(ctx, X + 2, Y + 4, 12, 8, "#2a2e45");
    px(ctx, X + 3, Y + 3, 10, 10, "#2a2e45");
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
  const done = statuses.filter((st) => st === "done").length;
  drawPath(ctx, world, done);
  drawTubes(ctx, s);
  drawHouses(ctx, s);
  drawNodeBases(ctx, world, statuses);
  // the tractor waits next to the current level
  const n = world.nodes[current];
  if (n) {
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
