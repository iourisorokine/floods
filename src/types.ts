// Shared types for the whole game.

export type Dir = "up" | "down" | "left" | "right";
export type ObjectType =
  | "house"
  | "road"
  | "tree"
  | "building"
  | "shop"
  | "field"
  | "pine"
  | "rock"
  | "boulder";
export type Phase = "intro" | "build" | "flood" | "done";

export interface TutorialStep {
  text: string;
  /** 'moved' | 'tubes>=N' | 'tubes@x,y>=N' | 'at x,y' | 'height>=N' | 'flood' */
  until?: string;
  /** squares to highlight, as [x, y] */
  mark?: [number, number][];
}

/** One rise of the water. After it, `pause` seconds to build before the next one. */
export interface Wave {
  rise: number;
  pause?: number;
}

export interface Level {
  id: string;
  name: string;
  /** side level: branches off the main path after this level id (optional) */
  branchFrom?: string;
  /** seconds before the water rises (0 = no limit, press F) */
  timer?: number;
  floodAmplitude?: number;
  tubeBudget?: number;
  /** seconds between each +1 rise of the water */
  riseInterval?: number;
  /** [1 star, 2 stars, 3 stars] as fractions of objects saved */
  stars?: number[];
  startDir?: Dir;
  intro?: string;
  /** short explanation shown before the level starts (new mechanic...) */
  explainer?: string;
  /** several waves instead of one flood (overrides floodAmplitude) */
  waves?: Wave[];
  /** night level: only the area around the tractor is visible */
  night?: boolean;
  tutorial?: TutorialStep[];
  heights: string[];
  objects: string[];
}

export interface Point {
  x: number;
  y: number;
}

/** The grid data needed to draw a map (a level or the world map). */
export interface Terrain {
  w: number;
  h: number;
  base: number[];
  tubes: number[];
  objects: (ObjectType | null)[];
  water: boolean[];
  lost: boolean[];
  floodedAt: number[];
  waterLevel: number;
  clock: number;
}

export interface Action {
  type: "build" | "remove" | "cut";
  x: number;
  y: number;
  elapsed: number;
  total: number;
}

export interface Tractor extends Point {
  dir: Dir;
  stuck: boolean;
  moved: boolean;
}

export interface Result {
  ratio: number;
  stars: number;
  passed: boolean;
  counts: Partial<Record<ObjectType, { total: number; saved: number }>>;
  tubesUsed: number;
}

export interface GameState extends Terrain {
  level: Level;
  /** cracked dike squares: they break when the water pushes on them */
  cracked: boolean[];
  waves: Wave[];
  /** index of the current (or next) wave */
  wave: number;
  /** water level after the last wave */
  finalLevel: number;
  targetLevel: number;
  phase: Phase;
  noTimer: boolean;
  timeLeft: number;
  tubesLeft: number;
  tubesUsed: number;
  tractor: Tractor;
  action: Action | null;
  riseTimer: number;
  spreadTimer: number;
  settleTimer: number;
  tutorialStep: number;
  result: Result | null;
}

export type GameEvent =
  | { type: "tutorial"; step: number }
  | { type: "built" | "removed" | "cancel" | "cut" | "pushed" }
  | { type: "wave-break"; wave: number }
  | { type: "breach"; x: number; y: number }
  | { type: "flood-start" }
  | { type: "rise"; level: number }
  | { type: "lost"; count: number }
  | { type: "stuck" }
  | { type: "done"; result: Result };

export type BuildBlocker =
  | "over"
  | "stuck"
  | "busy"
  | "edge"
  | "no tubes left"
  | "water"
  | "object"
  | "max height"
  | "too high";
