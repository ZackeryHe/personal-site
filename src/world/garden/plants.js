import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { inkMaterial, SEAL_RED } from "../../ink/material.js";

const UP = new THREE.Vector3(0, 1, 0);
const BAMBOO_LIT = new THREE.Color("#a3b486");
const BAMBOO_SHADE = new THREE.Color("#4e6b55");
const BLOSSOM = new THREE.Color("#c2364a");

// The garden's plants: bamboo, two plum trees, wildflowers.
export function build({ scene, P, places, rng }) {
  const rand = rng(78);
  addBamboo(scene, P, places.bamboo.range, rand);
  const plums = [
    addPlumTree(scene, places.plumEntrance.pos, rand, { height: 3.2 }),
    addPlumTree(scene, places.plumPavilion.pos, rand, { height: 3.6 }),
  ];
  addWildflowers(scene, places.meadow.pos, places.meadow.r - 0.5, 70, rand);
  addWildflowers(scene, places.plumEntrance.pos, 2.5, 14, rand);
  return {
    update(time) {
      for (const p of plums) p.update(time);
    },
  };
}

// 竹径 — a stretch of path through swaying bamboo (between path positions t0 and t1).
function addBamboo(scene, P, [t0, t1], rand) {
  const culms = [];
  for (let t = t0; t <= t1; t += 0.0045) {
    for (const sign of [-1, 1]) {
      if (rand() < 0.35) continue;
      const off = sign * rand.range(1.9, 6.5);
      const base = P.at(t, off);
      const n = 1 + Math.floor(rand() * 3); // bamboo grows in clumps
      for (let k = 0; k < n; k++) {
        culms.push({
          x: base.x + rand.range(-0.5, 0.5), z: base.z + rand.range(-0.5, 0.5),
          h: rand.range(6, 9.5), lean: rand.range(-0.07, 0.07), yaw: rand() * Math.PI * 2,
        });
      }
    }
  }

  // culm: thin cylinder with swollen nodes every ~0.45 m (scaled per instance)
  const culmGeo = new THREE.CylinderGeometry(0.045, 0.06, 1, 6, 90).translate(0, 0.5, 0);
  {
    const pos = culmGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const f = (y * 18) % 1; // ~18 segments per culm
      const node = 1 + 0.35 * Math.exp(-((Math.min(f, 1 - f) / 0.035) ** 2));
      pos.setX(i, pos.getX(i) * node);
      pos.setZ(i, pos.getZ(i) * node);
    }
    culmGeo.computeVertexNormals();
  }
  const greenInk = new THREE.Color("#1d2722");
  const culmMat = inkMaterial({
    channel: "mid", climb: 0.03, noiseScale: 0.35, noiseAmp: 0.3, near: 5, far: 50,
    density: 0.95, mist: 1.2, grain: 2.5, shade: 0.5, sil: 0.8, wash: 0.6, sway: 0.006,
    washLit: BAMBOO_LIT, washShade: BAMBOO_SHADE, color: greenInk,
  });
  const leafMat = inkMaterial({
    channel: "mid", climb: 0.03, noiseScale: 0.35, noiseAmp: 0.3, near: 5, far: 50,
    density: 1.15, mist: 1.2, grain: 3, shade: 0.8, sil: 0.3, wash: 0.5, sway: 0.006,
    washLit: BAMBOO_LIT, washShade: BAMBOO_SHADE, color: greenInk, side: THREE.DoubleSide,
  });
  // leaf: a slim blade, base at the origin, pointing along +y
  const leafGeo = new THREE.PlaneGeometry(0.07, 0.42, 1, 4).translate(0, 0.21, 0);
  {
    const pos = leafGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const v = pos.getY(i) / 0.42;
      pos.setX(i, pos.getX(i) * Math.sin(Math.min(1, v * 1.15) * Math.PI) * 1.2); // tapered both ends
    }
    leafGeo.computeVertexNormals();
  }

  const culmMesh = new THREE.InstancedMesh(culmGeo, culmMat, culms.length);
  const maxLeaves = culms.length * 7 * 5;
  const leafMesh = new THREE.InstancedMesh(leafGeo, leafMat, maxLeaves);
  const twigMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 1, 1, 3).translate(0, 0.5, 0), culmMat, culms.length * 7);
  const tree = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const out = new THREE.Matrix4();
  const s = new THREE.Vector3();
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const dir = new THREE.Vector3();
  let nl = 0;
  let nt = 0;
  culms.forEach((cu, i) => {
    tree.compose(
      new THREE.Vector3(cu.x, 0, cu.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(cu.lean, cu.yaw, 0, "YXZ")),
      s.set(1, 1, 1)
    );
    culmMesh.setMatrixAt(i, out.multiplyMatrices(tree, local.makeScale(1, cu.h, 1)));
    // leaf fans ("个" / "介" strokes) on twigs from the upper nodes
    const fans = 4 + Math.floor(rand() * 4);
    for (let f = 0; f < fans; f++) {
      const y = cu.h * rand.range(0.45, 0.95);
      const phi = rand() * Math.PI * 2;
      A.set(0, y, 0);
      B.set(Math.cos(phi) * rand.range(0.4, 0.9), y + rand.range(0.1, 0.35), Math.sin(phi) * rand.range(0.4, 0.9));
      dir.subVectors(B, A);
      const len = dir.length();
      local.compose(A, new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()), s.set(0.012, len, 0.012));
      twigMesh.setMatrixAt(nt++, out.multiplyMatrices(tree, local));
      const leaves = 3 + Math.floor(rand() * 3);
      for (let k = 0; k < leaves && nl < maxLeaves; k++) {
        // drooping blades fanned around the twig tip
        const e = new THREE.Euler(
          Math.PI * rand.range(0.55, 0.85),             // droop
          phi + (k - leaves / 2) * 0.45 + rand.range(-0.15, 0.15),
          rand.range(-0.3, 0.3),
          "YXZ"
        );
        local.compose(B, new THREE.Quaternion().setFromEuler(e), s.setScalar(rand.range(0.8, 1.25)));
        leafMesh.setMatrixAt(nl++, out.multiplyMatrices(tree, local));
      }
    }
  });
  leafMesh.count = nl;
  twigMesh.count = nt;
  for (const m of [culmMesh, leafMesh, twigMesh]) {
    m.instanceMatrix.needsUpdate = true;
    m.frustumCulled = false;
    scene.add(m);
  }
}

// 梅 — an old plum tree: dark angular branches, red blossoms, petals drifting down.
function addPlumTree(scene, origin, rand, { height = 3.4 } = {}) {
  const tubes = [];
  const tips = [];
  const grow = (start, dir, length, radius, depth) => {
    const pts = [start.clone()];
    let p = start.clone();
    const d = dir.clone();
    const segs = 4;
    for (let i = 0; i < segs; i++) {
      // plum branches change direction abruptly: the classic angular, "iron wire" line
      d.add(new THREE.Vector3(rand.range(-0.7, 0.7), rand.range(-0.2, 0.4), rand.range(-0.7, 0.7))).normalize();
      if (d.y < -0.2) d.y = -0.2;
      p = p.clone().addScaledVector(d, length / segs);
      pts.push(p);
      if (depth < 3 && i >= 1 && rand() < 0.55) {
        const side = new THREE.Vector3(rand.range(-1, 1), rand.range(0.2, 0.9), rand.range(-1, 1)).normalize();
        grow(p, side, length * rand.range(0.45, 0.7), radius * 0.55, depth + 1);
      }
      if (depth >= 1 || i >= 2) tips.push(p.clone()); // blossoms on branches (and the trunk top)
    }
    tubes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.1), 12, radius, 5));
  };
  grow(origin.clone(), new THREE.Vector3(rand.range(-0.3, 0.3), 1, rand.range(-0.3, 0.3)).normalize(), height, 0.13, 0);

  scene.add(new THREE.Mesh(mergeGeometries(tubes), inkMaterial({
    channel: "mid", climb: 0.05, noiseScale: 0.5, noiseAmp: 0.3, near: 4, far: 45,
    density: 1.1, mist: 0.8, grain: 3, shade: 0.6, sil: 0.8,
  })));

  // blossoms: little five-petal discs clustered at the branch tips
  const blossomMat = inkMaterial({
    channel: "mid", bias: 0.05, climb: 0.05, noiseScale: 1.2, noiseAmp: 0.25, near: 4, far: 45,
    density: 0.85, mist: 0.01, grain: 4, shade: 0.3, sil: 0, color: BLOSSOM, sketch: false,
    side: THREE.DoubleSide,
  });
  const blossomGeo = new THREE.CircleGeometry(0.075, 5);
  const blossoms = new THREE.InstancedMesh(blossomGeo, blossomMat, tips.length * 3);
  const dummy = new THREE.Object3D();
  let n = 0;
  for (const t of tips) {
    const k = 1 + Math.floor(rand() * 3);
    for (let j = 0; j < k; j++) {
      dummy.position.set(t.x + rand.range(-0.12, 0.12), t.y + rand.range(-0.08, 0.1), t.z + rand.range(-0.12, 0.12));
      dummy.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
      dummy.scale.setScalar(rand.range(0.6, 1.2));
      dummy.updateMatrix();
      blossoms.setMatrixAt(n++, dummy.matrix);
    }
  }
  blossoms.count = n;
  blossoms.frustumCulled = false;
  scene.add(blossoms);

  // falling petals: drift down with a flutter, rest on the ground a moment, start again
  const PETALS = 22;
  const petals = new THREE.InstancedMesh(new THREE.CircleGeometry(0.045, 5), blossomMat, PETALS);
  petals.frustumCulled = false;
  scene.add(petals);
  const state = Array.from({ length: PETALS }, () => ({
    tip: tips[Math.floor(rand() * tips.length)],
    t0: -rand() * 12, // stagger
    fall: rand.range(0.25, 0.45),
    drift: rand.range(0.2, 0.6),
    spin: rand.range(1, 3),
    phase: rand() * Math.PI * 2,
  }));
  const pos = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const m4 = new THREE.Matrix4();
  return {
    update(time) {
      state.forEach((s, i) => {
        const fallTime = s.tip.y / s.fall;
        const cycle = fallTime + 3; // 3 s resting on the ground
        const age = (((time - s.t0) % cycle) + cycle) % cycle;
        const tFall = Math.min(age, fallTime);
        pos.set(
          s.tip.x + Math.sin(tFall * 1.3 + s.phase) * s.drift + tFall * 0.15,
          Math.max(0.02, s.tip.y - tFall * s.fall),
          s.tip.z + Math.cos(tFall * 1.1 + s.phase) * s.drift * 0.6
        );
        const landed = age >= fallTime;
        e.set(landed ? -Math.PI / 2 : time * s.spin + s.phase, landed ? 0 : time * s.spin * 0.7, 0);
        petals.setMatrixAt(i, m4.compose(pos, q.setFromEuler(e), one));
      });
      petals.instanceMatrix.needsUpdate = true;
    },
  };
}

// wildflowers: tiny ink dots of colour on slim stems (the meadow, mostly)
function addWildflowers(scene, center, radius, count, rand) {
  const stemGeo = new THREE.CylinderGeometry(0.008, 0.012, 1, 3).translate(0, 0.5, 0);
  const headGeo = new THREE.IcosahedronGeometry(0.06, 0);
  const stemMat = inkMaterial({
    channel: "mid", bias: 0.2, climb: 0.1, noiseScale: 1, near: 3, far: 30, minFar: 0,
    density: 0.8, mist: 0.01, grain: 3, sil: 0, sketch: false, sway: 0.05,
  });
  const colours = [SEAL_RED, new THREE.Color("#c99a3a"), new THREE.Color("#7a5a9a")];
  const stems = new THREE.InstancedMesh(stemGeo, stemMat, count);
  const heads = colours.map((col) => new THREE.InstancedMesh(headGeo, inkMaterial({
    channel: "mid", bias: 0.2, climb: 0.1, noiseScale: 1, near: 3, far: 30, minFar: 0,
    density: 0.75, mist: 0.01, grain: 3, shade: 0.3, sil: 0, sketch: false, sway: 0.05, color: col,
  }), count));
  const counts = colours.map(() => 0);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * radius;
    const x = center.x + Math.cos(a) * d, z = center.z + Math.sin(a) * d;
    const h = rand.range(0.25, 0.6);
    dummy.position.set(x, 0, z);
    dummy.rotation.set(rand.range(-0.2, 0.2), 0, rand.range(-0.2, 0.2));
    dummy.scale.set(1, h, 1);
    dummy.updateMatrix();
    stems.setMatrixAt(i, dummy.matrix);
    // head sits at the stem tip
    const tip = new THREE.Vector3(0, 1, 0).applyMatrix4(dummy.matrix);
    const k = Math.floor(rand() * colours.length);
    dummy.position.copy(tip);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.scale.setScalar(rand.range(0.7, 1.3));
    dummy.updateMatrix();
    heads[k].setMatrixAt(counts[k]++, dummy.matrix);
  }
  heads.forEach((m, k) => (m.count = counts[k]));
  for (const m of [stems, ...heads]) {
    m.frustumCulled = false;
    scene.add(m);
  }
}
