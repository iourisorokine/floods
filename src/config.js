// ============================================================================
//  FLOODS — balancing & tuning variables
//  Everything you may want to tweak by hand lives in this file.
//  (Per-level values such as timer, flood amplitude and tube budget live in
//   src/levels.js — the values below are the defaults a level falls back to.)
// ============================================================================

export const CONFIG = {
  // ---- Level defaults (a level can override any of these) -----------------
  DEFAULT_TIMER_SECONDS: 60,     // build time before the water starts rising
  DEFAULT_FLOOD_AMPLITUDE: 2,    // how many elevation levels the water rises
  DEFAULT_TUBE_BUDGET: 12,       // number of protection tubes available
  START_WATER_LEVEL: 0,          // water level at the start (0 = only the rivers)

  // ---- Flood behaviour ------------------------------------------------------
  RISE_INTERVAL_SECONDS: 4,      // seconds between each +1 rise (level override: riseInterval)
  FIRST_RISE_DELAY_SECONDS: 0.5, // delay between "time's up" and the first rise
  SPREAD_STEP_MS: 180,           // water advances one square every N ms
  SETTLE_SECONDS: 2,             // wait after the last rise before scoring

  // ---- Tractor ----------------------------------------------------------------
  BUILD_TIME_SECONDS: 2,         // time to build one tube (tractor can't move meanwhile)
  REMOVE_TIME_SECONDS: 1,        // time to remove one tube
  MAX_CLIMB: 1,                  // max height difference the tractor can drive
  MOVE_INTERVAL_MS: 170,         // time per square while a direction is held
  TURN_HOLD_MS: 110,             // tap a new direction = turn only; hold longer = drive
  MAX_TUBES_PER_SQUARE: 3,       // how high a single square can be stacked
  ALLOW_REMOVE_TUBE: true,       // X key removes a tube in front (refunds it)
  CAN_BUILD_ON_WATER: false,     // allow building on water squares
  CAN_BUILD_ON_OBJECTS: false,   // allow building on houses / roads
  TRACTOR_CAN_DRIVE_ON_ROADS: true,

  // ---- Scoring (fraction of objects saved) --------------------------------
  // Level passed if at least PASS_THRESHOLD of the objects survive.
  PASS_THRESHOLD: 0.01,          // "at least one object"
  STAR_THRESHOLDS: [0.01, 0.6, 1.0], // 1 star, 2 stars, 3 stars
  OBJECT_WEIGHTS: {              // weight of each object type in the % saved
    house: 1,
    road: 1,
  },
  // (a level can override thresholds with `stars: [a, b, c]`)

  // ---- Display ------------------------------------------------------------------
  TILE_PX: 16,                   // logical pixel size of a square (pixel art)
  SCALE: 3,                      // on-screen zoom of the pixel art (same for every level)
  STAGE_MIN_W: 576,              // small maps are centred in a stage of at least
  STAGE_MIN_H: 576,              //   this size (screen pixels)
  UNLOCK_ALL_LEVELS: false,      // true = every level playable (handy for testing)
  TUTORIAL_POPUPS: true,         // tutorial tips pause the game in the middle of the field
  WARNING_SECONDS: 10,           // timer blinks red below this
  SHOW_HEIGHT_NUMBERS: false,    // debug: show elevation numbers (toggle with H)
  SOUND: true,                   // retro beeps

  // Soil colour per elevation (0 is always water)
  SOIL_COLORS: {
    1: '#5b3a1f', // dark brown
    2: '#9c6b3a', // light brown
    3: '#8fd14f', // light green grass
    4: '#5fae3a', // darker grass
    5: '#3f8a2c', // darker
    6: '#2b6420', // darkest
  },
  WATER_COLORS: ['#3b7de0', '#2f68c4', '#2553a3', '#1c4283'], // by depth (0,1,2,3+)
};
