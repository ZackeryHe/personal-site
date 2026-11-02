import * as THREE from "three";
import { inkMaterial } from "../../ink/material.js";

// Petals and leaves drifting down around you as you walk: plum-blossom pinks and whites
// early on, turning to gold and orange leaves toward the end. They flutter, spin, rest
// on the ground a moment, then drift down again somewhere near you.

const COLOURS = [
  ["#e8a3b1", 0], // plum blossom
  ["#f2ede2", 0], // white blossom
  ["#d9455a", 0.1],
  ["#e0ae4f", 0.55], // gold leaf
  ["#d97a3a", 0.7],  // orange leaf
];
const PER_COLOUR = 22;

export function build({ scene, P, rng }) {
  const rand = rng(107);
  // a petal: a small rounded almond, slightly cupped
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.07);
  shape.quadraticCurveTo(0.055, 0, 0, 0.07);
  shape.quadraticCurveTo(-0.055, 0, 0, -0.07);
  const geo = new THREE.ShapeGeometry(shape, 4);
  {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, (pos.getX(i) / 0.055) ** 2 * 0.012);
    geo.computeVertexNormals();
  }

  const flocks = COLOURS.map(([col, from]) => {
    const mesh = new THREE.InstancedMesh(geo, inkMaterial({
      reveal: "global", tint: "none", climb: 0, noiseAmp: 0, near: 4, far: 40, minFar: 0,
      density: 0.6, mist: 0.01, grain: 4, shade: 0.4, sil: 0.3, color: new THREE.Color(col),
      wash: 1, washLit: new THREE.Color(col), washShade: new THREE.Color(col).multiplyScalar(0.8),
      side: THREE.DoubleSide,
    }), PER_COLOUR);
    mesh.frustumCulled = false;
    scene.add(mesh);
    const petals = Array.from({ length: PER_COLOUR }, () => ({
      pos: new THREE.Vector3(0, -10, 0), fall: rand.range(0.25, 0.5), sway: rand.range(0.3, 0.8),
      spin: rand.range(1, 3), phase: rand() * 10, rest: 0, scale: rand.range(0.8, 1.4), alive: false,
    }));
    return { mesh, petals, from };
  });

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const sc = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  let lastTime = null;

  return {
    update(time, camera) {
      const dt = lastTime === null ? 0 : Math.min(0.1, Math.max(0, time - lastTime));
      lastTime = time;
      const camT = P.nearestT(camera.position.x, camera.position.z);
      camera.getWorldDirection(fwd);
      fwd.y = 0;
      fwd.normalize();
      for (const f of flocks) {
        // blossom early on, leaves later: each colour drifts only where it belongs
        const here = 1 - Math.min(1, Math.abs(camT - (f.from + 0.15)) / 0.45);
        f.petals.forEach((p, i) => {
          if (!p.alive) {
            if (rand() > here * dt * 3) {
              f.mesh.setMatrixAt(i, m4.makeScale(0, 0, 0));
              return;
            }
            // start somewhere up in the air ahead of and around you
            const ahead = rand.range(-3, 16);
            const side = rand.range(-9, 9);
            p.pos.set(camera.position.x + fwd.x * ahead - fwd.z * side, rand.range(3, 7), camera.position.z + fwd.z * ahead + fwd.x * side);
            p.alive = true;
            p.rest = 0;
          }
          if (p.pos.y > 0.02) {
            p.pos.y -= p.fall * dt;
            p.pos.x += Math.sin(time * p.sway * 2 + p.phase) * p.sway * dt + dt * 0.25; // a light breeze
            p.pos.z += Math.cos(time * p.sway * 1.6 + p.phase) * p.sway * dt * 0.6;
            e.set(time * p.spin + p.phase, time * p.spin * 0.6, Math.sin(time * 2 + p.phase) * 0.8);
          } else {
            p.pos.y = 0.02;
            e.set(-Math.PI / 2, p.phase, 0); // resting on the ground
            p.rest += dt;
            if (p.rest > 4) p.alive = false;
          }
          f.mesh.setMatrixAt(i, m4.compose(p.pos, q.setFromEuler(e), sc.setScalar(p.scale)));
        });
        f.mesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
