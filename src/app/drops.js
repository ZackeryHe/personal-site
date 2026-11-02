import * as THREE from "three";
import { CONFIG } from "../config.js";
import { globals, INK } from "../ink/material.js";

// The ink: the opening drop, ink falling from where you stand as you walk (and
// thrown ahead when you hurry), and drops you flick by clicking the ground.
export function createDrops({ field, scene, camera, walker, world, instant = false, inked = false, onFlick = null }) {
  const { path, pathLen } = world;
  const C = CONFIG.ink;
  const I = CONFIG.intro;
  const now = () => globals.uTime.value;

  let introStart = null;
  const lastStep = new THREE.Vector3(Infinity, 0, Infinity);
  const introSpot = new THREE.Vector3();

  const falling = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), new THREE.MeshBasicMaterial({ color: INK }));
  falling.visible = false;
  scene.add(falling);

  /** Add a drop (unless one is already close by) and ripple the ground there. */
  function land(x, z, strength, kind, quick = true) {
    if (field.nearest(x, z) > 3) field.add(x, z, now(), strength, kind, quick);
    globals.uLastDrop.value.set(x, z, now(), strength);
  }

  // click / tap anywhere on the ground to flick ink there
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  addEventListener("click", (e) => {
    if (introStart === null) return;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    ground.constant = -world.groundAt(camera.position.x, camera.position.z);
    for (let k = 0; k < 3; k++) {
      if (!ray.ray.intersectPlane(ground, hit)) return; // clicked the sky
      ground.constant = -world.groundAt(hit.x, hit.z);  // ...then the ground's height there
    }
    if (hit.distanceTo(camera.position) > 160) return;
    land(hit.x, hit.z, C.flick, "flick");
    onFlick?.(hit.x, hit.z, e);
  });

  return {
    get introStart() { return introStart; },

    /** Drop ink at a destination right away, so it's already blooming when you arrive. */
    dropAt(t) {
      if (introStart === null) return;
      const d = path.getPointAt(t);
      if (field.nearest(d.x, d.z) > 3) field.add(d.x, d.z, now(), 1, "walk");
    },

    update(t) {
      const p = walker.point;
      if (introStart === null && (instant || inked)) {
        // dev: pretend the opening happened long ago (?inked: and that you walked the whole way)
        introStart = t - 30;
        field.add(p.x, p.z, t - 30, 1, "walk");
        if (inked) {
          for (let s = 0; s <= pathLen; s += 6) {
            const q = path.getPointAt(s / pathLen);
            if (field.nearest(q.x, q.z) > 3) field.add(q.x, q.z, t - 60, 1, "walk");
          }
        }
        lastStep.copy(p);
      } else if (introStart === null) {
        // the opening: a drop falls just in front of you, lands, and the world blooms
        introSpot.copy(p).addScaledVector(walker.tangent, 5);
        const fallT = (t - (I.blankPaper - I.fall)) / I.fall;
        if (fallT > 0) {
          falling.visible = true;
          falling.position.set(introSpot.x, 3.2 * (1 - fallT * fallT), introSpot.z);
          falling.scale.set(1, 1 + fallT * 0.8, 1); // stretches as it falls
        }
        if (t >= I.blankPaper) {
          falling.visible = false;
          introStart = t;
          field.add(p.x, p.z, t, 1, "walk", false); // the opening drops bloom slowly
          land(introSpot.x, introSpot.z, 1, "walk", false);
          lastStep.copy(p);
        }
      } else if (Math.hypot(p.x - lastStep.x, p.z - lastStep.z) > C.stepEvery) {
        // ink keeps falling from where you stand as you walk...
        lastStep.copy(p);
        if (field.nearest(p.x, p.z) > 2.5) field.add(p.x, p.z, t, 1, "walk");
        // ...and when you hurry it's thrown ahead along the path
        const lead = Math.min(Math.abs(walker.speed) * C.throwAhead, C.maxThrow);
        if (lead > 6) {
          const ta = THREE.MathUtils.clamp(walker.progress + (Math.sign(walker.speed) * lead) / pathLen, 0, 1);
          const a = path.getPointAt(ta);
          if (field.nearest(a.x, a.z) > 5) field.add(a.x, a.z, t, 1, "walk");
        }
      }

      // the distant ranges / sun / birds bloom in, and the sketch races out ahead of the ink
      if (introStart === null) {
        globals.uIntro.value = 0;
        globals.uSketchR.value = 0;
      } else {
        const age = t - introStart;
        globals.uIntro.value = 1 - Math.exp(-age / I.skySweep);
        globals.uSketchR.value = CONFIG.sketchRadius * (1 - Math.exp(-age / I.sketchSweep));
      }
    },
  };
}
