import * as THREE from "three";
import { STOPS } from "./places.js";

const UP = new THREE.Vector3(0, 1, 0);

/** The stone arch bridge: half its span (m) and how high its hump rises. */
export const BRIDGE = { half: 5.5, hump: 2.2 };
/** Height of the bridge deck `s` metres from its middle (0 beyond its ends). */
export const deckHeight = (s) => BRIDGE.hump * Math.pow(Math.max(0, 1 - (s / BRIDGE.half) ** 2), 0.7);

// The walk itself: one curve through the landscape, plus helpers for placing
// things beside it.
export function makePath() {
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 10),    // the name rock
    new THREE.Vector3(1, 0, -10),   // the koi pond (left)
    new THREE.Vector3(-2, 0, -30),  // the avenue of tablets (Experience)
    new THREE.Vector3(-5, 0, -50),  // the bamboo and its lanterns (Projects)
    new THREE.Vector3(-6, 0, -66),  // out of the bamboo, facing the waterfall
    new THREE.Vector3(0, 0, -80),   // the bridge, the pagoda straight ahead
    new THREE.Vector3(12, 0, -89),  // the pavilion (Resume)
    new THREE.Vector3(23, 0, -97),  // the cliff edge, looking out over the canyon
  ]);
  const pathLen = path.getLength();
  const samples = path.getSpacedPoints(240);

  const distToPath = (x, z) => {
    let m = Infinity;
    for (const p of samples) m = Math.min(m, Math.hypot(p.x - x, p.z - z));
    return m;
  };
  /** The position along the path (0..1) nearest to x, z. */
  const nearestT = (x, z) => {
    let best = 0;
    let bestD = Infinity;
    samples.forEach((p, i) => {
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best / (samples.length - 1);
  };
  const sideAt = (t) => path.getTangentAt(t).cross(UP).normalize();
  /** Rotation about Y that turns local +z to face along the path. */
  const yawAt = (t) => {
    const tg = path.getTangentAt(t);
    return Math.atan2(tg.x, tg.z);
  };

  /** A point beside the path: t along it, `side` metres to the right (negative = left). */
  const at = (t, side = 0) => path.getPointAt(t).addScaledVector(sideAt(t), side);

  // Where the land ends: a cliff 4 m beyond the last step, square to the way you're
  // walking. Beyond it, the canyon (spectacles/vista.js).
  const end = path.getPointAt(1);
  const endDir = path.getTangentAt(1);
  const brink = end.clone().addScaledVector(endDir, 4);
  /** Signed distance past the cliff edge (positive = over the canyon). */
  const cliffDist = (x, z) => (x - brink.x) * endDir.x + (z - brink.z) * endDir.z;
  /** Is x, z off the edge of the cliff (or within `margin` metres of it)? */
  const overCliff = (x, z, margin = 0) => cliffDist(x, z) > -margin;
  /**
   * Pull any part of a (world-space) geometry that reaches out past the cliff back onto land,
   * so a hill never hangs out over the canyon: whatever lies within `soft` metres of the line
   * `margin` metres short of the edge is squeezed up against it, curving into a steep face
   * rather than being sliced flat.
   */
  const keepOnLand = (geometry, margin = 1.5, soft = 3) => {
    const pos = geometry.attributes.position;
    const limit = -margin;
    let moved = false;
    for (let i = 0; i < pos.count; i++) {
      const d = cliffDist(pos.getX(i), pos.getZ(i));
      if (d <= limit - soft) continue;
      const to = limit - soft * Math.exp(-(d - (limit - soft)) / soft); // eases up to the limit, never past it
      pos.setXYZ(i, pos.getX(i) + endDir.x * (to - d), pos.getY(i), pos.getZ(i) + endDir.z * (to - d));
      moved = true;
    }
    if (moved) geometry.computeVertexNormals();
    return geometry;
  };
  /** The z where the land ends for a given x, with a broken, rocky line (±1 m). */
  const edgeZ = (x) =>
    brink.z - (endDir.x / endDir.z) * (x - brink.x) + Math.sin(x * 0.31) * 1.0 + Math.sin(x * 0.83 + 1.7) * 0.5;

  // Areas kept clear for garden features and sight lines (see places.js).
  //   trees:  scattered trees keep out (default)
  //   ground: grass and reeds keep out too (water, the name rock)
  // Random mountains keep out of every reserved area, sight lines included.
  const reserved = [];
  const reserve = (x, z, r, { ground = false, trees = true } = {}) => reserved.push({ x, z, r, ground, trees });
  /** by: "trees" | "grass" | "mountains"; pad: the size of the thing being placed */
  const blocked = (x, z, { by = "trees", pad = 0 } = {}) =>
    reserved.some((c) => {
      if (by === "grass" && !c.ground) return false;
      if (by === "trees" && !c.trees) return false;
      return Math.hypot(c.x - x, c.z - z) < c.r + pad;
    });

  // Extra height for the walker: over the bridge arch and up onto the pavilion platform
  const heightAt = (t) => {
    const arch = deckHeight((t - STOPS.river) * pathLen);
    const sp = Math.abs((t - STOPS.pavilion) * pathLen);
    const platform = 0.35 * (1 - THREE.MathUtils.smoothstep(sp, 4.2, 5.0));
    return arch + platform;
  };

  return {
    path, pathLen, distToPath, nearestT, sideAt, yawAt, heightAt, at,
    end, endDir, cliffDist, overCliff, keepOnLand, edgeZ, reserve, blocked,
  };
}
