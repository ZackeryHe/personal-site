import * as THREE from "three";
import { massifGeometry, mountainMaterial } from "./mountains.js";
import { addTrees } from "./flora.js";

// 远林 — round to the left of the bench, out over the valley where nothing else stands: a long low
// bank of land in the middle distance and a paler one beyond it, a few pines along each crest,
// their feet lost in the mist. The middle ground between the rim at your feet and the far ranges:
// a few trees on a bank, the rest left empty. The pines are the lite kind (flora.js addTrees):
// only ever seen far off, in the mist, where they look just like the rest.
// (Each bank's foot is sunk into the level ground; each pine is sunk into the bank under it.)
export function build({ scene, P, places, rng }) {
  const rand = rng(97);
  const eye = places.bench.pos;
  for (const G of places.groves ?? []) {
    // (the lowest ground round its foot: it stands on that, its foot sunk into the rest)
    const ground = Math.min(P.groundAt(G.pos.x, G.pos.z), ...Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return P.groundAt(G.pos.x + Math.cos(a) * G.r, G.pos.z + Math.sin(a) * G.r);
    }));
    // a long, low, lopsided swell of land lying across the view from the bench: a rounded crest,
    // a lower shoulder off one end; no peaks, no strokes, no dots (boneless)
    const ga = Math.atan2(eye.z - G.pos.z, eye.x - G.pos.x); // (toward the bench)
    const along = ga + Math.PI / 2;                           // (across the view)
    const side = rand() < 0.5 ? 1 : -1;
    const geo = massifGeometry(rand, G.pos.x, G.pos.z, G.r, G.h, {
      summit: 2.1, flare: 1.5, peaks: 0, rocky: 0.3, terraces: 0, crown: 0,
      mainAt: { angle: along + (side > 0 ? Math.PI : 0), dist: 0.12 }, mainR: 0.5, mainE: 2.2, mainRot: along,
      shoulders: [{ angle: along + (side > 0 ? 0 : Math.PI), dist: 0.42, r: 0.36, h: 0.55, e: 1.8, rot: along + 0.2 * side }],
    });
    if (ground !== 0) geo.translate(0, ground, 0);
    scene.add(new THREE.Mesh(geo, mountainMaterial({
      layers: true, cloud: new THREE.Vector4(0, 1, 0, 0), dots: 0, density: 0.65 * G.ink,
      mist: ground + G.h * 0.65, mistBase: ground - 0.5, mistFloor: 0, // (its foot dissolving into the mist)
    })));

    // pines along its crest, irregularly spaced (a pair, a gap, a few together), one standing
    // taller than the rest
    const heightAt = (x, z) => geo.userData.heightAt(x, z) + ground;
    const ax = Math.cos(along), az = Math.sin(along);
    const spots = [];
    for (let i = 0; i < 400 && spots.length < G.trees; i++) {
      const u = rand.range(-0.62, 0.62) * G.r; // (along the crest)
      const w = rand.range(-0.12, 0.12) * G.r; // (a little either side of it)
      const x = G.pos.x + ax * u - az * w, z = G.pos.z + az * u + ax * w;
      if (heightAt(x, z) < ground + G.h * 0.5) continue; // (up on the bank, not down its sides)
      if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < rand.range(2.4, 6))) continue;
      spots.push({ x, z });
    }
    const trees = spots.map((s, i) => ({
      x: s.x, z: s.z,
      // (rooted below the lowest of the ground right round its trunk: never standing on air)
      y: Math.min(heightAt(s.x, s.z), ...Array.from({ length: 8 }, (_, k) => {
        const a = (k / 8) * Math.PI * 2;
        return heightAt(s.x + Math.cos(a) * 0.5, s.z + Math.sin(a) * 0.5);
      })) - 0.25,
      h: i === 0 ? rand.range(10.5, 12) : rand.range(6, 9),
      // near the end of the walk more of the trees are turning (they colour in gold and red)
      ...(rand() < 0.35 ? { autumn: 1 + Math.floor(rand() * 3) } : {}),
    }));
    if (trees.length) addTrees(scene, trees, rand, P.groundAt, { lite: true, channel: "far", climb: 0.004, ink: G.ink });
  }
}
