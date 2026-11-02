import * as THREE from "three";
import { inkMaterial } from "../../ink/material.js";

// Helpers shared by the far-off spectacles.

/** Horizontal unit vector from a place toward the point it faces, plus its right-hand side. */
export function facing(place) {
  const dir = place.faces.clone().sub(place.pos).setY(0).normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  return { dir, side };
}

/** Ink for distant built things / trees: follows the far ink channel like the mountains. */
export function farInk(opts = {}) {
  return inkMaterial({
    channel: "far", climb: 0.004, noiseScale: 0.08, noiseAmp: 0.25, near: 40, far: 320, minFar: 0.3,
    density: 0.95, mist: 0.01, grain: 0.5, shade: 0.25, sil: 0.8, side: THREE.DoubleSide,
    ...opts,
  });
}
