import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { peakGeometry, mountainMaterial } from "../landscape/mountains.js";
import { facing, peakRadiusAt, farInk } from "./common.js";

// 迎客松 — the "welcoming pine": an old pine growing out of a cliff near the summit,
// one long branch reaching out toward the path like an arm held out to visitors.
export function build({ scene, places, rng }) {
  const rand = rng(87);
  const C = places.pine;
  scene.add(new THREE.Mesh(peakGeometry(rand, C.pos.x, C.pos.z, C.r, C.h, 0), mountainMaterial()));

  const { dir, side } = facing(C);
  const up = new THREE.Vector3(0, 1, 0);
  const y0 = C.h * 0.7;
  const root = C.pos.clone().addScaledVector(dir, peakRadiusAt(C, y0) * 0.9).setY(y0);
  const p = (u, d, s) => root.clone().addScaledVector(up, u).addScaledVector(dir, d).addScaledVector(side, s);
  const branch = (points, radius) =>
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, radius, 6);

  // trunk leans out over the drop, the arm reaches toward the walk
  const trunk = [p(0, 0, 0), p(2.5, 1.2, 0.3), p(5, 2.2, -0.4), p(7, 3.6, 0.2)];
  const armStart = p(4, 1.9, -0.2);
  const arm = [armStart, p(4.6, 4.5, 1.6), p(4.3, 7.5, 3.2), p(3.8, 10, 4.2)];
  const wood = [
    branch(trunk, 0.5),
    branch(arm, 0.3),
    branch([p(5.6, 2.6, 0), p(6.4, 3.2, -2.6), p(6.6, 3.0, -4.6)], 0.2),
    branch([p(6.5, 3.3, 0.1), p(7.3, 5.4, 1.5), p(7.4, 6.8, 2.2)], 0.18),
  ];
  scene.add(new THREE.Mesh(mergeGeometries(wood), farInk({ density: 1.1, shade: 0.55, grain: 1.2 })));

  // flat layered needle pads: along the arm, on the side branches, and the crown
  const pads = [];
  const pad = (c, r) => {
    const g = new THREE.IcosahedronGeometry(1, 1);
    g.scale(r * rand.range(1, 1.25), r * rand.range(0.3, 0.4), r * rand.range(0.75, 0.95));
    g.rotateY(rand() * Math.PI);
    pads.push(g.translate(c.x, c.y, c.z));
  };
  pad(p(4.2, 10.3, 4.4), 2.4);
  pad(p(4.8, 8.2, 3.4), 2.0);
  pad(p(4.9, 6, 2.2), 1.6);
  pad(p(6.8, 3.1, -4.8), 2.0);
  pad(p(7.7, 7, 2.4), 1.8);
  pad(p(7.6, 3.7, 0.2), 2.6);
  pad(p(8.4, 3.2, -0.6), 1.7);
  scene.add(new THREE.Mesh(mergeGeometries(pads), farInk({
    density: 1.3, shade: 0.75, sil: 0.5, grain: 0.9, ragged: 0.6, sketch: false,
  })));

  C.anchor = p(6, 3, -11); // its name floats beside the tree
}
