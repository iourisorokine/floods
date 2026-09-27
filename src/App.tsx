import { useState, useCallback } from "react";
import Game from "./Game.tsx";
import WorldMap from "./WorldMap.tsx";
import { LEVELS } from "./levels.ts";
import {
  loadProgress,
  saveProgress,
  resetProgress,
  levelKey,
  isUnlocked,
} from "./progress.ts";
import type { Progress } from "./progress.ts";
import type { Result } from "./types.ts";

export default function App() {
  const [levelIndex, setLevelIndex] = useState<number | null>(null);
  const [progress, setProgress] = useState<Progress>(loadProgress);

  const onPlay = useCallback((i: number) => setLevelIndex(i), []);
  const onMenu = useCallback(() => setLevelIndex(null), []);
  const onReset = useCallback(() => setProgress(resetProgress()), []);

  const onNext = useCallback(() => {
    setLevelIndex((i) => (i !== null && i + 1 < LEVELS.length ? i + 1 : null));
  }, []);

  const onResult = useCallback(
    (result: Result) => {
      if (levelIndex === null) return;
      setProgress((p) => {
        const key = levelKey(levelIndex);
        if ((p[key] ?? 0) >= result.stars) return p;
        const next = { ...p, [key]: result.stars };
        saveProgress(next);
        return next;
      });
    },
    [levelIndex],
  );

  return (
    <div className="app">
      {levelIndex !== null && isUnlocked(progress, levelIndex) ? (
        <Game
          key={levelIndex}
          level={LEVELS[levelIndex]}
          levelIndex={levelIndex}
          levelCount={LEVELS.length}
          onMenu={onMenu}
          onNext={onNext}
          onResult={onResult}
        />
      ) : (
        <WorldMap progress={progress} onPlay={onPlay} onReset={onReset} />
      )}
    </div>
  );
}
