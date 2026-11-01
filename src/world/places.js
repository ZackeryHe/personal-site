import * as THREE from "three";

// Where everything is. Edit this file to move things around the walk.
//   t    = position along the path, 0 (start) → 1 (end)
//   side = metres to the right of the path (negative = left)

// Sections of the site: their text (src/content.js) writes itself in at these stops.
export const STOPS = {
  start: 0.02,
  about: 0.27,    // pine grove
  river: 0.5,     // lanterns + bridge
  pavilion: 0.82, // the gallery
  end: 0.98,      // stele with seals
};

// Named views. Chinese gardens give their views poetic names; each name brushes
// in beside its place when you're within `radius` metres (and beyond `minDist`).
//   of:     which place below it belongs to
//   height: how far above the place the name floats
//   look:   how much it gently turns your gaze as you pass (0 – 0.25)
//   far:    a spectacle seen from afar; its name appears when you look toward it
export const VIEWS = [
  { of: "pond", zh: "知鱼", en: "the joy of fish", radius: 16, height: 2.4, look: 0.25 },
  { of: "bamboo", zh: "竹径", en: "bamboo path", radius: 12, height: 3.4 },
  { of: "cranes", zh: "鹤鸣", en: "cranes calling", radius: 16, height: 2.6, look: 0.22 },
  { of: "boat", zh: "独钓", en: "fishing alone", radius: 22, height: 2.3, look: 0.12 },
  { of: "meadow", zh: "鹿鸣", en: "the deer call", radius: 18, height: 2.4, look: 0.2 },
  { of: "plumPavilion", zh: "暗香", en: "a hidden fragrance", radius: 13, height: 4, look: 0.15 },
  // spectacles
  { of: "waterfall", zh: "飞瀑", en: "flying falls", radius: 135, minDist: 35, far: true },
  { of: "pine", zh: "迎客松", en: "the welcoming pine", radius: 125, minDist: 35, far: true },
  { of: "geese", zh: "归雁", en: "geese flying home", radius: 150, minDist: 20, far: true },
  { of: "pagoda", zh: "远塔", en: "a pagoda far off", radius: 110, minDist: 50, far: true },
  { of: "temple", zh: "云寺", en: "a temple in the clouds", radius: 160, minDist: 45, far: true },
];

const UP = new THREE.Vector3(0, 1, 0);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Lay out the places along the path P, and reserve their space. */
export function planPlaces(P) {
  const places = {
    // ---------- the garden, beside the path ----------
    rock: { pos: P.at(0.05, 4.4) },             // entrance: boulder with your name carved in red
    plumEntrance: { pos: P.at(0.032, -4.6) },   // plum tree in blossom by the entrance
    pond: { pos: P.at(0.155, -9), r: 5.5 },     // koi, lotus
    bamboo: { range: [0.33, 0.405] },           // the path runs through bamboo between these t
    meadow: { pos: P.at(0.655, 12), r: 7 },     // deer, wildflowers, butterflies
    plumPavilion: { pos: P.at(0.785, 6) },      // plum tree beside the pavilion
    cranes: { pos: V() },                       // placed by garden/creatures.js
    boat: { pos: V() },                         // drifts; moved by garden/creatures.js

    // ---------- spectacles, seen from afar (world x, z) ----------
    // faces: the point on the walk the feature is turned toward
    waterfall: { pos: V(-48, 0, -110), r: 22, h: 72, faces: P.at(0.3) },
    pine: { pos: V(40, 0, -125), r: 16, h: 34, faces: P.at(0.5) },
    temple: { pos: V(-55, 0, -235), r: 24, h: 62, faces: P.at(0.9) },
    pagoda: { pos: V(38, 0, -178), r: 22, h: 34 },
    geese: { pos: V(), center: V(0, 46, -95), radii: [95, 60], period: 90 }, // pos moves
  };
  places.bamboo.pos = P.at((places.bamboo.range[0] + places.bamboo.range[1]) / 2, -2.5);

  // the river crosses the path at the bridge
  const rc = P.path.getPointAt(STOPS.river);
  const flow = P.sideAt(STOPS.river);
  const across = P.path.getTangentAt(STOPS.river);
  places.river = {
    pos: rc, flow, across,
    at: (along, acr) => rc.clone().addScaledVector(flow, along).addScaledVector(across, acr),
  };

  // scholar's rocks: around the pond, by the entrance, by the pavilion
  const pond = places.pond;
  const toPath = P.at(0.155).sub(pond.pos).normalize();
  const around = (a, r) => pond.pos.clone().addScaledVector(toPath.clone().applyAxisAngle(UP, a), r);
  places.taihu = [
    { pos: around(1.1, pond.r + 0.9), h: 2.4 },
    { pos: around(-0.9, pond.r + 1.1), h: 1.6 },
    { pos: around(2.6, pond.r + 0.8), h: 2.9 },
    { pos: P.at(0.065, 7.2), h: 1.8 },
    { pos: P.at(0.86, -5.8), h: 2.2 },
  ];

  // ---------- keep scattered trees (and, where it matters, grass) out ----------
  const r = (p, radius, opts) => P.reserve(p.x, p.z, radius, opts);
  for (let a = -80; a <= 80; a += 3) {
    const p = places.river.at(a, 0);
    r(p, 6);                       // no trees in, or right on the edge of, the river
    r(p, 3, { ground: true });     // no grass on the water; reeds stay on the banks
  }
  r(places.rock.pos, 3.5, { ground: true });
  r(places.plumEntrance.pos, 4);
  r(pond.pos, pond.r + 0.6, { ground: true });
  r(pond.pos, pond.r + 3);
  r(places.meadow.pos, places.meadow.r + 1.5);
  r(places.plumPavilion.pos, 4);
  for (const k of ["waterfall", "pine", "temple", "pagoda"]) {
    const s = places[k];
    r(s.pos, s.r + 12);
    // a clear sight line from the walk, so no random mountain hides it
    const toward = (s.faces ?? P.at(0.75)).clone().sub(s.pos).setY(0);
    const len = toward.length();
    toward.normalize();
    for (let d = s.r + 6; d < len - 15; d += 10) r(s.pos.clone().addScaledVector(toward, d), 12, { trees: false });
  }
  for (const { pos } of places.taihu) r(pos, 1.6);
  for (let t = places.bamboo.range[0]; t <= places.bamboo.range[1] + 1e-6; t += 0.015) r(P.path.getPointAt(t), 9);

  return places;
}
