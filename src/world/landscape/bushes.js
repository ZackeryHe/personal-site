import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { inkMaterial } from "../../ink/material.js";

// 点苔 — the dabs painters use for vegetation on distant mountains: little dark clumps of
// brush along the ridges, on the ledges and crowns, a few clinging to the cliffs. Light enough
// to scatter by the thousand: one instanced mesh of clumps per material.

/** One clump: a few squat lumpy blobs run together. */
function clumpGeometry() {
  const blob = (detail, r, x, y, z) => new THREE.IcosahedronGeometry(r, detail).scale(1, 0.62, 1).translate(x, y, z);
  return mergeGeometries([
    blob(1, 0.55, 0, 0.22, 0),
    blob(0, 0.4, 0.45, 0.14, 0.15),
    blob(0, 0.36, -0.32, 0.1, -0.28),
  ]);
}

/**
 * Spots for bushes on a geometry (positions in world space, with normals): mostly on ledges,
 * crowns and gentle slopes where the surface faces up, a few on steep faces, none on overhangs.
 *   density: chance per upward-facing vertex   minY / maxY: keep within these heights
 *   skip(p): leave out spots for which this returns true
 */
export function surfaceSpots(geometry, rand, { density = 0.05, faces = 0.03, minY = -Infinity, maxY = Infinity, skip = null, cluster = [1, 4] } = {}) {
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const spots = [];
  const side = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < minY || y > maxY) continue;
    const ny = nor.getY(i);
    const want = ny > 0.55 ? 1 : ny > 0.15 ? 0.45 : ny > -0.15 ? faces : 0;
    if (rand() > want * density) continue;
    const p = new THREE.Vector3(pos.getX(i), y, pos.getZ(i));
    if (skip?.(p)) continue;
    const n = new THREE.Vector3(nor.getX(i), ny, nor.getZ(i)).normalize();
    // a patch, not a lone lump: a few smaller clumps huddled round it along the surface
    const count = cluster[0] + Math.floor(rand() * (cluster[1] - cluster[0] + 1));
    for (let c = 0; c < count; c++) {
      if (c === 0) {
        spots.push({ p, n, k: 1 });
        continue;
      }
      side.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).projectOnPlane(n).normalize();
      spots.push({ p: p.clone(), n, k: rand.range(0.45, 0.75), off: side.clone().multiplyScalar(rand.range(0.7, 1.4)) });
    }
  }
  return spots;
}

/** Ink for the clumps; pass the reveal / channel / distance / mist settings of what they grow on. */
export function bushInk(opts = {}) {
  return inkMaterial({
    climb: 0, noiseScale: 0.1, noiseAmp: 0.25, density: 1.25, grain: 1.4, sil: 0.6, shade: 0.75,
    ragged: 0.55, tint: "foliage", wash: 0.6,
    washLit: new THREE.Color("#8fa77a"), washShade: new THREE.Color("#3f5a45"), sketch: false,
    ...opts,
  });
}

/**
 * An instanced mesh of clumps at the spots. size(spot) → metres; a spot may also carry its own
 * `scale` (a Vector3 multiplier, e.g. flattened pads of a tree) and `up` (no tilt to the slope).
 */
export function bushMesh(spots, rand, material, size) {
  const mesh = new THREE.InstancedMesh(clumpGeometry(), material, Math.max(1, spots.length));
  const o = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const lean = new THREE.Quaternion();
  spots.forEach((s, i) => {
    const base = size(s);
    const k = base * (s.k ?? 1) * rand.range(0.75, 1.25);
    o.position.copy(s.p).addScaledVector(s.n, k * 0.12); // sitting on the surface, not sunk in it
    if (s.off) o.position.addScaledVector(s.off, base); // (huddled round the patch's middle)
    // stand up, leaning a little with the slope; spun round at random
    lean.setFromUnitVectors(up, s.up ? up : up.clone().lerp(s.n, 0.35).normalize());
    o.quaternion.setFromAxisAngle(up, rand() * Math.PI * 2).premultiply(lean);
    o.scale.set(k, k * rand.range(0.8, 1.2), k);
    if (s.scale) o.scale.multiply(s.scale);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
  });
  mesh.count = spots.length;
  mesh.frustumCulled = false;
  return mesh;
}
