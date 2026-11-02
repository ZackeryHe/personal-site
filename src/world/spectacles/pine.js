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
  /** A limb along the points, thinning from r0 at its root to r1 at its tip. */
  const branch = (points, r0, r1) => {
    const curve = new THREE.CatmullRomCurve3(points);
    const segs = 24;
    const radial = 7;
    const g = new THREE.TubeGeometry(curve, segs, 1, radial); // unit radius: each ring is scaled below
    const pos = g.attributes.position;
    const c = new THREE.Vector3();
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      curve.getPointAt(u, c);
      const r = r0 + (r1 - r0) * Math.pow(u, 0.75);
      for (let j = 0; j <= radial; j++) {
        const k = i * (radial + 1) + j;
        pos.setXYZ(k, c.x + (pos.getX(k) - c.x) * r, c.y + (pos.getY(k) - c.y) * r, c.z + (pos.getZ(k) - c.z) * r);
      }
    }
    g.computeVertexNormals();
    return g;
  };

  // the trunk leans out over the drop; the arm reaches further out, a little drooping, and
  // every limb thins out toward its tip
  const trunk = [p(0, 0, 0), p(2.2, 0.8, 0.4), p(4.4, 1.6, -0.2), p(6.2, 2.9, 0.3)];
  const arm = [p(3.6, 1.3, -0.1), p(4.0, 3.4, 1.4), p(3.6, 5.8, 2.6), p(3.0, 7.8, 3.3)];
  const wood = [
    branch(trunk, 0.46, 0.17),
    branch(arm, 0.26, 0.045),
    branch([p(5, 2.0, 0), p(5.6, 2.4, -2.2), p(5.7, 2.2, -3.9)], 0.15, 0.035),
    branch([p(5.8, 2.6, 0.1), p(6.5, 4.4, 1.3), p(6.6, 5.6, 1.8)], 0.13, 0.03),
    branch([p(3.9, 4.6, 1.9), p(4.6, 5.0, 2.6), p(5.0, 5.3, 2.4)], 0.07, 0.02),   // twigs off the arm,
    branch([p(3.5, 6.9, 3.0), p(3.9, 7.2, 4.0), p(4.1, 7.6, 4.2)], 0.055, 0.015), // holding its pads
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
  pad(p(3.35, 8.0, 3.45), 1.25); // smaller out toward the end of the arm
  pad(p(4.1, 7.6, 4.2), 1.1);
  pad(p(4.0, 6.4, 2.7), 1.4);
  pad(p(5.0, 5.3, 2.4), 1.15);
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
