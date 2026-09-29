// Level checker: `npm run check-levels` (or `npm run check-levels -- 8` for one
// level, add `-v` to print the maps).
// For each level: what floods with no protection, the minimum number of tubes
// to save everything (min-cut), and whether a simple bot can build that
// within the time available, following the tractor rules.
import { LEVELS } from "../src/levels.ts";
import { analyse } from "./solver.ts";
import type { ObjectType } from "../src/types.ts";

const args = process.argv.slice(2);
const verbose = args.includes("-v");
const only = args.find((a) => a !== "-v");
const OBJECT_LETTER: Record<ObjectType, string> = {
  house: "H",
  road: "R",
  tree: "Y",
  building: "B",
  shop: "S",
  field: "F",
  pine: "P",
  rock: "X",
  boulder: "O",
};

for (const level of LEVELS) {
  const id = level.id;
  if (only && id !== only) continue;
  const {
    w,
    h,
    base,
    objects,
    cracked,
    A,
    budget,
    window,
    free,
    mc,
    bot,
    result,
  } = analyse(level);
  const cutSet = new Map(mc.cut.map((c): [number, number] => [c.i, c.need]));
  const mcText = mc.flow >= 1e9 ? "IMPOSSIBLE" : String(mc.flow);
  const botText = bot.ok
    ? `bot OK: ${bot.builds} tubes, ${bot.cuts} cuts, ${Math.round(bot.moves)} moves, ~${bot.seconds.toFixed(0)}s → ${Math.round((result?.ratio ?? 0) * 100)}% saved`
    : `bot FAILED, left: ${bot.left.join(" ")}`;
  const warn: string[] = [];
  if (mc.flow > budget) warn.push("budget < min tubes (full save impossible)");
  if (bot.ok && window && bot.seconds > window)
    warn.push("bot slower than the time available");
  if (free.lost.length === 0) warn.push("nothing floods without protection");
  const side = level.branchFrom ? ` (side, after ${level.branchFrom})` : "";
  console.log(
    `[${id}]${side} ${level.name} ${w}x${h} flood+${A} budget ${budget} time ${window || "∞"}s | ` +
      `objects ${free.objs.length}, lost unprotected ${free.lost.length} | min tubes ${mcText} | ${botText}` +
      (warn.length ? " | ⚠ " + warn.join("; ") : ""),
  );
  if (verbose) {
    for (let y = 0; y < h; y++) {
      let row = "   ";
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const obj = objects[i];
        const o = obj ? OBJECT_LETTER[obj] : cracked[i] ? "C" : " ";
        const c = cutSet.has(i) ? "#" : free.wet[i] ? "~" : " ";
        row += `${base[i]}${o}${c} `;
      }
      console.log(row);
    }
    if (bot.ok) console.log("   bot order: " + bot.log.join(" "));
  }
}
