// Player progress: best stars per level, saved in the browser (localStorage).
// A main level is unlocked when the previous one has been passed (at least 1
// star); a side level when the level it branches from has been passed.
import { CONFIG } from "./config.ts";
import { LEVELS } from "./levels.ts";

/** Best stars per level id */
export type Progress = Record<string, number>;

const STORE_KEY = "floods-progress-v1";

export const levelKey = (i: number): string => LEVELS[i].id ?? String(i);

export function loadProgress(): Progress {
  try {
    const p: unknown = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
    return p && typeof p === "object" ? (p as Progress) : {};
  } catch {
    return {};
  }
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}

export function resetProgress(): Progress {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    /* storage unavailable */
  }
  return {};
}

export const starsOf = (progress: Progress, i: number): number =>
  progress[levelKey(i)] ?? 0;

/** side levels branch off the main path; they are optional */
export const isSide = (i: number): boolean => !!LEVELS[i].branchFrom;
/** indices of the main path, in order */
export const MAIN_PATH: number[] = LEVELS.map((_, i) => i).filter(
  (i) => !isSide(i),
);
export const indexOfId = (id: string): number =>
  LEVELS.findIndex((l) => l.id === id);

export function isUnlocked(progress: Progress, i: number): boolean {
  if (CONFIG.UNLOCK_ALL_LEVELS) return true;
  const from = LEVELS[i].branchFrom;
  if (from) return starsOf(progress, indexOfId(from)) > 0;
  const k = MAIN_PATH.indexOf(i);
  return k <= 0 || starsOf(progress, MAIN_PATH[k - 1]) > 0;
}

/** next level on the main path after `i` (null after a side level or at the end) */
export function nextMain(i: number): number | null {
  if (isSide(i)) return null;
  const k = MAIN_PATH.indexOf(i);
  return k >= 0 && k + 1 < MAIN_PATH.length ? MAIN_PATH[k + 1] : null;
}

// Where the tractor waits on the map: the first unlocked main level not yet passed
export function currentLevel(progress: Progress): number {
  let cur = MAIN_PATH[0];
  for (const i of MAIN_PATH) if (isUnlocked(progress, i)) cur = i;
  for (const i of MAIN_PATH) {
    if (i === cur) break;
    if (!starsOf(progress, i)) return i;
  }
  return cur;
}

export function totalStars(progress: Progress): number {
  return LEVELS.reduce((sum, _, i) => sum + starsOf(progress, i), 0);
}
