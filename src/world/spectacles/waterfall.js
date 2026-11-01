import * as THREE from "three";
import { inkMaterial } from "../../ink/material.js";
import { peakGeometry, mountainMaterial } from "../landscape/mountains.js";
import { facing, peakRadiusAt } from "./common.js";

// 飞瀑 — a tall waterfall pouring down the face of a mountain, left as white paper.
export function build({ scene, places, rng }) {
  const rand = rng(85);
  const W = places.waterfall;
  const { dir, side } = facing(W);
  // the mountain, with a ravine cut into the face toward the walk for the falls to pour down
  const gully = { angle: Math.atan2(dir.x, dir.z), depth: 0.5, width: 0.22 };
  scene.add(new THREE.Mesh(peakGeometry(rand, W.pos.x, W.pos.z, W.r, W.h, 0, gully), mountainMaterial()));

  // a ribbon inside the ravine, widening as it falls
  const lip = W.h * 0.72;
  const N = 48;
  const positions = [];
  const uvs = [];
  const index = [];
  const pointAt = (y) => {
    const out = peakRadiusAt(W, y) * 0.85 + 0.3; // in front of the ravine floor, between its walls
    return new THREE.Vector3(W.pos.x + dir.x * out, y, W.pos.z + dir.z * out);
  };
  for (let j = 0; j <= N; j++) {
    const v = j / N; // 0 lip → 1 foot
    const y = lip * (1 - v) - 1;
    const c = pointAt(y);
    const w = 1.6 + v * 3.5;
    positions.push(c.x - side.x * w / 2, y, c.z - side.z * w / 2, c.x + side.x * w / 2, y, c.z + side.z * w / 2);
    uvs.push(0, v, 1, v);
    if (j < N) {
      const b = j * 2;
      index.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, inkMaterial({
    variant: "waterfall", channel: "far", climb: 0.002, noiseScale: 0.05, noiseAmp: 0.2,
    near: 40, far: 320, minFar: 0.4, density: 0.9, mist: 0.01, grain: 0.3, sil: 0,
    rim: 0.3, side: THREE.DoubleSide,
  })));

  // spray: soft paper-white puffs where it lands
  const spray = inkMaterial({
    channel: "far", climb: 0, noiseScale: 0.1, noiseAmp: 0.3, near: 40, far: 320,
    density: 0.04, mist: 0.01, sil: 0, sketch: false,
  });
  const foot = pointAt(0);
  for (let i = 0; i < 4; i++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), spray);
    puff.scale.set(rand.range(3, 5), rand.range(1.5, 2.5), rand.range(3, 5));
    puff.position.copy(foot).addScaledVector(side, rand.range(-3, 3)).addScaledVector(dir, rand.range(0, 3));
    puff.position.y = rand.range(0.5, 2);
    scene.add(puff);
  }

  W.anchor = pointAt(lip * 0.6).addScaledVector(side, 11); // its name floats beside the falls
}
