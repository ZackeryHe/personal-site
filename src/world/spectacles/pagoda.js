import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { massifGeometry, mountainMaterial } from "../landscape/mountains.js";
import { roofGeometry } from "../structures/structures.js";
import { farInk } from "./common.js";

// 远塔 — a pagoda on a knoll at the canyon's rim, beside the pavilion.
export function build({ scene, P: path, places, rng }) {
  const rand = rng(83);
  const P = places.pagoda;
  // its knoll: a small rounded massif (kept on land, short of the cliff edge)
  const knoll = path.keepOnLand(massifGeometry(rand, P.pos.x, P.pos.z, P.r * 1.25, P.h, {
    lobes: 2, summit: 2.2, flare: 1.4, peaks: 0, rocky: 0.5, terraces: 0, crown: 0, // (a knoll: rounded)
  }), 2);
  // (no texture strokes: on a knoll this small they'd read as a skirt)
  scene.add(new THREE.Mesh(knoll, mountainMaterial({ layers: true })));

  const parts = [];
  let y = knoll.userData.heightAt(P.pos.x, P.pos.z) - 0.3; // on its summit
  for (let i = 0; i < (P.tiers ?? 7); i++) {
    const w = 2.3 - i * 0.22;
    parts.push(new THREE.CylinderGeometry(w * 0.8, w * 0.85, 1.25, 8).translate(0, y + 0.625, 0));
    parts.push(roofGeometry(w + 0.45, 0.55, 0.3).translate(0, y + 1.2, 0));
    y += 1.6;
  }
  parts.push(new THREE.ConeGeometry(0.16, 2.4, 6).translate(0, y + 1.2, 0));
  for (let k = 0; k < 3; k++) {
    parts.push(new THREE.TorusGeometry(0.22 - k * 0.04, 0.05, 4, 10).rotateX(Math.PI / 2).translate(0, y + 0.4 + k * 0.45, 0));
  }
  const pagoda = new THREE.Mesh(mergeGeometries(parts), farInk());
  pagoda.position.set(P.pos.x, 0, P.pos.z);
  scene.add(pagoda);

}
