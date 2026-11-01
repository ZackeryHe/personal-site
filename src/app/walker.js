import * as THREE from "three";
import { CONFIG } from "../config.js";

// You: scroll / swipe / arrow keys move you along the path, the mouse turns your
// head, and the garden's views gently draw your gaze as you pass them.
export function createWalker({ camera, world, startT = 0, startLook = 0 }) {
  const { path, pathLen, heightAt, views } = world;
  const W = CONFIG.walk;
  const clamp01 = (x) => THREE.MathUtils.clamp(x, 0, 1);

  let target = clamp01(startT);
  let progress = target;
  let speed = 0; // m/s along the path (smoothed, signed)
  const mouse = { x: startLook, y: 0, sx: startLook, sy: 0 };
  const walk = (metres) => (target = clamp01(target + metres / pathLen));

  addEventListener("wheel", (e) => walk(e.deltaY * W.wheel), { passive: true });
  addEventListener("keydown", (e) => {
    if (["ArrowUp", "w", "W"].includes(e.key)) walk(W.key);
    if (["ArrowDown", "s", "S"].includes(e.key)) walk(-W.key);
  });
  let touchY = null;
  addEventListener("touchstart", (e) => (touchY = e.touches[0].clientY), { passive: true });
  addEventListener("touchmove", (e) => {
    const y = e.touches[0].clientY;
    walk((touchY - y) * W.touch);
    touchY = y;
  }, { passive: true });
  addEventListener("pointermove", (e) => {
    mouse.x = (e.clientX / innerWidth) * 2 - 1;
    mouse.y = (e.clientY / innerHeight) * 2 - 1;
  });

  const up = new THREE.Vector3(0, 1, 0);
  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const look = new THREE.Vector3();
  const toView = new THREE.Vector3();
  const gazeTarget = new THREE.Vector3();
  const gaze = { w: 0, point: new THREE.Vector3() };

  /** The view (if any) that should draw your eye right now, and how strongly. */
  function strongestView() {
    let best = null;
    let bestW = 0;
    for (const v of views) {
      if (!v.look) continue;
      toView.set(v.pos.x - point.x, 0, v.pos.z - point.z);
      const d = toView.length();
      if (d > v.radius || toView.dot(tangent) < -0.3 * d) continue; // not once it's behind you
      const w = v.look * (1 - THREE.MathUtils.smoothstep(d, v.radius * 0.45, v.radius));
      if (w > bestW) {
        bestW = w;
        best = v;
      }
    }
    return [best, bestW];
  }

  return {
    get progress() { return progress; },
    get speed() { return speed; },
    point,   // where you are on the path (updated every frame)
    tangent, // which way the path runs
    jumpTo(t) { target = clamp01(t); },

    update(dt) {
      const before = progress;
      progress += (target - progress) * Math.min(1, dt * W.follow);
      if (dt > 0) speed += (((progress - before) * pathLen) / dt - speed) * Math.min(1, dt * 5);
      mouse.sx += (mouse.x - mouse.sx) * Math.min(1, dt * 4);
      mouse.sy += (mouse.y - mouse.sy) * Math.min(1, dt * 4);

      path.getPointAt(progress, point);
      path.getTangentAt(progress, tangent);
      dir.copy(tangent).applyAxisAngle(up, -mouse.sx * W.lookYaw);
      const bob = Math.sin(progress * pathLen * 1.2) * W.bob; // gentle footsteps

      camera.position.set(point.x, W.eyeHeight + heightAt(progress) + bob, point.z);
      look.copy(camera.position).addScaledVector(dir, 10);
      look.y += -mouse.sy * W.lookPitch + W.lookUp;

      const [best, bestW] = strongestView();
      if (best) {
        gazeTarget.set(best.pos.x, 1.2, best.pos.z);
        if (gaze.w < 0.01) gaze.point.copy(gazeTarget);
        else gaze.point.lerp(gazeTarget, Math.min(1, dt * 3));
      }
      gaze.w += (bestW - gaze.w) * Math.min(1, dt * 1.5);
      look.lerp(gaze.point, gaze.w);
      camera.lookAt(look);
    },
  };
}
