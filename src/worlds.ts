// Worlds: groups of consecutive main levels sharing a landscape on the map.
// A world starts at the level `from` and runs until the next world.
export type WorldTheme = "country" | "mountains" | "town";

export interface WorldDef {
  name: string;
  /** id of the first level of this world */
  from: string;
  theme: WorldTheme;
}

export const WORLDS: WorldDef[] = [
  { name: "Countryside", from: "0a", theme: "country" },
  { name: "Mountains", from: "16", theme: "mountains" },
  { name: "Town", from: "21", theme: "town" },
];
