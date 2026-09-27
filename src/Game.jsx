import { useEffect, useRef, useState, useCallback } from 'react';
import { CONFIG } from './config.js';
import * as E from './engine.js';
import { render } from './render.js';
import { sfx } from './sound.js';

const KEY_DIRS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
  W: 'up', S: 'down', A: 'left', D: 'right',
  z: 'up', q: 'left', Z: 'up', Q: 'left', // AZERTY
};

const BLOCK_MESSAGES = {
  'too high': 'Too high! Stand on a higher square to build here',
  water: "Can't build on water",
  object: "Can't build on that",
  edge: 'Edge of the map',
  'no tubes left': 'No tubes left!',
  'max height': 'Maximum stack reached',
  stuck: 'Tractor is stuck in the water!',
  busy: 'Already building...',
};

const TERRAIN_NAMES = { 0: 'water', 1: 'dark soil', 2: 'soil', 3: 'grass', 4: 'hill', 5: 'high hill', 6: 'peak' };


function hudFromState(s) {
  const tut = E.currentTutorial(s);
  return {
    phase: s.phase,
    seconds: Math.ceil(s.timeLeft / 1000),
    noTimer: s.noTimer,
    tubesLeft: s.tubesLeft,
    waterLevel: s.waterLevel,
    targetLevel: s.targetLevel,
    stuck: s.tractor.stuck,
    result: s.result,
    tutorialStep: s.tutorialStep,
    tutorialText: tut?.text ?? null,
  };
}

function HeightScale({ hud }) {
  const levels = [6, 5, 4, 3, 2, 1, 0];
  return (
    <div className="side-box">
      <div className="side-title">HEIGHTS</div>
      <div className="scale">
        {levels.map((h) => {
          const wet = hud && h <= hud.waterLevel;
          const willFlood = hud && h <= hud.targetLevel;
          const isTarget = hud && h === hud.targetLevel;
          return (
            <div key={h} className={`scale-row ${isTarget ? 'target' : ''}`}>
              <span
                className="swatch"
                style={{ background: h === 0 ? CONFIG.WATER_COLORS[0] : CONFIG.SOIL_COLORS[h] }}
              />
              <span className="scale-num">{h}</span>
              <span className="scale-name">{TERRAIN_NAMES[h]}</span>
              <span className={`scale-water ${wet ? 'wet' : willFlood ? 'will' : ''}`} />
              {isTarget && <span className="flood-arrow">◄ FLOOD</span>}
            </div>
          );
        })}
      </div>
      <div className="scale-legend">
        <span><i className="scale-water wet" /> water now</span>
        <span><i className="scale-water will" /> will flood</span>
      </div>
      <div className="scale-legend">
        <span><span className="tube-icon" /> tube = +1 height</span>
      </div>
    </div>
  );
}

export default function Game({ level, levelIndex, levelCount, onMenu, onNext, onResult }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const inputRef = useRef({ held: [], nextMoveAt: 0 });
  const viewRef = useRef({ pos: { x: 0, y: 0 }, showHeights: CONFIG.SHOW_HEIGHT_NUMBERS, paused: false, modal: false, tipShown: -1 });
  const [hud, setHud] = useState(null);
  const [toast, setToast] = useState(null);
  const [paused, setPaused] = useState(false);
  const [banner, setBanner] = useState(null);
  const [tip, setTip] = useState(null); // tutorial step shown as a popup
  const toastTimer = useRef(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const showToast = useCallback((msg, ms = 1400) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);

  const showBanner = useCallback((msg, ms = 1800) => {
    setBanner(msg);
    setTimeout(() => setBanner((b) => (b === msg ? null : b)), ms);
  }, []);

  const restart = useCallback((skipIntro = false) => {
    const s = E.createGame(level);
    if (skipIntro) E.startLevel(s);
    stateRef.current = s;
    viewRef.current.pos = { x: s.tractor.x, y: s.tractor.y };
    viewRef.current.paused = false;
    viewRef.current.modal = false;
    viewRef.current.tipShown = -1;
    inputRef.current = { held: [], nextMoveAt: 0 };
    setPaused(false);
    setTip(null);
    setBanner(null);
    setHud(hudFromState(s));
  }, [level]);

  // (re)create game when the level changes
  useEffect(() => { restart(); }, [restart]);

  // ---- keyboard ----------------------------------------------------------
  useEffect(() => {
    const onDown = (e) => {
      const s = stateRef.current;
      if (!s) return;
      const dir = KEY_DIRS[e.key];
      if (dir || e.key === ' ') e.preventDefault();

      if (s.phase === 'intro') {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) E.startLevel(s);
        if (e.key === 'Escape' || e.key === 'm' || e.key === 'M') onMenu();
        return;
      }
      if (viewRef.current.modal) {
        // tutorial popup: any of these keys closes it and resumes the game
        if ((e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') && !e.repeat) closeTip();
        if (e.key === 'r' || e.key === 'R') restart(true);
        return;
      }
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        if (s.phase !== 'done') {
          viewRef.current.paused = !viewRef.current.paused;
          setPaused(viewRef.current.paused);
        }
        return;
      }
      if (e.key === 'r' || e.key === 'R') { restart(true); return; }
      if (e.key === 'h' || e.key === 'H') { viewRef.current.showHeights = !viewRef.current.showHeights; return; }
      if (s.phase === 'done') {
        if (e.key === 'Enter' || e.key === 'n' || e.key === 'N') {
          if (s.result?.passed && levelIndex < levelCount - 1) onNext(); else restart(true);
        }
        if (e.key === 'm' || e.key === 'M') onMenu();
        return;
      }
      if (viewRef.current.paused) {
        if (e.key === 'm' || e.key === 'M') onMenu();
        return;
      }

      if (dir) {
        if (e.repeat) return;
        const inp = inputRef.current;
        inp.held = inp.held.filter((d) => d !== dir).concat(dir);
        const now = performance.now();
        if (s.action) return;
        if (s.tractor.dir !== dir) {
          E.turn(s, dir);
          inp.nextMoveAt = now + CONFIG.TURN_HOLD_MS;
        } else {
          doMove(s, dir);
          inp.nextMoveAt = now + CONFIG.MOVE_INTERVAL_MS;
        }
        return;
      }
      if (e.key === ' ') {
        if (e.repeat) return;
        const r = E.tryBuild(s);
        if (r.ok) sfx.buildStart();
        else if (r.reason !== 'busy') { sfx.blocked(); showToast(BLOCK_MESSAGES[r.reason] ?? "Can't build here"); }
        return;
      }
      if ((e.key === 'x' || e.key === 'X') && CONFIG.ALLOW_REMOVE_TUBE) {
        const r = E.tryRemove(s);
        if (r.ok) sfx.buildStart(); else sfx.blocked();
        return;
      }
      if ((e.key === 'f' || e.key === 'F') && s.phase === 'build') {
        E.releaseFlood(s);
      }
    };
    const onUp = (e) => {
      const dir = KEY_DIRS[e.key];
      if (!dir) return;
      inputRef.current.held = inputRef.current.held.filter((d) => d !== dir);
    };
    const onBlur = () => { inputRef.current.held = []; };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [restart, onMenu, onNext, levelIndex, levelCount, showToast]);

  function closeTip() {
    viewRef.current.modal = false;
    inputRef.current = { held: [], nextMoveAt: 0 };
    setTip(null);
  }

  function doMove(s, dir) {
    const r = E.tryMove(s, dir);
    if (r === 'moved') sfx.move();
    return r;
  }

  // ---- main loop ----------------------------------------------------------
  useEffect(() => {
    let raf;
    let last = performance.now();
    let lastHudKey = '';
    let lastSecond = null;
    let lastBuildTick = -1;
    const loop = (now) => {
      const dt = Math.min(100, now - last);
      last = now;
      const s = stateRef.current;
      const canvas = canvasRef.current;
      if (s && canvas) {
        const view = viewRef.current;
        if (!view.paused && !view.modal) {
          // held direction -> continuous driving
          const inp = inputRef.current;
          const dir = inp.held[inp.held.length - 1];
          if (dir && now >= inp.nextMoveAt && !s.action && (s.phase === 'build' || s.phase === 'flood')) {
            if (s.tractor.dir !== dir) E.turn(s, dir);
            doMove(s, dir);
            inp.nextMoveAt = now + CONFIG.MOVE_INTERVAL_MS;
          }
          // game tick
          const events = E.update(s, dt);
          for (const ev of events) {
            if (ev.type === 'built') sfx.build();
            if (ev.type === 'removed') sfx.remove();
            if (ev.type === 'flood-start') { sfx.floodStart(); showBanner('THE WATER IS RISING!'); }
            if (ev.type === 'rise') sfx.rise();
            if (ev.type === 'lost') sfx.lost();
            if (ev.type === 'tutorial') sfx.tick();
            if (ev.type === 'stuck') showToast('Your tractor is stuck in the water!', 2500);
            if (ev.type === 'done') {
              (ev.result.passed ? sfx.win : sfx.lose)();
              onResultRef.current?.(ev.result);
            }
          }
          // building ticks
          if (s.action) {
            const k = Math.floor(s.action.elapsed / 250);
            if (k !== lastBuildTick) { lastBuildTick = k; sfx.work(); }
          } else lastBuildTick = -1;
          // countdown ticks
          const sec = Math.ceil(s.timeLeft / 1000);
          if (s.phase === 'build' && sec !== lastSecond && sec <= CONFIG.WARNING_SECONDS && sec > 0) sfx.tick();
          lastSecond = sec;
          // smooth tractor motion
          const k = Math.min(1, dt / (CONFIG.MOVE_INTERVAL_MS * 0.45));
          view.pos.x += (s.tractor.x - view.pos.x) * k;
          view.pos.y += (s.tractor.y - view.pos.y) * k;
          if (Math.abs(s.tractor.x - view.pos.x) < 0.02) view.pos.x = s.tractor.x;
          if (Math.abs(s.tractor.y - view.pos.y) < 0.02) view.pos.y = s.tractor.y;
        }
        // tutorial: show each new step as a popup in the middle of the field
        if (CONFIG.TUTORIAL_POPUPS && s.level.tutorial && !view.modal && !view.paused &&
          (s.phase === 'build' || s.phase === 'flood') && s.tutorialStep !== view.tipShown) {
          view.tipShown = s.tutorialStep;
          view.modal = true;
          inputRef.current.held = [];
          setTip(s.tutorialStep);
        }
        const ctx = canvas.getContext('2d');
        render(ctx, s, { time: now, tractorPos: view.pos, showHeights: view.showHeights });

        const h = hudFromState(s);
        const key = JSON.stringify(h);
        if (key !== lastHudKey) { lastHudKey = key; setHud(h); }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [showBanner, showToast]);

  const s = stateRef.current;
  const w = s?.w ?? 12, h = s?.h ?? 12;
  const scale = CONFIG.SCALE;
  const stageW = Math.max(CONFIG.STAGE_MIN_W, w * CONFIG.TILE_PX * scale + 16);
  const stageH = Math.max(CONFIG.STAGE_MIN_H, h * CONFIG.TILE_PX * scale + 16);
  const W = w * CONFIG.TILE_PX, H = h * CONFIG.TILE_PX;
  const warn = hud && hud.phase === 'build' && !hud.noTimer && hud.seconds <= CONFIG.WARNING_SECONDS;
  const mm = hud && !hud.noTimer ? `${Math.floor(hud.seconds / 60)}:${String(hud.seconds % 60).padStart(2, '0')}` : '--:--';
  const levelLabel = level.id ? `LEVEL ${level.id.toUpperCase()}` : `LEVEL ${levelIndex + 1}`;
  const isTutorial = !!level.tutorial;
  const amplitude = E.levelAmplitude(level);

  return (
    <div className="game">
      <div className="hud">
        <div className="hud-cell wide">
          <span className="label">{levelLabel}</span>
          <span className="value small">{level.name}</span>
        </div>
        <div className="hud-cell">
          <span className="label">{hud?.phase === 'flood' || hud?.phase === 'done' ? 'WATER' : 'TIME'}</span>
          {hud?.phase === 'flood' || hud?.phase === 'done'
            ? <span className="value warn">{hud?.phase === 'done' ? 'OVER' : 'RISING'}</span>
            : <span className={`value ${warn ? 'warn' : ''}`}>{hud?.noTimer ? 'F = GO' : mm}</span>}
        </div>
        <div className="hud-cell">
          <span className="label">TUBES</span>
          <span className="value">
            <span className="tube-icon" /> x{hud?.tubesLeft ?? 0}
          </span>
        </div>
        <div className="hud-cell">
          <span className="label">FLOOD HEIGHT</span>
          <span className="value flood-value">+{amplitude}</span>
        </div>
      </div>

      <div className="play-row">
        <div className="stage" style={{ width: stageW, height: stageH }}>
          <div className="board" style={{ width: W * scale, height: H * scale }}>
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              style={{ width: W * scale, height: H * scale }}
            />
          </div>
          {tip !== null && level.tutorial?.[tip] && (
            <div className="overlay tip-overlay" onClick={closeTip}>
              <div className="panel tip-popup">
                <div className="side-title">TUTORIAL {tip + 1}/{level.tutorial.length}</div>
                <p>{level.tutorial[tip].text}</p>
                <button onClick={closeTip}>OK (SPACE)</button>
              </div>
            </div>
          )}
          {toast && <div className="toast">{toast}</div>}
          {banner && <div className="banner">{banner}</div>}
          {hud?.phase === 'intro' && (
            <div className="overlay">
              <div className="panel intro-panel">
                <div className="small">{levelLabel}</div>
                <h2>{level.name}</h2>
                {level.intro && <p>{level.intro}</p>}
                <div className="facts">
                  <span>FLOOD <b>+{amplitude}</b></span>
                  <span>TUBES <b>{E.levelBudget(level)}</b></span>
                  <span>TIME <b>{E.levelTimer(level) ? `${E.levelTimer(level)}s` : 'no limit'}</b></span>
                </div>
                <p className="blink">PRESS SPACE TO START</p>
              </div>
            </div>
          )}
          {paused && (
            <div className="overlay">
              <div className="panel">
                <h2>PAUSED</h2>
                <p>P / ESC to resume</p>
                <p>R to restart</p>
                <p>M for the map</p>
              </div>
            </div>
          )}
          {hud?.result && (
            <div className="overlay">
              <div className="panel">
                <h2>{hud.result.passed ? (hud.result.stars === 3 ? 'ALL SAVED!' : 'LEVEL PASSED') : 'FLOODED...'}</h2>
                <div className="stars">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className={`star ${i < hud.result.stars ? 'on' : ''}`}>★</span>
                  ))}
                </div>
                <p>{Math.round(hud.result.ratio * 100)}% saved</p>
                {Object.entries(hud.result.counts).map(([k, v]) => (
                  <p key={k} className="small">{k}s: {v.saved}/{v.total}</p>
                ))}
                <p className="small">tubes used: {hud.result.tubesUsed}</p>
                <div className="buttons">
                  <button onClick={() => restart(true)}>RETRY (R)</button>
                  {hud.result.passed && levelIndex < levelCount - 1 && <button onClick={onNext}>NEXT (N)</button>}
                  <button onClick={onMenu}>MAP (M)</button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="side">
          <HeightScale hud={hud} />
          {tip === null && (hud?.tutorialText || level.intro) && (
            <div className={`side-box tip ${isTutorial ? 'tutorial' : ''}`}>
              <div className="side-title">{isTutorial ? `TUTORIAL ${hud?.tutorialStep + 1}/${level.tutorial.length}` : 'TIP'}</div>
              <p key={hud?.tutorialStep}>{hud?.tutorialText ?? level.intro}</p>
            </div>
          )}
        </div>
      </div>

      <div className="help">
        <span><b>ARROWS/WASD</b> drive (tap = turn)</span>
        <span><b>SPACE</b> build tube ({CONFIG.BUILD_TIME_SECONDS}s)</span>
        {CONFIG.ALLOW_REMOVE_TUBE && <span><b>X</b> remove tube</span>}
        <span><b>F</b> release flood now</span>
        <span><b>R</b> restart</span>
        <span><b>P</b> pause</span>
        <span><b>M</b> map (when paused/over)</span>
      </div>
    </div>
  );
}
