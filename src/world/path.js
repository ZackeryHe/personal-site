import * as THREE from "three";
import { STOPS } from "./places.js";

const UP = new THREE.Vector3(0, 1, 0);

// The walk itself: one curve through the landscape, plus helpers for placing
// things beside it.
export function makePath() {
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 10),
    new THREE.Vector3(2, 0, -15),
    new THREE.Vector3(-6, 0, -40),
    new THREE.Vector3(-2, 0, -65),
    new THREE.Vector3(8, 0, -90),
    new THREE.Vector3(4, 0, -115),
    new THREE.Vector3(0, 0, -135),
  ]);
  const pathLen = path.getLength();
  const samples = path.getSpacedPoints(240);

  const distToPath = (x, z) => {
    let m = Infinity;
    for (const p of samples) m = Math.min(m, Math.hypot(p.x - x, p.z - z));
    return m;
  };
  const sideAt = (t) => path.getTangentAt(t).cross(UP).normalize();
  /** Rotation about Y that turns local +z to face along the path. */
  const yawAt = (t) => {
    const tg = path.getTangentAt(t);
    return Math.atan2(tg.x, tg.z);
  };

  /** A point beside the path: t along it, `side` metres to the right (negative = left). */
  const at = (t, side = 0) => path.getPointAt(t).addScaledVector(sideAt(t), side);

  // Areas kept clear for garden features and views (see places.js).
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
    const sr = (t - STOPS.river) * pathLen;
    const arch = 1.6 * Math.sqrt(Math.max(0, 1 - (sr / 4.6) ** 2));
    const sp = Math.abs((t - STOPS.pavilion) * pathLen);
    const platform = 0.35 * (1 - THREE.MathUtils.smoothstep(sp, 4.2, 5.0));
    return arch + platform;
  };

  return { path, pathLen, distToPath, sideAt, yawAt, heightAt, at, reserve, blocked };
}
