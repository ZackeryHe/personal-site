import * as THREE from "three";

// Where everything is. Edit this file to move things around the walk.
//   t    = position along the path, 0 (start) → 1 (end, at the cliff)
//   side = metres to the right of the path (negative = left)
//
// The walk: your name → koi pond → avenue of tablets (Experience) → bamboo with lanterns
// (Projects) → the waterfall and its pool → the bridge (the pagoda ahead) → pavilion
// (Resume) → the cliff edge over the canyon, the red sun setting at its far end.

// Stops along the walk.
// Your points (text in src/content.js): their panel writes itself in at these stops.
// The rest place scenery.
export const STOPS = {
  start: 0.02,
  contacts: 0.085,  // just before the carved rocks on the lotus pond's near shore (you turn toward them)
  experience: 0.27, // the avenue of stone tablets (碑林)
  projects: 0.47,   // lanterns in the bamboo
  resume: 0.887,    // the pavilion, its hanging scrolls
  // scenery
  grove: 0.27,      // pines around the tablets
  river: 0.762,     // the bridge over the waterfall's stream
  pavilion: 0.887,
};

// Markers: your points, floating beside the thing that stands for them.
//   of:     the place (below) it belongs to     height: metres above that place
//   radius: it shows within this many metres
//   nudge:  how much it turns your head toward it as you approach (0 – 0.4)
// (GitHub, LinkedIn and Email are carved into rocks by the pond instead; see links below.)
export const MARKERS = [
  { id: "contacts", of: "contacts", height: 1.5, radius: 16, nudge: 0.4 },
  { id: "experience", of: "experience", height: 3.4, radius: 30, nudge: 0.25 },
  { id: "projects", of: "projects", height: 3.0, radius: 30, nudge: 0.3 },
  { id: "resume", of: "resume", height: 7.8, radius: 34, nudge: 0.25 },
];

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Lay out the places along the path P, and reserve their space. */
export function planPlaces(P) {
  // a point out past the end of the walk: `dist` metres ahead, `side` metres to the right
  const right = V(-P.endDir.z, 0, P.endDir.x);
  const ahead = (dist, side = 0) => P.end.clone().addScaledVector(P.endDir, dist).addScaledVector(right, side);
  const places = {
    // ---------- the entrance ----------
    rock: { pos: P.at(0.075, 5.0) },          // boulder with your name carved in red
    // Contacts: GitHub, LinkedIn, Email, small carved rocks on the near shore of the lotus pond
    // (content.js points), in a gentle arc following the water's edge
    links: [
      { id: "github", pos: P.at(0.108, -3.0) },
      { id: "linkedin", pos: P.at(0.13, -2.55) },
      { id: "email", pos: P.at(0.152, -2.95) },
    ],
    plumEntrance: { pos: P.at(0.03, -4.6) },  // plum tree in blossom

    // ---------- the garden ----------
    pond: { pos: P.at(0.13, -9), r: 5.5 },    // koi, lotus (on its own: nothing competes with it)
    // Experience: an avenue of tablets; none in the middle on the left, where the moon gate
    // in the garden wall behind opens a view through
    steles: [0.235, 0.27, 0.305].flatMap((t) => [-3.3, 3.3]
      .filter((side) => !(t === 0.27 && side < 0))
      .map((side) => ({ t, pos: P.at(t, side), faces: P.at(t - 0.04, 0) }))),
    bamboo: { range: [0.37, 0.585] },         // the path runs through bamboo between these t
    // a few clumps of bamboo peeking over the garden walls behind the tablets
    wallBamboo: [-6, -2, 2, 6].flatMap((d) => [-1, 1].map((side) =>
      P.at(STOPS.experience + d / P.pathLen, side * (7.4 + (d % 4 === 0 ? 0.6 : 0))))),
    lanterns: [0.4, 0.44, 0.48, 0.52, 0.56].map((t, i) => ({ t, pos: P.at(t, i % 2 ? 1.8 : -1.8) })), // Projects
    meadow: { pos: P.at(0.66, 8), r: 4.5 },   // deer, wildflowers, butterflies, by the stream
    plumPavilion: { pos: P.at(0.835, 5.5) },  // plum tree beside the pavilion
    cranes: { pos: V() },                     // placed by garden/creatures.js
    boat: { pos: V() },                       // drifts; moved by garden/creatures.js

    // ---------- spectacles ----------
    pagoda: { pos: V(10, 0, -106), r: 8, h: 9, tiers: 5 }, // on a knoll near the rim: ahead as you cross the bridge
    // the end: a lone pine on the brink, the sun and the geese out over the canyon
    pine: { pos: ahead(3.0, -8), faces: ahead(40, -16) },
    geese: { pos: V(), center: ahead(240, 0).setY(38), radii: [150, 45], period: 80 },
    sun: { pos: ahead(720, 0).setY(112), r: 86 },    // setting, low over the far end of the canyon
    bench: { pos: ahead(1.4, 0) },                    // a stone bench at the brink: sit, and look
    temple: { pos: V() },                     // on top of one of the canyon's pillars (spectacles/vista.js)
  };
  places.contacts = { pos: places.links[1].pos.clone() };        // marker: over the middle rock
  places.experience = { pos: P.at(STOPS.experience, 0) };       // marker: over the avenue
  places.projects = { pos: places.lanterns[2].pos.clone() };    // marker: over the middle lantern
  places.resume = { pos: P.path.getPointAt(STOPS.pavilion) };   // marker: over the pavilion
  places.bamboo.pos = P.at((places.bamboo.range[0] + places.bamboo.range[1]) / 2, -2.5);

  // ---------- the waterfall pool: falls, pool, cranes, boat, and the stream under the bridge ----------
  const rc = P.path.getPointAt(STOPS.river);
  const flow = P.sideAt(STOPS.river); // the stream runs left → right across the path
  const across = P.path.getTangentAt(STOPS.river);
  places.river = {
    pos: rc, flow, across, start: -11, // the stream begins at the pool, 11 m upstream
    at: (along, acr) => rc.clone().addScaledVector(flow, along).addScaledVector(across, acr),
  };
  places.pool = { pos: places.river.at(-11, 6), r: 9 };
  // the waterfall's mountain stands right behind the pool as you come out of the bamboo
  const view = P.at(0.62);
  const toPool = places.pool.pos.clone().sub(view).setY(0).normalize();
  places.waterfall = {
    // far enough back that only the pool's far edge laps its foot (no clipping)
    pos: places.pool.pos.clone().addScaledVector(toPool, 17 + places.pool.r * 0.6),
    r: 17, h: 44, lip: 0.6, faces: view,
  };
  places.pool.toPath = toPool.clone().negate(); // from the pool toward the walk: its near shallows

  // scholar's rocks: around the pond, by the entrance, before the pavilion
  const pond = places.pond;
  const toPath = P.at(0.13).sub(pond.pos).normalize();
  const around = (a, r) => pond.pos.clone().addScaledVector(toPath.clone().applyAxisAngle(V(0, 1, 0), a), r);
  places.taihu = [
    { pos: around(1.1, pond.r + 0.9), h: 2.4 },
    { pos: around(-0.9, pond.r + 1.1), h: 1.6 },
    { pos: around(2.6, pond.r + 0.8), h: 2.9 },
    { pos: P.at(0.095, 6.8), h: 1.8 },
    { pos: P.at(0.845, 4.5), h: 2.2 },
  ];

  // ---------- keep scattered trees (and, where it matters, grass) out ----------
  const r = (p, radius, opts) => P.reserve(p.x, p.z, radius, opts);
  for (let a = places.river.start; a <= 90; a += 3) {
    const p = places.river.at(a, 0);
    r(p, 6);                       // no trees in, or right on the edge of, the stream
    r(p, 3, { ground: true });     // no grass on the water; reeds stay on the banks
  }
  r(places.river.pos, 7.2, { ground: true });  // the bridge: no stepping stones or grass poking through it
  r(places.pool.pos, places.pool.r + 3);
  r(places.pool.pos, places.pool.r + 0.4, { ground: true });
  r(places.waterfall.pos, places.waterfall.r + 4);
  r(places.rock.pos, 3.5, { ground: true });
  for (const l of places.links) r(l.pos, 1.3, { ground: true });
  r(places.plumEntrance.pos, 4);
  r(pond.pos, pond.r + 0.6, { ground: true });
  r(pond.pos, pond.r + 3);
  for (const s of places.steles) r(s.pos, 1.8);
  // the garden walls behind the tablets (structures.js): trees keep clear of them
  for (const side of [-1, 1]) {
    for (let d = -8; d <= 8; d += 2) r(P.at(STOPS.experience + d / P.pathLen, side * 6.2), 2.6);
  }
  for (const l of places.lanterns) r(l.pos, 0.9);
  r(places.meadow.pos, places.meadow.r + 1.5);
  r(places.plumPavilion.pos, 4);
  r(places.pagoda.pos, places.pagoda.r + 3);
  r(places.pine.pos, 3);
  r(P.at(0.97), 7);                // the end: nothing but the view
  r(P.at(0.93), 6);
  for (const { pos } of places.taihu) r(pos, 1.6);
  for (let t = places.bamboo.range[0]; t <= places.bamboo.range[1] + 1e-6; t += 0.015) r(P.path.getPointAt(t), 9);
  // a clear view down the avenue and the bamboo to the waterfall: no random mountain in the way
  const from = P.at(0.27);
  const toFalls = places.waterfall.pos.clone().sub(from).setY(0);
  const len = toFalls.length();
  toFalls.normalize();
  for (let d = 10; d < len - places.waterfall.r; d += 8) r(from.clone().addScaledVector(toFalls, d), 10, { trees: false });

  return places;
}
