import * as THREE from "three";
import { inkMaterial, SEAL_RED } from "../../ink/material.js";

// Shared looks: "white" parts are bare paper with an ink outline, as in a painting.
const mats = () => ({
  white: inkMaterial({
    channel: "mid", bias: 0.15, climb: 0.02, noiseScale: 0.8, near: 3, far: 45,
    density: 0.14, mist: 0.01, grain: 2, shade: 0.15, sil: 1.2,
  }),
  black: inkMaterial({
    channel: "mid", bias: 0.15, climb: 0.02, noiseScale: 0.8, near: 3, far: 45,
    density: 1.1, mist: 0.01, grain: 2.5, shade: 0.6, sil: 0.5,
  }),
  red: inkMaterial({
    channel: "mid", bias: 0.15, climb: 0.02, noiseScale: 0.8, near: 3, far: 45,
    density: 0.95, mist: 0.01, grain: 3, shade: 0.4, sil: 0, color: SEAL_RED,
  }),
  tan: inkMaterial({
    channel: "mid", bias: 0.15, climb: 0.02, noiseScale: 0.8, near: 3, far: 45,
    density: 0.38, mist: 0.01, grain: 1.8, shade: 0.35, sil: 1.0, wash: 1.6,
  }),
});

const part = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
};
const tube = (points, r) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), 16, r, 5);

// 鹤鸣 — red-crowned cranes wading by the bridge. Every so often one dips its head.
function crane(M, rand) {
  const g = new THREE.Group();
  for (const sx of [-0.07, 0.07]) g.add(part(new THREE.CylinderGeometry(0.018, 0.02, 1.0, 4), M.black, sx, 0.5, 0.02 * Math.sign(sx)));
  g.add(part(new THREE.SphereGeometry(1, 14, 10).scale(0.26, 0.24, 0.5), M.white, 0, 1.12, 0, -0.12));
  g.add(part(new THREE.ConeGeometry(0.2, 0.5, 7), M.black, 0, 1.05, -0.48, -2.0)); // black tail plumes
  // neck + head pivot at the base of the neck
  const neck = new THREE.Group();
  neck.position.set(0, 1.25, 0.34);
  neck.add(new THREE.Mesh(tube([[0, 0, 0], [0, 0.25, 0.12], [0, 0.5, 0.04], [0, 0.68, 0.14]], 0.04), M.black));
  neck.add(part(new THREE.SphereGeometry(0.075, 10, 8), M.white, 0, 0.72, 0.17));
  neck.add(part(new THREE.SphereGeometry(0.04, 8, 6), M.red, 0, 0.775, 0.16)); // the red crown
  neck.add(part(new THREE.ConeGeometry(0.018, 0.22, 5), M.tan, 0, 0.69, 0.32, Math.PI / 2 + 0.25));
  g.add(neck);
  return { group: g, neck, phase: rand() * 20, period: rand.range(7, 11) };
}

// 鹿鸣 — deer grazing in the meadow; they lift their heads and watch as you pass.
function deer(M, rand, stag) {
  const g = new THREE.Group();
  for (const [x, z] of [[-0.11, 0.3], [0.11, 0.3], [-0.11, -0.3], [0.11, -0.3]]) {
    g.add(part(new THREE.CylinderGeometry(0.025, 0.03, 0.64, 4), M.tan, x, 0.32, z));
  }
  g.add(part(new THREE.CapsuleGeometry(0.17, 0.5, 4, 10), M.tan, 0, 0.78, 0, Math.PI / 2));
  g.add(part(new THREE.ConeGeometry(0.05, 0.12, 5), M.white, 0, 0.86, -0.45, -2.2)); // tail
  const head = new THREE.Group();
  head.position.set(0, 0.9, 0.3);
  head.add(part(new THREE.CapsuleGeometry(0.06, 0.28, 3, 8), M.tan, 0, 0.16, 0.08, 0.5));
  head.add(part(new THREE.SphereGeometry(1, 10, 8).scale(0.07, 0.075, 0.15), M.tan, 0, 0.34, 0.2, 0.3));
  head.add(part(new THREE.SphereGeometry(0.025, 6, 4), M.black, 0, 0.3, 0.34)); // nose
  for (const sx of [-1, 1]) {
    head.add(part(new THREE.ConeGeometry(0.035, 0.12, 4), M.tan, sx * 0.07, 0.42, 0.15, 0, 0, -sx * 0.9));
    if (stag) {
      head.add(new THREE.Mesh(tube([[sx * 0.04, 0.4, 0.14], [sx * 0.12, 0.58, 0.1], [sx * 0.16, 0.72, 0.16], [sx * 0.15, 0.85, 0.1]], 0.012), M.black));
      head.add(new THREE.Mesh(tube([[sx * 0.12, 0.58, 0.1], [sx * 0.2, 0.66, 0.22]], 0.01), M.black));
    }
  }
  g.add(head);
  return { group: g, head, phase: rand() * 10, alert: 0 };
}

// a butterfly: two wings that flap, wandering around a spot
function butterfly(rand, color) {
  const wing = new THREE.BufferGeometry();
  wing.setAttribute("position", new THREE.Float32BufferAttribute([
    0, 0, 0.02,  0.13, 0, 0.1,  0.16, 0, -0.02,
    0, 0, 0.02,  0.16, 0, -0.02, 0.09, 0, -0.1,
  ], 3));
  wing.setAttribute("uv", new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
  wing.setIndex([0, 1, 2, 3, 4, 5]);
  wing.computeVertexNormals();
  const mat = inkMaterial({
    channel: "mid", bias: 0.15, climb: 0, noiseScale: 2, noiseAmp: 0.2, near: 3, far: 30, minFar: 0,
    density: 0.9, mist: 0.01, grain: 4, sil: 0, sketch: false, color, side: THREE.DoubleSide,
  });
  const g = new THREE.Group();
  const l = new THREE.Mesh(wing, mat);
  const r = new THREE.Mesh(wing, mat);
  r.scale.x = -1;
  g.add(l, r);
  g.scale.setScalar(1.4);
  return { group: g, l, r, phase: rand() * 100, speed: rand.range(0.5, 0.9) };
}

// 独钓 — a fisherman in a straw cape and hat, drifting on the river.
function boat(M) {
  const hull = new THREE.SphereGeometry(1, 18, 10).scale(0.5, 0.3, 1.7);
  const pos = hull.attributes.position;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0) pos.setY(i, 0.04); // open top
  hull.computeVertexNormals();
  const g = new THREE.Group();
  g.add(part(hull, M.tan, 0, 0.12, 0));
  g.add(part(new THREE.ConeGeometry(0.3, 0.55, 8), M.black, 0, 0.42, -0.4)); // straw cape
  g.add(part(new THREE.SphereGeometry(0.085, 8, 6), M.white, 0, 0.74, -0.38));
  g.add(part(new THREE.ConeGeometry(0.4, 0.17, 12), M.tan, 0, 0.86, -0.38)); // conical hat
  const rodGeo = new THREE.CylinderGeometry(0.008, 0.014, 2.8, 4).translate(0, 1.4, 0);
  g.add(part(rodGeo, M.black, 0.15, 0.5, -0.2, 0.95, 0, -0.55));
  g.add(part(new THREE.CylinderGeometry(0.003, 0.003, 1.9, 3), M.black, 1.61, 0.95, 1.74)); // line from the rod tip
  return g;
}

export function build({ scene, places: L, rng }) {
  const rand = rng(79);
  const M = mats();
  const UP = new THREE.Vector3(0, 1, 0);
  const R = L.river;
  const flowYaw = Math.atan2(R.flow.x, R.flow.z);

  // cranes: two in the shallows, one on the far bank
  const cranes = [
    { p: R.at(-7.5, 1.3), yaw: flowYaw + 0.3 },
    { p: R.at(-10.2, -0.7), yaw: flowYaw + Math.PI - 0.4 },
    { p: R.at(-13.5, 4.3), yaw: flowYaw + 1.2 },
  ].map(({ p, yaw }) => {
    const c = crane(M, rand);
    c.group.position.copy(p);
    c.group.rotation.y = yaw;
    scene.add(c.group);
    return c;
  });

  // deer in the meadow
  const herd = [true, false].map((stag, i) => {
    const d = deer(M, rand, stag);
    const a = rand() * Math.PI * 2;
    d.group.position.set(L.meadow.pos.x + Math.cos(a) * (2 + i * 2), 0, L.meadow.pos.z + Math.sin(a) * (2 + i * 2));
    d.group.rotation.y = rand() * Math.PI * 2;
    d.baseYaw = d.group.rotation.y;
    scene.add(d.group);
    return d;
  });

  // butterflies around the meadow, the pond and the plum trees
  const flutter = [];
  const spots = [
    [L.meadow.pos, 5], [L.pond.pos, 2], [L.plumEntrance.pos, 2], [L.plumPavilion.pos, 2],
  ];
  const wingColours = [new THREE.Color("#c99a3a"), new THREE.Color("#161a21"), new THREE.Color("#b8322a")];
  for (const [center, n] of spots) {
    for (let i = 0; i < n; i++) {
      const b = butterfly(rand, wingColours[Math.floor(rand() * wingColours.length)]);
      b.center = center;
      b.radius = rand.range(1.5, 4);
      scene.add(b.group);
      flutter.push(b);
    }
  }

  // the fisherman's boat
  const skiff = boat(M);
  scene.add(skiff);

  // where the named views (places.js) attach
  L.cranes.pos.copy(cranes[0].group.position);

  const target = new THREE.Vector3();
  const next = new THREE.Vector3();
  return {
    update(time, camera) {
      // cranes dip their heads now and then
      for (const c of cranes) {
        const k = (time + c.phase) % c.period;
        const dip = k < 1.8 ? Math.sin((k / 1.8) * Math.PI) : 0;
        c.neck.rotation.x = 1.25 * dip;
        c.neck.rotation.y = Math.sin(time * 0.3 + c.phase) * 0.25 * (1 - dip);
      }

      // deer graze; when you come close they look up and turn their heads to you
      for (const d of herd) {
        const dist = camera.position.distanceTo(d.group.position);
        d.alert += ((dist < 13 ? 1 : 0) - d.alert) * 0.03;
        const graze = (Math.sin(time * 0.35 + d.phase) * 0.5 + 0.5) * (1 - d.alert);
        d.head.rotation.x = 1.0 * graze - 0.15 * d.alert;
        target.copy(camera.position).sub(d.group.position);
        const toCam = Math.atan2(target.x, target.z) - d.group.rotation.y;
        const wrapped = Math.atan2(Math.sin(toCam), Math.cos(toCam));
        d.head.rotation.y = THREE.MathUtils.clamp(wrapped, -1.1, 1.1) * d.alert;
      }

      // butterflies wander and flap
      for (const b of flutter) {
        const t = time * b.speed + b.phase;
        next.set(
          b.center.x + Math.sin(t * 0.7) * b.radius + Math.sin(t * 1.9) * 0.4,
          0.6 + Math.sin(t * 1.3) * 0.35 + Math.sin(t * 3.1) * 0.12,
          b.center.z + Math.cos(t * 0.53) * b.radius + Math.cos(t * 2.3) * 0.4
        );
        b.group.lookAt(next);
        b.group.position.copy(next);
        const f = Math.sin(time * 18 + b.phase) * 0.9;
        b.l.rotation.z = f;
        b.r.rotation.z = -f;
      }

      // the boat drifts slowly up and down the river, bobbing
      const along = 16 + Math.sin(time * 0.04) * 6;
      skiff.position.copy(R.at(along, 0.4));
      skiff.position.y = Math.sin(time * 1.6) * 0.03;
      skiff.rotation.set(Math.sin(time * 1.1) * 0.02, flowYaw + Math.sin(time * 0.07) * 0.15, Math.sin(time * 1.3) * 0.03);
      L.boat.pos.copy(skiff.position); // its view name follows the boat
    },
  };
}
