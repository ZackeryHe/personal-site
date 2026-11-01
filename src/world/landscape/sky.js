import * as THREE from "three";
import { inkMaterial, SEAL_RED } from "../../ink/material.js";

// Distant layered ranges, a pale vermilion sun, and a few birds.
// These bloom in with the opening drop (global reveal) instead of the ink field.
export function build({ scene, rng }) {
  const rand = rng(51);
  const center = new THREE.Vector3(2, 0, -62); // middle of the walk

  // ---------- Layered distant ranges (三远: each layer paler) ----------
  // Rings around the whole walk, so they surround you with correct parallax.
  const layers = [
    { radius: 330, base: 22, amp: 70, density: 0.34 },
    { radius: 430, base: 40, amp: 95, density: 0.22 },
    { radius: 540, base: 60, amp: 120, density: 0.13 },
  ];
  for (const L of layers) {
    const ridge = periodicNoise(rand, [6, 13, 29, 61], [1, 0.5, 0.22, 0.1]);
    const N = 480;
    const positions = [];
    const uvs = [];
    const index = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const a = u * Math.PI * 2;
      const x = center.x + Math.cos(a) * L.radius;
      const z = center.z + Math.sin(a) * L.radius;
      const top = L.base + L.amp * Math.pow(ridge(u), 1.7);
      positions.push(x, -30, z, x, top, z);
      uvs.push(u, 0, u, 1);
      if (i < N) {
        const b = i * 2;
        index.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, inkMaterial({
      reveal: "global", variant: "backdrop", climb: 0, noiseScale: 0.01, noiseAmp: 0.25,
      edge: 0.02, rimWidth: 0.05, rim: 0.35, near: 2000, far: 3000, density: L.density,
      mist: 45, grain: 0.02, sil: 0, color: new THREE.Color("#3f5566"), side: THREE.DoubleSide,
      cloud: new THREE.Vector4(L.base + 10, 10, 0.7, 0.6),
    }));
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  // ---------- Pale vermilion sun, low over the end of the path ----------
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(34, 64),
    inkMaterial({
      reveal: "global", climb: 0, noiseScale: 0.05, noiseAmp: 0.3, rim: 0.4, rimWidth: 0.06,
      near: 2000, far: 3000, density: 0.55, mist: 0.01, grain: 0.06, sil: 0, color: SEAL_RED,
    })
  );
  sun.position.set(60, 120, -520);
  scene.add(sun);

  // ---------- Birds circling ahead ----------
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute("position", new THREE.Float32BufferAttribute([
    0, 0, 0.18,   0, 0, -0.18,   1.0, 0.12, -0.1,
    1.0, 0.12, -0.1,   1.5, 0.05, -0.35,   0, 0, -0.18,
  ], 3));
  wingGeo.setAttribute("uv", new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
  wingGeo.computeVertexNormals();
  const birdMat = inkMaterial({
    reveal: "global", climb: 0, noiseAmp: 0, near: 2000, far: 3000, density: 0.95,
    mist: 0.01, grain: 2, sil: 0, side: THREE.DoubleSide,
  });
  const birds = [];
  for (let i = 0; i < 6; i++) {
    const bird = new THREE.Group();
    const left = new THREE.Mesh(wingGeo, birdMat);
    const right = new THREE.Mesh(wingGeo, birdMat);
    right.scale.x = -1;
    bird.add(left, right);
    bird.scale.setScalar(rand.range(0.9, 1.4));
    scene.add(bird);
    birds.push({
      bird, left, right,
      cx: rand.range(-25, 25), cz: rand.range(-140, -40), y: rand.range(28, 45),
      r: rand.range(25, 50), speed: rand.range(0.05, 0.09) * (rand() < 0.5 ? -1 : 1),
      phase: rand() * Math.PI * 2, flap: rand.range(4, 6),
    });
  }

  const next = new THREE.Vector3();
  return {
    update(time, camera) {
      sun.lookAt(camera.position);
      for (const b of birds) {
        const a = b.phase + time * b.speed;
        const pos = (ang) => next.set(b.cx + Math.cos(ang) * b.r, b.y + Math.sin(ang * 3) * 1.5, b.cz + Math.sin(ang) * b.r);
        b.bird.position.copy(pos(a));
        b.bird.lookAt(pos(a + 0.01 * Math.sign(b.speed)));
        // flap, with an occasional glide
        const glide = Math.sin(time * 0.4 + b.phase) > 0.3 ? 0.15 : 1;
        const f = Math.sin(time * b.flap + b.phase) * 0.55 * glide;
        b.left.rotation.z = f;
        b.right.rotation.z = -f;
      }
    },
  };
}

// 1-D noise that wraps around seamlessly (for ridgelines on a ring).
function periodicNoise(rand, periods, amps) {
  const tables = periods.map((p) => Array.from({ length: p }, () => rand()));
  const total = amps.reduce((a, b) => a + b, 0);
  return (u) => {
    let v = 0;
    periods.forEach((p, o) => {
      const x = u * p;
      const i = Math.floor(x);
      const f = x - i;
      const s = f * f * (3 - 2 * f);
      const t = tables[o];
      v += amps[o] * (t[i % p] * (1 - s) + t[(i + 1) % p] * s);
    });
    return v / total;
  };
}
