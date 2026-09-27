import { useEffect, useMemo, useRef, useState } from 'react';
import { CONFIG } from './config.js';
import { LEVELS } from './levels.js';
import { buildWorld, drawWorld } from './worldmap.js';
import { isUnlocked, starsOf, currentLevel, totalStars } from './progress.js';
import { levelAmplitude, levelBudget, levelTimer } from './engine.js';

const SCALE = CONFIG.SCALE;
const T = CONFIG.TILE_PX;

function LockIcon() {
  return (
    <svg width="14" height="16" viewBox="0 0 7 8" shapeRendering="crispEdges" aria-hidden="true">
      <path d="M2 0h3v1H2zM1 1h1v2H1zM5 1h1v2H5zM0 3h7v5H0z" fill="#8b90a8" />
      <path d="M3 5h1v2H3z" fill="#2a2e45" />
    </svg>
  );
}

function Stars({ n, size = 'small' }) {
  return (
    <span className={`stars-row ${size}`}>
      {[0, 1, 2].map((k) => <span key={k} className={k < n ? 'on' : ''}>★</span>)}
    </span>
  );
}

export default function WorldMap({ progress, onPlay, onReset }) {
  const world = useMemo(() => buildWorld(LEVELS.length), []);
  const canvasRef = useRef(null);
  const current = currentLevel(progress);
  const [sel, setSel] = useState(current);
  const [confirmReset, setConfirmReset] = useState(false);

  const statuses = LEVELS.map((_, i) =>
    !isUnlocked(progress, i) ? 'locked' : starsOf(progress, i) > 0 ? 'done' : 'open');

  // keep the selection on the current level after a reset
  useEffect(() => { setSel(currentLevel(progress)); }, [progress]);

  // animated canvas (water glints, tractor)
  const statusKey = statuses.join(',');
  useEffect(() => {
    let raf;
    const loop = (t) => {
      const c = canvasRef.current;
      if (c) drawWorld(c.getContext('2d'), world, statusKey.split(','), current, t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [world, statusKey, current]);

  // keyboard: arrows move along the path, Enter plays
  useEffect(() => {
    const onKey = (e) => {
      if (confirmReset) {
        if (e.key === 'Escape') setConfirmReset(false);
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSel((s) => (s + 1 < LEVELS.length && isUnlocked(progress, s + 1) ? s + 1 : s));
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault();
        setSel((s) => Math.max(0, s - 1));
      }
      if ((e.key === 'Enter' || e.key === ' ') && isUnlocked(progress, sel)) {
        e.preventDefault();
        onPlay(sel);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel, progress, onPlay, confirmReset]);

  const lvl = LEVELS[sel];
  const selUnlocked = isUnlocked(progress, sel);
  const total = totalStars(progress);
  const W = world.w * T * SCALE, H = world.h * T * SCALE;

  // one signpost per group, at its first level
  const groupStarts = LEVELS.map((l, i) => (i === 0 || l.group !== LEVELS[i - 1].group ? i : -1)).filter((i) => i >= 0 && LEVELS[i].group);

  return (
    <div className="map-screen" style={{ width: W }}>
      <header className="map-header">
        <h1 className="logo small-logo">FLOODS</h1>
        <div className="map-header-right">
          <span className="total-stars">★ {total} / {LEVELS.length * 3}</span>
          {confirmReset ? (
            <span className="confirm">
              Erase all progress?
              <button className="danger" onClick={() => { onReset(); setConfirmReset(false); }}>YES</button>
              <button onClick={() => setConfirmReset(false)}>NO</button>
            </span>
          ) : (
            <button onClick={() => setConfirmReset(true)}>RESET PROGRESS</button>
          )}
        </div>
      </header>

      <div className="map" style={{ width: W, height: H }}>
        <canvas
          ref={canvasRef}
          width={world.w * T}
          height={world.h * T}
          style={{ width: W, height: H }}
        />
        {groupStarts.map((i) => {
          const n = world.nodes[i];
          return (
            <div
              key={'g' + i}
              className="signpost"
              style={{ left: n.x * T * SCALE + (T * SCALE) / 2, top: n.y * T * SCALE - 30 }}
            >
              {LEVELS[i].group.toUpperCase()}
            </div>
          );
        })}
        {world.nodes.map((n, i) => {
          const st = statuses[i];
          return (
            <button
              key={i}
              className={`node ${st} ${i === sel ? 'sel' : ''} ${i === current ? 'current' : ''}`}
              style={{ left: n.x * T * SCALE + (T * SCALE) / 2, top: n.y * T * SCALE + (T * SCALE) / 2 }}
              onClick={() => { if (st !== 'locked') { if (i === sel) onPlay(i); else setSel(i); } else setSel(i); }}
              onDoubleClick={() => st !== 'locked' && onPlay(i)}
              title={LEVELS[i].name}
            >
              <span className="node-id">{st === 'locked' ? <LockIcon /> : (LEVELS[i].id ?? i).toUpperCase()}</span>
              {st === 'done' && <Stars n={starsOf(progress, i)} />}
            </button>
          );
        })}
      </div>

      <div className="panel level-card">
        <div className="level-card-main">
          <div className="small">LEVEL {(lvl.id ?? sel).toUpperCase()} · {lvl.group?.toUpperCase()}</div>
          <h2>{lvl.name}</h2>
          <p className="level-card-intro">{selUnlocked ? lvl.intro : 'Pass the previous level to unlock this one.'}</p>
          <div className="facts left">
            <span>MAP <b>{lvl.heights[0].length}×{lvl.heights.length}</b></span>
            <span>FLOOD <b>+{levelAmplitude(lvl)}</b></span>
            <span>TUBES <b>{levelBudget(lvl)}</b></span>
            <span>TIME <b>{levelTimer(lvl) ? `${levelTimer(lvl)}s` : 'no limit'}</b></span>
          </div>
        </div>
        <div className="level-card-side">
          <Stars n={starsOf(progress, sel)} size="big" />
          <button className="play" disabled={!selUnlocked} onClick={() => onPlay(sel)}>
            {selUnlocked ? (starsOf(progress, sel) ? 'REPLAY' : 'PLAY') : 'LOCKED'}
          </button>
        </div>
      </div>
      <p className="map-help">ARROWS move along the path · ENTER to play · click a level to select it, click again to play</p>
    </div>
  );
}
