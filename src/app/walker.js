import * as THREE from "three";
import { CONFIG } from "../config.js";

// You: scroll / swipe / arrow keys move you along the path and the mouse turns your
// head. As you approach one of your points, your head is nudged gently toward it.
// Stop, and you can crane right round.
export function createWalker({ camera, world, startT = 0, startLook = 0 }) {
  const { path, pathLen, heightAt, markers, bench } = world;
  const W = CONFIG.walk;
  const { lerp, smoothstep, clamp } = THREE.MathUtils;
  const clamp01 = (x) => clamp(x, 0, 1);

  let target = clamp01(startT);
  let progress = target;
  let speed = 0;     // m/s along the path (smoothed, signed)
  let stillFor = 0;  // seconds since you stopped
  let still = 0;     // 0 walking → 1 standing still (eases in)
  let crane = 0;     // -1 craning left … 1 craning right (only while still)
  let nudge = 0;     // radians your head is turned toward a nearby point
  let seated = 0;    // 0 standing → 1 sitting on the bench at the end
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

  // fine control near the centre of the screen; the big turn happens toward the edge
  const shaped = (x) => Math.sign(x) * Math.pow(Math.abs(x), W.lookCurve);

  const up = new THREE.Vector3(0, 1, 0);
  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const right = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const look = new THREE.Vector3();
  const toPoint = new THREE.Vector3();
  const fwd = new THREE.Vector3();

  /**
   * How far to turn toward the nearest point you're approaching: grows as you get
   * closer, and fades smoothly as it passes beside and behind you.
   */
  function nudgeTarget() {
    let best = 0;
    let bestW = 0;
    for (const m of markers) {
      if (!m.nudge) continue;
      toPoint.set(m.pos.x - point.x, 0, m.pos.z - point.z);
      const d = toPoint.length();
      if (d > m.radius) continue;
      // angle from the way the path runs to the point (+ = to the left)
      const a = Math.atan2(tangent.z * toPoint.x - tangent.x * toPoint.z, tangent.x * toPoint.x + tangent.z * toPoint.z);
      const near = 1 - smoothstep(d, m.radius * 0.3, m.radius);
      const ahead = smoothstep(Math.cos(a), -0.3, 0.4);
      const w = m.nudge * near * ahead;
      if (w > bestW) {
        bestW = w;
        best = a * w;
      }
    }
    return best;
  }

  return {
    get progress() { return progress; },
    get speed() { return speed; },
    get still() { return still; },
    get crane() { return crane; },
    get seated() { return seated; },
    point,   // where you are on the path (updated every frame)
    tangent, // which way the path runs
    jumpTo(t) { target = clamp01(t); },

    /** Where your gaze meets the ground (clamped to CONFIG.colour.gazeRange). */
    gazePoint(out) {
      const [near, far] = CONFIG.colour.gazeRange;
      camera.getWorldDirection(fwd);
      if (fwd.y < -0.03) {
        const t = camera.position.y / -fwd.y;
        if (t >= near && t <= far) return out.copy(camera.position).addScaledVector(fwd, t).setY(0);
      }
      // looking level or up (e.g. at the mountains): a spot a comfortable distance out in
      // that direction, close enough to watch the flowers come up
      const t = fwd.y < -0.03 ? clamp(camera.position.y / -fwd.y, near, far) : CONFIG.colour.levelGaze;
      fwd.y = 0;
      fwd.normalize();
      return out.copy(camera.position).addScaledVector(fwd, t).setY(0);
    },

    update(dt) {
      const before = progress;
      progress += (target - progress) * Math.min(1, dt * W.follow);
      if (dt > 0) speed += (((progress - before) * pathLen) / dt - speed) * Math.min(1, dt * 5);

      // standing still? (eases in after a moment; any step snaps you out of it)
      const stopped = Math.abs(speed) < W.stillSpeed && Math.abs(target - progress) * pathLen < 0.3;
      stillFor = stopped ? stillFor + dt : 0;
      const wantStill = stillFor > W.stillAfter ? 1 : 0;
      still += (wantStill - still) * Math.min(1, dt * (wantStill ? 2.5 : 6));

      mouse.sx += (mouse.x - mouse.sx) * Math.min(1, dt * 4);
      mouse.sy += (mouse.y - mouse.sy) * Math.min(1, dt * 4);
      crane = Math.sign(mouse.sx) * still * smoothstep(Math.abs(mouse.sx), 0.3, 0.75);

      path.getPointAt(progress, point);
      path.getTangentAt(progress, tangent);
      right.crossVectors(tangent, up).normalize();
      // at the very end you sit down on the bench (and get up again when you scroll back)
      const wantSit = bench && target > 0.999 && progress > 0.985 ? 1 : 0;
      seated += (wantSit - seated) * Math.min(1, dt * (wantSit ? W.sitEase : 3));
      const sit = seated * seated * (3 - 2 * seated);
      nudge += (nudgeTarget() * (1 - sit) - nudge) * Math.min(1, dt * W.nudgeEase);
      // seated, you turn round to look back the way you came (sweeping past the lone pine
      // on your left), and the mouse can turn you right round to the canyon again
      const range = lerp(lerp(W.lookYaw, W.lookYawStill, still), Math.PI, sit);
      const yaw = nudge + sit * W.sitTurn - shaped(mouse.sx) * range;
      dir.copy(tangent).applyAxisAngle(up, yaw);
      const bob = Math.sin(progress * pathLen * 1.2) * W.bob * (1 - sit); // gentle footsteps

      camera.position.set(point.x, W.eyeHeight + heightAt(progress) + bob, point.z);
      if (sit > 0) {
        camera.position.x = lerp(camera.position.x, bench.x, sit);
        camera.position.z = lerp(camera.position.z, bench.z, sit);
        camera.position.y = lerp(camera.position.y, W.sitHeight, sit);
      }
      // craning: your head leans out toward the side you're looking
      camera.position.addScaledVector(right, crane * W.craneLean).addScaledVector(dir, Math.abs(crane) * 0.12);
      look.copy(camera.position).addScaledVector(dir, 10);
      look.y += -mouse.sy * lerp(W.lookPitch, W.lookPitchStill, still) + W.lookUp;
      camera.lookAt(look);
      camera.rotateZ(-crane * W.craneRoll); // a slight head tilt
    },
  };
}
