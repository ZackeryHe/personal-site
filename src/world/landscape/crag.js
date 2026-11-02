import * as THREE from "three";
import { massifGeometry, mountainMaterial } from "./mountains.js";
import { addTrees } from "./flora.js";

// 石 — a rock standing up out of the meadow where the river bends, low on the left of the view
// from the bench: a craggy mass of stone, blocky and ledged, rounded on top, a pine leaning from
// a shelf near its crown. A near, dark mass anchoring that side of the painting, the way the old
// painters set a rock in the corner of a scroll; the river slips away behind it.
// Its foot is sunk into the level ground, so it stands on the meadow, never above it.
export function build({ scene, P, places, rng }) {
  const C = places.crag;
  if (!C) return;
  const rand = rng(91);
  const toEye = places.bench.pos.clone().sub(C.pos).setY(0).normalize();
  const ga = Math.atan2(toEye.z, toEye.x); // (massifGeometry's angles)
  // (the lowest ground round its foot: it stands on that, its foot sunk into the rest)
  const ground = Math.min(P.groundAt(C.pos.x, C.pos.z), ...Array.from({ length: 12 }, (_, k) => {
    const a = (k / 12) * Math.PI * 2;
    return P.groundAt(C.pos.x + Math.cos(a) * C.r, C.pos.z + Math.sin(a) * C.r);
  }));
  // its main mass a little back, a lower block stepping down in front of it toward the bench, a
  // squat one at its side and a low shelf of stone at its foot: masses one behind another, ledged
  const geo = massifGeometry(rand, C.pos.x, C.pos.z, C.r, C.h, {
    summit: 2.6, flare: 0.75, peaks: 2, rocky: 1.4, terraces: 0.5, crown: 1,
    mainAt: { angle: ga + Math.PI + 0.4, dist: 0.16 }, mainR: 0.5, mainE: 1.4, mainRot: ga + Math.PI / 2 + 0.3,
    shoulders: [
      { angle: ga - 0.3, dist: 0.36, r: 0.36, h: 0.66, e: 1.5, rot: ga + Math.PI / 2 - 0.2, s: 2.2 },
      { angle: ga + 1.3, dist: 0.44, r: 0.34, h: 0.45, e: 1.3, rot: ga + 1.3 + Math.PI / 2, s: 2.4 },
      { angle: ga + 0.5, dist: 0.62, r: 0.3, h: 0.22, e: 1.8, rot: ga + Math.PI / 2 + 0.4, s: 3, f: 0.6 },
    ],
  });
  if (ground !== 0) geo.translate(0, ground, 0);
  scene.add(new THREE.Mesh(geo, mountainMaterial({
    cloud: new THREE.Vector4(0, 1, 0, 0), cun: 0.9, cunFreq: 0.45, layers: true, density: 1.05,
    near: 30, far: 300, minFar: 0.35, mist: ground + 5, mistBase: ground - 1.5, mistFloor: 0.25, // (its foot in the meadow's haze)
  })));

  // the pine: rooted on a shelf near the crown, on the side toward the bench
  const heightAt = (x, z) => geo.userData.heightAt(x, z) + ground;
  const relief = (x, z, r) => Math.max(...[[r, 0], [-r, 0], [0, r], [0, -r]].map(([dx, dz]) => Math.abs(heightAt(x + dx, z + dz) - heightAt(x, z))));
  let best = null;
  for (let i = 0; i < 300; i++) {
    const a = ga + rand.range(-1.3, 1.3);
    const d = C.r * rand.range(0.1, 0.5);
    const x = C.pos.x + Math.cos(a) * d, z = C.pos.z + Math.sin(a) * d;
    const y = heightAt(x, z);
    const score = y - relief(x, z, 0.6) * 8; // (high up, and as flat as it gets)
    if (!best || score > best.score) best = { x, z, y, score };
  }
  // (sunk into its shelf a little, below the lowest of the stone right round it: never on air)
  const y = Math.min(best.y, ...Array.from({ length: 8 }, (_, k) => {
    const a = (k / 8) * Math.PI * 2;
    return heightAt(best.x + Math.cos(a) * 0.5, best.z + Math.sin(a) * 0.5);
  })) - 0.3;
  addTrees(scene, [{ x: best.x, z: best.z, y, h: 7 }], rand, P.groundAt, { climb: 0.004, channel: "far" });
  C.heightAt = heightAt; // (for anything else that wants to stand on it)
  C.pine = new THREE.Vector3(best.x, y, best.z);
}
