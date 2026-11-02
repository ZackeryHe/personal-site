import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { inkMaterial } from "../../ink/material.js";

const LOTUS_GREEN_LIT = new THREE.Color("#9db07f");
const LOTUS_GREEN_SHADE = new THREE.Color("#4f6e57");

// 知鱼 — the koi pond: still water, lotus leaves and flowers, koi swimming laps.
export function build({ scene, places, rng }) {
  const rand = rng(77);
  const { pos: c, r: R } = places.pond;
  const dummy = new THREE.Object3D();

  // ---------- water ----------
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(R, 64).rotateX(-Math.PI / 2),
    inkMaterial({
      variant: "pond", tint: "water", channel: "mid", bias: 0.08, climb: 0, noiseScale: 0.15, noiseAmp: 0.3,
      near: 3, far: 45, minFar: 0, density: 0.55, mist: 0.01, sil: 0,
      color: new THREE.Color("#22303d"), flow: new THREE.Vector4(R, 0, c.x, c.z),
    })
  );
  water.position.set(c.x, 0.03, c.z);
  scene.add(water);

  // ---------- lotus leaves: cupped discs, some floating, some held up on stems ----------
  const leafGeo = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
  {
    const pos = leafGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const rr = Math.hypot(x, z);
      pos.setY(i, 0.14 * rr * rr + 0.03 * Math.sin(Math.atan2(z, x) * 7) * rr); // cupped, wavy rim
    }
    leafGeo.computeVertexNormals();
  }
  const leafMat = inkMaterial({ tint: "foliage",
    channel: "mid", bias: 0.12, climb: 0.05, noiseScale: 0.6, noiseAmp: 0.3, near: 3, far: 40,
    density: 0.8, mist: 0.01, grain: 1.2, shade: 0.55, sil: 0.4, wash: 1, ragged: 0.25,
    washLit: LOTUS_GREEN_LIT, washShade: LOTUS_GREEN_SHADE, color: new THREE.Color("#1c2620"),
    side: THREE.DoubleSide,
  });
  const stemMat = inkMaterial({ tint: "foliage",
    channel: "mid", bias: 0.12, climb: 0.05, noiseScale: 0.6, near: 3, far: 40,
    density: 0.85, mist: 0.01, grain: 3, sil: 0, color: new THREE.Color("#1c2620"),
  });
  const leaves = [];
  const stems = [];
  for (let i = 0; i < 16; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * (R - 1.2);
    const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
    const raised = rand() < 0.35;
    const h = raised ? rand.range(0.35, 0.9) : 0.05;
    leaves.push({ x, z, y: h, s: rand.range(0.45, 0.85), tilt: raised ? rand.range(0.1, 0.45) : 0.03 });
    if (raised) stems.push({ x, z, h });
  }

  // ---------- lotus flowers + buds ----------
  const flowerGeo = (() => {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const v = i / 10;
      pts.push(new THREE.Vector2(0.03 + Math.sin(v * Math.PI * 0.85) * 0.2 + v * 0.05, v * 0.32));
    }
    const g = new THREE.LatheGeometry(pts, 32);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const petal = Math.cos(Math.atan2(z, x) * 8); // scalloped petal tips
      pos.setY(i, y + Math.max(0, y - 0.15) * petal * 0.35);
    }
    g.computeVertexNormals();
    return g;
  })();
  const flowerMat = inkMaterial({ tint: "blossom",
    channel: "mid", bias: 0.15, climb: 0.05, noiseScale: 0.8, near: 3, far: 40,
    density: 0.55, mist: 0.01, grain: 2, shade: 0.3, sil: 0.7, color: new THREE.Color("#b84f68"),
    side: THREE.DoubleSide,
  });
  const flowers = [];
  for (let i = 0; i < 5; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * (R - 1.5);
    const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
    const h = rand.range(0.5, 1.0);
    const bud = i >= 3;
    flowers.push({ x, z, y: h, s: bud ? 0.55 : rand.range(0.9, 1.2), bud });
    stems.push({ x, z, h });
  }

  const leafMesh = new THREE.InstancedMesh(leafGeo, leafMat, leaves.length);
  leaves.forEach((l, i) => {
    dummy.position.set(l.x, l.y, l.z);
    dummy.rotation.set(l.tilt, rand() * Math.PI * 2, 0, "YXZ");
    dummy.scale.setScalar(l.s);
    dummy.updateMatrix();
    leafMesh.setMatrixAt(i, dummy.matrix);
  });
  const stemMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.015, 0.02, 1, 4).translate(0, 0.5, 0), stemMat, stems.length);
  stems.forEach((s, i) => {
    dummy.position.set(s.x, 0, s.z);
    dummy.rotation.set(rand.range(-0.08, 0.08), 0, rand.range(-0.08, 0.08));
    dummy.scale.set(1, s.h, 1);
    dummy.updateMatrix();
    stemMesh.setMatrixAt(i, dummy.matrix);
  });
  const flowerMesh = new THREE.InstancedMesh(flowerGeo, flowerMat, flowers.length);
  flowers.forEach((f, i) => {
    dummy.position.set(f.x, f.y, f.z);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.scale.set(f.s * (f.bud ? 0.6 : 1), f.s * (f.bud ? 1.3 : 1), f.s * (f.bud ? 0.6 : 1));
    dummy.updateMatrix();
    flowerMesh.setMatrixAt(i, dummy.matrix);
  });
  for (const m of [leafMesh, stemMesh, flowerMesh]) {
    m.frustumCulled = false;
    scene.add(m);
  }

  // ---------- pond-edge stones ----------
  const edgeStones = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 1),
    inkMaterial({
      channel: "mid", bias: 0.1, climb: 0.05, noiseScale: 0.7, near: 3, far: 40,
      density: 0.8, mist: 0.01, grain: 2, shade: 0.15,
    }),
    26
  );
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rand.range(-0.08, 0.08);
    const s = rand.range(0.3, 0.6);
    dummy.position.set(c.x + Math.cos(a) * (R + 0.15), 0.05, c.z + Math.sin(a) * (R + 0.15));
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.scale.set(s * 1.3, s * 0.45, s);
    dummy.updateMatrix();
    edgeStones.setMatrixAt(i, dummy.matrix);
  }
  edgeStones.frustumCulled = false;
  scene.add(edgeStones);

  // ---------- koi ----------
  const koiGeo = (() => {
    const body = new THREE.SphereGeometry(1, 14, 10).scale(0.14, 0.075, 0.45);
    const tail = new THREE.BufferGeometry();
    tail.setAttribute("position", new THREE.Float32BufferAttribute([
      0, 0, -0.38,   -0.17, 0.0, -0.68,   0.17, 0.0, -0.68,
      0, 0, -0.38,   0, 0.0, -0.58,      -0.17, 0.0, -0.68,
    ], 3));
    tail.setAttribute("uv", new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
    tail.setIndex([0, 1, 2, 3, 4, 5]);
    tail.computeVertexNormals();
    const fins = new THREE.BufferGeometry();
    fins.setAttribute("position", new THREE.Float32BufferAttribute([
      0.1, 0, 0.12,   0.3, 0, 0.0,   0.1, 0, 0.0,
      -0.1, 0, 0.12,  -0.1, 0, 0.0,  -0.3, 0, 0.0,
    ], 3));
    fins.setAttribute("uv", new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
    fins.setIndex([0, 1, 2, 3, 4, 5]);
    fins.computeVertexNormals();
    return mergeGeometries([body, tail, fins]);
  })();
  const koiKinds = [
    { color: "#d4512a", count: 4, density: 0.85 }, // red-orange
    { color: "#161a21", count: 2, density: 0.9 },  // ink black
  ];
  const koi = [];
  for (const kind of koiKinds) {
    const mesh = new THREE.InstancedMesh(koiGeo, inkMaterial({
      channel: "mid", bias: 0.2, climb: 0, noiseScale: 1, noiseAmp: 0.2, near: 3, far: 35,
      density: kind.density, mist: 0.01, grain: 2, shade: 0.4, sil: 0.6, wiggle: 0.05,
      sketch: false, color: new THREE.Color(kind.color), side: THREE.DoubleSide,
    }), kind.count);
    mesh.frustumCulled = false;
    scene.add(mesh);
    for (let i = 0; i < kind.count; i++) {
      koi.push({
        mesh, i,
        r0: rand.range(1.3, R - 1.8), phase: rand() * Math.PI * 2,
        w: rand.range(0.25, 0.45) * (rand() < 0.3 ? -1 : 1), size: rand.range(0.85, 1.25),
      });
    }
  }
  const q = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const m4 = new THREE.Matrix4();

  return {
    update(time) {
      for (const k of koi) {
        // lazy laps that speed up and wander in and out
        const a = k.phase + time * k.w + Math.sin(time * 0.3 + k.phase) * 0.6;
        const rr = k.r0 + Math.sin(time * 0.21 + k.phase * 2) * 0.8;
        pos.set(c.x + Math.cos(a) * rr, 0.07, c.z + Math.sin(a) * rr);
        // heading along the direction of travel (head is +z)
        const a2 = a + 0.05 * Math.sign(k.w);
        const dx = c.x + Math.cos(a2) * rr - pos.x;
        const dz = c.z + Math.sin(a2) * rr - pos.z;
        q.setFromAxisAngle(UP, Math.atan2(dx, dz));
        k.mesh.setMatrixAt(k.i, m4.compose(pos, q, scl.setScalar(k.size)));
      }
      for (const kind of new Set(koi.map((k) => k.mesh))) kind.instanceMatrix.needsUpdate = true;
    },
  };
}
