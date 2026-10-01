import { useEffect, useMemo, useRef, useState } from "react";
import { CONFIG } from "./config.ts";
import { LEVELS } from "./levels.ts";
import { buildWorld, drawWorld } from "./worldmap.ts";
import type { NodeStatus } from "./worldmap.ts";
import {
  isUnlocked,
  starsOf,
  currentLevel,
  totalStars,
  MAIN_PATH,
} from "./progress.ts";
import type { Progress } from "./progress.ts";
import {
  levelAmplitude,
  levelBudget,
  levelTimer,
  levelWaves,
} from "./engine.ts";

// order used by the arrow keys: each main level, followed by its side levels
const MAP_ORDER: number[] = MAIN_PATH.flatMap((i) => [
  i,
  ...LEVELS.map((_, j) => j).filter(
    (j) => LEVELS[j].branchFrom === LEVELS[i].id,
  ),
]);

const SCALE = CONFIG.SCALE;
const T = CONFIG.TILE_PX;
const MAP_BORDER = 4; // matches the .map-scroll border in styles.css

// width of a classic (non-overlay) scrollbar, 0 on systems with overlay scrollbars
function scrollbarWidth(): number {
  const d = document.createElement("div");
  d.style.cssText =
    "position:absolute;top:-999px;width:100px;height:100px;overflow:scroll";
  document.body.appendChild(d);
  const w = d.offsetWidth - d.clientWidth;
  d.remove();
  return w;
}

function LockIcon() {
  return (
    <svg
      width="14"
      height="16"
      viewBox="0 0 7 8"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <path d="M2 0h3v1H2zM1 1h1v2H1zM5 1h1v2H5zM0 3h7v5H0z" fill="#8b90a8" />
      <path d="M3 5h1v2H3z" fill="#2a2e45" />
    </svg>
  );
}

function Stars({ n, size = "small" }: { n: number; size?: "small" | "big" }) {
  return (
    <span className={`stars-row ${size}`}>
      {[0, 1, 2].map((k) => (
        <span key={k} className={k < n ? "on" : ""}>
          ★
        </span>
      ))}
    </span>
  );
}

interface WorldMapProps {
  progress: Progress;
  onPlay: (index: number) => void;
  onReset: () => void;
}

export default function WorldMap({ progress, onPlay, onReset }: WorldMapProps) {
  const world = useMemo(() => buildWorld(), []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [gutter] = useState(scrollbarWidth);
  const current = currentLevel(progress);
  const [sel, setSel] = useState(current);
  const [confirmReset, setConfirmReset] = useState(false);

  const statuses: NodeStatus[] = LEVELS.map((_, i) =>
    !isUnlocked(progress, i)
      ? "locked"
      : starsOf(progress, i) > 0
        ? "done"
        : "open",
  );

  // keep the selection on the current level after a reset
  useEffect(() => {
    setSel(currentLevel(progress));
  }, [progress]);

  // keep the selected level visible in the scrolling map
  // (centred when the map opens, then only scrolled as much as needed)
  const firstScroll = useRef(true);
  useEffect(() => {
    const node = nodeRefs.current[sel];
    const box = scrollRef.current;
    if (!node || !box) return;
    const r = node.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const margin = 70;
    if (firstScroll.current) {
      firstScroll.current = false;
      box.scrollTop += r.top - b.top - box.clientHeight / 2;
      box.scrollLeft += r.left - b.left - box.clientWidth / 2;
      return;
    }
    if (r.top - margin < b.top) box.scrollTop += r.top - margin - b.top;
    else if (r.bottom + margin > b.top + box.clientHeight)
      box.scrollTop += r.bottom + margin - b.top - box.clientHeight;
    if (r.left - margin < b.left) box.scrollLeft += r.left - margin - b.left;
    else if (r.right + margin > b.left + box.clientWidth)
      box.scrollLeft += r.right + margin - b.left - box.clientWidth;
  }, [sel]);

  // animated canvas (water glints, tractor)
  const statusKey = statuses.join(",");
  useEffect(() => {
    let raf = 0;
    const loop = (t: number) => {
      const c = canvasRef.current;
      const ctx = c?.getContext("2d");
      if (ctx)
        drawWorld(ctx, world, statusKey.split(",") as NodeStatus[], current, t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [world, statusKey, current]);

  // keyboard: arrows move along the path, Enter plays
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirmReset) {
        if (e.key === "Escape") setConfirmReset(false);
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowUp") {
        e.preventDefault();
        setSel((s) => {
          const k = MAP_ORDER.indexOf(s);
          const next = MAP_ORDER.slice(k + 1).find((j) =>
            isUnlocked(progress, j),
          );
          return next ?? s;
        });
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
        e.preventDefault();
        setSel((s) => {
          const k = MAP_ORDER.indexOf(s);
          return k > 0 ? MAP_ORDER[k - 1] : s;
        });
      }
      if ((e.key === "Enter" || e.key === " ") && isUnlocked(progress, sel)) {
        e.preventDefault();
        onPlay(sel);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel, progress, onPlay, confirmReset]);

  const lvl = LEVELS[sel];
  const selUnlocked = isUnlocked(progress, sel);
  const total = totalStars(progress);
  const W = world.w * T * SCALE,
    H = world.h * T * SCALE;

  return (
    <div
      className="map-screen"
      style={{ width: `min(100%, ${W + 2 * MAP_BORDER + gutter}px)` }}
    >
      <header className="map-header">
        <h1 className="logo small-logo">FLOODS</h1>
        <div className="map-header-right">
          <span className="total-stars">
            ★ {total} / {LEVELS.length * 3}
          </span>
          {confirmReset ? (
            <span className="confirm">
              Erase all progress?
              <button
                className="danger"
                onClick={() => {
                  onReset();
                  setConfirmReset(false);
                }}
              >
                YES
              </button>
              <button onClick={() => setConfirmReset(false)}>NO</button>
            </span>
          ) : (
            <button onClick={() => setConfirmReset(true)}>
              RESET PROGRESS
            </button>
          )}
        </div>
      </header>

      <div className="map-scroll" ref={scrollRef}>
        <div className="map" style={{ width: W, height: H }}>
          <canvas
            ref={canvasRef}
            width={world.w * T}
            height={world.h * T}
            style={{ width: W, height: H }}
          />
          {world.worldStarts.map(({ index, name }) => {
            const n = world.nodes[index];
            return (
              <div
                key={"w" + name}
                className="signpost"
                style={{
                  left: n.x * T * SCALE + (T * SCALE) / 2,
                  top: n.y * T * SCALE - 26,
                }}
              >
                {name.toUpperCase()}
              </div>
            );
          })}
          {world.nodes.map((n, i) => {
            const st = statuses[i];
            if (n.x < 0) return null;
            return (
              <button
                key={i}
                ref={(el) => {
                  nodeRefs.current[i] = el;
                }}
                className={`node ${st} ${i === sel ? "sel" : ""} ${i === current ? "current" : ""} ${LEVELS[i].branchFrom ? "side" : ""}`}
                style={{
                  left: n.x * T * SCALE + (T * SCALE) / 2,
                  top: n.y * T * SCALE + (T * SCALE) / 2,
                }}
                onClick={() => {
                  if (st !== "locked") {
                    if (i === sel) onPlay(i);
                    else setSel(i);
                  } else setSel(i);
                }}
                onDoubleClick={() => st !== "locked" && onPlay(i)}
                title={LEVELS[i].name}
              >
                <span className="node-id">
                  {st === "locked" ? <LockIcon /> : LEVELS[i].id.toUpperCase()}
                </span>
                {st === "done" && <Stars n={starsOf(progress, i)} />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel level-card">
        <div className="level-card-main">
          <div className="small">
            {lvl.branchFrom
              ? `SIDE LEVEL ${lvl.id.toUpperCase()} · OPTIONAL · BRANCHES OFF LEVEL ${lvl.branchFrom.toUpperCase()}`
              : `LEVEL ${lvl.id.toUpperCase()}`}
          </div>
          <h2>{lvl.name}</h2>
          <p className="level-card-intro">
            {selUnlocked
              ? lvl.intro
              : lvl.branchFrom
                ? `Pass level ${lvl.branchFrom.toUpperCase()} to unlock this side level.`
                : "Pass the previous level to unlock this one."}
          </p>
          <div className="facts left">
            <span>
              MAP{" "}
              <b>
                {lvl.heights[0].length}×{lvl.heights.length}
              </b>
            </span>
            <span>
              {levelWaves(lvl).length > 1 ? "WAVES" : "FLOOD"}{" "}
              <b>
                {levelWaves(lvl).length > 1
                  ? levelWaves(lvl)
                      .map((wv) => `+${wv.rise}`)
                      .join(" ")
                  : `+${levelAmplitude(lvl)}`}
              </b>
            </span>
            {lvl.night && (
              <span>
                <b>NIGHT</b>
              </span>
            )}
            <span>
              TUBES <b>{levelBudget(lvl)}</b>
            </span>
            <span>
              TIME <b>{levelTimer(lvl) ? `${levelTimer(lvl)}s` : "no limit"}</b>
            </span>
          </div>
        </div>
        <div className="level-card-side">
          <Stars n={starsOf(progress, sel)} size="big" />
          <button
            className="play"
            disabled={!selUnlocked}
            onClick={() => onPlay(sel)}
          >
            {selUnlocked
              ? starsOf(progress, sel)
                ? "REPLAY"
                : "PLAY"
              : "LOCKED"}
          </button>
        </div>
      </div>
      <p className="map-help">
        ARROWS move along the path · ENTER to play · click a level to select it,
        click again to play
      </p>
    </div>
  );
}
