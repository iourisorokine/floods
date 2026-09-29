// Level analysis helpers used by `npm run check-levels`.
//  - flood without protection
//  - minimum number of tubes to save every object (min-cut, ignores tractor)
//  - a greedy "bot" that drives the tractor and builds that cut, following
//    the real rules (climb 1, build only on squares not higher than you,
//    cut pines on the way, slower on fields), with an estimate of how long
//    it takes. Pushable boulders are treated as fixed rocks.
import { CONFIG } from "../src/config.ts";
import {
  parseLevel,
  PROTECTED,
  IS_ROCK,
  levelAmplitude,
  levelBudget,
  levelTimer,
  levelWaves,
  wavePause,
  createGame,
  update,
  startLevel,
  releaseFlood,
} from "../src/engine.ts";
import type { Level, ObjectType, Result } from "../src/types.ts";

const INF = 1e9;

export interface CutSquare {
  i: number;
  need: number;
}

export type BotResult =
  | {
      ok: true;
      log: string[];
      moves: number;
      builds: number;
      cuts: number;
      helpers: number;
      seconds: number;
      tubes: number[];
      cutPines: number[];
    }
  | { ok: false; log: string[]; left: string[]; moves: number; builds: number };

export interface Analysis {
  w: number;
  h: number;
  base: number[];
  objects: (ObjectType | null)[];
  cracked: boolean[];
  A: number;
  budget: number;
  timer: number;
  /** build time available: timer + pauses between waves */
  window: number;
  free: { wet: boolean[]; objs: number[]; lost: number[] };
  mc: { flow: number; cut: CutSquare[] };
  bot: BotResult;
  result: Result | null;
}

function neighbors(w: number, h: number, i: number): number[] {
  const x = i % w;
  const y = (i / w) | 0;
  const r: number[] = [];
  if (y > 0) r.push(i - w);
  if (x < w - 1) r.push(i + 1);
  if (y < h - 1) r.push(i + w);
  if (x > 0) r.push(i - 1);
  return r;
}

const BLOCKED: ReadonlySet<ObjectType | null> = new Set<ObjectType>([
  "house",
  "tree",
  "building",
  "shop",
  "rock",
  "boulder",
]);

// Height that holds water back at the final level, when nothing is built:
// rocks add height, cracked dikes that the water reaches break.
function waterHeights(
  level: Level,
  tubes: number[] | null,
  repaired: boolean[] | null,
): number[] {
  const { base, objects, cracked } = parseLevel(level);
  const A = CONFIG.START_WATER_LEVEL + levelAmplitude(level);
  return base.map((b, i) => {
    let hgt =
      b +
      (tubes ? tubes[i] : 0) +
      (IS_ROCK(objects[i]) ? CONFIG.ROCK_HEIGHT : 0);
    const breaks =
      cracked[i] &&
      !(repaired && repaired[i]) &&
      hgt - CONFIG.CRACK_BREAK_MARGIN <= A;
    if (breaks) hgt = Math.max(1, b - CONFIG.CRACK_DROP);
    return hgt;
  });
}

export function floodWithout(
  level: Level,
  tubes: number[] | null = null,
  repaired: boolean[] | null = null,
): Analysis["free"] {
  const { w, h, base, objects } = parseLevel(level);
  const A = CONFIG.START_WATER_LEVEL + levelAmplitude(level);
  const H = waterHeights(level, tubes, repaired);
  const wet = base.map((b) => b === 0);
  const q: number[] = [];
  wet.forEach((v, i) => v && q.push(i));
  while (q.length) {
    const i = q.shift()!;
    for (const j of neighbors(w, h, i)) {
      if (!wet[j] && objects[j] !== "building" && H[j] <= A) {
        wet[j] = true;
        q.push(j);
      }
    }
  }
  const objs = objects
    .map((o, i) => (PROTECTED.has(o) ? i : -1))
    .filter((i) => i >= 0);
  const lostAt = (i: number) =>
    objects[i] === "building" ? neighbors(w, h, i).some((j) => wet[j]) : wet[i];
  return { wet, objs, lost: objs.filter(lostAt) };
}

// Min vertex cut (capacity = tubes needed to lift the square above the flood)
export function minCut(level: Level): Analysis["mc"] {
  const { w, h, base, objects, cracked } = parseLevel(level);
  const A = CONFIG.START_WATER_LEVEL + levelAmplitude(level);
  const H = waterHeights(level, null, null);
  const N = w * h;
  const S = 2 * N;
  const T = 2 * N + 1;
  const cap = new Map<number, number>();
  const adj: number[][] = Array.from({ length: 2 * N + 2 }, () => []);
  const key = (a: number, b: number) => a * 100000 + b;
  const get = (a: number, b: number) => cap.get(key(a, b)) ?? 0;
  const add = (a: number, b: number, c: number) => {
    if (!cap.has(key(a, b))) {
      adj[a].push(b);
      adj[b].push(a);
      cap.set(key(a, b), 0);
      if (!cap.has(key(b, a))) cap.set(key(b, a), 0);
    }
    cap.set(key(a, b), get(a, b) + c);
  };
  const floodable = (i: number) => objects[i] !== "building" && H[i] <= A;
  // squares that must stay dry: protected objects, and the squares next to buildings
  const targets = new Set<number>();
  for (let i = 0; i < N; i++) {
    if (!PROTECTED.has(objects[i])) continue;
    if (objects[i] === "building")
      neighbors(w, h, i).forEach((j) => floodable(j) && targets.add(j));
    else targets.add(i);
  }
  for (let i = 0; i < N; i++) {
    if (!floodable(i)) continue;
    const buildable = base[i] > 0 && (!objects[i] || objects[i] === "pine");
    const need = cracked[i] ? Math.max(1, A + 1 - base[i]) : A + 1 - base[i];
    const c = buildable && need <= CONFIG.MAX_TUBES_PER_SQUARE ? need : INF;
    add(i, i + N, c);
    if (base[i] === 0) add(S, i, INF);
    if (targets.has(i)) add(i + N, T, INF);
    for (const j of neighbors(w, h, i)) if (floodable(j)) add(i + N, j, INF);
  }
  let flow = 0;
  for (;;) {
    const prev = new Int32Array(2 * N + 2).fill(-1);
    prev[S] = S;
    const q = [S];
    while (q.length && prev[T] < 0) {
      const u = q.shift()!;
      for (const v of adj[u]) {
        if (prev[v] < 0 && get(u, v) > 0) {
          prev[v] = u;
          q.push(v);
        }
      }
    }
    if (prev[T] < 0) break;
    let f = INF;
    for (let v = T; v !== S; v = prev[v]) f = Math.min(f, get(prev[v], v));
    for (let v = T; v !== S; v = prev[v]) {
      cap.set(key(prev[v], v), get(prev[v], v) - f);
      cap.set(key(v, prev[v]), get(v, prev[v]) + f);
    }
    flow += f;
    if (flow >= INF) return { flow: INF, cut: [] };
  }
  const seen = new Uint8Array(2 * N + 2);
  seen[S] = 1;
  const q = [S];
  while (q.length) {
    const u = q.shift()!;
    for (const v of adj[u]) {
      if (!seen[v] && get(u, v) > 0) {
        seen[v] = 1;
        q.push(v);
      }
    }
  }
  const cut: CutSquare[] = [];
  for (let i = 0; i < N; i++) {
    if (seen[i] && !seen[i + N] && floodable(i)) {
      cut.push({
        i,
        need: cracked[i] ? Math.max(1, A + 1 - base[i]) : A + 1 - base[i],
      });
    }
  }
  return { flow, cut };
}

// Greedy bot: builds `plan` ([{i, need}]) following the tractor rules.
export function botBuild(level: Level, plan: CutSquare[]): BotResult {
  const { w, h, base, start } = parseLevel(level);
  const objects = parseLevel(level).objects.slice();
  const tubes = new Array<number>(w * h).fill(0);
  const water = base.map((b) => b === 0);
  const G = (i: number) => base[i] + tubes[i];
  const cutCost = (CONFIG.CUT_TIME_SECONDS * 1000) / CONFIG.MOVE_INTERVAL_MS; // in "moves"
  const stepCost = (i: number) =>
    (objects[i] === "field" ? CONFIG.FIELD_SLOWDOWN : 1) +
    (objects[i] === "pine" ? cutCost : 0);
  const passable = (i: number) => !water[i] && !BLOCKED.has(objects[i]);
  let pos = start.y * w + start.x;
  const remaining = new Map<number, number>(
    plan.map((p): [number, number] => [p.i, p.need]),
  );
  let moves = 0;
  let builds = 0;
  let cuts = 0;
  let turns = 0;
  let helpers = 0;
  const cutPines: number[] = [];
  const log: string[] = [];
  const label = (i: number) => `(${i % w},${(i / w) | 0})`;
  const cutPine = (i: number) => {
    if (objects[i] !== "pine") return;
    objects[i] = null;
    cuts += 1;
    cutPines.push(i);
  };

  // Dijkstra from the current position; returns costs and predecessors
  const paths = () => {
    const dist = new Array<number>(w * h).fill(Infinity);
    const prev = new Array<number>(w * h).fill(-1);
    const done = new Array<boolean>(w * h).fill(false);
    dist[pos] = 0;
    for (;;) {
      let u = -1;
      for (let i = 0; i < w * h; i++)
        if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u]))
          u = i;
      if (u < 0) break;
      done[u] = true;
      for (const v of neighbors(w, h, u)) {
        if (!passable(v) || Math.abs(G(v) - G(u)) > CONFIG.MAX_CLIMB) continue;
        const d = dist[u] + stepCost(v);
        if (d < dist[v]) {
          dist[v] = d;
          prev[v] = u;
        }
      }
    }
    return { dist, prev };
  };
  const walkTo = (target: number, prev: number[], dist: number[]) => {
    for (let v = target; v !== pos && v >= 0; v = prev[v]) cutPine(v);
    moves += dist[target];
    turns += dist[target] > 0 ? Math.ceil(dist[target] / 3) + 1 : 1;
    pos = target;
  };

  while ([...remaining.values()].some((n) => n > 0)) {
    const { dist, prev } = paths();
    let best: { c: number; a: number; cost: number } | null = null;
    for (const [c, need] of remaining) {
      if (need <= 0) continue;
      for (const a of neighbors(w, h, c)) {
        if (dist[a] === Infinity || G(a) < G(c)) continue;
        const penalty = (remaining.get(a) ?? 0) > 0 ? 50 : 0;
        const cost = dist[a] + penalty + (objects[c] === "pine" ? cutCost : 0);
        if (!best || cost < best.cost) best = { c, a, cost };
      }
    }
    if (!best) {
      // stepping stone: build a tube next to the target, climb on it, then stack
      let step: { c: number; a: number; d: number } | null = null;
      for (const [c, need] of remaining) {
        if (need <= 0) continue;
        for (const a of neighbors(w, h, c)) {
          if (
            !passable(a) ||
            (objects[a] && objects[a] !== "pine") ||
            tubes[a] >= CONFIG.MAX_TUBES_PER_SQUARE
          )
            continue;
          if (G(a) + 1 < G(c)) continue;
          const nbs = neighbors(w, h, a).filter((b) => dist[b] < Infinity);
          const buildFrom = nbs.filter((b) => G(b) >= G(a));
          const climbFrom = nbs.filter(
            (b) => Math.abs(G(a) + 1 - G(b)) <= CONFIG.MAX_CLIMB,
          );
          if (!buildFrom.length || !climbFrom.length) continue;
          const b = buildFrom.sort((p1, p2) => dist[p1] - dist[p2])[0];
          if (!step || dist[b] < step.d) step = { c: a, a: b, d: dist[b] };
        }
      }
      if (step) {
        walkTo(step.a, prev, dist);
        cutPine(step.c);
        moves += 1;
        turns += 1;
        tubes[step.c] += 1;
        builds += 1;
        helpers += 1;
        log.push(`+${label(step.c)}`);
        continue;
      }
      const left = [...remaining]
        .filter(([, n]) => n > 0)
        .map(([i, n]) => `${label(i)}x${n}`);
      return { ok: false, log, left, moves, builds };
    }
    walkTo(best.a, prev, dist);
    cutPine(best.c);
    tubes[best.c] += 1;
    builds += 1;
    remaining.set(best.c, (remaining.get(best.c) ?? 0) - 1);
    log.push(label(best.c));
  }
  const seconds =
    (moves * CONFIG.MOVE_INTERVAL_MS + turns * CONFIG.TURN_HOLD_MS) / 1000 +
    builds * CONFIG.BUILD_TIME_SECONDS +
    cuts * CONFIG.CUT_TIME_SECONDS;
  return {
    ok: true,
    log,
    moves,
    builds,
    cuts,
    helpers,
    seconds,
    tubes,
    cutPines,
  };
}

// Runs the real engine flood (all waves) with a given tube layout; returns the score
export function scoreWithTubes(
  level: Level,
  tubes: number[],
  cutPines: number[] = [],
): Result | null {
  const s = createGame(level);
  startLevel(s);
  s.tubes = tubes.slice();
  s.tubesUsed = tubes.reduce((a, b) => a + b, 0);
  tubes.forEach((n, i) => n > 0 && (s.cracked[i] = false));
  cutPines.forEach((i) => (s.objects[i] = null));
  for (let t = 0; t < 600000 && s.phase !== "done"; t += 50) {
    if (s.phase === "build") releaseFlood(s);
    update(s, 50);
  }
  return s.result;
}

export function analyse(level: Level): Analysis {
  const { w, h, base, objects, cracked } = parseLevel(level);
  const A = CONFIG.START_WATER_LEVEL + levelAmplitude(level);
  const budget = levelBudget(level);
  const timer = levelTimer(level);
  const waves = levelWaves(level);
  const window =
    timer + waves.slice(0, -1).reduce((a, wv) => a + wavePause(wv), 0);
  const free = floodWithout(level);
  const mc = minCut(level);
  const bot: BotResult =
    mc.flow < INF
      ? botBuild(level, mc.cut)
      : { ok: false, log: [], left: ["impossible"], moves: 0, builds: 0 };
  const result = bot.ok ? scoreWithTubes(level, bot.tubes, bot.cutPines) : null;
  return {
    w,
    h,
    base,
    objects,
    cracked,
    A,
    budget,
    timer,
    window,
    free,
    mc,
    bot,
    result,
  };
}
