import * as THREE from "three";
import { inkMaterial } from "../../ink/material.js";
import { STOPS } from "../places.js";

// The ground (ending at the cliff), stepping stones, grass, the stream and its reeds.
// (No rocks along the canyon's rim: at the end there's nothing but the view.)
export function build({ scene, P, places, rng }) {
  const rand = rng(11);
  const dummy = new THREE.Object3D();

  // ---------- Ground: the ink bleeds out from your feet. Level through the garden, it rises to
  // the canyon's rim (P.groundAt) and ends there at the cliff. Laid out along the rim (u, metres
  // along it) and inland from its broken edge (rows bunched up toward the edge, where it climbs). ----------
  const right = new THREE.Vector3(-P.endDir.z, 0, P.endDir.x);
  const wobble = (u) => 0.6 * Math.sin(u * 0.31) + 0.3 * Math.sin(u * 0.83 + 1.7); // ± ~1 m, out and in
  const edgeAt = (u, out) => out.copy(P.brink).addScaledVector(right, u).addScaledVector(P.endDir, wobble(u));
  const ALONG = 900;
  const COLS = 240;
  {
    // inland from the edge: every 0.35 m across the rise to the rim (the crest, the brow, the face
    // and its foot), then further and further apart out to 650 m
    const inland = [];
    for (let d = 0; d < 40; d += 0.35) inland.push(d);
    for (let d = 40; d < 650; d *= 1.09) inland.push(d);
    inland.push(650);
    const ROWS = inland.length - 1;
    const positions = [];
    const uvs = [];
    const index = [];
    const p = new THREE.Vector3();
    for (let i = 0; i <= COLS; i++) {
      const u = -ALONG / 2 + (i / COLS) * ALONG;
      for (let j = 0; j <= ROWS; j++) {
        edgeAt(u, p).addScaledVector(P.endDir, -inland[j]);
        positions.push(p.x, P.groundAt(p.x, p.z), p.z);
        uvs.push(i / COLS, inland[j] / 650);
      }
    }
    for (let i = 0; i < COLS; i++) {
      for (let j = 0; j < ROWS; j++) {
        const a = i * (ROWS + 1) + j;
        const b = a + ROWS + 1;
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

  // ---------- The cliff under the rim: a rock face dropping from the edge into the canyon's cloud ----------
  {
    const ROWS = 14;
    const DROP = 34;
    const positions = [];
    const uvs = [];
    const index = [];
    const p = new THREE.Vector3();
    for (let i = 0; i <= COLS; i++) {
      const u = -ALONG / 2 + (i / COLS) * ALONG;
      edgeAt(u, p);
      const top = P.groundAt(p.x, p.z);
      for (let j = 0; j <= ROWS; j++) {
        const v = j / ROWS;
        // stepping out and back in as it falls: ledges and bulges
        const bulge = 0.9 * Math.sin(u * 0.13 + v * 7) * Math.sin(v * Math.PI) + 0.5 * Math.sin(u * 0.47 - v * 11);
        positions.push(p.x + P.endDir.x * bulge, top - 0.05 - DROP * v, p.z + P.endDir.z * bulge);
        uvs.push(i / COLS, v);
      }
    }
    for (let i = 0; i < COLS; i++) {
      for (let j = 0; j < ROWS; j++) {
        const a = i * (ROWS + 1) + j;
        const b = a + ROWS + 1;
        index.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    const face = new THREE.Mesh(g, inkMaterial({
      channel: "far", climb: 0, noiseScale: 0.06, noiseAmp: 0.3, near: 20, far: 300, minFar: 0.2, density: 0.95,
      grain: 0.5, shade: 0.35, sil: 0.4, wash: 1, glow: 0.9, side: THREE.DoubleSide,
      mistBase: places.rim - 20, mist: places.rim - 6, mistFloor: 0, // fading down into the cloud
    }));
    face.frustumCulled = false;
    scene.add(face);
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
    if (P.slopeAt(p.x, p.z) > 0.2) continue;           // nor up the rim's face (stone steps climb it)
    if (Math.hypot(p.x - bench.x, p.z - bench.z) < 9) continue;
    stoneSpots.push(p);
  }
  const stones = new THREE.InstancedMesh(stoneGeo, inkMaterial({
    channel: "ground", bias: 0.05, climb: 0, noiseScale: 0.8, noiseAmp: 0.3,
    near: 3, far: 30, minFar: 0, density: 0.8, mist: 0.01, grain: 2, shade: 0.15,
  }), stoneSpots.length);
  stoneSpots.forEach((p, i) => {
    const s = rand.range(0.35, 0.6);
    dummy.position.copy(p).setY(P.groundAt(p.x, p.z));
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.scale.set(s * rand.range(0.8, 1.2), s * rand.range(0.25, 0.4), s * rand.range(0.6, 0.95));
    dummy.updateMatrix();
    stones.setMatrixAt(i, dummy.matrix);
  });
  stones.frustumCulled = false;
  scene.add(stones);

  // ---------- Grass tufts and reeds: quick brush flicks ----------
  const blades = [];
  const tuft = (x, z, n, height, spread) => {
    if (P.blocked(x, z, { by: "grass" }) || P.overCliff(x, z, 1) || P.slopeAt(x, z) > 0.45) return;
    if (bench && Math.hypot(x - bench.x, z - bench.z) < 9) return; // the crest by the bench: just the view
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
    dummy.position.set(b.x, P.groundAt(b.x, b.z), b.z);
    dummy.rotation.set(b.tiltX, rand() * Math.PI, b.tiltZ);
    dummy.scale.set(1, b.h, 1);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
  });
  grass.frustumCulled = false;
  scene.add(grass);

  // ---------- The stream: from the waterfall's pool, under the bridge, away to the right ----------
  const from = R.start;
  const to = 70; // it wanders off to the south-east across the meadows, before the land rises
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
