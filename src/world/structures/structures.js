import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { inkMaterial, SEAL_RED } from "../../ink/material.js";
import { STOPS } from "../places.js";

const at = (geo, x, y, z) => geo.translate(x, y, z);

// Bridge, lanterns, pavilion, and the stele at the end of the path.
export function build({ scene, P }) {
  // built things: outlined, with upward faces left mostly as bare paper
  const stoneMat = inkMaterial({
    channel: "mid", bias: 0.12, climb: 0.04, noiseScale: 0.4, noiseAmp: 0.3,
    near: 4, far: 45, density: 1, mist: 0.6, grain: 2.5, shade: 0.12, side: THREE.DoubleSide,
  });

  // ---------- Arched bridge ----------
  const arch = (z) => 1.6 * Math.sqrt(Math.max(0, 1 - (z / 4.6) ** 2));
  const deck = new THREE.PlaneGeometry(2.4, 9.4, 1, 28).rotateX(-Math.PI / 2);
  {
    const pos = deck.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, arch(pos.getZ(i)) - 0.05);
    deck.computeVertexNormals();
  }
  const bridgeParts = [deck];
  for (const x of [-1.2, 1.2]) {
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const z = -4.7 + (i / 20) * 9.4;
      pts.push(new THREE.Vector3(x, arch(z) + 0.85, z));
    }
    bridgeParts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.06, 5));
    for (let z = -4.2; z <= 4.21; z += 1.4) {
      bridgeParts.push(at(new THREE.CylinderGeometry(0.06, 0.07, 0.9, 5), x, arch(z) + 0.4, z));
    }
  }
  const bridge = new THREE.Mesh(mergeGeometries(bridgeParts), stoneMat);
  bridge.position.copy(P.path.getPointAt(STOPS.river));
  bridge.rotation.y = P.yawAt(STOPS.river);
  scene.add(bridge);

  // ---------- Stone lanterns before the bridge: one per project ----------
  const lanternGeo = mergeGeometries([
    at(new THREE.CylinderGeometry(0.4, 0.5, 0.3, 6), 0, 0.15, 0),
    at(new THREE.CylinderGeometry(0.15, 0.15, 1.0, 6), 0, 0.8, 0),
    at(new THREE.BoxGeometry(0.6, 0.5, 0.6), 0, 1.5, 0),
    at(new THREE.ConeGeometry(0.6, 0.45, 4), 0, 1.95, 0),
    at(new THREE.SphereGeometry(0.1, 6, 4), 0, 2.25, 0),
  ]);
  const lanterns = new THREE.InstancedMesh(lanternGeo, stoneMat, 5);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 5; i++) {
    const t = STOPS.river - 0.085 + i * 0.012;
    const p = P.path.getPointAt(t).addScaledVector(P.sideAt(t), i % 2 ? 2.4 : -2.4);
    dummy.position.copy(p);
    dummy.rotation.y = P.yawAt(t);
    dummy.updateMatrix();
    lanterns.setMatrixAt(i, dummy.matrix);
  }
  lanterns.frustumCulled = false;
  scene.add(lanterns);

  // ---------- Pavilion (the gallery) ----------
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

  // Hanging scrolls on the side walls: they only bloom once you're inside
  const scrollMat = inkMaterial({
    channel: "ground", bias: 0.35, climb: 0.05, noiseScale: 0.8, near: 2, far: 16,
    density: 0.65, mist: 0.01, grain: 4, sil: 0, color: new THREE.Color("#4a3b2c"),
    side: THREE.DoubleSide,
  });
  for (const sx of [-2.85, 2.85]) {
    for (const z of [-1.5, 0, 1.5]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.2), scrollMat);
      s.position.set(sx, 2.9, z);
      s.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
      pav.add(s);
    }
  }
  pav.position.copy(P.path.getPointAt(STOPS.pavilion));
  pav.rotation.y = P.yawAt(STOPS.pavilion);
  scene.add(pav);

  // ---------- Stele at the end of the path, stamped with seals (colophon) ----------
  const endP = P.path.getPointAt(1).addScaledVector(P.path.getTangentAt(1), 7);
  const stele = new THREE.Group();
  stele.add(new THREE.Mesh(
    mergeGeometries([
      at(new THREE.BoxGeometry(3.2, 0.5, 1.2), 0, 0.25, 0),
      at(new THREE.BoxGeometry(2.4, 3.8, 0.45), 0, 2.4, 0),
      at(new THREE.BoxGeometry(2.7, 0.35, 0.6), 0, 4.45, 0),
    ]),
    stoneMat
  ));
  const sealMat = inkMaterial({
    channel: "mid", bias: 0.3, climb: 0.02, noiseScale: 1.2, noiseAmp: 0.25, near: 3, far: 40,
    density: 0.9, mist: 0.01, grain: 3, sil: 0, color: SEAL_RED,
  });
  for (const [x, y, size] of [[0.55, 3.4, 0.55], [-0.6, 1.6, 0.4], [0.5, 1.2, 0.32]]) {
    const seal = new THREE.Mesh(new THREE.PlaneGeometry(size, size), sealMat);
    seal.position.set(x, y, 0.235);
    seal.rotation.z = (x > 0 ? -1 : 1) * 0.04;
    stele.add(seal);
  }
  stele.position.copy(endP);
  stele.rotation.y = P.yawAt(1) + Math.PI; // face back toward the walker
  scene.add(stele);
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
