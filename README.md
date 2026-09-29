# Floods

A retro, pixel-art flood-protection game in React.

Drive the tractor and build white tubes to keep the rising water away from the houses and roads before the timer runs out.

## Run it

```bash
pnpm install
pnpm dev
```

Then open the URL that Vite prints (usually http://localhost:5173).

Other scripts: `pnpm build` (type-check + production build), `pnpm typecheck`, `pnpm check-levels`.

The project is written in TypeScript (strict mode). `pnpm check-levels` runs the `.ts` tool directly with Node, which needs Node 22.18 or newer.

## Play online

https://iourisorokine.github.io/floods/

## Deployment

Every push to `main` builds the game and publishes it on GitHub Pages (`.github/workflows/deploy.yml`).
One-time setup: repo Settings > Pages > Source = "GitHub Actions".

## Controls

| Key | Action |
| --- | --- |
| Arrows / WASD (ZQSD) | Drive. A tap on a new direction only turns the tractor; hold the key to drive |
| Space | Start the level / build a tube on the square in front of the tractor (takes 2 s) |
| X | Remove a tube in front of the tractor (it goes back into your budget) |
| Enter / N | Next level (on the result screen) |
| M | Back to the menu (when paused or on the result screen) |
| F | Release the flood now (skip the rest of the timer) |
| R | Restart the level |
| P / Esc | Pause |
| H | Debug: show the elevation numbers |

## Rules

- Each square has an elevation from 0 to 6, shown by the soil colour: 0 is water, 1 dark brown, 2 light brown, 3 light grass and 4 to 6 darker grass.
- A tube raises its square by 1. You can build on the square in front of the tractor only if it is not higher than the square you stand on. To stack tubes, climb somewhere higher first.
- The tractor can climb or descend 1 level at a time, including onto tubes. It can drive on roads but not on houses.
- When the timer ends, the water rises 1 level at a time up to the level's flood amplitude. Water spreads up, down, left and right (never diagonally) onto every square that is not higher than the water.
- Building a tube takes 2 seconds, during which the tractor cannot move.
- The HEIGHTS panel on the right shows which soil colour matches which height, where the water is now and the height the flood will reach.
- Trees block the tractor and cannot be built on.
- Your score is the percentage of objects saved. Saving at least one object passes the level. You earn 1 to 3 stars.

## Levels

The main path has 27 levels in three worlds, plus 3 optional side levels:

- **Countryside (0a–15)**: two 5×5 tutorials, then 8×8 and 12×12 levels up to a 16×12 finale.
- **Mountains (16–20)**: pines, rocks and boulders to push, terrace farms and a mountain lake.
- **Town (21–25)**: buildings, shops and fields; levels 24 and 25 come in **2 waves**.
- **Side levels** branch off the main path and never block it:
  - **S1 Night Watch** (after level 9): at night you only see around the tractor.
  - **S2 Cracked Dikes** (after level 14): cracked dike squares break when the water pushes on them.
  - **S3 Global Warming** (after level 25): 3 waves, +1, +1 and then +2.

A level that introduces a new element shows a short explanation before it starts.

The levels form a path on a pixel-art world map. Each main level unlocks the next one once it is passed (at least 1 star); a side level unlocks when the level it branches from is passed. Progress and best stars are saved in the browser (localStorage) and can be erased with the **RESET PROGRESS** button on the map. Set `UNLOCK_ALL_LEVELS: true` in `src/config.ts` to open every level while testing. Worlds are defined in `src/worlds.ts`.

In the tutorials, each tip appears in the middle of the field and pauses the game until you press Space (`TUTORIAL_POPUPS` in the config).

## Landscape elements

| Code | Element | Rules |
| --- | --- | --- |
| H | House | Worth 1. |
| R | Road | Worth 1. The tractor can drive on it. |
| B | Building | Worth 3. Keeps water out, but is lost as soon as water touches any side. |
| S | Shop | Worth 2. |
| F | Field | Worth 0.5. The tractor drives slowly on it. |
| Y | Tree | Blocks the tractor. |
| P | Pine | Blocks the tractor; press SPACE facing it to cut it down (3 s). |
| X | Rock | Blocks the tractor, holds back water 2 levels above its ground. |
| O | Boulder | Like a rock, but the tractor pushes it by driving into it (flat or downhill only). |
| C | Cracked dike | Breaks (drops 2 levels) when the water pushes on it; a tube on it repairs it. |

Waves, pause lengths, night mode and side-level branches are set per level in `src/levels.ts`; element values, cutting time, field slowdown, rock height and crack behaviour are in `src/config.ts`.

## Files

- `src/config.ts`: all the balancing variables (timings, climb rule, scoring, colours...).
- `src/levels.ts`: level definitions (height grid plus object grid). Add levels here.
- `src/types.ts`: shared types (levels, game state, events).
- `src/engine.ts`: pure game logic (movement, building, flooding, scoring).
- `src/render.ts`, `src/sprites.ts`: pixel-art canvas renderer.
- `src/Game.tsx`, `src/App.tsx`: React UI (HUD, input, tutorial popups).
- `src/WorldMap.tsx`, `src/worldmap.ts`: level progression map (generated from the level list, so new levels extend the path automatically).
- `src/progress.ts`: saved progress (stars, unlocking of main and side levels, reset).
- `src/worlds.ts`: the worlds of the level path and their landscape.
- `tools/check-levels.ts`, `tools/solver.ts`: run `pnpm check-levels` (add `-- -v` to print the maps) to see, for each level, what floods without protection, the minimum number of tubes needed to save everything, and whether a simple bot can build it in time following the tractor rules. The bot cuts pines but treats boulders as fixed, so boulder and triage levels (18, 19, 20, S3) show a budget warning on purpose.
