import { useState, useCallback } from 'react';
import Game from './Game.jsx';
import WorldMap from './WorldMap.jsx';
import { LEVELS } from './levels.js';
import { loadProgress, saveProgress, resetProgress, levelKey, isUnlocked } from './progress.js';

export default function App() {
  const [levelIndex, setLevelIndex] = useState(null);
  const [progress, setProgress] = useState(loadProgress);

  const onPlay = useCallback((i) => setLevelIndex(i), []);
  const onMenu = useCallback(() => setLevelIndex(null), []);
  const onReset = useCallback(() => setProgress(resetProgress()), []);

  const onNext = useCallback(() => {
    setLevelIndex((i) => (i + 1 < LEVELS.length ? i + 1 : null));
  }, []);

  const onResult = useCallback((result) => {
    setProgress((p) => {
      const key = levelKey(levelIndex);
      if ((p[key] ?? 0) >= result.stars) return p;
      const next = { ...p, [key]: result.stars };
      saveProgress(next);
      return next;
    });
  }, [levelIndex]);

  const canPlay = levelIndex !== null && isUnlocked(progress, levelIndex);

  return (
    <div className="app">
      {!canPlay ? (
        <WorldMap progress={progress} onPlay={onPlay} onReset={onReset} />
      ) : (
        <Game
          key={levelIndex}
          level={LEVELS[levelIndex]}
          levelIndex={levelIndex}
          levelCount={LEVELS.length}
          onMenu={onMenu}
          onNext={onNext}
          onResult={onResult}
        />
      )}
    </div>
  );
}
