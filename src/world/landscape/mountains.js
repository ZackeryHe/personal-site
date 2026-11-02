import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { inkMaterial } from "../../ink/material.js";
import { surfaceSpots, bushInk, bushMesh } from "./bushes.js";
import { rng, noise3 } from "../random.js";

/**
 * One shan shui peak: a steep profile with long, soft folds running down it (ridges and gullies,
 * like hemp-fibre strokes), swelling gently, its foot spreading into a smooth skirt where it meets
 * the ground. Base at y = -2, summit at y = h - 2 (above x, z when lean = 0). Its detail comes from
 * its own random stream (one draw from `rand`), so changing the detail never moves anything else.
 *   gully: a ravine cut into one face, { angle (atan2(dx, dz)), depth 0–1, width (radians) }
 *   style: { profile: 0.4 (blunt, bulging) … 0.85 (straight-sided),
 *            shoulder: 0–0.35 (a buttress bulging out partway up one side) }
 */
export function peakGeometry(rand, x, z, r, h, lean = rand.range(-1, 1), gully = null, style = {}) {
  const own = rng(1 + Math.floor(rand() * 2147483000));
  const n = noise3(own);
  const profile = style.profile ?? 0.55;
  const shoulder = style.shoulder ?? 0;
  const shoulderAt = own() * Math.PI * 2;
  const shoulderK = own.range(0.3, 0.55);
  const o = [own() * 50, own() * 50];
  const g = new THREE.ConeGeometry(r, h, 56, 34);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x0 = pos.getX(i), y0 = pos.getY(i), z0 = pos.getZ(i);
    const k = (y0 + h / 2) / h; // 0 base → 1 summit
    const rest = 1 - k;
    if (rest < 1e-4) {
      pos.setXYZ(i, lean * h * 0.2, y0, 0); // the summit
      continue;
    }
    const theta = Math.atan2(x0, z0);
    const cx = Math.cos(theta), cz = Math.sin(theta);
    // long folds running down it, and slower swellings: smooth, so its silhouette and its foot
    // are drawn in long strokes rather than jagged
    const folds = 0.17 * n(cx * 2.6 + o[0], k * 1.1, cz * 2.6 + o[1])
                + 0.08 * n(cx * 6.5 + o[1], k * 2.2 + 7, cz * 6.5)
                + 0.03 * n(cx * 15 - o[0], k * 4 + 3, cz * 15);
    const swell = 0.08 * n(cx * 1.1 + 13, k * 0.6, cz * 1.1 - 4);
    let s = (Math.pow(rest, profile) / rest) * (1 + (folds + swell) * (0.35 + 0.65 * Math.min(1, rest * 1.6)));
    s *= 1 + 0.16 * (1 - THREE.MathUtils.smoothstep(k, 0, 0.18)); // the foot spreads into a soft skirt
    if (shoulder > 0) {
      const d = Math.atan2(Math.sin(theta - shoulderAt), Math.cos(theta - shoulderAt));
      s *= 1 + shoulder * Math.exp(-((d / 0.75) ** 2)) * Math.exp(-(((k - shoulderK) / 0.17) ** 2));
    }
    if (gully) {
      const d = Math.atan2(Math.sin(theta - gully.angle), Math.cos(theta - gully.angle));
      s *= 1 - gully.depth * Math.exp(-((d / gully.width) ** 2));
    }
    pos.setXYZ(i, x0 * s + lean * k * k * h * 0.2, y0, z0 * s);
  }
  // one smooth surface: the seam where the cone wraps round (and its summit) joined up, so no
  // crease runs down it in the shading
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  const m = mergeVertices(g, 1e-4);
  m.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(m.attributes.position.count * 2), 2));
  m.computeVertexNormals();
  m.translate(x, h / 2 - 2, z);
  return m;
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
    const perVertex = density * Math.min(1, 520 / g.attributes.position.count); // (as many, however finely it's built)
    return surfaceSpots(g, rand, { density: perVertex, faces: 0.04, minY: 8, maxY: max.y - (max.y - min.y) * 0.12, skip, cluster: [1, 3] });
  });
  return bushMesh(spots, rand, bushInk({
    channel: "far", climb: 0.004, noiseScale: 0.03, noiseAmp: 0.3, near: 40, far: 320, minFar: 0.22, mist: 18,
  }), (s) => THREE.MathUtils.clamp(1.2 + distTo(s.p) * 0.012, 1.2, 3.6));
}

// the shapes a peak can take: blunt and bulging, the classic steep dome, a little straighter
const PROFILES = [0.42, 0.52, 0.6, 0.68];

// Clusters of peaks all around, merged into one mesh. They follow the "far" ink
// channel, so the opening bloom sweeps across them from where you stand. No two alike: each
// takes its own shape (PROFILES), some with a buttress partway up, and the peaks around a main
// one are clearly lower, and shaped differently, from it.
export function build({ scene, P, rng }) {
  const rand = rng(23);
  const geos = [];
  const shape = (not = -1) => {
    let i = Math.floor(rand() * PROFILES.length);
    if (i === not) i = (i + 1 + Math.floor(rand() * (PROFILES.length - 1))) % PROFILES.length;
    return i;
  };
  for (let i = 0; i < 60; i++) {
    const x = rand.range(-170, 170);
    const z = rand.range(-150, 40);
    const r = rand.range(14, 32);
    const h = 24 + 64 * Math.pow(rand(), 1.4); // more low ones than tall
    // stay off the path, on solid ground (the canyon has its own pillars, see spectacles/vista.js),
    // and out of the garden's spots and the sight lines (to the waterfall, and from the lookout)
    if (P.distToPath(x, z) < 40 || P.cliffDist(x, z) > -r * 1.3) continue;
    if (P.blocked(x, z, { by: "mountains", pad: r * 1.2 })) continue;
    const main = shape();
    geos.push(peakGeometry(rand, x, z, r, h, rand.range(-1, 1), null, {
      profile: PROFILES[main], shoulder: rand() < 0.45 ? rand.range(0.15, 0.32) : 0,
    }));
    // lesser peaks around it
    const shoulders = 1 + Math.floor(rand() * 3);
    for (let s = 0; s < shoulders; s++) {
      const a = rand() * Math.PI * 2;
      const d = r * rand.range(0.55, 1.0);
      geos.push(peakGeometry(rand, x + Math.cos(a) * d, z + Math.sin(a) * d, r * rand.range(0.45, 0.75), h * rand.range(0.32, 0.62),
        rand.range(-1, 1), null, { profile: PROFILES[shape(main)] }));
    }
  }
  for (const g of geos) P.keepOnLand(g); // (a shoulder can reach further than its peak)
  const mesh = new THREE.Mesh(mergeGeometries(geos), mountainMaterial());
  mesh.frustumCulled = false;
  scene.add(mesh);
  // and the dabs of brush that stand for the trees and scrub on them
  scene.add(mountainBushes(geos, { seed: 24, distTo: (p) => P.distToPath(p.x, p.z) }));
}
