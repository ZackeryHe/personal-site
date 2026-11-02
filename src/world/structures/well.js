import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { inkMaterial } from "../../ink/material.js";
import { roofGeometry } from "./structures.js";

// 源 — the source: a well beside the path through the meadows (Source code: in Chinese 源码,
// "the code at the source"). An octagonal stone curb under its own little roof on four posts, a
// windlass (辘轳) over it, its rope wound round the drum down to a bucket hanging over the water.
export function build({ scene, P, places }) {
  const S = places.source;
  if (!S) return;
  const at = (g, x, y, z) => g.translate(x, y, z);
  const oct = (r) => {
    const s = new THREE.Shape();
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    return s;
  };

  // stone: the platform and the curb
  const curb = oct(0.86);
  curb.holes.push(oct(0.6));
  const stone = mergeGeometries([
    at(new THREE.BoxGeometry(3.6, 0.24, 3.6), 0, 0.12, 0),
    new THREE.ExtrudeGeometry(curb, { depth: 0.62, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, 0.24, 0),
    // its coping: a band a little proud at the top
    new THREE.ExtrudeGeometry((() => { const c = oct(0.92); c.holes.push(oct(0.58)); return c; })(), { depth: 0.09, bevelEnabled: false })
      .rotateX(-Math.PI / 2).translate(0, 0.86, 0),
  ].map((g) => (g.index ? g.toNonIndexed() : g)));

  // wood: four posts, the lintels, the windlass (two uprights, the drum and its crank), the rope,
  // and the bucket
  const top = 2.55;
  const wood = [];
  for (const [x, z] of [[-1.42, -1.42], [1.42, -1.42], [-1.42, 1.42], [1.42, 1.42]]) {
    wood.push(at(new THREE.CylinderGeometry(0.075, 0.09, top - 0.24, 6), x, 0.24 + (top - 0.24) / 2, z));
  }
  for (const s of [-1.42, 1.42]) {
    wood.push(at(new THREE.BoxGeometry(3.05, 0.16, 0.14), 0, top - 0.08, s));
    wood.push(at(new THREE.BoxGeometry(0.14, 0.16, 3.05), s, top - 0.08, 0));
  }
  for (const x of [-0.72, 0.72]) wood.push(at(new THREE.BoxGeometry(0.1, 1.05, 0.1), x, 0.95 + 0.52, 0));
  wood.push(at(new THREE.CylinderGeometry(0.11, 0.11, 1.34, 10).rotateZ(Math.PI / 2), 0, 1.86, 0)); // the drum
  wood.push(at(new THREE.BoxGeometry(0.06, 0.34, 0.06), 0.82, 1.72, 0));                           // the crank
  wood.push(at(new THREE.BoxGeometry(0.22, 0.05, 0.05), 0.92, 1.56, 0));
  wood.push(at(new THREE.CylinderGeometry(0.012, 0.012, 0.62, 4), 0.15, 1.55, 0.1));                // the rope
  const bucket = new THREE.CylinderGeometry(0.17, 0.13, 0.24, 10, 1, true);
  wood.push(at(bucket, 0.15, 1.12, 0.1));
  wood.push(at(new THREE.TorusGeometry(0.15, 0.012, 4, 12, Math.PI), 0.15, 1.24, 0.1));            // its handle

  // the roof: dark tiles, upturned at the corners
  const roof = at(roofGeometry(2.05, 1.2, 0.45), 0, top, 0);
  const finial = at(new THREE.SphereGeometry(0.13, 8, 6), 0, top + 1.32, 0);

  const g = new THREE.Group();
  g.add(new THREE.Mesh(stone, inkMaterial({
    channel: "mid", bias: 0.12, climb: 0.04, noiseScale: 0.4, noiseAmp: 0.3, near: 4, far: 45,
    density: 1, mist: 0.6, grain: 2.5, shade: 0.14, side: THREE.DoubleSide,
  })));
  g.add(new THREE.Mesh(mergeGeometries(wood.map((w) => (w.index ? w.toNonIndexed() : w))), inkMaterial({
    channel: "mid", bias: 0.12, climb: 0.04, noiseScale: 0.4, noiseAmp: 0.3, near: 4, far: 45,
    density: 1.05, mist: 0.6, grain: 3, shade: 0.5, sil: 0.7, tint: "wood", side: THREE.DoubleSide,
  })));
  g.add(new THREE.Mesh(mergeGeometries([roof.toNonIndexed(), finial.toNonIndexed()]), inkMaterial({
    channel: "mid", bias: 0.12, climb: 0.04, noiseScale: 0.4, noiseAmp: 0.3, near: 4, far: 55,
    density: 0.95, mist: 0.6, grain: 3, shade: 0.55, sil: 0.5, tint: "none", side: THREE.DoubleSide,
  })));
  // the water, deep down in the curb: dark, a faint ring on it
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24).rotateX(-Math.PI / 2), inkMaterial({
    variant: "pond", tint: "water", channel: "mid", bias: 0.12, climb: 0, noiseScale: 0.4, near: 3, far: 40,
    minFar: 0, density: 1.4, mist: 0.01, sil: 0, color: new THREE.Color("#141a22"),
    flow: new THREE.Vector4(0.6, 0, S.pos.x, S.pos.z), // (its rings drift out from the middle of the well)
  }));
  water.position.y = 0.42;
  g.add(water);

  g.position.copy(S.pos).setY(P.groundAt(S.pos.x, S.pos.z) - 0.05);
  g.rotation.y = Math.atan2(S.faces.x - S.pos.x, S.faces.z - S.pos.z);
  scene.add(g);
}
