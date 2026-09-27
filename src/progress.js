// Player progress: best stars per level, saved in the browser (localStorage).
// A level is unlocked when the previous one has been passed (at least 1 star).
import { CONFIG } from './config.js';
import { LEVELS } from './levels.js';

const STORE_KEY = 'floods-progress-v1';

export const levelKey = (i) => LEVELS[i].id ?? String(i);

export function loadProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(STORE_KEY));
    return p && typeof p === 'object' ? p : {};
  } catch {
    return {};
  }
}

export function saveProgress(p) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
}

export function resetProgress() {
  try { localStorage.removeItem(STORE_KEY); } catch { /* storage unavailable */ }
  return {};
}

export const starsOf = (progress, i) => progress[levelKey(i)] ?? 0;

export function isUnlocked(progress, i) {
  if (CONFIG.UNLOCK_ALL_LEVELS || i === 0) return true;
  return starsOf(progress, i - 1) > 0;
}

// The furthest unlocked level (where the tractor waits on the map)
export function currentLevel(progress) {
  let cur = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (isUnlocked(progress, i)) cur = i;
  }
  // prefer the first unlocked level not yet passed
  for (let i = 0; i <= cur; i++) if (!starsOf(progress, i)) return i;
  return cur;
}

export function totalStars(progress) {
  return LEVELS.reduce((sum, _, i) => sum + starsOf(progress, i), 0);
}
