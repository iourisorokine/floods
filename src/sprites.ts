// Pixel-art sprites for the 3/4 view. Each character maps to a colour in the
// palette; '.' is transparent. Sprites are 16 px wide and are drawn with
// their bottom row on the front edge of the square they stand on.
import type { Dir } from "./types.ts";

export type Palette = Record<string, string>;

export const TRACTOR_PALETTE: Palette = {
  K: "#1b1b22", // tyre
  k: "#3a3a44", // tyre tread
  O: "#e8841f", // body
  o: "#b85e12", // body shade
  C: "#2a2f3a", // cab frame
  W: "#9fd6ff", // window
  Y: "#ffd23f", // light
  S: "#9aa3ad", // blade
  s: "#5f6770", // blade shade
  x: "rgba(0,0,0,0.3)", // shadow
};

// One sprite per direction (seen slightly from above and from the front)
export const TRACTOR: Record<Dir, string[]> = {
  down: [
    "................",
    "................",
    ".....CCCCCC.....",
    "....CWWWWWWC....",
    "..KKCWWWWWWCKK..",
    "..KkCCCCCCCCkK..",
    "..KkOOOOOOOOkK..",
    "..KkOOOOOOOOkK..",
    "..KKooooooooKK..",
    "...KOOOOOOOOK...",
    "...KOOOOOOOOK...",
    "...KoYooooYoK...",
    "..SSSSSSSSSSSS..",
    "..ssssssssssss..",
    "...xxxxxxxxxx...",
    "................",
  ],
  up: [
    "................",
    "....SSSSSSSS....",
    "....ssssssss....",
    "...KOOOOOOOOK...",
    "...KOOOOOOOOK...",
    "...KooooooooK...",
    "..KKCCCCCCCCKK..",
    "..KkCWWWWWWCkK..",
    "..KkCWWWWWWCkK..",
    "..KkCCCCCCCCkK..",
    "..KkOOOOOOOOkK..",
    "..KkooooooookK..",
    "..KKooooooooKK..",
    "..KK........KK..",
    "...xxxxxxxxxx...",
    "................",
  ],
  right: [
    "................",
    "................",
    "...CCCCC........",
    "...CWWWC........",
    "...CWWWC........",
    "...CCCCCOOOOO...",
    "..OOOOOOOOOOOO.S",
    "..OOOOOOOOOOOOYS",
    "..oooooooooooo.S",
    ".KKKK......KK.sS",
    "KkkkkK....KkkK..",
    "KkKKkK....KkkK..",
    "KkkkkK.....KK...",
    ".KKKK...........",
    "..xxxxxxxxxxxx..",
    "................",
  ],
  left: [], // mirror of `right`, filled below
};
TRACTOR.left = TRACTOR.right.map((r) => [...r].reverse().join(""));

export const HOUSE_PALETTE: Palette = {
  R: "#c0392b",
  r: "#e0604f",
  D: "#7b241c",
  C: "#5a5a66",
  c: "#34343c",
  W: "#f1e3c2",
  w: "#cbb88f",
  B: "#4a90c2",
  d: "#6b3d1f",
  x: "rgba(0,0,0,0.28)", // shadow
};

// Roof (ridge left-right) seen from above, then the front wall
export const HOUSE: string[] = [
  "................",
  "...........cc...",
  "..DDDDDDDDDcCD..",
  ".rRRRRRRRRRRRRr.",
  ".RRrRRRRRRrRRRR.",
  "rRRRRRRRRRRRRRRr",
  "RRRRrRRRRRRRrRRR",
  "RRRRRRRRRRRRRRRR",
  "DDDDDDDDDDDDDDDD",
  ".WWWWWWWWWWWWWW.",
  ".WBBWWWWWWWWBBW.",
  ".WBBWWWddWWWBBW.",
  ".WWWWWWddWWWWWW.",
  ".WWWWWWddWWWWWW.",
  ".wwwwwwddwwwwww.",
  ".xxxxxxxxxxxxxx.",
];

export const TREE_PALETTE: Palette = {
  G: "#2f7d32",
  g: "#1d5621",
  l: "#57b05b",
  b: "#5a3413",
  B: "#7a4a22",
  x: "rgba(0,0,0,0.3)",
};

export const TREE: string[] = [
  "......gGGg......",
  "....gGllGGGg....",
  "...GllllGGGGg...",
  "..gGlllGGGGGGg..",
  "..GGllGGGGGGGg..",
  ".gGGGGGGGGGGGGg.",
  ".GGGGGGGGGGGGGg.",
  ".gGGGGGGGGGGGgg.",
  "..gGGGGGGGGGGg..",
  "..ggGGGGGGGggg..",
  "...gggGGGggg....",
  ".....ggggg......",
  ".......bB.......",
  ".......bB.......",
  ".......bB.......",
  ".....xxbBxx.....",
  "....xxxxxxxx....",
];

function check(name: string, rows: string[]): void {
  rows.forEach((r, i) => {
    if (r.length !== 16)
      throw new Error(`sprite ${name} row ${i} has length ${r.length}`);
  });
}
(Object.keys(TRACTOR) as Dir[]).forEach((d) =>
  check(`tractor-${d}`, TRACTOR[d]),
);
check("house", HOUSE);
check("tree", TREE);

// 3x5 pixel digits for the debug height overlay
export const DIGITS: Record<number, string[]> = {
  0: ["111", "101", "101", "101", "111"],
  1: ["010", "110", "010", "010", "111"],
  2: ["111", "001", "111", "100", "111"],
  3: ["111", "001", "111", "001", "111"],
  4: ["101", "101", "111", "001", "001"],
  5: ["111", "100", "111", "001", "111"],
  6: ["111", "100", "111", "101", "111"],
  7: ["111", "001", "010", "010", "010"],
  8: ["111", "101", "111", "101", "111"],
  9: ["111", "101", "111", "001", "111"],
};
