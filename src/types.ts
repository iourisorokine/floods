// Shared types for the whole game.

export type Dir = "up" | "down" | "left" | "right";
export type ObjectType = "house" | "road" | "tree";
export type Phase = "intro" | "build" | "flood" | "done";

export interface TutorialStep {
  text: string;
  /** 'moved' | 'tubes>=N' | 'tubes@x,y>=N' | 'at x,y' | 'height>=N' | 'flood' */
  until?: string;
  /** squares to highlight, as [x, y] */
  mark?: [number, number][];
}

export interface Level {
  id: string;
  name: string;
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
  type: "build" | "remove";
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
  | { type: "built" | "removed" | "cancel" }
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
