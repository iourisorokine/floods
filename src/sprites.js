// 16x16 pixel-art sprites. Each character maps to a colour in the palette;
// '.' is transparent.

export const TRACTOR_PALETTE = {
  K: '#1b1b22', // tyre
  k: '#3a3a44', // tyre tread
  O: '#e8841f', // body
  o: '#b85e12', // body shade
  C: '#2a2f3a', // cab frame
  W: '#9fd6ff', // window
  Y: '#ffd23f', // light
  S: '#9aa3ad', // blade
  s: '#5f6770', // blade shade
};

// Facing right (blade at the front)
export const TRACTOR_RIGHT = [
  '................',
  '.KkKkK....KkK...',
  '.kKkKk....kKk...',
  '.KkKkK....KkK...',
  '..oooooooooooo.S',
  '..oCCCCOOOOOOY.S',
  '..oCWWCOOOOOOO.S',
  '..oCWWCOOOOOOOsS',
  '..oCWWCOOOOOOOsS',
  '..oCWWCOOOOOOO.S',
  '..oCCCCOOOOOOY.S',
  '..oooooooooooo.S',
  '.KkKkK....KkK...',
  '.kKkKk....kKk...',
  '.KkKkK....KkK...',
  '................',
];

export const HOUSE_PALETTE = {
  R: '#c0392b',
  r: '#e0604f',
  D: '#7b241c',
  C: '#5a5a66',
  c: '#34343c',
  W: '#f1e3c2',
  w: '#cbb88f',
  B: '#4a90c2',
  d: '#6b3d1f',
  x: 'rgba(0,0,0,0.28)', // shadow
};

export const HOUSE = [
  '................',
  '..rrrrrrrrrrrr..',
  '.rRRRRRRRRRcCRR.',
  '.rRRRRRRRRRCCRR.',
  '.rRRRRRRRRRRRRRx',
  '.rRRRRRRRRRRRRRx',
  '.DDDDDDDDDDDDDDx',
  '.RRRRRRRRRRRRRRx',
  '.RRRRRRRRRRRRRRx',
  '.RRRRRRRRRRRRRRx',
  '.DDDDDDDDDDDDDDx',
  '..WWWWWWWWWWWWxx',
  '..WBBWWddWWBBWxx',
  '..WBBWWddWWBBWxx',
  '..wwwwwddwwwwwxx',
  '...xxxxxxxxxxxxx',
];

export const TREE_PALETTE = {
  G: '#2f7d32',
  g: '#1d5621',
  l: '#57b05b',
  b: '#6b3d1f',
  x: 'rgba(0,0,0,0.3)',
};

export const TREE = [
  '................',
  '.....gGGGGg.....',
  '....GGllGGGg....',
  '...GllllGGGGg...',
  '..gGlllGGGGGGg..',
  '..GGllGGGGGGGg..',
  '..GGGGGGGGGGGgx.',
  '..gGGGGGGGGGGgx.',
  '..gGGGGGGGGGggx.',
  '...gGGGGGGGGgxx.',
  '....ggGGGGggxx..',
  '.....xggggxxx...',
  '.......bb.......',
  '.......bbx......',
  '........x.......',
  '................',
];

function check(name, rows) {
  rows.forEach((r, i) => {
    if (r.length !== 16) throw new Error(`sprite ${name} row ${i} has length ${r.length}`);
  });
}
check('tractor', TRACTOR_RIGHT);
check('house', HOUSE);
check('tree', TREE);

// Rotate a right-facing sprite to face another direction
export function orient(rows, dir) {
  const n = rows.length;
  const out = Array.from({ length: n }, () => new Array(n).fill('.'));
  for (let oy = 0; oy < n; oy++) {
    for (let ox = 0; ox < n; ox++) {
      const c = rows[oy][ox];
      let nx = ox, ny = oy;
      if (dir === 'left') { nx = n - 1 - ox; }
      else if (dir === 'down') { nx = n - 1 - oy; ny = ox; }
      else if (dir === 'up') { nx = oy; ny = n - 1 - ox; }
      out[ny][nx] = c;
    }
  }
  return out.map((r) => r.join(''));
}

// 3x5 pixel digits for the debug height overlay
export const DIGITS = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
};
