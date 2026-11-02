import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { roofGeometry } from "../structures/structures.js";
import { farInk } from "./common.js";

// 云寺 — a temple on top of one of the canyon's stone pillars, above the clouds.
// (vista.js raises the pillar and sets places.temple.pos to its top; run it first.)
export function build({ scene, places, rng }) {
  const rand = rng(89);
  const T = places.temple;
  if (!T.faces) return;
  const dir = T.faces.clone().sub(T.pos).setY(0).normalize();

  // built in a local frame where +z faces back across the canyon (toward the walk)
  const parts = [
    new THREE.BoxGeometry(10, 1.2, 7).translate(0, 0.6, 0),                // terrace
    new THREE.BoxGeometry(10, 0.9, 0.35).translate(0, 1.65, 3.4),          // low front wall
    new THREE.BoxGeometry(5, 2.6, 3.4).translate(0, 2.5, -0.5),            // main hall
    roofGeometry(3.3, 1.8, 0.6).scale(1.25, 1, 0.9).translate(0, 3.8, -0.5),
  ];
  for (const sx of [-1, 1]) {                                              // side halls
    parts.push(new THREE.BoxGeometry(2.4, 1.9, 2.4).translate(sx * 3.8, 2.15, 1));
    parts.push(roofGeometry(1.8, 1.1, 0.4).translate(sx * 3.8, 3.1, 1));
  }
  let y = 1.2;                                                              // a small tower behind
  for (let i = 0; i < 3; i++) {
    const w = 1.1 - i * 0.18;
    parts.push(new THREE.CylinderGeometry(w * 0.75, w * 0.8, 1.2, 8).translate(-2.8, y + 0.6, -2.6));
    parts.push(roofGeometry(w + 0.3, 0.45, 0.22).translate(-2.8, y + 1.15, -2.6));
    y += 1.5;
  }
  parts.push(new THREE.ConeGeometry(0.1, 1.4, 6).translate(-2.8, y + 0.7, -2.6));
  // drawn larger and darker than life, as painters do, so it reads from across the canyon
  const temple = new THREE.Mesh(mergeGeometries(parts), farInk({ shade: 0.45, density: 1.25, minFar: 0.55 }));
  temple.position.copy(T.pos);
  temple.rotation.y = Math.atan2(dir.x, dir.z) + rand.range(-0.2, 0.2);
  temple.scale.setScalar(1.3);
  scene.add(temple);
}
