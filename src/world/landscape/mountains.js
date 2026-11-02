import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { inkMaterial } from "../../ink/material.js";
import { surfaceSpots, bushInk, bushMesh } from "./bushes.js";
import { rng } from "../random.js";

/**
 * One shan shui peak: steep, bulging profile with vertical folds. Base sits at y = -2,
 * the summit at y = h - 2 (directly above x, z when lean = 0).
 * gully: optional ravine cut into one face, { angle (atan2(dx, dz)), depth 0–1, width (radians) }
 */
export function peakGeometry(rand, x, z, r, h, lean = rand.range(-1, 1), gully = null) {
  const g = new THREE.ConeGeometry(r, h, 28, 16);
  const pos = g.attributes.position;
  const jitter = new Map(); // keyed by position so seam vertices move together (no cracks)
  const folds = 4 + Math.floor(rand() * 4);
  const phase = rand() * Math.PI * 2;
  for (let i = 0; i < pos.count; i++) {
    const x0 = pos.getX(i), y0 = pos.getY(i), z0 = pos.getZ(i);
    const key = [x0, y0, z0].map((v) => Math.round(v * 1000) + 0).join(","); // +0 folds -0 into 0
    if (!jitter.has(key)) jitter.set(key, [rand(), rand()]);
    const [j1, j2] = jitter.get(key);
    const k = (y0 + h / 2) / h; // 0 base → 1 peak
    const rest = 1 - k;
    const theta = Math.atan2(x0, z0);
    const bulge = rest > 1e-4 ? Math.pow(rest, 0.55) / rest : 0; // steep, rounded profile
    const fold = 1 + 0.16 * Math.sin(theta * folds + phase + k * 2) * (0.25 + rest);
    const rough = 1 + (j1 - 0.5) * 0.3 * (0.3 + rest);
    let s = bulge * fold * rough;
    if (gully) {
      const d = Math.atan2(Math.sin(theta - gully.angle), Math.cos(theta - gully.angle));
      s *= 1 - gully.depth * Math.exp(-((d / gully.width) ** 2));
    }
    const dy = rest > 1e-4 ? (j2 - 0.5) * h * 0.04 : 0; // keep the summit exact
    pos.setXYZ(i, x0 * s + lean * k * k * h * 0.2, y0 + dy, z0 * s);
  }
  g.computeVertexNormals();
  g.translate(x, h / 2 - 2, z);
  return g;
}

/** cloud: (belt height, half-thickness, strength, drift speed) */
export function mountainMaterial(overrides = {}) {
  return inkMaterial({
    channel: "far", climb: 0.004, noiseScale: 0.03, noiseAmp: 0.3, edge: 0.015,
    rimWidth: 0.05, rim: 0.5, near: 40, far: 320, minFar: 0.22, density: 0.9, mist: 18,
    grain: 0.12, wash: 1, dots: 0.9, tint: "mountain",
    cloud: new THREE.Vector4(30, 6, 0.85, 1),
    ...overrides,
  });
}

/**
 * Bushes (dabs of brush) over mountain geometry, inked in with the mountains themselves.
 *   geos: their geometries (world space)   distTo(p): metres from where they're seen, to size them
 *   skip(p): leave a spot bare (e.g. the waterfall's ravine)
 */
export function mountainBushes(geos, { seed, distTo, skip = null, density = 0.03 }) {
  const rand = rng(seed);
  const spots = geos.flatMap((g) => {
    // up the slopes and along the ridges, but not perched on the very summit (it reads as a hat)
    g.computeBoundingBox();
    const { min, max } = g.boundingBox;
    return surfaceSpots(g, rand, { density, faces: 0.04, minY: 8, maxY: max.y - (max.y - min.y) * 0.12, skip, cluster: [1, 3] });
  });
  return bushMesh(spots, rand, bushInk({
    channel: "far", climb: 0.004, noiseScale: 0.03, noiseAmp: 0.3, near: 40, far: 320, minFar: 0.22, mist: 18,
  }), (s) => THREE.MathUtils.clamp(1.2 + distTo(s.p) * 0.012, 1.2, 3.6));
}

// Clusters of peaks all around, merged into one mesh. They follow the "far" ink
// channel, so the opening bloom sweeps across them from where you stand.
export function build({ scene, P, rng }) {
  const rand = rng(23);
  const geos = [];
  for (let i = 0; i < 60; i++) {
    const x = rand.range(-170, 170);
    const z = rand.range(-150, 40);
    const r = rand.range(14, 32);
    const h = rand.range(28, 85);
    // stay off the path, on solid ground (the canyon has its own pillars, see spectacles/vista.js),
    // and out of the garden's spots and the sight line to the waterfall
    if (P.distToPath(x, z) < 40 || P.cliffDist(x, z) > -r * 1.3) continue;
    if (P.blocked(x, z, { by: "mountains", pad: r * 1.2 })) continue;
    geos.push(peakGeometry(rand, x, z, r, h));
    // shoulders around the main peak
    const shoulders = 1 + Math.floor(rand() * 3);
    for (let s = 0; s < shoulders; s++) {
      const a = rand() * Math.PI * 2;
      const d = r * rand.range(0.5, 0.95);
      geos.push(peakGeometry(rand, x + Math.cos(a) * d, z + Math.sin(a) * d, r * rand.range(0.5, 0.8), h * rand.range(0.4, 0.75)));
    }
  }
  for (const g of geos) P.keepOnLand(g); // (a shoulder can reach further than its peak)
  const mesh = new THREE.Mesh(mergeGeometries(geos), mountainMaterial());
  mesh.frustumCulled = false;
  scene.add(mesh);
  // and the dabs of brush that stand for the trees and scrub on them
  scene.add(mountainBushes(geos, { seed: 24, distTo: (p) => P.distToPath(p.x, p.z) }));
}
