import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { peakGeometry, mountainMaterial } from "../landscape/mountains.js";
import { roofGeometry } from "../structures/structures.js";
import { farInk } from "./common.js";

// 远塔 — a seven-storey pagoda on top of a far hill.
export function build({ scene, places, rng }) {
  const rand = rng(83);
  const P = places.pagoda;
  scene.add(new THREE.Mesh(peakGeometry(rand, P.pos.x, P.pos.z, P.r, P.h, 0), mountainMaterial()));

  const parts = [];
  let y = P.h - 2 - 0.5; // just below the summit
  for (let i = 0; i < 7; i++) {
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

  P.anchor = new THREE.Vector3(P.pos.x + 9, P.h + 4, P.pos.z); // its name floats beside the pagoda
}
