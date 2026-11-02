import * as THREE from "three";
import { STOPS, STOP_AT } from "./places.js";

const UP = new THREE.Vector3(0, 1, 0);

/** The stone arch bridge: half its span (m) and how high its hump rises. */
export const BRIDGE = { half: 5.5, hump: 2.2 };
/** Height of the bridge deck `s` metres from its middle (0 beyond its ends). */
export const deckHeight = (s) => BRIDGE.hump * Math.pow(Math.max(0, 1 - (s / BRIDGE.half) ** 2), 0.7);

/** How high the land rises at the canyon's rim, where the lookout is (metres). */
export const RIM = 16;
/** ...over this band, in metres short of the cliff edge: from the foot of the face to the crest */
export const RISE = [-26, -3];
/**
 * The garden's length along the walk (the start to just past the bridge was laid out when the
 * walk was this long): positions in the garden are given as fractions of it (see places.js).
 */
export const GARDEN_LEN = 120.6;

// The walk itself: one curve through the landscape, plus helpers for placing
// things beside it.
export function makePath() {
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 10),    // the entrance
    new THREE.Vector3(1, 0, -10),   // the koi pond (left)
    new THREE.Vector3(-2, 0, -30),  // the avenue of tablets (Experience)
    new THREE.Vector3(-5, 0, -50),  // the bamboo and its lanterns (Projects)
    new THREE.Vector3(-6, 0, -66),  // out of the bamboo, through the pavilion (Resume), facing the waterfall
    new THREE.Vector3(0, 0, -80),   // the bridge, the pagoda straight ahead
    new THREE.Vector3(12, 0, -89),  // past the foot of the pagoda's knoll
    new THREE.Vector3(30, 0, -86),  // east across the meadows, north of the stream
    new THREE.Vector3(46, 0, -73),  // the foot of the rim
    new THREE.Vector3(58, 0, -68),  // stone steps up its face...
    new THREE.Vector3(70, 0, -80),  // ...to the lookout: the canyon ahead, the whole walk behind
  ]);
  const pathLen = path.getLength();
  const samples = path.getSpacedPoints(400);
  // the stops (places.js) as positions along this walk
  for (const [k, g] of Object.entries(STOP_AT)) STOPS[k] = (g * GARDEN_LEN) / pathLen;
  STOPS.painting = 1; // the bench at the end, and the painting you turn round to

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

  // The land: level through the garden, then a short steep face (stone steps climb it) up to a
  // narrow crest RIM metres up (rolling a little along it), with the canyon's cliff beyond. The
  // crest is narrow so that, sitting at its edge, you look straight down into the valley.
  const right = new THREE.Vector3(-endDir.z, 0, endDir.x);
  const roll = (lat) => 1 + 0.22 * (Math.sin(lat * 0.045 + 0.7) - Math.sin(0.7)) + 0.1 * (Math.sin(lat * 0.11 + 2.1) - Math.sin(2.1));
  /** Height of the ground at x, z. */
  const groundAt = (x, z) => {
    const d = cliffDist(x, z);
    if (d < RISE[0]) return 0;
    const lat = (x - brink.x) * right.x + (z - brink.z) * right.z; // metres along the rim
    return RIM * roll(lat) * THREE.MathUtils.smoothstep(d, RISE[0], RISE[1]);
  };
  const rim = groundAt(brink.x, brink.z); // at the lookout
  /** How steep the ground is at x, z (rise over run). */
  const slopeAt = (x, z) => Math.hypot(groundAt(x + 0.5, z) - groundAt(x - 0.5, z), groundAt(x, z + 0.5) - groundAt(x, z - 0.5));

  // Height of the walker's feet: the ground, plus the bridge arch and the pavilion platform
  const onPath = new THREE.Vector3();
  const heightAt = (t) => {
    const arch = deckHeight((t - STOPS.river) * pathLen);
    const sp = Math.abs((t - STOPS.pavilion) * pathLen);
    const platform = 0.35 * (1 - THREE.MathUtils.smoothstep(sp, 4.2, 5.0));
    path.getPointAt(t, onPath);
    return arch + platform + groundAt(onPath.x, onPath.z);
  };

  return {
    path, pathLen, distToPath, nearestT, sideAt, yawAt, heightAt, at,
    end, endDir, brink, cliffDist, overCliff, keepOnLand, groundAt, slopeAt, rim, reserve, blocked,
  };
}
