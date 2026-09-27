# Floods

A retro, pixel-art flood-protection game in React.

Drive the tractor and build white tubes to keep the rising water away from the houses and roads before the timer runs out.

## Run it

```bash
npm install      # or: pnpm install
npm run dev      # or: pnpm dev
```

Then open the URL that Vite prints (usually http://localhost:5173).

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

- **Tutorial (0a, 0b)**: 5×5 guided levels: building, releasing the flood, the height rule, the timer and stacking.
- **Easy (1–5)**: 8×8 maps.
- **Medium (6–10)**: 12×12 maps.
- **Hard (11–15)**: an island to ring with tubes, a gorge to find, tubes used as steps, a dike to raise while driving on it, and a 16×12 finale.

The levels form a path on a pixel-art world map. Each level unlocks the next one once it is passed (at least 1 star). Progress and best stars are saved in the browser (localStorage) and can be erased with the **RESET PROGRESS** button on the map. Set `UNLOCK_ALL_LEVELS: true` in `src/config.js` to open every level while testing.

In the tutorials, each tip appears in the middle of the field and pauses the game until you press Space (`TUTORIAL_POPUPS` in the config).

## Files

- `src/config.js`: all the balancing variables (timings, climb rule, scoring, colours...).
- `src/levels.js`: level definitions (height grid plus object grid). Add levels here.
- `src/engine.js`: pure game logic (movement, building, flooding, scoring).
- `src/render.js`, `src/sprites.js`: pixel-art canvas renderer.
- `src/Game.jsx`, `src/App.jsx`: React UI (HUD, input, tutorial popups).
- `src/WorldMap.jsx`, `src/worldmap.js`: level progression map (generated from the level list, so new levels extend the path automatically).
- `src/progress.js`: saved progress (stars, unlocking, reset).
- `tools/check-levels.js`, `tools/solver.js`: run `npm run check-levels` (add `-- -v` to print the maps) to see, for each level, what floods without protection, the minimum number of tubes needed to save everything, and whether a simple bot can build it in time following the tractor rules.
