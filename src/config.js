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
    lookYaw: 1.1,     // how far the mouse turns your head while walking (radians at the screen edge)
    lookYawStill: 1.95, // ...and once you've stopped: crane right round (~110°)
    lookCurve: 1.35,  // >1: fine control near the centre, the big turn happens toward the edge
    lookPitch: 4,
    lookPitchStill: 6,
    lookUp: 0.8,      // resting gaze tilt (metres up at 10 m ahead): more sky + mountains, less ground
    bob: 0.04,        // footstep bob
    stillSpeed: 0.4,  // below this many m/s you count as standing still...
    stillAfter: 0.35, // ...after this many seconds
    craneLean: 0.3,   // metres your head shifts toward the side you crane to
    craneRoll: 0.06,  // head tilt when craning (radians)
    nudgeEase: 1.2,   // how gently your head turns toward a point as you approach (lower = gentler)
    sitHeight: 1.15,  // eye height on the bench at the end
    sitEase: 0.9,     // how slowly you sit down (lower = slower)
    // (sitting, you turn round to the painting's view: see places.painting in src/world/places.js)
  },

  // 设色, the colour stage: stand still and crane to the side, and colour blooms where you look
  colour: {
    crane: 0.3,          // how far you need to turn (0–1) for colour to start coming in
    fill: 3.5,           // seconds of looking for a bloom to come in fully (it starts faint)
    gazeRange: [3, 32],  // metres: where on the ground your gaze can land (looking down)
    levelGaze: 11,       // metres out a bloom lands when you're looking level or up
    spacing: 4.5,        // turn your gaze further than this and a new bloom starts there
    reach: [14, 95],     // metres: near things (plants, rocks, water), far things (mountains)
    grow: [1.5, 3],      // seconds for the colour to spread out once it lands
    sproutsPerBloom: 16, // flowers that spring up as a bloom fills
    sproutSpread: 5.5,   // ...within this many metres
    maxSprouts: 300,
    butterflies: 6,
    splash: 0.35,        // how far colour bleeds out of a splat of ink you click (0–1 of a full bloom)
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
    fieldRect: [-200, -360, 480, 480], // x0, z0, width, depth
    fieldResolution: 320,
  },

  sketchRadius: 40, // metres around you that are line-drawn ahead of the ink (0 = off)
};
