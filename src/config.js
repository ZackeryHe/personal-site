// How it feels: the main settings, all in one place.

export const CONFIG = {
  render: {
    maxPixelRatio: 1.5, // lower = faster, softer
    fov: 60,
    far: 900,
  },

  walk: {
    eyeHeight: 1.7,
    wheel: 0.02,      // metres walked per wheel-delta unit
    key: 3,           // metres per ↑/↓ press
    touch: 0.05,      // metres per pixel swiped
    follow: 3,        // how quickly you catch up to where you scrolled (higher = snappier)
    lookYaw: 0.9,     // how far the mouse turns your head (radians at the screen edge)
    lookPitch: 4,
    lookUp: 0.8,      // resting gaze tilt (metres up at 10 m ahead): more sky + mountains, less ground
    bob: 0.04,        // footstep bob
  },

  intro: {
    blankPaper: 0.9,  // seconds of blank paper before the first drop lands
    fall: 0.35,       // seconds the drop takes to fall
    skySweep: 2.2,    // how slowly the distant ranges / sun / birds bloom in
    sketchSweep: 0.45, // how fast the sketch races out from the drop
  },

  ink: {
    // per spread scale: [mid (trees, buildings), far (mountains), ground wash]
    reach: [30, 240, 14], // metres
    grow: [1.8, 5.0, 1.4], // seconds (the slow opening bloom)
    quick: 3,              // walking / clicking drops grow this many times faster
    dry: 6,                // seconds fresh ink stays wet on the ground
    stepEvery: 3,          // a drop lands at your feet every N metres
    throwAhead: 1.2,       // when moving fast, ink is thrown this many seconds of walking ahead
    maxThrow: 30,          // ...but never more than this many metres
    flick: 0.6,            // strength of a clicked drop (1 = same as a footstep)
    // the top-down area the ink map covers (must contain everything that inks in)
    fieldRect: [-210, -335, 420, 420], // x0, z0, width, depth
    fieldResolution: 320,
  },

  sketchRadius: 40, // metres around you that are line-drawn ahead of the ink (0 = off)
};
