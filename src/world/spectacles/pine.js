import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { inkMaterial } from "../../ink/material.js";
import { facing } from "./common.js";

// 迎客松 — the "welcoming pine": an old pine at the very edge of the cliff, leaning out
// over the canyon, one long branch held out over the drop. It frames the view at the end.
export function build({ scene, places, rng }) {
  const rand = rng(87);
  const C = places.pine;
  const { dir, side } = facing(C); // dir: out over the canyon
  const up = new THREE.Vector3(0, 1, 0);
  const root = C.pos.clone().setY(-0.2);
  const p = (u, d, s) => root.clone().addScaledVector(up, u).addScaledVector(dir, d).addScaledVector(side, s);
  const branch = (points, radius) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, radius, 6);

  // the trunk leans out over the drop; the arm reaches further out, a little drooping
  const trunk = [p(0, 0, 0), p(2.2, 0.8, 0.4), p(4.4, 1.6, -0.2), p(6.2, 2.9, 0.3)];
  const arm = [p(3.6, 1.3, -0.1), p(4.0, 3.4, 1.4), p(3.6, 5.8, 2.6), p(3.0, 7.8, 3.3)];
  const wood = [
    branch(trunk, 0.42),
    branch(arm, 0.24),
    branch([p(5, 2.0, 0), p(5.6, 2.4, -2.2), p(5.7, 2.2, -3.9)], 0.16),
    branch([p(5.8, 2.6, 0.1), p(6.5, 4.4, 1.3), p(6.6, 5.6, 1.8)], 0.14),
  ];
  scene.add(new THREE.Mesh(mergeGeometries(wood), inkMaterial({
    channel: "mid", climb: 0.03, noiseScale: 0.35, noiseAmp: 0.3, near: 6, far: 60,
    density: 1.1, mist: 0.01, grain: 1.6, shade: 0.55, sil: 0.8, tint: "wood",
  })));

  // flat layered clouds of needles along the arm, on the side branches, and the crown: each a
  // clump of overlapping lumpy pads, domed on top and flat beneath, like the other pines
  const lumpy = new THREE.IcosahedronGeometry(1, 2);
  {
    const pos = lumpy.attributes.position;
    const lumps = new Map(); // keyed by position so shared vertices move together
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const key = [x, y, z].map((v) => Math.round(v * 1000) + 0).join(",");
      if (!lumps.has(key)) {
        const a = Math.atan2(z, x);
        lumps.set(key, 1 + 0.22 * Math.sin(a * 5 + y * 3) + 0.12 * Math.sin(a * 11 - y * 5) + (rand() - 0.5) * 0.18);
      }
      const k = lumps.get(key);
      pos.setXYZ(i, x * k, (y > 0 ? y : y * 0.35) * (0.8 + 0.2 * k), z * k);
    }
    lumpy.computeVertexNormals();
  }
  const pads = [];
  const pad = (c, r) => {
    const parts = 4 + Math.floor(rand() * 2);
    for (let j = 0; j < parts; j++) {
      const rr = r * (j === 0 ? 0.9 : rand.range(0.45, 0.7));
      pads.push(lumpy.clone()
        .scale(rr * rand.range(1, 1.2), rr * rand.range(0.3, 0.38), rr * rand.range(0.7, 0.9))
        .rotateY(rand() * Math.PI)
        .translate(c.x + (j ? rand.range(-0.7, 0.7) * r : 0), c.y + (j ? rand.range(-0.06, 0.16) * r : 0), c.z + (j ? rand.range(-0.6, 0.6) * r : 0)));
    }
  };
  pad(p(3.4, 8.1, 3.5), 1.9);
  pad(p(4.0, 6.4, 2.7), 1.5);
  pad(p(4.2, 4.6, 1.8), 1.2);
  pad(p(5.8, 2.3, -4.1), 1.5);
  pad(p(6.8, 5.8, 1.9), 1.4);
  pad(p(6.6, 3.1, 0.3), 2.0);
  pad(p(7.2, 2.7, -0.5), 1.3);
  scene.add(new THREE.Mesh(mergeGeometries(pads), inkMaterial({
    channel: "mid", climb: 0.03, noiseScale: 0.35, noiseAmp: 0.3, near: 6, far: 60,
    density: 1.4, mist: 0.01, grain: 2.4, sil: 0.7, shade: 0.8, ragged: 0.9, tint: "foliage", wash: 0.5,
    washLit: new THREE.Color("#8fa77a"), washShade: new THREE.Color("#3f5a45"), sketch: false,
  })));
}
