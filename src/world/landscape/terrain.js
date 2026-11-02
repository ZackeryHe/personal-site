import * as THREE from "three";
import { inkMaterial } from "../../ink/material.js";
import { STOPS } from "../places.js";

// The ground (ending at the cliff), stepping stones, grass, the stream and its reeds,
// and the broken rocks along the canyon's rim.
export function build({ scene, P, places, rng }) {
  const rand = rng(11);
  const dummy = new THREE.Object3D();

  // ---------- Ground: the ink bleeds out from your feet. It ends at the cliff. ----------
  {
    const cols = 150;
    const rows = 36;
    const positions = [];
    const uvs = [];
    const index = [];
    for (let i = 0; i <= cols; i++) {
      const x = -450 + (i / cols) * 900;
      const z0 = Math.min(Math.max(P.edgeZ(x), -450), 449); // far to the east the canyon swallows it all
      for (let j = 0; j <= rows; j++) {
        const v = j / rows;
        positions.push(x, 0, z0 + (450 - z0) * v * v); // rows bunch up near the edge (where land ends)
        uvs.push(i / cols, v);
      }
    }
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const a = i * (rows + 1) + j;
        const b = a + rows + 1;
        index.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, inkMaterial({
      variant: "ground", tint: "ground", channel: "ground", climb: 0, noiseScale: 0.12, noiseAmp: 0.35,
      edge: 0.02, rimWidth: 0.06, rim: 0.8, near: 4, far: 40, minFar: 0, density: 0.16,
      mist: 0.01, grain: 0.35, sil: 0, side: THREE.DoubleSide,
    })));
  }

  // a lumpy stone (displacement keyed by position so the mesh stays watertight)
  const stoneGeo = new THREE.IcosahedronGeometry(1, 1);
  {
    const pos = stoneGeo.attributes.position;
    const bump = new Map();
    for (let i = 0; i < pos.count; i++) {
      const key = [pos.getX(i), pos.getY(i), pos.getZ(i)].map((v) => Math.round(v * 1000) + 0).join(",");
      if (!bump.has(key)) bump.set(key, rand.range(0.75, 1.2));
      const b = bump.get(key);
      pos.setXYZ(i, pos.getX(i) * b, Math.max(pos.getY(i) * b, -0.2), pos.getZ(i) * b);
    }
    stoneGeo.computeVertexNormals();
  }

  // ---------- Stepping stones: revealed as the ground wash reaches them ----------
  // (they stop short of the bench at the end: sitting there, you look back over open grass)
  const bench = places.bench?.pos ?? P.end;
  const stoneSpots = [];
  for (let i = 0; i < 150; i++) {
    const t = i / 150;
    const p = P.path.getPointAt(t).addScaledVector(P.sideAt(t), rand.range(-0.8, 0.8));
    if (P.blocked(p.x, p.z, { by: "grass" })) continue; // not under the bridge
    if (Math.hypot(p.x - bench.x, p.z - bench.z) < 9) continue;
    stoneSpots.push(p);
  }
  const stones = new THREE.InstancedMesh(stoneGeo, inkMaterial({
    channel: "ground", bias: 0.05, climb: 0, noiseScale: 0.8, noiseAmp: 0.3,
    near: 3, far: 30, minFar: 0, density: 0.8, mist: 0.01, grain: 2, shade: 0.15,
  }), stoneSpots.length);
  stoneSpots.forEach((p, i) => {
    const s = rand.range(0.35, 0.6);
    dummy.position.copy(p);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.scale.set(s * rand.range(0.8, 1.2), s * rand.range(0.25, 0.4), s * rand.range(0.6, 0.95));
    dummy.updateMatrix();
    stones.setMatrixAt(i, dummy.matrix);
  });
  stones.frustumCulled = false;
  scene.add(stones);

  // ---------- The canyon's rim: broken rocks along the edge, out to either side ----------
  const rimRocks = [];
  for (let x = P.end.x - 22; x <= P.end.x + 30; x += rand.range(1.6, 3.2)) {
    const z = P.edgeZ(x) + rand.range(0.3, 1.3);
    if (Math.hypot(x - places.pine.pos.x, z - places.pine.pos.z) < 1.8) continue; // the lone pine's spot
    if (Math.hypot(x - bench.x, z - bench.z) < 12) continue; // nothing but the view from the bench
    rimRocks.push({ x, z, s: rand.range(0.5, 1.5) });
  }
  const rim = new THREE.InstancedMesh(stoneGeo, inkMaterial({
    channel: "mid", bias: 0.05, climb: 0.04, noiseScale: 0.6, noiseAmp: 0.3,
    near: 4, far: 60, density: 0.9, mist: 0.01, grain: 1.6, shade: 0.25, sil: 0.8,
  }), rimRocks.length);
  rimRocks.forEach((r, i) => {
    dummy.position.set(r.x, -0.15, r.z);
    dummy.rotation.set(rand.range(-0.3, 0.3), rand() * Math.PI, rand.range(-0.3, 0.3));
    dummy.scale.set(r.s * rand.range(0.9, 1.4), r.s * rand.range(0.4, 0.8), r.s);
    dummy.updateMatrix();
    rim.setMatrixAt(i, dummy.matrix);
  });
  rim.frustumCulled = false;
  scene.add(rim);

  // ---------- Grass tufts and reeds: quick brush flicks ----------
  const blades = [];
  const tuft = (x, z, n, height, spread) => {
    if (P.blocked(x, z, { by: "grass" }) || P.overCliff(x, z, 1)) return;
    for (let i = 0; i < n; i++) {
      blades.push({
        x: x + rand.range(-0.15, 0.15),
        z: z + rand.range(-0.15, 0.15),
        h: height * rand.range(0.6, 1.1),
        tiltX: rand.range(-spread, spread),
        tiltZ: rand.range(-spread, spread),
      });
    }
  };
  for (let i = 0; i < 520; i++) {
    const t = rand();
    const off = rand.range(1.3, 7) * (rand() < 0.5 ? -1 : 1);
    const p = P.path.getPointAt(t).addScaledVector(P.sideAt(t), off);
    tuft(p.x, p.z, 3 + Math.floor(rand() * 5), rand.range(0.35, 0.9), 0.5);
  }
  // wider clumps out in the open
  for (let i = 0; i < 160; i++) {
    const t = rand();
    const off = rand.range(7, 22) * (rand() < 0.5 ? -1 : 1);
    const p = P.path.getPointAt(t).addScaledVector(P.sideAt(t), off);
    for (let k = 0; k < 4; k++) tuft(p.x + rand.range(-1.5, 1.5), p.z + rand.range(-1.5, 1.5), 4 + Math.floor(rand() * 4), rand.range(0.5, 1.1), 0.45);
  }
  // around the koi pond
  const kp = places.pond;
  for (let i = 0; i < 30; i++) {
    const a = rand() * Math.PI * 2;
    const d = kp.r + rand.range(0.8, 3);
    tuft(kp.pos.x + Math.cos(a) * d, kp.pos.z + Math.sin(a) * d, 4 + Math.floor(rand() * 4), rand.range(0.6, 1.3), 0.35);
  }
  // reeds around the pool and along both banks of its stream
  const R = places.river;
  const pool = places.pool;
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const d = pool.r + rand.range(0.6, 1.6);
    tuft(pool.pos.x + Math.cos(a) * d, pool.pos.z + Math.sin(a) * d, 4 + Math.floor(rand() * 4), rand.range(1.0, 1.8), 0.3);
  }
  for (let i = 0; i < 46; i++) {
    const along = rand.range(-6, 40);
    if (Math.abs(along) < 2.6) continue; // keep the bridge clear
    const p = R.at(along, (rand() < 0.5 ? -1 : 1) * rand.range(3.3, 4.4));
    tuft(p.x, p.z, 4 + Math.floor(rand() * 4), rand.range(1.1, 1.9), 0.3);
  }

  // a blade: tapered, and curving over as it rises
  const bladeGeo = new THREE.PlaneGeometry(0.075, 1, 1, 5).translate(0, 0.5, 0);
  {
    const pos = bladeGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      pos.setXYZ(i, pos.getX(i) * (1 - y * 0.92), y, 0.22 * y * y);
    }
    bladeGeo.computeVertexNormals();
  }
  const grass = new THREE.InstancedMesh(
    bladeGeo,
    inkMaterial({
      channel: "ground", bias: 0.1, climb: 0.2, noiseScale: 1, noiseAmp: 0.3, tint: "foliage",
      near: 3, far: 30, minFar: 0, density: 0.85, mist: 0.01, grain: 3, sil: 0.4, sway: 0.03,
      wash: 0.8, washLit: new THREE.Color("#a8bf7e"), washShade: new THREE.Color("#55734a"),
      color: new THREE.Color("#22301f"), side: THREE.DoubleSide,
    }),
    blades.length
  );
  blades.forEach((b, i) => {
    dummy.position.set(b.x, 0, b.z);
    dummy.rotation.set(b.tiltX, rand() * Math.PI, b.tiltZ);
    dummy.scale.set(1, b.h, 1);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
  });
  grass.frustumCulled = false;
  scene.add(grass);

  // ---------- The stream: from the waterfall's pool, under the bridge, away to the right ----------
  const from = R.start;
  const to = 100; // it wanders off to the south-east, well before the cliff
  const stream = new THREE.Mesh(
    new THREE.PlaneGeometry(to - from, 7).rotateX(-Math.PI / 2),
    inkMaterial({
      variant: "river", tint: "water", channel: "mid", bias: 0.15, climb: 0, noiseScale: 0.1, noiseAmp: 0.35,
      near: 3, far: 55, minFar: 0, density: 0.6, mist: 0.01, sil: 0,
      color: new THREE.Color("#22303d"),
      flow: new THREE.Vector4(R.flow.x, R.flow.z, R.pos.x, R.pos.z),
    })
  );
  stream.position.copy(R.at((from + to) / 2, 0)).setY(0.02);
  stream.rotation.y = P.yawAt(STOPS.river);
  scene.add(stream);
}
