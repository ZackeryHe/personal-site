import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { peakGeometry, mountainMaterial } from "../landscape/mountains.js";
import { roofGeometry } from "../structures/structures.js";
import { facing, peakRadiusAt, farInk } from "./common.js";

// 云寺 — a temple high on a mountainside, with a belt of cloud drifting just below it.
export function build({ scene, places, rng }) {
  const rand = rng(89);
  const T = places.temple;
  const ledge = T.h * 0.62;
  const { dir, side } = facing(T);
  // the mountain, with a recess cut into the face toward the walk for the temple to sit in
  const recess = { angle: Math.atan2(dir.x, dir.z), depth: 0.6, width: 0.4 };
  scene.add(new THREE.Mesh(
    peakGeometry(rand, T.pos.x, T.pos.z, T.r, T.h, 0, recess),
    mountainMaterial({ cloud: new THREE.Vector4(ledge - 9, 5, 0.95, 0.8) }) // clouds under the temple
  ));

  const base = T.pos.clone().addScaledVector(dir, peakRadiusAt(T, ledge) * 0.62).setY(ledge);

  // built in a local frame where +z faces out over the valley (toward the walk)
  const parts = [
    new THREE.BoxGeometry(13, 1.2, 8).translate(0, 0.6, 0),                // terrace
    new THREE.BoxGeometry(13, 0.9, 0.35).translate(0, 1.65, 3.9),          // low front wall
    new THREE.BoxGeometry(6, 3, 4).translate(0, 2.7, -0.5),                // main hall
    roofGeometry(3.9, 2.1, 0.7).scale(1.25, 1, 0.9).translate(0, 4.2, -0.5),
  ];
  for (const sx of [-1, 1]) {                                              // side halls
    parts.push(new THREE.BoxGeometry(3, 2.2, 3).translate(sx * 4.8, 2.3, 1));
    parts.push(roofGeometry(2.2, 1.3, 0.45).translate(sx * 4.8, 3.4, 1));
  }
  let y = 1.2;                                                              // a small tower behind
  for (let i = 0; i < 3; i++) {
    const w = 1.3 - i * 0.2;
    parts.push(new THREE.CylinderGeometry(w * 0.75, w * 0.8, 1.4, 8).translate(-3.5, y + 0.7, -3));
    parts.push(roofGeometry(w + 0.35, 0.5, 0.25).translate(-3.5, y + 1.35, -3));
    y += 1.75;
  }
  parts.push(new THREE.ConeGeometry(0.12, 1.6, 6).translate(-3.5, y + 0.8, -3));
  // drawn larger and darker than life, as painters do, so it reads from across the valley
  const temple = new THREE.Mesh(mergeGeometries(parts), farInk({ shade: 0.45, density: 1.25, minFar: 0.55 }));
  temple.position.copy(base);
  temple.rotation.y = Math.atan2(dir.x, dir.z) + rand.range(-0.15, 0.15);
  temple.scale.setScalar(1.6);
  scene.add(temple);

  T.anchor = base.clone().addScaledVector(side, 14).add(new THREE.Vector3(0, 5, 0)); // beside the temple
}
