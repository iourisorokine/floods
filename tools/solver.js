// Level analysis helpers used by `npm run check-levels`.
//  - flood without protection
//  - minimum number of tubes to save every object (min-cut, ignores tractor)
//  - a greedy "bot" that drives the tractor and builds that cut, following
//    the real rules (climb 1, build only on squares not higher than you),
//    with an estimate of how long it takes.
import { CONFIG } from '../src/config.js';
import { parseLevel, PROTECTED, levelAmplitude, levelBudget, levelTimer, createGame, update, startLevel, releaseFlood } from '../src/engine.js';

const INF = 1e9;

function neighbors(w, h, i) {
  const x = i % w, y = (i / w) | 0, r = [];
  if (y > 0) r.push(i - w);
  if (x < w - 1) r.push(i + 1);
  if (y < h - 1) r.push(i + w);
  if (x > 0) r.push(i - 1);
  return r;
}

export function floodWithout(level, tubes = null) {
  const { w, h, base, objects } = parseLevel(level);
  const A = CONFIG.START_WATER_LEVEL + levelAmplitude(level);
  const H = (i) => base[i] + (tubes ? tubes[i] : 0);
  const wet = base.map((b) => b === 0);
  const q = [];
  wet.forEach((v, i) => v && q.push(i));
  while (q.length) {
    const i = q.shift();
    for (const j of neighbors(w, h, i)) if (!wet[j] && H(j) <= A) { wet[j] = true; q.push(j); }
  }
  const objs = objects.map((o, i) => (PROTECTED.has(o) ? i : -1)).filter((i) => i >= 0);
  return { wet, objs, lost: objs.filter((i) => wet[i]) };
}

// Min vertex cut (capacity = tubes needed to lift the square above the flood)
// `targets` = object indices to protect (default: all)
export function minCut(level, targets = null) {
  const { w, h, base, objects } = parseLevel(level);
  const A = CONFIG.START_WATER_LEVEL + levelAmplitude(level);
  const N = w * h, S = 2 * N, T = 2 * N + 1;
  const cap = new Map();
  const adj = Array.from({ length: 2 * N + 2 }, () => []);
  const key = (a, b) => a * 100000 + b;
  const add = (a, b, c) => {
    if (!cap.has(key(a, b))) { adj[a].push(b); adj[b].push(a); cap.set(key(a, b), 0); if (!cap.has(key(b, a))) cap.set(key(b, a), 0); }
    cap.set(key(a, b), cap.get(key(a, b)) + c);
  };
  const tset = new Set(targets ?? objects.map((o, i) => (PROTECTED.has(o) ? i : -1)).filter((i) => i >= 0));
  for (let i = 0; i < N; i++) {
    if (base[i] > A) continue;
    const need = A + 1 - base[i];
    let c;
    if (base[i] === 0 || objects[i]) c = INF;
    else c = need <= CONFIG.MAX_TUBES_PER_SQUARE ? need : INF;
    add(i, i + N, c);
    if (base[i] === 0) add(S, i, INF);
    if (tset.has(i)) add(i + N, T, INF);
    for (const j of neighbors(w, h, i)) if (base[j] <= A) add(i + N, j, INF);
  }
  let flow = 0;
  for (;;) {
    const prev = new Int32Array(2 * N + 2).fill(-1); prev[S] = S;
    const q = [S];
    while (q.length && prev[T] < 0) {
      const u = q.shift();
      for (const v of adj[u]) if (prev[v] < 0 && cap.get(key(u, v)) > 0) { prev[v] = u; q.push(v); }
    }
    if (prev[T] < 0) break;
    let f = INF;
    for (let v = T; v !== S; v = prev[v]) f = Math.min(f, cap.get(key(prev[v], v)));
    for (let v = T; v !== S; v = prev[v]) {
      cap.set(key(prev[v], v), cap.get(key(prev[v], v)) - f);
      cap.set(key(v, prev[v]), cap.get(key(v, prev[v])) + f);
    }
    flow += f;
    if (flow >= INF) return { flow: INF, cut: [] };
  }
  const seen = new Uint8Array(2 * N + 2); seen[S] = 1; const q = [S];
  while (q.length) { const u = q.shift(); for (const v of adj[u]) if (!seen[v] && cap.get(key(u, v)) > 0) { seen[v] = 1; q.push(v); } }
  const cut = [];
  for (let i = 0; i < N; i++) if (seen[i] && !seen[i + N] && base[i] <= A) cut.push({ i, need: A + 1 - base[i] });
  return { flow, cut };
}

// Greedy bot: builds `plan` ([{i, need}]) following the tractor rules.
export function botBuild(level, plan) {
  const { w, h, base, objects, start } = parseLevel(level);
  const tubes = new Array(w * h).fill(0);
  const water = base.map((b) => b === 0);
  const H = (i) => base[i] + tubes[i];
  const passable = (i) => !water[i] && objects[i] !== 'house' && objects[i] !== 'tree';
  let pos = start.y * w + start.x;
  const remaining = new Map(plan.map((p) => [p.i, p.need]));
  let moves = 0, builds = 0, turns = 0, helpers = 0;
  const log = [];
  while ([...remaining.values()].some((n) => n > 0)) {
    // BFS distances from current position
    const dist = new Array(w * h).fill(-1);
    dist[pos] = 0;
    const q = [pos];
    while (q.length) {
      const u = q.shift();
      for (const v of neighbors(w, h, u)) {
        if (dist[v] >= 0 || !passable(v) || Math.abs(H(v) - H(u)) > CONFIG.MAX_CLIMB) continue;
        dist[v] = dist[u] + 1; q.push(v);
      }
    }
    let best = null;
    for (const [c, need] of remaining) {
      if (need <= 0) continue;
      for (const a of neighbors(w, h, c)) {
        if (dist[a] < 0 || H(a) < H(c)) continue;
        // prefer standing squares that don't need to be built themselves
        const penalty = remaining.get(a) > 0 ? 50 : 0;
        const cost = dist[a] + penalty;
        if (!best || cost < best.cost) best = { c, a, cost, d: dist[a] };
      }
    }
    if (!best) {
      // stepping stone: build a tube next to the target, climb on it, then stack
      let step = null;
      for (const [c, need] of remaining) {
        if (need <= 0) continue;
        for (const a of neighbors(w, h, c)) {
          if (!passable(a) || objects[a] || tubes[a] >= CONFIG.MAX_TUBES_PER_SQUARE) continue;
          if (H(a) + 1 < H(c)) continue;
          const nbs = neighbors(w, h, a).filter((b) => dist[b] >= 0);
          const buildFrom = nbs.filter((b) => H(b) >= H(a));
          const climbFrom = nbs.filter((b) => Math.abs(H(a) + 1 - H(b)) <= CONFIG.MAX_CLIMB);
          if (!buildFrom.length || !climbFrom.length) continue;
          const b = buildFrom.sort((p, q) => dist[p] - dist[q])[0];
          if (!step || dist[b] < step.d) step = { c: a, a: b, d: dist[b] };
        }
      }
      if (step) {
        moves += step.d + 1;
        turns += Math.ceil(step.d / 3) + 2;
        pos = step.a;
        tubes[step.c] += 1;
        builds += 1;
        helpers += 1;
        log.push(`+(${step.c % w},${(step.c / w) | 0})`);
        continue;
      }
      const left = [...remaining].filter(([, n]) => n > 0).map(([i, n]) => `(${i % w},${(i / w) | 0})x${n}`);
      return { ok: false, log, left, moves, builds };
    }
    moves += best.d;
    turns += best.d > 0 ? Math.ceil(best.d / 3) + 1 : 1;
    pos = best.a;
    tubes[best.c] += 1;
    builds += 1;
    remaining.set(best.c, remaining.get(best.c) - 1);
    log.push(`(${best.c % w},${(best.c / w) | 0})`);
  }
  const seconds = (moves * CONFIG.MOVE_INTERVAL_MS + turns * CONFIG.TURN_HOLD_MS) / 1000 + builds * CONFIG.BUILD_TIME_SECONDS;
  return { ok: true, log, moves, builds, helpers, seconds, tubes };
}

// Runs the real engine flood with a given tube layout; returns the score
export function scoreWithTubes(level, tubes) {
  const s = createGame(level);
  startLevel(s);
  s.tubes = tubes.slice();
  s.tubesUsed = tubes.reduce((a, b) => a + b, 0);
  releaseFlood(s);
  for (let t = 0; t < 120000 && s.phase !== 'done'; t += 50) update(s, 50);
  return s.result;
}

export function analyse(level) {
  const { w, h, base, objects } = parseLevel(level);
  const A = CONFIG.START_WATER_LEVEL + levelAmplitude(level);
  const budget = levelBudget(level);
  const timer = levelTimer(level);
  const free = floodWithout(level);
  const mc = minCut(level);
  const bot = mc.flow < INF ? botBuild(level, mc.cut) : { ok: false, left: ['impossible'] };
  const result = bot.ok ? scoreWithTubes(level, bot.tubes) : null;
  return { w, h, base, objects, A, budget, timer, free, mc, bot, result };
}
