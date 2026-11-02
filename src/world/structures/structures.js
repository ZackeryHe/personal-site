import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { inkMaterial, SEAL_RED } from "../../ink/material.js";
import { STOPS } from "../places.js";
import { BRIDGE, deckHeight } from "../path.js";

const at = (geo, x, y, z) => geo.translate(x, y, z);

// Bridge, lanterns in the bamboo (Projects), the pavilion (Resume), and the avenue of tablets (Experience).
export function build({ scene, P, places }) {
  // built things: outlined, with upward faces left mostly as bare paper
  const stoneMat = inkMaterial({
    channel: "mid", bias: 0.12, climb: 0.04, noiseScale: 0.4, noiseAmp: 0.3,
    near: 4, far: 45, density: 1, mist: 0.6, grain: 2.5, shade: 0.12, side: THREE.DoubleSide,
  });

  // ---------- The stone arch bridge (拱桥): a solid hump over a round arch ----------
  // built in its own frame: x along the span, then turned to follow the path
  {
    const { half } = BRIDGE;
    const W = 2.8;       // width
    const foot = -0.8;   // where the arch springs (below the water)
    const open = 2.4;    // the arch's radius
    const body = new THREE.Shape();
    body.moveTo(-half - 0.8, foot);
    body.lineTo(-half - 0.8, 0);
    for (let i = 0; i <= 48; i++) {
      const u = -half + (i / 48) * 2 * half;
      body.lineTo(u, deckHeight(u) - 0.02);
    }
    body.lineTo(half + 0.8, 0);
    body.lineTo(half + 0.8, foot);
    body.lineTo(open, foot);
    body.absarc(0, foot, open, 0, Math.PI, false); // the arch: a hole up through the body
    body.lineTo(-half - 0.8, foot);
    const parts = [new THREE.ExtrudeGeometry(body, { depth: W, bevelEnabled: false, curveSegments: 40 }).translate(0, 0, -W / 2)];

    // low parapets along both edges, with posts topped by little stone buds
    for (const zSide of [-1, 1]) {
      const band = new THREE.Shape();
      band.moveTo(-half, 0);
      for (let i = 0; i <= 40; i++) {
        const u = -half + (i / 40) * 2 * half;
        band.lineTo(u, deckHeight(u) + 0.62);
      }
      for (let i = 40; i >= 0; i--) {
        const u = -half + (i / 40) * 2 * half;
        band.lineTo(u, deckHeight(u) - 0.02);
      }
      parts.push(new THREE.ExtrudeGeometry(band, { depth: 0.16, bevelEnabled: false }).translate(0, 0, zSide * (W / 2 - 0.08) - 0.08));
      for (let u = -half; u <= half + 0.01; u += half / 4) {
        const y = deckHeight(u);
        parts.push(at(new THREE.BoxGeometry(0.22, 0.86, 0.22), u, y + 0.41, zSide * (W / 2 - 0.08)));
        parts.push(at(new THREE.SphereGeometry(0.13, 8, 6), u, y + 0.92, zSide * (W / 2 - 0.08)));
      }
    }
    // the edges of the steps, as fine ink lines across the deck
    const steps = [];
    for (let u = -half + 0.4; u < half - 0.3; u += 0.5) {
      if (Math.abs(u) < 0.9) continue; // the level top
      steps.push(at(new THREE.BoxGeometry(0.05, 0.035, W - 0.45), u, deckHeight(u) + 0.01, 0));
    }
    parts.push(...steps);

    const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
    g.rotateY(-Math.PI / 2); // span along local z
    const bridge = new THREE.Mesh(g, stoneMat);
    bridge.position.copy(P.path.getPointAt(STOPS.river));
    bridge.rotation.y = P.yawAt(STOPS.river);
    scene.add(bridge);
  }

  // ---------- A rough stone bench at the brink, facing the canyon: sit down, and look ----------
  if (places.bench) {
    const slab = new THREE.BoxGeometry(2.4, 0.24, 0.72, 10, 2, 4);
    {
      const pos = slab.attributes.position;
      const bumps = new Map();
      for (let i = 0; i < pos.count; i++) {
        const key = [pos.getX(i), pos.getY(i), pos.getZ(i)].map((v) => Math.round(v * 1000)).join(",");
        if (!bumps.has(key)) bumps.set(key, [Math.random() - 0.5, Math.random() - 0.5]);
        const [a, b] = bumps.get(key);
        pos.setXYZ(i, pos.getX(i) * (1 + a * 0.04), pos.getY(i) + b * 0.05, pos.getZ(i) * (1 + b * 0.08));
      }
      slab.computeVertexNormals();
    }
    const bench = new THREE.Mesh(mergeGeometries([
      at(slab.toNonIndexed(), 0, 0.56, 0),
      at(new THREE.BoxGeometry(0.46, 0.44, 0.56).toNonIndexed(), -0.8, 0.22, 0),
      at(new THREE.BoxGeometry(0.46, 0.44, 0.56).toNonIndexed(), 0.8, 0.22, 0),
    ]), stoneMat);
    bench.position.copy(places.bench.pos);
    bench.rotation.y = Math.atan2(P.endDir.x, P.endDir.z);
    scene.add(bench);
  }

  // ---------- Stone lanterns along the bamboo path: one per project ----------
  // open-sided light box (four little posts) with a warm glow inside
  const lanternGeo = mergeGeometries([
    at(new THREE.CylinderGeometry(0.4, 0.5, 0.3, 6), 0, 0.15, 0),
    at(new THREE.CylinderGeometry(0.15, 0.15, 1.0, 6), 0, 0.8, 0),
    at(new THREE.BoxGeometry(0.7, 0.1, 0.7), 0, 1.3, 0),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => at(new THREE.BoxGeometry(0.08, 0.5, 0.08), x * 0.27, 1.6, z * 0.27)),
    at(new THREE.ConeGeometry(0.62, 0.45, 4), 0, 2.07, 0),
    at(new THREE.SphereGeometry(0.1, 6, 4), 0, 2.37, 0),
  ]);
  const glowMat = inkMaterial({
    channel: "mid", bias: 0.12, climb: 0.04, noiseScale: 1, near: 4, far: 45, density: 0.55,
    mist: 0.01, grain: 4, shade: 0.9, sil: 0, tint: "none", color: new THREE.Color("#d9a24a"),
  });
  const lanterns = new THREE.InstancedMesh(lanternGeo, stoneMat, places.lanterns.length);
  const glows = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.38, 0.4).translate(0, 1.6, 0), glowMat, places.lanterns.length);
  const dummy = new THREE.Object3D();
  places.lanterns.forEach(({ t, pos }, i) => {
    dummy.position.copy(pos);
    dummy.rotation.y = P.yawAt(t) + Math.PI / 4;
    dummy.updateMatrix();
    lanterns.setMatrixAt(i, dummy.matrix);
    glows.setMatrixAt(i, dummy.matrix);
  });
  for (const m of [lanterns, glows]) {
    m.frustumCulled = false;
    scene.add(m);
  }

  // ---------- Pavilion (Resume) ----------
  const pavParts = [
    at(new THREE.BoxGeometry(8, 0.35, 8), 0, 0.175, 0), // platform
  ];
  const top = 4.55;
  for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
    pavParts.push(at(new THREE.CylinderGeometry(0.17, 0.2, top - 0.35, 6), x, (top + 0.35) / 2, z));
  }
  // lintels + side railings (the path passes through the open front and back)
  for (const s of [-3, 3]) {
    pavParts.push(at(new THREE.BoxGeometry(6.4, 0.3, 0.25), 0, top - 0.15, s));
    pavParts.push(at(new THREE.BoxGeometry(0.25, 0.3, 6.4), s, top - 0.15, 0));
    pavParts.push(at(new THREE.BoxGeometry(0.12, 0.12, 6), s, 1.1, 0));
  }
  pavParts.push(at(roofGeometry(4.3, 2.6, 0.9), 0, top, 0));
  pavParts.push(at(new THREE.SphereGeometry(0.28, 8, 6), 0, top + 2.85, 0));
  const pav = new THREE.Group();
  pav.add(new THREE.Mesh(mergeGeometries(pavParts), stoneMat));

  // Hanging scrolls on the side walls (Resume: the pages of it), with a red seal on each
  const scrollMat = inkMaterial({
    channel: "mid", bias: 0.15, climb: 0.04, noiseScale: 0.8, near: 2, far: 30,
    density: 0.6, mist: 0.01, grain: 4, sil: 0, color: new THREE.Color("#4a3b2c"),
    side: THREE.DoubleSide,
  });
  const scrollSeal = inkMaterial({
    channel: "mid", bias: 0.2, climb: 0.04, noiseScale: 1.2, near: 2, far: 30,
    density: 0.9, mist: 0.01, grain: 3, sil: 0, color: SEAL_RED, side: THREE.DoubleSide,
  });
  for (const sx of [-2.85, 2.85]) {
    for (const z of [-1.5, 0, 1.5]) {
      const s = new THREE.Group();
      s.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 2.6), scrollMat));
      const seal = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), scrollSeal);
      seal.position.set(0.28, -0.95, 0.01);
      s.add(seal);
      s.position.set(sx, 2.8, z);
      s.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
      pav.add(s);
    }
  }
  pav.position.copy(P.path.getPointAt(STOPS.pavilion));
  pav.rotation.y = P.yawAt(STOPS.pavilion);
  scene.add(pav);

  // ---------- Steles: stone tablets stamped with seals ----------
  const sealMat = inkMaterial({
    channel: "mid", bias: 0.3, climb: 0.02, noiseScale: 1.2, noiseAmp: 0.25, near: 3, far: 40,
    density: 0.9, mist: 0.01, grain: 3, sil: 0, color: SEAL_RED,
  });
  /** A stele of the given size, placed at pos and turned to face the point `faces`. */
  const stele = (pos, faces, s = 1) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(
      mergeGeometries([
        at(new THREE.BoxGeometry(3.2, 0.5, 1.2), 0, 0.25, 0),
        at(new THREE.BoxGeometry(2.4, 3.8, 0.45), 0, 2.4, 0),
        at(new THREE.BoxGeometry(2.7, 0.35, 0.6), 0, 4.45, 0),
      ]),
      stoneMat
    ));
    for (const [x, y, size] of [[0.55, 3.4, 0.55], [-0.6, 1.6, 0.4], [0.5, 1.2, 0.32]]) {
      const seal = new THREE.Mesh(new THREE.PlaneGeometry(size, size), sealMat);
      seal.position.set(x, y, 0.235);
      seal.rotation.z = (x > 0 ? -1 : 1) * 0.04;
      g.add(seal);
    }
    g.scale.setScalar(s);
    g.position.copy(pos);
    g.rotation.y = Math.atan2(faces.x - pos.x, faces.z - pos.z);
    scene.add(g);
  };
  // Experience: an avenue of tablets (碑林) either side of the path, one per role
  for (const s of places.steles) stele(s.pos, s.faces, 0.5);

  // ---------- Behind the tablets: whitewashed garden walls (粉墙) under dark tile coping,
  // with lattice windows (漏窗), and on the left a moon gate (月洞门) to look through ----------
  const plaster = inkMaterial({
    channel: "mid", bias: 0.1, climb: 0.03, noiseScale: 0.4, noiseAmp: 0.3, near: 4, far: 55,
    density: 0.08, mist: 0.4, grain: 1.5, shade: 0.1, sil: 1.2, tint: "none", side: THREE.DoubleSide,
  });
  const dark = inkMaterial({
    channel: "mid", bias: 0.1, climb: 0.03, noiseScale: 0.4, noiseAmp: 0.3, near: 4, far: 55,
    density: 0.95, mist: 0.4, grain: 3, shade: 0.55, sil: 0.5, tint: "none", side: THREE.DoubleSide,
  });
  const L = 15;   // length
  const H = 2.8;  // height
  const T = 0.32; // thickness
  const hexagon = (cx, cy, r) => {
    const s = new THREE.Path();
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      i === 0 ? s.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : s.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    return s;
  };
  const circle = (cx, cy, r) => new THREE.Path().absarc(cx, cy, r, 0, Math.PI * 2, true);
  for (const side of [-1, 1]) {
    const t = STOPS.experience;
    const tangent = P.path.getTangentAt(t);
    const shape = new THREE.Shape([
      new THREE.Vector2(-L / 2, 0), new THREE.Vector2(L / 2, 0),
      new THREE.Vector2(L / 2, H), new THREE.Vector2(-L / 2, H),
    ]);
    const windows = side < 0
      ? [{ u: -4.8, kind: "hex" }, { u: 4.8, kind: "circle" }]
      : [{ u: -4.8, kind: "circle" }, { u: 0, kind: "hex" }, { u: 4.8, kind: "circle" }];
    for (const w of windows) shape.holes.push(w.kind === "hex" ? hexagon(w.u, 1.55, 0.52) : circle(w.u, 1.55, 0.48));
    if (side < 0) shape.holes.push(circle(0, 1.3, 1.15)); // the moon gate
    const parts = [new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false, curveSegments: 36 }).translate(0, 0, -T / 2)];
    // lattice bars across each window
    const bars = [];
    for (const w of windows) {
      const r = 0.48;
      for (const off of [-0.24, 0, 0.24]) {
        const half = Math.sqrt(r * r - off * off) * 0.98;
        bars.push(at(new THREE.BoxGeometry(0.045, half * 2, T * 0.5), w.u + off, 1.55, 0));
        bars.push(at(new THREE.BoxGeometry(half * 2, 0.045, T * 0.5), w.u, 1.55 + off, 0));
      }
    }
    // the coping: a ridge of dark tiles along the top
    const ridge = new THREE.Shape([new THREE.Vector2(-0.42, 0), new THREE.Vector2(0.42, 0), new THREE.Vector2(0, 0.34)]);
    const coping = new THREE.ExtrudeGeometry(ridge, { depth: L + 0.4, bevelEnabled: false })
      .translate(0, 0, -(L + 0.4) / 2).rotateY(Math.PI / 2).translate(0, H, 0);
    const wall = new THREE.Group();
    wall.add(new THREE.Mesh(mergeGeometries(parts), plaster));
    wall.add(new THREE.Mesh(mergeGeometries([coping, ...bars.map((b) => b.toNonIndexed())]), dark));
    wall.position.copy(P.at(t, side * 6.2));
    wall.rotation.y = Math.atan2(-tangent.z, tangent.x); // runs along the path
    scene.add(wall);
  }
}

// Square hip roof with concave sides and upturned corners, corners over the pillars.
export function roofGeometry(halfSize, height, lift) {
  const g = new THREE.ConeGeometry(1, 1, 32, 8, true);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x0 = pos.getX(i), y0 = pos.getY(i), z0 = pos.getZ(i);
    const k = y0 + 0.5; // 0 eave → 1 apex
    const rest = 1 - k;
    const theta = Math.atan2(x0, z0);
    // stretch the circle to a square; corners land on the diagonals (over the pillars)
    const sq = 1 / Math.max(Math.abs(Math.cos(theta)), Math.abs(Math.sin(theta)));
    const corner = (sq - 1) / (Math.SQRT2 - 1); // 0 mid-edge → 1 corner
    const r = halfSize * sq * Math.pow(rest, 1.6); // concave sweep
    const y = k * height + lift * corner * corner * Math.pow(rest, 4); // upturned eaves
    pos.setXYZ(i, Math.sin(theta) * r, y, Math.cos(theta) * r);
  }
  g.computeVertexNormals();
  return g;
}
