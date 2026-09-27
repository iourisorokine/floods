// Pure game logic — no React, no drawing. Easy to test and to tweak.
import { CONFIG } from './config.js';

export const DIRS = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};
const NEIGHBORS = Object.values(DIRS);

// Object codes used in the level `objects` grid
export const OBJECT_CODES = { H: 'house', R: 'road', Y: 'tree' };
// Objects that count for the score (must be protected)
export const PROTECTED = new Set(['house', 'road']);

// ---------------------------------------------------------------------------
// Level parsing
// ---------------------------------------------------------------------------
export function parseLevel(level) {
  const h = level.heights.length;
  const w = level.heights[0].replace(/\s/g, '').length;
  const base = new Array(w * h);
  const objects = new Array(w * h).fill(null);
  let start = null;
  for (let y = 0; y < h; y++) {
    const hRow = level.heights[y].replace(/\s/g, '');
    const oRow = (level.objects?.[y] ?? '').replace(/\s/g, '');
    if (hRow.length !== w) throw new Error(`Level "${level.name}": heights row ${y} has ${hRow.length} squares, expected ${w}`);
    if (level.objects && oRow.length !== w) throw new Error(`Level "${level.name}": objects row ${y} has ${oRow.length} squares, expected ${w}`);
    for (let x = 0; x < w; x++) {
      base[y * w + x] = parseInt(hRow[x], 10);
      const c = oRow[x] ?? '.';
      if (OBJECT_CODES[c]) objects[y * w + x] = OBJECT_CODES[c];
      if (c === 'T') start = { x, y };
    }
  }
  if (!start) throw new Error(`Level "${level.name}": no tractor start (T) in objects grid`);
  return { w, h, base, objects, start };
}

export const levelTimer = (level) => level.timer ?? CONFIG.DEFAULT_TIMER_SECONDS;
export const levelAmplitude = (level) => level.floodAmplitude ?? CONFIG.DEFAULT_FLOOD_AMPLITUDE;
export const levelBudget = (level) => level.tubeBudget ?? CONFIG.DEFAULT_TUBE_BUDGET;

// ---------------------------------------------------------------------------
// Game creation
// ---------------------------------------------------------------------------
export function createGame(level) {
  const { w, h, base, objects, start } = parseLevel(level);
  const timer = levelTimer(level);
  const s = {
    level,
    w, h,
    base,
    tubes: new Array(w * h).fill(0),
    objects,
    lost: new Array(w * h).fill(false),
    water: new Array(w * h).fill(false),
    floodedAt: new Array(w * h).fill(-1), // time (ms) a square got flooded, for animation
    waterLevel: CONFIG.START_WATER_LEVEL,
    targetLevel: CONFIG.START_WATER_LEVEL + levelAmplitude(level),
    phase: 'intro', // 'intro' -> 'build' -> 'flood' -> 'done'
    noTimer: !timer, // timer 0 = wait for the player to press F
    timeLeft: timer ? timer * 1000 : Infinity,
    tubesLeft: levelBudget(level),
    tubesUsed: 0,
    tractor: { x: start.x, y: start.y, dir: level.startDir ?? 'right', stuck: false, moved: false },
    action: null, // { type: 'build' | 'remove', x, y, elapsed, total }
    clock: 0,
    riseTimer: 0,
    spreadTimer: 0,
    settleTimer: 0,
    tutorialStep: 0,
    result: null,
  };
  // Initial water: height-0 squares are always water, then let it settle at START level
  for (let i = 0; i < w * h; i++) if (base[i] === 0) s.water[i] = true;
  while (spreadStep(s, false).length) { /* settle instantly */ }
  return s;
}

export function startLevel(s) {
  if (s.phase === 'intro') s.phase = 'build';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export const idx = (s, x, y) => y * s.w + x;
export const inBounds = (s, x, y) => x >= 0 && y >= 0 && x < s.w && y < s.h;
export const heightAt = (s, x, y) => s.base[idx(s, x, y)] + s.tubes[idx(s, x, y)];
const active = (s) => (s.phase === 'build' || s.phase === 'flood') && !s.tractor.stuck;

export function frontCell(s) {
  const { dx, dy } = DIRS[s.tractor.dir];
  return { x: s.tractor.x + dx, y: s.tractor.y + dy };
}

export function canEnter(s, x, y) {
  if (!inBounds(s, x, y)) return false;
  const i = idx(s, x, y);
  if (s.water[i]) return false;
  const obj = s.objects[i];
  if (obj === 'house' || obj === 'tree') return false;
  if (obj === 'road' && !CONFIG.TRACTOR_CAN_DRIVE_ON_ROADS) return false;
  const diff = Math.abs(heightAt(s, x, y) - heightAt(s, s.tractor.x, s.tractor.y));
  return diff <= CONFIG.MAX_CLIMB;
}

// ---------------------------------------------------------------------------
// Player actions
// ---------------------------------------------------------------------------
export function turn(s, dir) {
  if (!active(s) || s.action) return false;
  s.tractor.dir = dir;
  return true;
}

// returns 'moved' | 'blocked' | 'busy'
export function tryMove(s, dir) {
  if (!active(s)) return 'blocked';
  if (s.action) return 'busy';
  s.tractor.dir = dir;
  const { dx, dy } = DIRS[dir];
  const nx = s.tractor.x + dx, ny = s.tractor.y + dy;
  if (!canEnter(s, nx, ny)) return 'blocked';
  s.tractor.x = nx;
  s.tractor.y = ny;
  s.tractor.moved = true;
  return 'moved';
}

// Why building is (not) possible on the square in front. Returns null if OK.
export function buildBlocker(s) {
  if (s.phase === 'intro' || s.phase === 'done') return 'over';
  if (s.tractor.stuck) return 'stuck';
  if (s.action) return 'busy';
  const { x, y } = frontCell(s);
  if (!inBounds(s, x, y)) return 'edge';
  const i = idx(s, x, y);
  if (s.tubesLeft <= 0) return 'no tubes left';
  if (s.water[i] && !CONFIG.CAN_BUILD_ON_WATER) return 'water';
  if (s.objects[i] && !CONFIG.CAN_BUILD_ON_OBJECTS) return 'object';
  if (s.objects[i] === 'tree') return 'object';
  if (s.tubes[i] >= CONFIG.MAX_TUBES_PER_SQUARE) return 'max height';
  if (heightAt(s, x, y) > heightAt(s, s.tractor.x, s.tractor.y)) return 'too high';
  return null;
}

// Starts building; the tube appears after BUILD_TIME_SECONDS (see update)
export function tryBuild(s) {
  const reason = buildBlocker(s);
  if (reason) return { ok: false, reason };
  const { x, y } = frontCell(s);
  s.tubesLeft -= 1; // reserved now, refunded if the build is cancelled
  s.action = { type: 'build', x, y, elapsed: 0, total: CONFIG.BUILD_TIME_SECONDS * 1000 };
  if (s.action.total <= 0) finishAction(s);
  return { ok: true, x, y };
}

export function tryRemove(s) {
  if (!CONFIG.ALLOW_REMOVE_TUBE || !active(s) || s.action) return { ok: false };
  const { x, y } = frontCell(s);
  if (!inBounds(s, x, y)) return { ok: false };
  const i = idx(s, x, y);
  if (s.tubes[i] <= 0 || s.water[i]) return { ok: false };
  s.action = { type: 'remove', x, y, elapsed: 0, total: CONFIG.REMOVE_TIME_SECONDS * 1000 };
  if (s.action.total <= 0) finishAction(s);
  return { ok: true, x, y };
}

function finishAction(s) {
  const a = s.action;
  s.action = null;
  const i = idx(s, a.x, a.y);
  if (a.type === 'build') {
    if (s.water[i] && !CONFIG.CAN_BUILD_ON_WATER) { s.tubesLeft += 1; return 'cancel'; }
    s.tubes[i] += 1;
    s.tubesUsed += 1;
    return 'built';
  }
  if (s.tubes[i] > 0 && !s.water[i]) {
    s.tubes[i] -= 1;
    s.tubesLeft += 1;
    s.tubesUsed -= 1;
    return 'removed';
  }
  return 'cancel';
}

export function releaseFlood(s) {
  if (s.phase === 'build') s.timeLeft = 0;
}

// ---------------------------------------------------------------------------
// Water
// ---------------------------------------------------------------------------
// One step of spreading: every dry square next to water whose height is
// <= water level gets flooded (4 directions, no diagonals).
function spreadStep(s, record = true) {
  const newly = [];
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const i = idx(s, x, y);
      if (s.water[i] || heightAt(s, x, y) > s.waterLevel) continue;
      for (const { dx, dy } of NEIGHBORS) {
        const nx = x + dx, ny = y + dy;
        if (inBounds(s, nx, ny) && s.water[idx(s, nx, ny)]) { newly.push(i); break; }
      }
    }
  }
  for (const i of newly) {
    s.water[i] = true;
    s.floodedAt[i] = record ? s.clock : -1;
    if (PROTECTED.has(s.objects[i])) s.lost[i] = true;
    if (i === idx(s, s.tractor.x, s.tractor.y)) { s.tractor.stuck = true; }
  }
  return newly;
}

// ---------------------------------------------------------------------------
// Tutorial steps: level.tutorial = [{ text, until, mark }]
//   until: 'moved' | 'tubes>=N' | 'tubes@x,y>=N' | 'at x,y' | 'height>=N' | 'flood'
// ---------------------------------------------------------------------------
export function stepDone(s, until) {
  if (!until) return false;
  let m;
  if (until === 'moved') return s.tractor.moved;
  if (until === 'flood') return s.phase === 'flood' || s.phase === 'done';
  if ((m = until.match(/^tubes>=(\d+)$/))) return s.tubesUsed >= +m[1];
  if ((m = until.match(/^tubes@(\d+),(\d+)>=(\d+)$/))) return s.tubes[idx(s, +m[1], +m[2])] >= +m[3];
  if ((m = until.match(/^at (\d+),(\d+)$/))) return s.tractor.x === +m[1] && s.tractor.y === +m[2];
  if ((m = until.match(/^height>=(\d+)$/))) return heightAt(s, s.tractor.x, s.tractor.y) >= +m[1];
  return false;
}

export function currentTutorial(s) {
  return s.level.tutorial?.[s.tutorialStep] ?? null;
}

// ---------------------------------------------------------------------------
// Tick — returns a list of events for sounds/UI
// ---------------------------------------------------------------------------
export function update(s, dt) {
  const events = [];
  if (s.phase === 'intro' || s.phase === 'done') return events;
  s.clock += dt;

  // tutorial progression
  const steps = s.level.tutorial;
  // (a step also completes when the player already did what the next one asks)
  while (steps && s.tutorialStep < steps.length - 1 &&
    (stepDone(s, steps[s.tutorialStep].until) || stepDone(s, steps[s.tutorialStep + 1].until))) {
    s.tutorialStep += 1;
    events.push({ type: 'tutorial', step: s.tutorialStep });
  }

  // build / remove in progress
  if (s.action) {
    if (s.tractor.stuck) {
      if (s.action.type === 'build') s.tubesLeft += 1;
      s.action = null;
    } else {
      s.action.elapsed += dt;
      if (s.action.elapsed >= s.action.total) {
        const r = finishAction(s);
        events.push({ type: r });
      }
    }
  }

  if (s.phase === 'build') {
    if (!s.noTimer) s.timeLeft = Math.max(0, s.timeLeft - dt);
    if (s.timeLeft <= 0) {
      s.phase = 'flood';
      s.riseTimer = riseInterval(s) - CONFIG.FIRST_RISE_DELAY_SECONDS * 1000;
      events.push({ type: 'flood-start' });
    }
    return events;
  }

  // flood phase
  s.riseTimer += dt;
  if (s.waterLevel < s.targetLevel && s.riseTimer >= riseInterval(s)) {
    s.riseTimer = 0;
    s.waterLevel += 1;
    s.settleTimer = 0;
    events.push({ type: 'rise', level: s.waterLevel });
  }

  s.spreadTimer += dt;
  while (s.spreadTimer >= CONFIG.SPREAD_STEP_MS) {
    s.spreadTimer -= CONFIG.SPREAD_STEP_MS;
    const newly = spreadStep(s);
    if (newly.length) {
      s.settleTimer = 0;
      const lostNow = newly.filter((i) => PROTECTED.has(s.objects[i]));
      if (lostNow.length) events.push({ type: 'lost', count: lostNow.length });
      if (s.tractor.stuck && newly.includes(idx(s, s.tractor.x, s.tractor.y))) events.push({ type: 'stuck' });
    }
  }

  if (s.waterLevel >= s.targetLevel) {
    s.settleTimer += dt;
    if (s.settleTimer >= CONFIG.SETTLE_SECONDS * 1000) {
      s.phase = 'done';
      s.action = null;
      s.result = score(s);
      events.push({ type: 'done', result: s.result });
    }
  }
  return events;
}

const riseInterval = (s) => (s.level.riseInterval ?? CONFIG.RISE_INTERVAL_SECONDS) * 1000;

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------
export function score(s) {
  let total = 0, saved = 0;
  const counts = {};
  s.objects.forEach((obj, i) => {
    if (!PROTECTED.has(obj)) return;
    const wgt = CONFIG.OBJECT_WEIGHTS[obj] ?? 1;
    total += wgt;
    counts[obj] ??= { total: 0, saved: 0 };
    counts[obj].total += 1;
    if (!s.lost[i]) { saved += wgt; counts[obj].saved += 1; }
  });
  const ratio = total ? saved / total : 1;
  const thresholds = s.level.stars ?? CONFIG.STAR_THRESHOLDS;
  const stars = thresholds.filter((t) => ratio >= t - 1e-9).length;
  return { ratio, stars, passed: ratio >= CONFIG.PASS_THRESHOLD - 1e-9, counts, tubesUsed: s.tubesUsed };
}
