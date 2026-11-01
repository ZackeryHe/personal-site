import * as THREE from "three";
import { inkMaterial } from "../../ink/material.js";
import { STOPS } from "../places.js";

// Pines in the painted style: a bent trunk, short branches, and flat "cloud"
// pads of needles. Everything is instanced (3 draw calls for the whole forest).
export function build({ scene, P, rng }) {
  const rand = rng(37);
  const UP = new THREE.Vector3(0, 1, 0);

  // ---------- Where the trees go ----------
  const trees = [];
  const plant = (x, z, h) => {
    if (P.distToPath(x, z) < 4 || P.blocked(x, z)) return;
    trees.push({ x, z, h, yaw: rand() * Math.PI * 2, sc: rand.range(0.8, 1.25) });
  };
  for (let i = 0; i < 120; i++) {
    const t = rand();
    const off = rand.range(4.5, 24) * (rand() < 0.5 ? -1 : 1);
    const p = P.path.getPointAt(t).addScaledVector(P.sideAt(t), off);
    plant(p.x, p.z, rand.range(4.5, 9.5));
  }
  // a denser grove around the About station
  for (let i = 0; i < 30; i++) {
    const t = STOPS.about + rand.range(-0.06, 0.06);
    const off = rand.range(4, 12) * (rand() < 0.5 ? -1 : 1);
    const p = P.path.getPointAt(t).addScaledVector(P.sideAt(t), off);
    plant(p.x, p.z, rand.range(6, 11));
  }

  // ---------- Shared geometry ----------
  // Trunk: unit height, base at y=0, with an S-bend baked in (world units).
  const bend = (y) => 0.5 * Math.sin(y * 2.4) - 0.25 * y;
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.32, 1, 7, 10).translate(0, 0.5, 0);
  {
    const pos = trunkGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) + bend(pos.getY(i)));
    trunkGeo.computeVertexNormals();
  }
  const branchGeo = new THREE.CylinderGeometry(0.5, 1, 1, 4).translate(0, 0.5, 0);
  const padGeo = new THREE.IcosahedronGeometry(1, 1);

  const woodMat = inkMaterial({
    channel: "mid", climb: 0.035, noiseScale: 0.35, noiseAmp: 0.3,
    near: 5, far: 50, density: 1, mist: 1.2, grain: 3, shade: 0.55, sway: 0.004,
  });
  // dark needle masses: little shading, ragged needle-tip edges
  const padMat = inkMaterial({
    channel: "mid", climb: 0.035, noiseScale: 0.35, noiseAmp: 0.3,
    near: 6, far: 55, density: 1.3, mist: 1.5, grain: 2.2, sil: 0.5, shade: 0.75,
    ragged: 0.9, sway: 0.004,
    sketch: false, // beyond the ink, pines are drawn as bare trunks; foliage blooms in with the ink
  });

  const maxPads = trees.length * 7 * 3;
  const trunks = new THREE.InstancedMesh(trunkGeo, woodMat, trees.length);
  const branches = new THREE.InstancedMesh(branchGeo, woodMat, maxPads);
  const pads = new THREE.InstancedMesh(padGeo, padMat, maxPads);

  const treeM = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const out = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const dir = new THREE.Vector3();
  let n = 0; // branches
  let m = 0; // pads
  const C = new THREE.Vector3();
  // A clump of 2-3 overlapping flattened pads reads as one irregular needle mass
  const addClump = (treeMatrix, center, r) => {
    const parts = 2 + Math.floor(rand() * 2);
    for (let j = 0; j < parts; j++) {
      const rr = r * (j === 0 ? 1 : rand.range(0.55, 0.85));
      C.set(
        center.x + (j === 0 ? 0 : rand.range(-0.6, 0.6) * r),
        center.y + (j === 0 ? 0 : rand.range(-0.05, 0.2) * r),
        center.z + (j === 0 ? 0 : rand.range(-0.5, 0.5) * r)
      );
      local.compose(C, new THREE.Quaternion().setFromAxisAngle(UP, rand() * Math.PI),
        s.set(rr, rr * rand.range(0.3, 0.45), rr * rand.range(0.65, 0.85)));
      pads.setMatrixAt(m++, out.multiplyMatrices(treeMatrix, local));
    }
  };

  trees.forEach((tr, i) => {
    treeM.compose(new THREE.Vector3(tr.x, 0, tr.z), q.setFromAxisAngle(UP, tr.yaw), s.set(1, 1, 1));
    // trunk (scaled to height; the bend is in x so it scales with sc only)
    local.compose(new THREE.Vector3(), new THREE.Quaternion(), s.set(tr.sc, tr.h, tr.sc));
    trunks.setMatrixAt(i, out.multiplyMatrices(treeM, local));

    const trunkAt = (yn) => A.set(bend(yn) * tr.sc, yn * tr.h, 0);
    const padCount = 3 + Math.floor(rand() * 4);
    for (let k = 0; k < padCount; k++) {
      const yn = 0.35 + (k / padCount) * 0.58 + rand.range(-0.04, 0.04);
      trunkAt(yn);
      const phi = rand() * Math.PI * 2;
      const L = rand.range(0.6, 1.5) * (1.1 - yn) * tr.h * 0.35 + 0.4;
      B.set(A.x + Math.cos(phi) * L, A.y + 0.15 * L, A.z + Math.sin(phi) * L);
      // branch from trunk to pad
      dir.subVectors(B, A);
      const len = dir.length();
      local.compose(A, new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()), s.set(0.07, len, 0.07));
      branches.setMatrixAt(n, out.multiplyMatrices(treeM, local));
      // needle mass at the branch tip
      addClump(treeM, B, rand.range(0.7, 1.25) * ((1.15 - yn) * tr.h * 0.16 + 0.45));
      n++;
    }
    // crown
    trunkAt(1);
    addClump(treeM, A.add(new THREE.Vector3(0, 0.1, 0)), (0.35 * tr.h * 0.16 + 0.45) * rand.range(0.9, 1.2));
  });

  branches.count = n;
  pads.count = m;
  for (const m of [trunks, branches, pads]) {
    m.instanceMatrix.needsUpdate = true;
    m.frustumCulled = false;
    scene.add(m);
  }
}
