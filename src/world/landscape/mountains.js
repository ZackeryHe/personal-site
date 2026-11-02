import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { inkMaterial } from "../../ink/material.js";
import { surfaceSpots, bushInk, bushMesh } from "./bushes.js";
import { rng, noise3 } from "../random.js";

const smoothstep = THREE.MathUtils.smoothstep;
/** A smooth maximum: max(a, b) with the crease between them rounded over k (a saddle). */
const smax = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
};

/**
 * A mountain after the old painters (Dong Yuan, Juran, Huang Gongwang, Fan Kuan): a massif of
 * summits run together, its main one slightly peaked, lesser ones around it, and smaller peaks
 * rising out of its ridges so its skyline goes up and down; its flanks concave, flaring out at the
 * foot (not a mound: steep high up, spreading as they come down); rocky ribs and gullies running
 * down from the summit; ledges stepping down some flanks (折带); on some, small boulders crowning
 * the summits (矾头). Built as a radial grid with exact normals, so it's rocky but never jagged;
 * the texture strokes (皴) are painted on by the ink (mountainMaterial's `cun`).
 *   R: the footprint's radius   H: the main summit's height (above the ground)
 *   style: lobes (1–4 summits), summit (1.4 peaked … 2.4 rounded), flare (1 straight … 2.6 concave,
 *          flaring at the foot), peaks (smaller peaks along the ridges), rocky (0–1.3: ribs and
 *          rock masses), terraces (0–0.5), crown (0/1: boulders on the summits),
 *          shoulders ([{ angle, dist, r, h }]: lesser summits placed by hand),
 *          mainAt ({ angle, dist }: where the main summit stands, as a fraction of R),
 *          gully ({ x, z: the way it faces, depth 0–1, width (radians) }: a ravine down one face)
 * Returns the geometry; its userData has heightAt(x, z) and radiusAt(dirX, dirZ, y) (world).
 * Its detail comes from its own random stream (one draw from `rand`), so changing the detail
 * never moves anything else.
 */
export function massifGeometry(rand, x, z, R, H, style = {}) {
  const own = rng(1 + Math.floor(rand() * 2147483000));
  const n = noise3(own);
  const o = [own() * 50, own() * 50, own() * 50];
  const lobeCount = style.lobes ?? 1 + Math.floor(own() * 3);
  const summit = style.summit ?? own.range(1.45, 1.9);
  const flare = style.flare ?? own.range(1.7, 2.4);
  const peakCount = style.peaks ?? 4 + Math.floor(own() * 4);
  const rocky = style.rocky ?? own.range(0.8, 1.15);
  const terraces = style.terraces ?? (own() < 0.4 ? own.range(0.18, 0.36) : 0);
  const crown = style.crown ?? (own() < 0.4 ? 1 : 0);
  const gully = style.gully ?? null;
  /** a summit's profile: t = 0 at its top → 1 at its foot */
  const profile = (t, top, fl) => top * Math.pow(1 - Math.pow(t, summit), fl);

  // the summits: the main one near the middle (or where it's put), lesser ones around it
  const mx = style.mainAt ? Math.cos(style.mainAt.angle) * style.mainAt.dist : own.range(-0.06, 0.06);
  const mz = style.mainAt ? Math.sin(style.mainAt.angle) * style.mainAt.dist : own.range(-0.06, 0.06);
  const lobes = [{ cx: mx * R, cz: mz * R, r: R * own.range(0.62, 0.72), h: H, f: flare }];
  const extra = style.shoulders ?? Array.from({ length: lobeCount - 1 }, () => ({
    angle: own() * Math.PI * 2, dist: own.range(0.32, 0.5), r: own.range(0.32, 0.45), h: own.range(0.42, 0.72),
  }));
  for (const sh of extra) {
    const d = R * sh.dist;
    lobes.push({ cx: Math.cos(sh.angle) * d, cz: Math.sin(sh.angle) * d, r: R * sh.r, h: H * sh.h, f: flare * own.range(0.85, 1.1) });
  }
  const summits = (px, pz) => {
    let h = 0;
    for (const L of lobes) {
      const t = Math.hypot(px - L.cx, pz - L.cz) / L.r;
      if (t < 1) h = smax(h, profile(t, L.h, L.f), H * 0.07);
    }
    return h;
  };
  // smaller peaks rising out of the ridges and shoulders: a little above the slope they stand on
  const peaks = [];
  for (let i = 0; i < peakCount; i++) {
    const a = own() * Math.PI * 2;
    const d = R * own.range(0.08, 0.5); // (some right by the summit: a broken, many-pointed crest)
    const cx = lobes[0].cx + Math.cos(a) * d;
    const cz = lobes[0].cz + Math.sin(a) * d;
    const under = summits(cx, cz);
    if (under < H * 0.14) continue;
    if (gully) { // (none in the ravine)
      const da = Math.atan2(Math.sin(Math.atan2(cz, cx) - Math.atan2(gully.z, gully.x)), Math.cos(Math.atan2(cz, cx) - Math.atan2(gully.z, gully.x)));
      if (Math.abs(da) < gully.width * 1.6) continue;
    }
    peaks.push({ cx, cz, r: R * own.range(0.1, 0.2), h: Math.min(under + H * own.range(0.07, 0.17), H * 1.02) });
  }
  // boulders crowning the summits (矾头): a few small rounded knobs on each
  const knobs = [];
  if (crown) {
    for (const L of lobes) {
      const count = 2 + Math.floor(own() * 3);
      for (let i = 0; i < count; i++) {
        const a = own() * Math.PI * 2;
        const d = L.r * own.range(0.06, 0.24);
        knobs.push({ cx: L.cx + Math.cos(a) * d, cz: L.cz + Math.sin(a) * d, r: R * own.range(0.05, 0.085), h: H * own.range(0.016, 0.03) });
      }
    }
  }
  const ledge = H / own.range(5, 7); // the spacing of the ledges down its flanks

  /** Height of the mountain at (px, pz), relative to its centre. */
  const heightAt = (px, pz) => {
    let h = summits(px, pz);
    if (h <= 0) return 0;
    for (const K of peaks) {
      const t = Math.hypot(px - K.cx, pz - K.cz) / K.r;
      if (t < 1) h = smax(h, profile(t, K.h, 1.6), H * 0.035);
    }
    for (const K of knobs) {
      const t = Math.hypot(px - K.cx, pz - K.cz) / K.r;
      if (t < 1) h += K.h * Math.pow(1 - t * t, 0.7); // (rounded boulders, not points)
    }
    const rr = Math.min(1, Math.hypot(px, pz) / R);
    // rocky ribs and gullies running down from the summit (sharp-crested, like ribs of rock),
    // and rock masses swelling out of the flanks
    const a = Math.atan2(pz - lobes[0].cz, px - lobes[0].cx);
    const ca = Math.cos(a), sa = Math.sin(a);
    const v = n(ca * 2.6 + o[0], rr * 2.4, sa * 2.6 + o[1]);
    const ridged = 1 - Math.sqrt(v * v + 0.006);
    const v2 = n(ca * 6.5 + o[2], rr * 4.5 + 3, sa * 6.5);
    const ribs2 = 1 - Math.sqrt(v2 * v2 + 0.01);
    const masses = n(px / R * 3.2 + o[1], h / H * 2.2 + 5, pz / R * 3.2 - o[2]);
    const down = Math.pow(Math.sin(Math.PI * Math.min(1, rr / 0.93)), 0.7); // none at the summit, nor the foot
    h += H * rocky * ((ridged - 0.74) * 0.16 + (ribs2 - 0.7) * 0.055 + masses * 0.08) * down;
    h *= 1 + 0.08 * n(px / R * 1.4 + 9, 4.2, pz / R * 1.4 - 3);
    // ledges stepping down the flanks (折带): flattish shelves, then steeper drops
    if (terraces > 0) {
      const off = n(px * 0.05 + 7, 1.3, pz * 0.05) * ledge * 0.6;
      const f = (h + off) / ledge;
      const fl = Math.floor(f);
      const fr = f - fl;
      const stepped = (fl + fr * fr * fr * (fr * (fr * 6 - 15) + 10)) * ledge - off;
      h += (stepped - h) * terraces * smoothstep(rr, 0.12, 0.3);
    }
    if (gully) {
      const da = Math.atan2(Math.sin(Math.atan2(pz, px) - Math.atan2(gully.z, gully.x)), Math.cos(Math.atan2(pz, px) - Math.atan2(gully.z, gully.x)));
      h *= 1 - gully.depth * Math.exp(-((da / gully.width) ** 2)) * smoothstep(rr, 0.14, 0.42); // (below the summit)
    }
    return Math.max(0, h);
  };

  // a radial grid: rings out from the middle, the seam's two edges in the same place
  const J = 40;
  const Kn = 112;
  const SINK = 0.6; // (its foot a little below the ground, so no edge shows)
  const positions = new Float32Array((J + 1) * (Kn + 1) * 3);
  const normals = new Float32Array((J + 1) * (Kn + 1) * 3);
  const uvs = new Float32Array((J + 1) * (Kn + 1) * 2);
  const e = 0.3;
  for (let j = 0; j <= J; j++) {
    const r = R * (j / J);
    for (let k = 0; k <= Kn; k++) {
      const phi = ((k % Kn) / Kn) * Math.PI * 2;
      const px = Math.cos(phi) * r;
      const pz = Math.sin(phi) * r;
      const i = j * (Kn + 1) + k;
      positions.set([x + px, heightAt(px, pz) - SINK, z + pz], i * 3);
      // exact normals, from the height's slope (the same on both edges of the seam)
      const gx = (heightAt(px + e, pz) - heightAt(px - e, pz)) / (2 * e);
      const gz = (heightAt(px, pz + e) - heightAt(px, pz - e)) / (2 * e);
      const len = Math.hypot(gx, 1, gz);
      normals.set([-gx / len, 1 / len, -gz / len], i * 3);
      uvs.set([k / Kn, j / J], i * 2); // x: round the mountain, y: from its summit out to its foot
    }
  }
  const index = [];
  for (let j = 0; j < J; j++) {
    for (let k = 0; k < Kn; k++) {
      const a = j * (Kn + 1) + k;
      const b = a + Kn + 1;
      index.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.userData.heightAt = (wx, wz) => heightAt(wx - x, wz - z) - SINK;
  /** How far out from its middle, along (dirX, dirZ), its surface comes down to height y. */
  g.userData.radiusAt = (dirX, dirZ, y) => {
    const at = (r) => heightAt(dirX * r, dirZ * r) - SINK;
    const step = R / 240;
    let r = R;
    while (r > 0 && at(r) < y) r -= step;
    if (r <= 0) return 0;
    let a = r;
    let b = Math.min(R, r + step);
    for (let i = 0; i < 12; i++) {
      const m = (a + b) / 2;
      if (at(m) >= y) a = m;
      else b = m;
    }
    return a;
  };
  return g;
}

/**
 * cloud: (belt height, half-thickness, strength, drift speed)
 * cun: the texture strokes (皴) painted on a massif (massifGeometry's uv: round it, and down it)
 */
export function mountainMaterial(overrides = {}) {
  return inkMaterial({
    channel: "far", climb: 0.004, noiseScale: 0.03, noiseAmp: 0.3, edge: 0.015,
    rimWidth: 0.05, rim: 0.5, near: 40, far: 320, minFar: 0.22, density: 0.9, mist: 18,
    mistFloor: 0, // (their feet fade right away into the mist: they rise out of the ground)
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
export function mountainBushes(geos, { seed, distTo, skip = null, density = 0.05 }) {
  const rand = rng(seed);
  const spots = geos.flatMap((g) => {
    // up the slopes and along the ridges, but not perched on the very summit (it reads as a hat)
    g.computeBoundingBox();
    const { min, max } = g.boundingBox;
    const perVertex = density * Math.min(1, 520 / g.attributes.position.count); // (as many, however finely it's built)
    return surfaceSpots(g, rand, { density: perVertex, faces: 0.04, minY: 8, maxY: max.y - (max.y - min.y) * 0.12, skip, cluster: [1, 3] });
  });
  return bushMesh(spots, rand, bushInk({
    channel: "far", climb: 0.004, noiseScale: 0.03, noiseAmp: 0.3, near: 40, far: 320, minFar: 0.22, mist: 18, mistFloor: 0,
  }), (s) => THREE.MathUtils.clamp(1.2 + distTo(s.p) * 0.012, 1.2, 3.6));
}

// Massifs all around (massifGeometry), merged into one mesh: low and broad, each its own
// arrangement of summits, ridges, ledges and boulders. They follow the "far" ink channel, so the
// opening bloom sweeps across them from where you stand.
export async function build({ scene, P, rng, breathe }) {
  const rand = rng(23);
  const geos = [];
  for (let i = 0; i < 46; i++) {
    await breathe(); // (each massif is a good few ms: let the page breathe between them)
    const x = rand.range(-175, 175);
    const z = rand.range(-155, 45);
    const R = rand.range(26, 46);
    const H = THREE.MathUtils.clamp(R * rand.range(0.5, 0.78), 14, 32); // (low and broad: their flanks flare out at the foot)
    // stay off the path, on solid ground (the canyon has its own pillars, see spectacles/vista.js),
    // and out of the garden's spots and the sight lines (to the waterfall, and from the lookout)
    if (P.distToPath(x, z) < R + 12 || P.cliffDist(x, z) > -R * 1.1) continue;
    if (P.blocked(x, z, { by: "mountains", pad: R * 0.95 })) continue;
    geos.push(Object.assign(massifGeometry(rand, x, z, R, H), { near: P.distToPath(x, z) }));
  }
  // nearest the walk first: they're drawn in this order, so whatever stands behind them (and so
  // is hidden from the walk) is skipped rather than painted and then painted over
  geos.sort((a, b) => a.near - b.near);
  for (const g of geos) P.keepOnLand(g); // (one can reach out toward the canyon's edge)
  // a belt of cloud drifting across their middles; the texture strokes painted on
  const mesh = new THREE.Mesh(mergeGeometries(geos), mountainMaterial({ cloud: new THREE.Vector4(17, 4, 0.75, 1), cun: 1 }));
  mesh.frustumCulled = false;
  scene.add(mesh);
  // and the dabs of brush that stand for the trees and scrub on them
  scene.add(mountainBushes(geos, { seed: 24, distTo: (p) => P.distToPath(p.x, p.z) }));
}
