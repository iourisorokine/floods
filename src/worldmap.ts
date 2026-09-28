// World map for the level progression screen: a pixel-art landscape with a
// winding path linking the levels. Generated from the number of levels, so
// adding levels in levels.ts extends the map automatically.
import {
  drawScene,
  drawTractorAt,
  px,
  hash,
  sceneFor,
  topY,
  TW,
  TD,
  LH,
} from "./render.ts";
import type { Scene } from "./render.ts";
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
  scene: Scene;
}

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
        (hash(x, y, 7) - 0.5) * 0.7 +
        Math.sin(x * 0.7 + y * 0.3) * 0.5;
      base[at(x, y)] = Math.max(1, Math.min(6, Math.round(v)));
    }
  }
  // flatten path & nodes a bit so the road looks walkable
  for (let i = 0; i < N; i++)
    if (path[i])
      base[i] = Math.max(
        1,
        Math.min(4, Math.round(1.3 + (h - 1 - Math.floor(i / w)) * 0.42)),
      );
  // low coast along the sea at the back, otherwise the hills in front would hide it
  for (let y = 0; y < Math.min(3, h); y++) {
    for (let x = 0; x < w; x++) {
      const coast = x >= 6 || path[at(x, y)];
      if (coast) base[at(x, y)] = Math.min(base[at(x, y)], y + 1);
    }
  }

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
  return {
    w,
    h,
    nodes,
    path,
    bridge,
    pathOrder,
    state,
    scene: sceneFor(state),
  };
}

/** Screen position (logical pixels) of the centre of a level's square */
export function nodeScreen(world: World, i: number): Point {
  const n = world.nodes[i];
  const b = world.state.base[n.y * world.w + n.x];
  return { x: n.x * TW + TW / 2, y: topY(world.scene, n.y, b) + TD / 2 };
}

// Dirt path on the top face of a square
function drawPathTile(
  ctx: CanvasRenderingContext2D,
  world: World,
  x: number,
  y: number,
  travelled: boolean,
): void {
  const { w, h, path, bridge, scene, state } = world;
  const i = y * w + x;
  if (!path[i] || bridge[i]) return;
  const isP = (xx: number, yy: number): boolean =>
    xx >= 0 && yy >= 0 && xx < w && yy < h && path[yy * w + xx];
  const X = x * TW;
  const Y = topY(scene, y, state.base[i]);
  const L = isP(x - 1, y),
    R = isP(x + 1, y),
    U = isP(x, y - 1),
    D = isP(x, y + 1);
  const dirt = "#d8b878",
    edge = "#a7824a";
  px(ctx, X + 4, Y + 3, 8, 6, dirt);
  if (L) px(ctx, X, Y + 3, 4, 6, dirt);
  if (R) px(ctx, X + 12, Y + 3, 4, 6, dirt);
  if (U) px(ctx, X + 4, Y, 8, 3, dirt);
  if (D) px(ctx, X + 4, Y + 9, 8, 3, dirt);
  if (!U)
    px(ctx, X + (L ? 0 : 4), Y + 3, (L ? 4 : 0) + 8 + (R ? 4 : 0), 1, edge);
  if (!D)
    px(ctx, X + (L ? 0 : 4), Y + 8, (L ? 4 : 0) + 8 + (R ? 4 : 0), 1, edge);
  if (!L)
    px(ctx, X + 4, Y + (U ? 0 : 3), 1, (U ? 3 : 0) + 6 + (D ? 3 : 0), edge);
  if (!R)
    px(ctx, X + 11, Y + (U ? 0 : 3), 1, (U ? 3 : 0) + 6 + (D ? 3 : 0), edge);
  if (hash(x, y, 5) < 0.5)
    px(ctx, X + 6 + Math.floor(hash(x, y, 6) * 4), Y + 5, 1, 1, edge);
  if (travelled) {
    // footprints on the part of the path already travelled
    px(ctx, X + 6, Y + 5, 2, 2, "#8a6a3a");
    px(ctx, X + 9, Y + 5, 2, 2, "#8a6a3a");
  }
}

// Wooden bridge where the path crosses water, slightly above the water
function drawBridge(
  ctx: CanvasRenderingContext2D,
  world: World,
  x: number,
  y: number,
): void {
  const { w, h, path, bridge, scene } = world;
  const i = y * w + x;
  if (!bridge[i]) return;
  const isP = (xx: number, yy: number): boolean =>
    xx >= 0 && yy >= 0 && xx < w && yy < h && path[yy * w + xx];
  const X = x * TW;
  const Y = topY(scene, y, 1) + 1;
  if (isP(x, y - 1) || isP(x, y + 1)) {
    px(ctx, X + 3, Y - 2, 10, TD + 2, "#8b5a2b");
    for (let k = 0; k < TD; k += 3) px(ctx, X + 3, Y - 2 + k, 10, 1, "#5e3a17");
    px(ctx, X + 2, Y - 3, 1, TD + 3, "#3d2610");
    px(ctx, X + 13, Y - 3, 1, TD + 3, "#3d2610");
  } else {
    px(ctx, X, Y + 2, TW, 7, "#8b5a2b");
    for (let k = 0; k < TW; k += 3) px(ctx, X + k, Y + 2, 1, 7, "#5e3a17");
    px(ctx, X, Y + 9, TW, LH - 1, "#5e3a17"); // front of the deck
    px(ctx, X, Y + 1, TW, 1, "#3d2610");
  }
}

// Round stone platform under each level
function drawNodeBase(
  ctx: CanvasRenderingContext2D,
  world: World,
  i: number,
  status: NodeStatus,
): void {
  const c = nodeScreen(world, i);
  const X = c.x - TW / 2,
    Y = c.y - TD / 2;
  const rim =
    status === "locked" ? "#4a4e63" : status === "done" ? "#e7c94a" : "#ffffff";
  px(ctx, X + 3, Y, 10, TD, rim);
  px(ctx, X + 1, Y + 2, 14, TD - 4, rim);
  px(ctx, X + 4, Y + 1, 8, TD - 2, "#2a2e45");
  px(ctx, X + 2, Y + 3, 12, TD - 6, "#2a2e45");
  px(ctx, X + 1, Y + TD - 2, 14, 2, "#15172a"); // thickness of the platform
}

export function drawWorld(
  ctx: CanvasRenderingContext2D,
  world: World,
  statuses: NodeStatus[],
  current: number,
  time: number,
): void {
  world.state.clock = time;
  const done = statuses.filter((st) => st === "done").length;
  const travelled = new Set<number>();
  world.pathOrder.forEach((seg, k) => {
    if (k < done) seg.forEach((t) => travelled.add(t));
  });
  const nodeIndex = new Map(
    world.nodes.map((n, i): [number, number] => [n.y * world.w + n.x, i]),
  );
  const cur = world.nodes[current];
  drawScene(ctx, world.scene, world.state, time, {
    surface: (x, y) => {
      const i = y * world.w + x;
      drawPathTile(ctx, world, x, y, travelled.has(i));
      const n = nodeIndex.get(i);
      if (n !== undefined) drawNodeBase(ctx, world, n, statuses[n]);
    },
    overWater: (x, y) => drawBridge(ctx, world, x, y),
    afterRow: (y) => {
      if (!cur || y !== cur.y) return;
      // the tractor waits next to the current level
      const bob = Math.floor(time / 300) % 2;
      const b = world.state.base[cur.y * world.w + cur.x];
      drawTractorAt(
        ctx,
        world.scene,
        "right",
        { x: cur.x - 0.9, y: cur.y - bob * 0.08 },
        b,
      );
    },
  });
}
