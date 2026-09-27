// Level checker: `npm run check-levels` (or `npm run check-levels -- 8` for one level)
// For each level: what floods with no protection, the minimum number of tubes
// to save everything (min-cut), and whether a simple bot can build that
// within the timer, following the tractor rules.
import { LEVELS } from '../src/levels.js';
import { analyse } from './solver.js';

const only = process.argv[2];
const verbose = process.argv.includes('-v');

LEVELS.forEach((level, n) => {
  const id = level.id ?? String(n);
  if (only && only !== '-v' && id !== only) return;
  const r = analyse(level);
  const { w, h, base, objects, A, budget, timer, free, mc, bot, result } = r;
  const cutSet = new Map(mc.cut.map((c) => [c.i, c.need]));
  const mcText = mc.flow >= 1e9 ? 'IMPOSSIBLE' : mc.flow;
  const botText = bot.ok
    ? `bot OK: ${bot.builds} tubes, ${bot.moves} moves, ~${bot.seconds.toFixed(0)}s → ${Math.round(result.ratio * 100)}% saved`
    : `bot FAILED, left: ${bot.left?.join(' ')}`;
  const warn = [];
  if (mc.flow > budget) warn.push('budget < min tubes (full save impossible)');
  if (bot.ok && timer && bot.seconds > timer) warn.push('bot slower than timer');
  if (free.lost.length === 0) warn.push('nothing floods without protection');
  console.log(`[${id}] ${level.name} ${w}x${h} flood+${A} budget ${budget} timer ${timer || '∞'}s | objects ${free.objs.length}, lost unprotected ${free.lost.length} | min tubes ${mcText} | ${botText}${warn.length ? ' | ⚠ ' + warn.join('; ') : ''}`);
  if (verbose) {
    for (let y = 0; y < h; y++) {
      let row = '   ';
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const o = objects[i] ? ({ house: 'H', road: 'R', tree: 'Y' })[objects[i]] : ' ';
        const c = cutSet.has(i) ? '#' : free.wet[i] ? '~' : ' ';
        row += `${base[i]}${o}${c} `;
      }
      console.log(row);
    }
    if (bot.ok) console.log('   bot order: ' + bot.log.join(' '));
  }
});
