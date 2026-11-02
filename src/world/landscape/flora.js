import * as THREE from "three";
import { inkMaterial } from "../../ink/material.js";
import { STOPS } from "../places.js";

// Trees in the painted style: a bent trunk, branches angled up then out, and wide flat
// "cloud" pads of needles, darker beneath. (Instanced: a few draw calls for all of them.)
// Every tree is painted the same way, in ink. Some of them are turning: where colour blooms
// (设色, app/colour.js) their pads take on autumn colours instead of green, from fresh green
// through gold to orange and red, more autumnal the further you walk.

const UP = new THREE.Vector3(0, 1, 0);

// the turning trees' colours (the colour stage's tint): [wash on lit pads, the ink turns toward]
const AUTUMN = [
  ["#b3c47a", "#3f5a28"], // yellow-green
  ["#e0c060", "#7a5a12"], // gold
  ["#eba04e", "#8c4a14"], // orange
  ["#e4794a", "#8a2e12"], // red-orange
  ["#d65a45", "#7a1f16"], // red
].map(([wash, ink]) => ({ wash: new THREE.Color(wash), ink: new THREE.Color(ink), amount: 1 }));

export function build({ scene, P, places, rng }) {
  const rand = rng(37);
  // (nowhere up the rise to the rim: not on its face, nor on the crest by the lookout)
  const ok = (x, z, near = 4) => !(P.distToPath(x, z) < near || P.blocked(x, z) || P.overCliff(x, z, 2) || P.groundAt(x, z) > 0.4);

  // ---------- where the trees go ----------
  const trees = [];
  const turning = [];
  for (let i = 0; i < 100; i++) {
    const t = rand();
    const off = rand.range(4.5, 24) * (rand() < 0.5 ? -1 : 1);
    const p = P.path.getPointAt(t).addScaledVector(P.sideAt(t), off);
    if (!ok(p.x, p.z)) continue;
    // more turning trees further along, and in the open
    if (rand() < 0.15 + t * 0.35) turning.push({ x: p.x, z: p.z, t });
    else trees.push({ x: p.x, z: p.z, h: rand.range(5, 10) });
  }
  // a few behind the garden walls around the tablets, not crowding them
  for (let i = 0; i < 10; i++) {
    const t = STOPS.grove + rand.range(-8.4, 8.4) / P.pathLen;
    const p = P.path.getPointAt(t).addScaledVector(P.sideAt(t), rand.range(9, 18) * (rand() < 0.5 ? -1 : 1));
    if (ok(p.x, p.z, 8)) trees.push({ x: p.x, z: p.z, h: rand.range(7, 11) });
  }
  // the turning trees: size and colour from their own stream, so the layout above stays put
  const r2 = rng(38);
  for (const { x, z, t } of turning) {
    const k = Math.round(t * (AUTUMN.length - 0.6) + r2.range(-0.8, 0.8));
    trees.push({ x, z, h: r2.range(5, 9), autumn: Math.max(0, Math.min(AUTUMN.length - 1, k)) });
  }

  // the pines framing the painting at the end (places.painting.frame)
  for (const { pos, h } of places.painting?.frame ?? []) trees.push({ x: pos.x, z: pos.z, h });

  addTrees(scene, trees, rand, P.groundAt);
}

// ---------------------------------------------------------------- trees
/**
 * Pines at the spots ({ x, z, h, autumn?, y? }: y, if given, is the ground they stand on).
 * climb / channel: how the ink reaches them (a pine high on a rock: less climb, so it inks in
 * with the rock under it rather than waiting for the ink to climb up from the ground below).
 */
export function addTrees(scene, spots, rand, groundAt, { climb = 0.035, channel = "mid" } = {}) {
  // trunk: unit height, base at y=0, a gentle S-bend baked in, flaring at the foot
  const bend = (y) => 0.45 * Math.sin(y * 2.4) - 0.2 * y;
  const trunkGeo = new THREE.CylinderGeometry(0.13, 0.3, 1, 8, 12).translate(0, 0.5, 0);
  {
    const pos = trunkGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const flare = 1 + 0.6 * Math.max(0, 0.12 - y) / 0.12;
      pos.setXYZ(i, pos.getX(i) * flare + bend(y), y, pos.getZ(i) * flare);
    }
    trunkGeo.computeVertexNormals();
  }
  const branchGeo = new THREE.CylinderGeometry(0.5, 1, 1, 5).translate(0, 0.5, 0);
  const padGeo = new THREE.IcosahedronGeometry(1, 2);
  {
    // a cloud of needles: lumpy and irregular all round, domed on top, flat underneath
    const pos = padGeo.attributes.position;
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
    padGeo.computeVertexNormals();
  }

  const woodMat = inkMaterial({
    channel, climb, noiseScale: 0.35, noiseAmp: 0.3,
    near: 5, far: 55, density: 1, mist: 1.2, grain: 3, shade: 0.55, sway: 0.004, tint: "wood", soft: true,
  });
  // needle pads: the same ink for every tree; only what colour they turn when colour
  // blooms differs (evergreen: green; the turning trees: their autumn shade)
  const padMat = (tint) => inkMaterial({
    channel, climb, noiseScale: 0.35, noiseAmp: 0.3,
    near: 6, far: 60, density: 1.45, mist: 1.5, grain: 2.4, sil: 0.7, shade: 0.8,
    ragged: 0.9, sway: 0.004, tint, wash: 0.5, soft: true,
    washLit: new THREE.Color("#8fa77a"), washShade: new THREE.Color("#3f5a45"),
    sketch: false, // beyond the ink, trees are drawn as bare trunks; foliage blooms in with the ink
  });

  const trunks = new THREE.InstancedMesh(trunkGeo, woodMat, spots.length);
  const branches = new THREE.InstancedMesh(branchGeo, woodMat, spots.length * 10);
  const padsBy = new Map(); // colour group (-1 evergreen, else AUTUMN index) → pad matrices
  const treeM = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const out = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const dir = new THREE.Vector3();
  let nb = 0;
  let pads = null; // the current tree's colour group
  const pad = (c, r, flat = 0.32) => {
    // a clump of 4–6 overlapping lumpy pads reads as one irregular cloud of needles
    const parts = 4 + Math.floor(rand() * 3);
    for (let j = 0; j < parts; j++) {
      const rr = r * (j === 0 ? 0.85 : rand.range(0.4, 0.7));
      local.compose(
        B.set(c.x + (j ? rand.range(-0.7, 0.7) * r : 0), c.y + (j ? rand.range(-0.08, 0.18) * r : 0), c.z + (j ? rand.range(-0.6, 0.6) * r : 0)),
        q.setFromAxisAngle(UP, rand() * Math.PI),
        s.set(rr, rr * rand.range(flat * 0.8, flat * 1.2), rr * rand.range(0.7, 0.9))
      );
      pads.push(new THREE.Matrix4().multiplyMatrices(treeM, local));
    }
  };

  spots.forEach((tr, i) => {
    const group = tr.autumn ?? -1;
    if (!padsBy.has(group)) padsBy.set(group, []);
    pads = padsBy.get(group);
    const sc = rand.range(0.85, 1.3);
    const lean = rand.range(-0.12, 0.12);
    treeM.compose(new THREE.Vector3(tr.x, (tr.y ?? groundAt(tr.x, tr.z)) - 0.1, tr.z), q.setFromEuler(new THREE.Euler(lean, rand() * Math.PI * 2, 0, "YXZ")), s.set(1, 1, 1));
    trunks.setMatrixAt(i, out.multiplyMatrices(treeM, local.makeScale(sc, tr.h, sc)));
    const trunkAt = (yn) => A.set((0.45 * Math.sin(yn * 2.4) - 0.2 * yn) * sc, yn * tr.h, 0);

    // branches: angled up, then the pad out at the tip; longest low down
    const n = 5 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const yn = 0.32 + (k / n) * 0.6 + rand.range(-0.03, 0.03);
      trunkAt(yn);
      const phi = rand() * Math.PI * 2;
      const L = rand.range(0.7, 1.3) * (1.15 - yn) * tr.h * 0.42 + 0.5;
      const tip = new THREE.Vector3(A.x + Math.cos(phi) * L, A.y + L * rand.range(0.15, 0.35), A.z + Math.sin(phi) * L);
      dir.subVectors(tip, A);
      const len = dir.length();
      local.compose(A, new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()), s.set(0.08, len, 0.08));
      branches.setMatrixAt(nb++, out.multiplyMatrices(treeM, local));
      pad(tip, rand.range(0.8, 1.2) * ((1.2 - yn) * tr.h * 0.17 + 0.55));
    }
    // the crown: a wide dome of pads
    trunkAt(1);
    pad(A.clone().add(new THREE.Vector3(0, 0.15, 0)), (tr.h * 0.13 + 0.6) * rand.range(0.9, 1.2), 0.42);
  });

  branches.count = nb;
  const padMeshes = [...padsBy].map(([group, list]) => {
    const m = new THREE.InstancedMesh(padGeo, padMat(group < 0 ? "foliage" : AUTUMN[group]), list.length);
    list.forEach((mat, k) => m.setMatrixAt(k, mat));
    return m;
  });
  for (const m of [trunks, branches, ...padMeshes]) {
    m.instanceMatrix.needsUpdate = true;
    m.frustumCulled = false;
    scene.add(m);
  }
}
