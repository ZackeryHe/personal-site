import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { inkMaterial, SEAL_RED } from "../../ink/material.js";
import { mountainMaterial } from "../landscape/mountains.js";
import { createMist } from "../effects/mist.js";
import { noise3, rng } from "../random.js";
import { surfaceSpots, bushInk, bushMesh } from "../landscape/bushes.js";

// The end of the walk: nothing built but a stone bench, just the view. The land stops at a
// cliff over a canyon, and the canyon is a forest of stone: sheer towers rising out of a sea
// of cloud, pines on their crowns, cloud drifting through their middles, a natural stone
// arch flung between two of them, waterfalls falling away into the cloud. The towers step
// back in layers, each paler than the last, to the far ranges and the red sun setting at the
// far end (sky.js), and three cranes glide slowly across it.
// (Must run before temple.js, which builds on the mesa chosen here.)

const { smoothstep } = THREE.MathUtils;

/**
 * A stone tower: stepped strata, vertical grooves, slow bulges, an optional taper (narrower
 * toward the crown), waist (pinched in the middle) or flare (wider under the crown), a gentle
 * lean, and a rounded crown.
 */
function towerGeometry(layout, n, { x, z, r, top, base = -50, crownAt = 0.97, taper = 1, waist = 0, flare = 0, lean = 0 }) {
  // its own random stream (one draw from the layout's), so changing its detail never moves the others
  const rand = rng(1 + Math.floor(layout() * 2147483000));
  const H = top - base;
  const rows = Math.min(100, Math.max(24, Math.round(H / 2.2))); // (its foot is hidden under the sea of cloud)
  const g = new THREE.CylinderGeometry(r * 0.85, r * 1.15, H, 28, rows, false);
  const pos = g.attributes.position;
  const jitter = new Map(); // keyed by position so seam vertices move together
  const strata = rand.range(2.5, 5);
  const phase = rand() * Math.PI * 2;
  const leanDir = rand() * Math.PI * 2;
  const o = rand() * 100;
  for (let i = 0; i < pos.count; i++) {
    const x0 = pos.getX(i), y0 = pos.getY(i), z0 = pos.getZ(i);
    const key = [x0, y0, z0].map((v) => Math.round(v * 1000) + 0).join(",");
    if (!jitter.has(key)) jitter.set(key, [rand(), rand()]);
    const [j1, j2] = jitter.get(key);
    const k = (y0 + H / 2) / H; // 0 foot → 1 crown
    const yw = base + k * H;
    const theta = Math.atan2(x0, z0);
    const ux = Math.sin(theta), uz = Math.cos(theta);
    const ledge = Math.pow(Math.abs(Math.sin((yw / strata) * Math.PI)), 0.35); // stepped strata
    const bulge = 1 + 0.16 * n(ux * 1.3 + o, yw * 0.035, uz * 1.3) + 0.07 * n(ux * 3 - o, yw * 0.12, uz * 3 + o);
    let s = (1 + 0.12 * Math.sin(theta * 5 + phase) + 0.06 * Math.sin(theta * 11 + phase * 2)
      + 0.1 * (ledge - 0.7) * (0.5 + 0.5 * j2) + (j1 - 0.5) * 0.06) * bulge;
    // the visible part (above the cloud: from 20 m up its foot) carries the taper
    const above = smoothstep(yw, base + 20, top);
    s *= (1 + (taper - 1) * above) * (1 - waist * Math.sin(Math.PI * above) ** 2 + flare * smoothstep(above, 0.72, 0.96));
    const crown = k > crownAt ? Math.sqrt(Math.max(0, 1 - ((k - crownAt) / (1 - crownAt)) ** 2)) : 1;
    const l = lean * H * k * k;
    pos.setXYZ(i, x0 * s * crown + Math.cos(leanDir) * l, y0, z0 * s * crown + Math.sin(leanDir) * l);
  }
  g.computeVertexNormals();
  g.translate(x, base + H / 2, z);
  // where its crown ended up (it leans)
  g.userData.crown = new THREE.Vector3(x + Math.cos(leanDir) * lean * H, top, z + Math.sin(leanDir) * lean * H);
  return g;
}

/** A tube along a curve, thinning from r0 at its root to r1 at its tip. */
function taperedTube(curve, r0, r1, segs = 8, radial = 5) {
  const g = new THREE.TubeGeometry(curve, segs, 1, radial); // unit radius: each ring is scaled below
  const pos = g.attributes.position;
  const c = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    curve.getPointAt(u, c);
    const r = r0 + (r1 - r0) * u;
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      pos.setXYZ(k, c.x + (pos.getX(k) - c.x) * r, c.y + (pos.getY(k) - c.y) * r, c.z + (pos.getZ(k) - c.z) * r);
    }
  }
  g.computeVertexNormals();
  return g;
}

/**
 * A pine on a crown, drawn large enough to read from afar: a leaning trunk thinning as it
 * rises, and two or three flat clouds of needles (clumps, flattened: see landscape/bushes.js).
 */
function crownTree(set, rand, x, y, z, h) {
  const a = rand() * Math.PI * 2;
  const lean = rand.range(0.15, 0.4) * h;
  const at = (t) => new THREE.Vector3(x + Math.cos(a) * lean * t * t, y + h * t, z + Math.sin(a) * lean * t * t);
  const curve = new THREE.CatmullRomCurve3([at(0), at(0.35), at(0.7), at(1)]);
  set.trunks.push(taperedTube(curve, h * 0.05, h * 0.014));
  const tiers = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < tiers; i++) {
    const t = 0.55 + 0.45 * (i / (tiers - 1));
    const b = rand() * Math.PI * 2;
    const off = (1 - t) * h * 0.2;
    set.spots.push({
      p: curve.getPoint(t).add(new THREE.Vector3(Math.cos(b) * off, 0, Math.sin(b) * off)),
      n: new THREE.Vector3(0, 1, 0), up: true,
      size: h * rand.range(0.3, 0.4) * (1.2 - t * 0.4),
      scale: new THREE.Vector3(1.35, 0.42, 1.1),
    });
  }
}

/** A falling ribbon of water in front of a cliff at `at`, facing `toward` (horizontal unit vector). */
function fallGeometry(at, toward, yTop, yBottom, w0, w1) {
  const side = new THREE.Vector3(-toward.z, 0, toward.x);
  const N = 40;
  const positions = [];
  const uvs = [];
  const index = [];
  for (let j = 0; j <= N; j++) {
    const v = j / N; // 0 lip → 1 foot
    const y = yTop + (yBottom - yTop) * v;
    const w = w0 + (w1 - w0) * v;
    const c = at.clone().addScaledVector(toward, 1.2 * Math.sqrt(v)); // it leaps a little clear
    positions.push(c.x - side.x * w / 2, y, c.z - side.z * w / 2, c.x + side.x * w / 2, y, c.z + side.z * w / 2);
    uvs.push(0, v, 1, v);
    if (j < N) index.push(j * 2, j * 2 + 2, j * 2 + 1, j * 2 + 1, j * 2 + 2, j * 2 + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** 天生桥 — a natural stone arch between the crowns of two towers (a, b: their axes), its deck at y. */
function archGeometry(rand, n, a, b, y, depth) {
  const d = new THREE.Vector3().subVectors(b, a).setY(0);
  const L = d.length();
  const top = (u) => 2.2 * Math.sin(Math.PI * u);
  const under = (u) => -14 + 9.5 * Math.pow(Math.sin(Math.PI * u), 0.55);
  const N = 40;
  const shape = new THREE.Shape();
  shape.moveTo(0, under(0));
  for (let i = 0; i <= N; i++) shape.lineTo((i / N) * L, top(i / N));
  for (let i = N; i >= 0; i--) shape.lineTo((i / N) * L, under(i / N));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 4, curveSegments: 1 });
  g.translate(0, 0, -depth / 2);
  // weathered: the rock swells and dents a little
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    pos.setZ(i, pz * (1 + 0.25 * n(px * 0.15, py * 0.2, 3.3)));
    pos.setY(i, py + 0.8 * n(px * 0.2 + 7, pz * 0.3, 1.1));
  }
  g.computeVertexNormals();
  g.rotateY(Math.atan2(-d.z, d.x));
  g.translate(a.x, y, a.z);
  return g;
}

/** A red-crowned crane in flight: neck stretched out ahead, legs trailing behind, slow wingbeats. */
function flyingCrane(mats) {
  const g = new THREE.Group();
  const part = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const tube = (pts, r) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 8, r, 5);
  part(new THREE.SphereGeometry(1, 12, 8).scale(0.3, 0.26, 0.75), mats.white);
  part(new THREE.ConeGeometry(0.22, 0.6, 6).rotateX(-Math.PI / 2), mats.black, 0, 0.02, -0.8); // black tail plumes
  part(tube([[0, 0.05, 0.6], [0, 0.1, 1.15], [0, 0.12, 1.7]], 0.06), mats.black); // neck
  part(new THREE.SphereGeometry(0.11, 8, 6), mats.white, 0, 0.13, 1.8);
  part(new THREE.SphereGeometry(0.06, 6, 4), mats.red, 0, 0.21, 1.78); // the red crown
  part(new THREE.ConeGeometry(0.035, 0.32, 5).rotateX(Math.PI / 2), mats.black, 0, 0.11, 2.02); // beak
  for (const sx of [-1, 1]) part(tube([[sx * 0.08, -0.1, -0.5], [sx * 0.07, -0.13, -1.2], [sx * 0.06, -0.15, -2.0]], 0.03), mats.black); // legs
  // wings: white inner, black flight feathers at the tips; each side flaps at the shoulder and
  // bends again halfway out
  const tri = (pts) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts.flat(), 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Array((pts.length / 3) * 6).fill(0), 2));
    geo.computeVertexNormals();
    return geo;
  };
  const innerGeo = tri([[0, 0, 0.36], [0, 0, -0.42], [1.8, 0, 0.3], [1.8, 0, 0.3], [0, 0, -0.42], [1.8, 0, -0.55]]);
  const outerGeo = tri([[0, 0, 0.3], [0, 0, -0.55], [1.6, 0, -0.05], [1.6, 0, -0.05], [0, 0, -0.55], [1.35, 0, -0.8]]);
  const wings = [-1, 1].map((sx) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(sx * 0.2, 0.08, 0.05);
    shoulder.scale.x = sx;
    shoulder.add(new THREE.Mesh(innerGeo, mats.white));
    const elbow = new THREE.Group();
    elbow.position.x = 1.75;
    elbow.add(new THREE.Mesh(outerGeo, mats.black));
    shoulder.add(elbow);
    g.add(shoulder);
    return { shoulder, elbow, sx };
  });
  return { group: g, wings };
}

export async function build({ scene, P, places, breathe }) {
  const rand = rng(97); // the layout
  const veg = rng(99);  // trees and bushes (their own stream, so they never shift the layout)
  const n = noise3(rng(98));
  const end = P.end;
  const right = new THREE.Vector3(-P.endDir.z, 0, P.endDir.x);
  const at = (side, ahead) => end.clone().addScaledVector(right, side).addScaledVector(P.endDir, ahead);
  const bench = places.bench?.pos ?? end;
  // the canyon is built up to the rim the walk climbs to: everything in it rises with it, as one
  const lift = places.rim ?? 0;
  const sea = lift - 18; // the top of the sea of cloud
  const towerAt = (opts) => towerGeometry(rand, n, { base: lift - 50, ...opts });

  // geometry gathered by how it's inked: near things ink in as you arrive (the far ink reaches
  // ~240 m), far things are always there, pale on the horizon
  const near = { walls: [], towers: [], trunks: [], spots: [] };
  const far = { walls: [], towers: [], trunks: [], spots: [] };
  const NEAR = 220;
  /** bushes all over a rock, above the cloud; and on some crowns a tree or two */
  const clothe = (set, g, { density = 0.04, faces = 0.03, trees = 0, r = 4, size = 5, bare = false } = {}) => {
    const crown = g.userData.crown;
    set.spots.push(...surfaceSpots(g, veg, { density, faces, minY: sea + 9, maxY: bare ? crown.y - 2 : Infinity }));
    // scrub all over its crown (a bare, upward-facing top is left as paper, and reads as a hole)
    const cover = bare ? 0 : Math.max(3, Math.min(16, Math.round((r * r) / 6)));
    for (let i = 0; i < cover; i++) {
      const a = veg() * Math.PI * 2;
      const rr = r * 0.8 * Math.sqrt(veg());
      set.spots.push({ p: new THREE.Vector3(crown.x + Math.cos(a) * rr, crown.y - 0.4, crown.z + Math.sin(a) * rr), n: new THREE.Vector3(0, 1, 0), k: veg.range(0.9, 1.4) });
    }
    for (let i = 0; i < trees; i++) {
      const a = veg() * Math.PI * 2;
      const rr = r * Math.sqrt(veg()) * 0.6;
      crownTree(set, veg, crown.x + Math.cos(a) * rr, crown.y - 0.6, crown.z + Math.sin(a) * rr, size * veg.range(0.8, 1.2));
    }
  };
  const someTrees = (chance) => (veg() < chance ? 1 + Math.floor(veg() * 2) : 0);

  // ---------- the canyon's walls: clusters of fused columns receding along both sides ----------
  let templeSpot = null;
  for (const side of [-1, 1]) {
    for (let k = 0; k < 11; k++) {
      await breathe(); // (the canyon is a lot to build: let the page breathe as it goes)
      const ahead = 34 + k * 42 + rand.range(-10, 10);
      const offset = side * (40 + ahead * 0.34 + rand.range(0, 18)); // the canyon widens away from you
      const r = 14 + k * 2.5 + rand.range(0, 10);
      const top = lift + rand.range(-4, 9) + k * 2.2; // below eye level near you, rising far off
      const p = at(offset, ahead);
      const set = ahead < NEAR ? near : far;
      const treeSize = Math.min(10, 4 + ahead * 0.014);
      const main = towerAt({ x: p.x, z: p.z, r, top, crownAt: 0.985 });
      set.walls.push(main);
      const temple = side < 0 && k === 2;
      if (temple) templeSpot = { p: main.userData.crown, top, r };
      clothe(set, main, { trees: temple ? 0 : someTrees(0.5), r, size: treeSize, bare: temple }); // (the temple's crown stays clear)
      // columns fused to it, standing a little proud of the wall, each its own height
      const columns = 1 + Math.floor(rand() * 3);
      for (let c = 0; c < columns; c++) {
        const a = rand() * Math.PI * 2;
        const cr = r * rand.range(0.35, 0.6);
        const q = p.clone().add(new THREE.Vector3(Math.cos(a) * r * 0.62, 0, Math.sin(a) * r * 0.62));
        const ctop = top + rand.range(-10, 14);
        const col = towerAt({ x: q.x, z: q.z, r: cr, top: ctop, crownAt: 0.975, flare: rand.range(0, 0.15) });
        set.walls.push(col);
        clothe(set, col, { trees: someTrees(0.35), r: cr, size: treeSize * 0.9 });
      }
    }
  }

  // ---------- the stone forest: towers rising out of the cloud, in layers ----------
  // [side, ahead, radius, top, taper]: placed by hand, like a painter composing. A few tall ones
  // stand off to either side near at hand, low ones below you in the middle (their crowns just
  // break the cloud), and they step back paler and paler, leaving a clear way to the sun.
  const TOWERS = [
    // near: framing the view, off to the sides
    [-54, 74, 6, 31, 0.7], [-37, 106, 4.5, 21, 0.75], [57, 86, 6.5, 35, 0.7], [43, 124, 4.5, 18, 0.8],
    // low ones in the middle, below you: their crowns just break the cloud
    [-13, 130, 5.5, 1, 0.85], [19, 176, 6, 8, 0.8],
    // the arch's two towers (the arch is flung between them, below)
    [31, 166, 7.5, 41, 0.8], [63, 184, 9.5, 47, 0.85],
    // the middle distance
    [-43, 238, 10, 57, 0.75], [-82, 270, 12, 81, 0.7], [-27, 302, 7, 39, 0.8],
    [51, 252, 10, 65, 0.75], [94, 290, 13, 91, 0.7], [35, 332, 8, 43, 0.8],
    // far off, palest, framing the sun
    [-64, 386, 15, 92, 0.7], [-114, 436, 19, 122, 0.65], [-49, 486, 13, 72, 0.75],
    [74, 406, 17, 106, 0.7], [125, 466, 21, 136, 0.65], [64, 526, 14, 82, 0.75],
    [-94, 566, 19, 112, 0.7], [106, 586, 19, 117, 0.7],
  ];
  const ARCH = [6, 7]; // the arch's two towers in TOWERS
  const towerAxis = [];
  const towerRadius = [];
  for (const [i, [side, ahead, r, top, taper]] of TOWERS.entries()) {
    await breathe();
    const p = at(side, ahead);
    const set = ahead < NEAR ? near : far;
    const g = towerAt({
      x: p.x, z: p.z, r, top: top + lift, taper, waist: rand.range(0, 0.12), flare: rand.range(0, 0.15), lean: rand.range(0.003, 0.01),
    });
    set.towers.push(g);
    towerAxis.push(p);
    towerRadius.push(r);
    const treeSize = Math.min(11, 4 + ahead * 0.015);
    clothe(set, g, { trees: someTrees(0.55), r: r * taper, size: treeSize });
    // most have lesser columns fused to them, each its own height: stepped, irregular skylines
    if (ARCH.includes(i)) continue; // (but keep the arch's two towers clean)
    const companions = rand() < 0.75 ? 1 + Math.floor(rand() * 2) : 0;
    for (let c = 0; c < companions; c++) {
      const a = rand() * Math.PI * 2;
      const cr = r * rand.range(0.4, 0.65);
      // (seated well into the tower and standing upright, so no sliver of sky opens between them)
      const q = p.clone().add(new THREE.Vector3(Math.cos(a) * r * 0.6, 0, Math.sin(a) * r * 0.6));
      const ctop = lift + top - (top + 24) * rand.range(0.15, 0.55);
      const col = towerAt({ x: q.x, z: q.z, r: cr, top: ctop, taper: rand.range(0.7, 0.9) });
      set.towers.push(col);
      clothe(set, col, { trees: someTrees(0.3), r: cr * 0.7, size: treeSize * 0.85 });
    }
  }

  // ---------- a cliff left of the middle, with a waterfall leaping from it into the cloud ----------
  const FALL = { side: -30, ahead: 150, r: 13, top: lift + 16 };
  const fallCliff = at(FALL.side, FALL.ahead);
  {
    const g = towerAt({ x: fallCliff.x, z: fallCliff.z, r: FALL.r, top: FALL.top, crownAt: 0.985 });
    near.walls.push(g);
    clothe(near, g, { trees: 2, r: FALL.r, size: 6 });
    for (const [a, f, h] of [[2.2, 0.55, 8], [3.6, 0.45, -3]]) { // a shoulder and a lower step beside it
      const q = fallCliff.clone().addScaledVector(right, Math.cos(a) * FALL.r * 0.85).addScaledVector(P.endDir, Math.sin(a) * FALL.r * 0.85);
      const col = towerAt({ x: q.x, z: q.z, r: FALL.r * f, top: FALL.top + h, crownAt: 0.98, taper: 0.85 });
      near.walls.push(col);
      clothe(near, col, { trees: 1, r: FALL.r * f * 0.7, size: 5.5 });
    }
  }

  // ---------- 天生桥: a natural stone arch between two towers on the right ----------
  const archA = towerAxis[ARCH[0]];
  const archB = towerAxis[ARCH[1]];
  const archY = lift + 31;
  const arch = archGeometry(rand, n, archA, archB, archY, 8);
  near.spots.push(...surfaceSpots(arch, veg, { density: 0.2, faces: 0.05 })); // bushes along its back
  {
    const p = archA.clone().lerp(archB, 0.42);
    crownTree(near, veg, p.x, archY + 1.6, p.z, 6); // and a pine
  }

  // ---------- materials ----------
  // The cloud hides the rocks' feet: their ink fades out just above the sea of cloud, to a
  // wandering line, and the billows (below) heap up round them; some feet show through.
  // (glow: their misty, paper-pale parts take on the sun's warm haze, like the sky behind them)
  // (mist: the height above which they're fully clear of it)
  const stone = (cloud, mist) => ({
    climb: 0, grain: 0.3, near: 30, far: 520, minFar: 0.16, mistBase: sea - 2, mist, mistFloor: 0, wash: 1, glow: 0.95, cloud,
  });
  const wallCloud = new THREE.Vector4(sea - 2, 4, 0.5, 0.6); // mist pooled around the walls' feet
  const towerCloud = new THREE.Vector4(lift + 12, 7, 0.7, 0.5); // a belt of cloud through the towers' middles
  const add = (geos, mat) => {
    if (!geos.length) return null;
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.frustumCulled = false;
    scene.add(m);
    return m;
  };
  // near stone is inked darker than far, so the layers step back one behind another
  add(near.walls, mountainMaterial({ ...stone(wallCloud, lift - 5), density: 1.1 }));
  add(far.walls, mountainMaterial({ ...stone(wallCloud, lift - 5), reveal: "global" }));
  add(near.towers, mountainMaterial({ ...stone(towerCloud, lift - 4), density: 1.15 }));
  add(far.towers, mountainMaterial({ ...stone(new THREE.Vector4(lift + 24, 10, 0.7, 0.4), lift - 4), reveal: "global" }));
  add([arch], mountainMaterial({ ...stone(new THREE.Vector4(0, 1, 0, 0), lift - 4), density: 1.15 }));
  // trees and bushes, fading into the cloud like the rock they grow on
  const growth = { near: 30, far: 520, minFar: 0.2, mistBase: sea - 2, mist: lift - 5, mistFloor: 0, glow: 0.6 };
  const trunkInk = (opts) => inkMaterial({
    channel: "far", climb: 0, noiseScale: 0.1, noiseAmp: 0.25, grain: 0.8, sil: 0.5, density: 1.1, shade: 0.5,
    tint: "wood", ...growth, ...opts,
  });
  add(near.trunks, trunkInk());
  add(far.trunks, trunkInk({ reveal: "global", density: 1 }));
  const bushSize = (s) => s.size ?? THREE.MathUtils.clamp(0.8 + s.p.distanceTo(bench) * 0.0075, 0.8, 4.5);
  scene.add(bushMesh(near.spots, veg, bushInk({ channel: "far", ...growth }), bushSize));
  scene.add(bushMesh(far.spots, veg, bushInk({ reveal: "global", density: 1.1, ...growth }), bushSize));

  // the temple stands on a mesa top on the left, a little way out
  if (templeSpot) {
    places.temple.pos.copy(templeSpot.p).setY(templeSpot.top - 0.3); // (its crown, built up with the rest)
    places.temple.faces = end.clone();
  }

  // ---------- the waterfall: from the lip of the cliff left of the middle, down into the cloud ----------
  const toBench = bench.clone().sub(fallCliff).setY(0).normalize();
  const lip = fallCliff.clone().addScaledVector(toBench, FALL.r * 1.06);
  scene.add(new THREE.Mesh(
    fallGeometry(lip, toBench, FALL.top - 1, sea - 2, 1.6, 6.5),
    inkMaterial({
      variant: "waterfall", tint: "water", channel: "far", climb: 0, noiseScale: 0.05, noiseAmp: 0.2,
      near: 40, far: 520, minFar: 0.35, density: 0.85, mistBase: sea - 2, mist: lift - 6, mistFloor: 0, grain: 0.3, sil: 0, rim: 0.3,
      side: THREE.DoubleSide,
    })
  ));
  const falls = [lip.clone().addScaledVector(toBench, 1.5).setY(sea + 4)];

  // ---------- cloud: billowing over the gorge and heaped round the rocks' feet (all of it below
  // your eye, so you look down onto it), thin veils drifting through the far towers, spray
  // where the falls vanish ----------
  createMist(scene, rand, {
    count: 64, size: [20, 48], life: 34, rise: 0.04, grow: 0.5, drift: 6, opacity: 0.55, shadeAmount: 0.32, glow: 0.8, floor: [sea, 6],
    spots: (i, r) => {
      const ahead = r.range(15, 500);
      const p = at(r.range(-1, 1) * (26 + ahead * 0.4), ahead);
      return [p.x, r.range(sea - 3, sea + 6), p.z];
    },
  });
  createMist(scene, rand, {
    count: towerAxis.length * 3, size: [14, 28], life: 26, rise: 0.06, grow: 0.6, drift: 4, opacity: 0.55, shadeAmount: 0.3, glow: 0.8, floor: [sea, 6],
    spots: (i, r) => {
      const k = Math.floor(i / 3);
      const p = towerAxis[k];
      const a = r() * Math.PI * 2;
      const d = towerRadius[k] * 1.3 + 4; // just outside its foot, not cutting through it
      return [p.x + Math.cos(a) * d, r.range(sea, sea + 8), p.z + Math.sin(a) * d];
    },
  });
  createMist(scene, rand, {
    count: 10, size: [30, 56], life: 48, rise: 0.02, grow: 0.4, drift: 10, opacity: 0.2, shadeAmount: 0.15, glow: 0.9, floor: [sea, 6],
    spots: (i, r) => {
      const ahead = r.range(200, 450);
      const p = at((r() < 0.5 ? -1 : 1) * r.range(45, 40 + ahead * 0.35), ahead); // off to the sides, clear of the sun
      return [p.x, lift + r.range(0, 12), p.z];
    },
  });
  createMist(scene, rand, {
    count: falls.length * 6, size: [6, 13], life: 7, rise: 0.6, grow: 1.1, drift: 1.6, opacity: 0.7, shadeAmount: 0.3, floor: [sea, 4],
    spots: (i, r) => {
      const f = falls[i % falls.length];
      return [f.x + r.range(-3, 3), f.y + r.range(-2, 3), f.z + r.range(-3, 3)];
    },
  });

  // ---------- 云海: a sea of cloud filling the canyon, warm where the sun is behind it ----------
  const seaMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1100, 900).rotateX(-Math.PI / 2),
    inkMaterial({
      variant: "clouds", reveal: "global", climb: 0, noiseScale: 0.02, noiseAmp: 0.3, near: 20, far: 600,
      minFar: 0.15, density: 1, sil: 0, tint: "none", sketch: false, side: THREE.DoubleSide, glow: 0.9,
    })
  );
  seaMesh.position.copy(P.brink).addScaledVector(P.endDir, 450).setY(sea); // from the brink outward
  seaMesh.rotation.y = Math.atan2(P.endDir.x, P.endDir.z);
  scene.add(seaMesh);

  // ---------- 鹤 — three cranes gliding in a slow loop across the face of the sun ----------
  const craneInk = (opts) => inkMaterial({
    reveal: "global", climb: 0, noiseAmp: 0, near: 2000, far: 3000, mist: 0.01, grain: 2, tint: "none",
    side: THREE.DoubleSide, ...opts,
  });
  const mats = {
    white: craneInk({ density: 0.12, sil: 1.1, shade: 0.2 }),
    black: craneInk({ density: 1.05, sil: 0.2, shade: 0.5 }),
    red: craneInk({ density: 1, sil: 0, color: SEAL_RED }),
  };
  const centre = at(0, 205).setY(lift + 33);
  const cranes = [0, 1, 2].map((i) => {
    const c = flyingCrane(mats);
    c.group.scale.setScalar(3); // drawn larger than life, as painters do, so they read against the sun
    scene.add(c.group);
    return { ...c, lag: i * 0.045, dy: [0, 3.5, -2.5][i], flapPhase: rand() * 6, glidePhase: rand() * 6 };
  });
  const flight = { rx: 75, rz: 28, period: 110 };
  const pos = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const course = (a, dy, out) => out.copy(centre)
    .addScaledVector(right, Math.cos(a) * flight.rx)
    .addScaledVector(P.endDir, Math.sin(a) * flight.rz)
    .setY(centre.y + dy + Math.sin(a * 2) * 4);

  return {
    bushes: near.spots.length + far.spots.length,
    update(time) {
      for (const c of cranes) {
        const a = (time / flight.period - c.lag) * Math.PI * 2;
        course(a, c.dy, pos);
        course(a + 0.02, c.dy, ahead);
        c.group.position.copy(pos);
        c.group.lookAt(ahead);
        c.group.rotateZ(-0.18); // banking into the long turn
        // slow, deep wingbeats, and now and then a long glide on outstretched wings
        const glide = smoothstep(Math.sin(time * 0.23 + c.glidePhase), 0.1, 0.5);
        const beat = Math.sin(time * 1.7 + c.flapPhase);
        for (const w of c.wings) {
          w.shoulder.rotation.z = -w.sx * (beat * 0.5 * (1 - glide) + 0.04);
          w.elbow.rotation.z = -w.sx * (Math.sin(time * 1.7 + c.flapPhase - 0.6) * 0.35 * (1 - glide) - 0.05);
        }
      }
    },
  };
}
