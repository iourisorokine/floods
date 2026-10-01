// Chapters of the main path, shown as signposts on the world map.
// A chapter starts at the level `from` and runs until the next one.
export interface ChapterDef {
  name: string;
  /** id of the first level of this chapter */
  from: string;
}

export const WORLDS: ChapterDef[] = [
  { name: "Countryside", from: "0a" },
  { name: "Mountains & Towns", from: "10" },
  { name: "Big Floods", from: "18" },
];

// Landscape drawn around a level on the map, guessed from what is in it
export type WorldTheme = "country" | "mountains" | "town";
