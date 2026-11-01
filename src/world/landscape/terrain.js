import * as THREE from "three";
import { inkMaterial } from "../../ink/material.js";
import { STOPS } from "../places.js";

// The ground wash, stepping stones, grass tufts and riverside reeds.
export function build({ scene, P, rng }) {
  const rand = rng(11);
  const dummy = new THREE.Object3D();

  // ---------- Ground: the ink bleeds out from your feet ----------
  scene.add(new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2),
    inkMaterial({
      variant: "ground", channel: "ground", climb: 0, noiseScale: 0.12, noiseAmp: 0.35,
      edge: 0.02, rimWidth: 0.06, rim: 0.8, near: 4, far: 40, minFar: 0, density: 0.16,
      mist: 0.01, grain: 0.35, sil: 0,
    })
  ));

  // ---------- Stepping stones: revealed as the ground wash reaches them ----------
  const stoneCount = 170;
  // a lumpy pebble (displacement keyed by position so the mesh stays watertight)
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
  const stones = new THREE.InstancedMesh(
    stoneGeo,
    inkMaterial({
      channel: "ground", bias: 0.05, climb: 0, noiseScale: 0.8, noiseAmp: 0.3,
      near: 3, far: 30, minFar: 0, density: 0.8, mist: 0.01, grain: 2, shade: 0.15,
    }),
    stoneCount
  );
  for (let i = 0; i < stoneCount; i++) {
    const t = i / stoneCount;
    const p = P.path.getPointAt(t).addScaledVector(P.sideAt(t), rand.range(-0.8, 0.8));
    const s = rand.range(0.35, 0.6);
    dummy.position.copy(p);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.scale.set(s * rand.range(0.8, 1.2), s * rand.range(0.25, 0.4), s * rand.range(0.6, 0.95));
    dummy.updateMatrix();
    stones.setMatrixAt(i, dummy.matrix);
  }
  stones.frustumCulled = false;
  scene.add(stones);

  // ---------- Grass tufts and reeds: quick brush flicks ----------
  const blades = [];
  const tuft = (x, z, n, height, spread) => {
    if (P.blocked(x, z, { by: "grass" })) return;
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
  for (let i = 0; i < 150; i++) {
    const t = rand();
    const off = rand.range(1.4, 6) * (rand() < 0.5 ? -1 : 1);
    const p = P.path.getPointAt(t).addScaledVector(P.sideAt(t), off);
    tuft(p.x, p.z, 3 + Math.floor(rand() * 4), rand.range(0.4, 0.9), 0.5);
  }
  // reeds along both river banks
  const riverP = P.path.getPointAt(STOPS.river);
  const flow = P.sideAt(STOPS.river);
  const across = P.path.getTangentAt(STOPS.river);
  for (let i = 0; i < 60; i++) {
    const along = rand.range(-28, 28);
    if (Math.abs(along) < 2.2) continue; // keep the bridge clear
    const bank = (rand() < 0.5 ? -1 : 1) * rand.range(3.2, 4.4);
    tuft(
      riverP.x + flow.x * along + across.x * bank,
      riverP.z + flow.z * along + across.z * bank,
      4 + Math.floor(rand() * 4), rand.range(1.1, 1.9), 0.3
    );
  }

  const grass = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.035, 1, 3).translate(0, 0.5, 0),
    inkMaterial({
      channel: "ground", bias: 0.1, climb: 0.2, noiseScale: 1, noiseAmp: 0.3,
      near: 3, far: 28, minFar: 0, density: 0.9, mist: 0.01, grain: 3, sil: 0, sway: 0.03,
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

  // ---------- River: spreads out sideways from the bridge ----------
  const river = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 7).rotateX(-Math.PI / 2),
    inkMaterial({
      variant: "river", channel: "mid", bias: 0.15, climb: 0, noiseScale: 0.1, noiseAmp: 0.35,
      near: 3, far: 55, minFar: 0, density: 0.6, mist: 0.01, sil: 0,
      color: new THREE.Color("#22303d"),
      flow: new THREE.Vector4(flow.x, flow.z, riverP.x, riverP.z),
    })
  );
  river.position.set(riverP.x, 0.02, riverP.z);
  river.rotation.y = P.yawAt(STOPS.river);
  scene.add(river);
}
