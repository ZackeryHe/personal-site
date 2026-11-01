import * as THREE from "three";
import { inkMaterial } from "../../ink/material.js";

// 归雁 — a V of wild geese, flying a long slow loop over the valley.
export function build({ scene, places, rng }) {
  const rand = rng(95);
  const G = places.geese;

  const wing = new THREE.BufferGeometry();
  wing.setAttribute("position", new THREE.Float32BufferAttribute([
    0, 0, 0.2,   0, 0, -0.2,   1.1, 0.1, -0.12,
    1.1, 0.1, -0.12,   1.7, 0.04, -0.4,   0, 0, -0.2,
  ], 3));
  wing.setAttribute("uv", new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
  wing.computeVertexNormals();
  const mat = inkMaterial({
    reveal: "global", climb: 0, noiseAmp: 0, near: 2000, far: 3000, density: 0.95,
    mist: 0.01, grain: 2, sil: 0, side: THREE.DoubleSide,
  });

  // formation offsets (x: right, z: forward) — the leader, then two trailing lines
  const slots = [[0, 0]];
  for (let i = 1; i <= 4; i++) slots.push([-1.9 * i, -1.6 * i], [1.9 * i, -1.6 * i]);
  const flock = slots.map(([x, z]) => {
    const bird = new THREE.Group();
    const l = new THREE.Mesh(wing, mat);
    const r = new THREE.Mesh(wing, mat);
    r.scale.x = -1;
    bird.add(l, r);
    bird.scale.setScalar(1.5);
    scene.add(bird);
    return { bird, l, r, x, z, phase: rand() * Math.PI * 2 };
  });

  const [rx, rz] = G.radii;
  const lead = new THREE.Vector3();
  const heading = new THREE.Vector3();
  const right = new THREE.Vector3();
  const pos = new THREE.Vector3();
  return {
    update(time) {
      const a = (time / G.period) * Math.PI * 2;
      lead.set(G.center.x + Math.cos(a) * rx, G.center.y + Math.sin(a * 2) * 3, G.center.z + Math.sin(a) * rz);
      heading.set(-Math.sin(a) * rx, 0, Math.cos(a) * rz).normalize();
      right.set(-heading.z, 0, heading.x);
      for (const b of flock) {
        pos.copy(lead).addScaledVector(right, b.x).addScaledVector(heading, b.z);
        pos.y += Math.sin(time * 0.8 + b.phase) * 0.3;
        b.bird.position.copy(pos);
        b.bird.lookAt(pos.add(heading));
        const f = Math.sin(time * 2.6 + b.phase) * 0.5; // slow, steady wingbeats
        b.l.rotation.z = f;
        b.r.rotation.z = -f;
      }
      G.pos.copy(lead); // its name follows the leader
    },
  };
}
