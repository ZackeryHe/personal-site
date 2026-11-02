import * as THREE from "three";
import { CONFIG } from "../config.js";
import { globals } from "../ink/material.js";

// You: scroll / swipe / arrow keys move you along the path and the mouse turns your
// head (on a phone: swipe up or down to walk, drag sideways to look round). As you approach one
// of your points, your head is nudged gently toward it.
// Stop, and you can crane right round.
export function createWalker({ camera, world, startT = 0, startLook = 0 }) {
  const { path, pathLen, heightAt, markers, bench, painting, groundAt, raycastGround, endDir } = world;
  const W = CONFIG.walk;
  const { lerp, smoothstep, clamp } = THREE.MathUtils;
  const clamp01 = (x) => clamp(x, 0, 1);

  let target = clamp01(startT);
  let progress = target;
  let speed = 0;     // m/s along the path (smoothed, signed)
  let walkedAt = -Infinity; // when you last asked to walk (scroll, key, swipe, a jump): ms
  let still = 0;     // 0 walking → 1 standing still (eases in)
  let crane = 0;     // -1 craning left … 1 craning right (only while still)
  let nudge = 0;     // radians your head is turned toward a nearby point
  let seated = 0;    // 0 standing → 1 sitting on the bench at the end
  let anchor = null; // where the mouse was as you sat down: seated, you look around from there
  let framing = 0;   // 0 → 1: the painter's framing (a longer lens, a clearer distance), eased
  let climbing = 0;  // how steeply the way ahead rises (eased): you look up the steps as you climb
  const mouse = { x: startLook, y: 0, sx: startLook, sy: 0 };
  let movedAt = 0;  // when the pointer last moved (ms)
  let fingers = false; // you look about with a finger (dragging), not a mouse
  let satAt = 0;    // when you last sat down (ms)
  const holds = new Map(); // who's holding the view still, and at what gaze, whatever the pointer does (see hold())
  const heldGaze = () => holds.values().next().value ?? null; // (the first to hold it)
  const walk = (metres) => {
    target = clamp01(target + metres / pathLen);
    walkedAt = performance.now();
  };

  addEventListener("wheel", (e) => walk(e.deltaY * W.wheel), { passive: true });
  addEventListener("keydown", (e) => {
    if (["ArrowUp", "w", "W"].includes(e.key)) walk(W.key);
    if (["ArrowDown", "s", "S"].includes(e.key)) walk(-W.key);
  });
  const restAt = { x: startLook, y: 0 }; // where the pointer last came to rest
  const lookAt = (x, y) => {
    mouse.x = x;
    mouse.y = y;
    // (a real move, not the hand's jitter)
    if (Math.abs(mouse.x - restAt.x) + Math.abs(mouse.y - restAt.y) > 0.025) {
      restAt.x = mouse.x;
      restAt.y = mouse.y;
      movedAt = performance.now();
    }
  };
  // a mouse: where it is is where you look
  addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return; // (a finger: see below)
    fingers = false;
    lookAt((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
  });
  // a finger: each swipe either walks or looks, never both. Which is decided as it starts and
  // kept till you lift it: mostly up or down, you walk (as you'd scroll); mostly sideways, you
  // turn your head, as if dragging the view round (a panorama): drag right, you look left
  let touch = null; // { x, y, from, mode: null | "walk" | "look" }
  addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    touch = { x: t.clientX, y: t.clientY, fromX: t.clientX, fromY: t.clientY, mode: null };
  }, { passive: true });
  addEventListener("touchmove", (e) => {
    const t = e.touches[0];
    if (!touch || !t) return;
    if (!touch.mode) {
      const dx = t.clientX - touch.fromX, dy = t.clientY - touch.fromY;
      if (Math.hypot(dx, dy) < W.touchDecide) return; // (not decided yet: nothing moves)
      touch.mode = Math.abs(dy) >= Math.abs(dx) ? "walk" : "look";
    }
    if (touch.mode === "walk") walk((touch.y - t.clientY) * W.touch);
    else {
      // (a finger isn't stopped by the screen's edges: seated, it has as far to go either way
      // from where you sat down, however far round you were looking as you sat)
      fingers = true;
      const [lo, hi] = anchor ? [anchor.x - 1, anchor.x + 1] : [-1, 1];
      lookAt(clamp(mouse.x - ((t.clientX - touch.x) / innerWidth) * W.touchLook, lo, hi), mouse.y);
    }
    touch.x = t.clientX;
    touch.y = t.clientY;
  }, { passive: true });
  const lift = () => (touch = null);
  addEventListener("touchend", lift, { passive: true });
  addEventListener("touchcancel", lift, { passive: true });

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
  /** Signed angle about +Y that turns direction a onto direction b (both horizontal). */
  const angleTo = (a, b) => Math.atan2(a.z * b.x - a.x * b.z, a.x * b.x + a.z * b.z);
  // seated, how far you can turn each way from the painting: right round to the canyon, the short
  // way on one side and the long way round on the other (turning right is a negative angle)
  const toCanyon = painting && endDir ? angleTo(painting.facing, endDir) : Math.PI;
  const turnLeft = toCanyon > 0 ? toCanyon : 2 * Math.PI + toCanyon;
  const turnRight = toCanyon < 0 ? -toCanyon : 2 * Math.PI - toCanyon;

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
    /** Where the pointer says to look (screen −1…1), and how long it's been resting there (s). */
    get gaze() { return { x: mouse.x, y: mouse.y }; },
    get restingFor() { return (performance.now() - movedAt) / 1000; },
    /**
     * Hold the view at a gaze (from `gaze`) whatever the pointer does, or let go (null). `by`:
     * who's holding it (the keepsake, the resume scroll): each lets go of only its own hold.
     */
    hold(g, by = "you") {
      if (g) holds.set(by, g);
      else holds.delete(by);
    },
    /** Finish turning to where you're looking, now (the next update puts the camera there). */
    settleLook() {
      const held = heldGaze();
      mouse.sx = held ? held.x : mouse.x;
      mouse.sy = held ? held.y : mouse.y;
    },
    point,   // where you are on the path (updated every frame)
    tangent, // which way the path runs
    jumpTo(t) {
      target = clamp01(t);
      walkedAt = performance.now();
    },

    /**
     * Where your gaze meets the ground: within CONFIG.colour.gazeRange (sitting up on the rim,
     * right out across the valley below), or a comfortable spot out that way if it's further.
     */
    gazePoint(out) {
      const [near, far] = CONFIG.colour.gazeRange;
      const reach = lerp(far, CONFIG.colour.seatedGaze, seated);
      camera.getWorldDirection(fwd);
      const hit = raycastGround(camera.position, fwd, reach, out);
      if (hit && hit.distanceTo(camera.position) >= near) return hit;
      // looking level or up (e.g. at the mountains), or at the ground at your feet: a spot a
      // comfortable distance out that way, close enough to watch the flowers come up
      fwd.y = 0;
      fwd.normalize();
      out.copy(camera.position).addScaledVector(fwd, hit ? near : CONFIG.colour.levelGaze);
      return out.setY(groundAt(out.x, out.z));
    },

    /** Point a camera at the painting: sitting on the bench, looking back over the walk. */
    paintingView(cam) {
      cam.position.copy(bench).setY(bench.y + W.sitHeight);
      look.copy(cam.position).addScaledVector(painting.facing, 10);
      look.y += 10 * Math.tan(painting.pitch);
      cam.up.set(0, 1, 0);
      cam.lookAt(look);
      cam.fov = painting.fov;
      cam.updateProjectionMatrix();
    },

    update(dt) {
      const before = progress;
      progress += (target - progress) * Math.min(1, dt * W.follow);
      if (dt > 0) speed += (((progress - before) * pathLen) / dt - speed) * Math.min(1, dt * 5);

      // standing still? As soon as you stop scrolling and you've all but glided to a halt (it
      // eases in quickly; any step snaps you out of it)
      const sinceWalked = (performance.now() - walkedAt) / 1000;
      const stopped = sinceWalked > W.stillAfter && Math.abs(target - progress) * pathLen < W.stillSlack;
      const wantStill = stopped ? 1 : 0;
      still += (wantStill - still) * Math.min(1, dt * (wantStill ? W.stillEase : 6));

      const held = heldGaze();
      const gx = held ? held.x : mouse.x;
      const gy = held ? held.y : mouse.y;
      mouse.sx += (gx - mouse.sx) * Math.min(1, dt * 4);
      mouse.sy += (gy - mouse.sy) * Math.min(1, dt * 4);
      // craning: turning your head well to the side (seated: away from the painting)
      const turned = mouse.sx - (anchor ? anchor.x : 0);
      crane = Math.sign(turned) * still * smoothstep(Math.abs(turned), 0.3, 0.75);

      path.getPointAt(progress, point);
      path.getTangentAt(progress, tangent);
      right.crossVectors(tangent, up).normalize();
      // at the very end you sit down on the bench (and get up again when you scroll back)
      const wantSit = bench && target > 0.999 && progress > 0.985 ? 1 : 0;
      if (wantSit && !anchor) {
        anchor = { x: mouse.sx, y: mouse.sy };
        satAt = performance.now();
      }
      seated += (wantSit - seated) * Math.min(1, dt * (wantSit ? W.sitEase : 3));
      if (!wantSit && seated < 0.001) {
        seated = 0; // fully up again: only now let go of where you were looking as you sat
        anchor = null;
        mouse.x = clamp(mouse.x, -1, 1); // (a finger may have taken it further round, seated)
      }
      const sit = seated * seated * (3 - 2 * seated);
      nudge += (nudgeTarget() * (1 - sit) - nudge) * Math.min(1, dt * W.nudgeEase);
      // walking: the path ahead, your head turned by the mouse (and nudged toward your points)
      let yaw = nudge - shaped(mouse.sx) * lerp(W.lookYaw, W.lookYawStill, still);
      // climbing, you look up the steps ahead rather than into the rock in front of you
      const ahead = Math.min(1, progress + 2.5 / pathLen);
      const rise = ahead > progress ? (heightAt(ahead) - heightAt(progress)) / ((ahead - progress) * pathLen) : 0;
      climbing += (Math.max(0, rise) - climbing) * Math.min(1, dt * 3);
      let lookY = -mouse.sy * lerp(W.lookPitch, W.lookPitchStill, still) + W.lookUp + climbing * 10 * W.climbLook;
      if (sit > 0) {
        // seated, you turn round to the painting, the same view wherever you were looking; from
        // there you look around, right round to face the canyon either way. A mouse: either edge
        // of the screen (however far the mouse was from it as you sat down; if it was right by
        // an edge there's little room that way, so held there, it carries you on round). A
        // finger: a screen's width of dragging either way from where you sat.
        if (anchor && !fingers && sit > 0.9 && movedAt > satAt && performance.now() - movedAt < W.sitEdgeFor * 1000) {
          const room = W.sitEdgeRoom, step = dt * W.sitEdgeSlide;
          if (mouse.x > 0.97 && 1 - anchor.x < room) anchor.x = Math.max(anchor.x - step, 1 - room);
          if (mouse.x < -0.97 && 1 + anchor.x < room) anchor.x = Math.min(anchor.x + step, room - 1);
        }
        const ax = anchor?.x ?? 0;
        const ay = anchor?.y ?? 0;
        const dx = mouse.sx - ax;
        const u = fingers
          ? clamp(dx, -1, 1)
          : dx > 0 ? Math.min(1, dx / Math.max(1 - ax, W.sitEdgeRoom)) : Math.max(-1, dx / Math.max(1 + ax, W.sitEdgeRoom));
        const around = u > 0 ? -shaped(u) * turnRight : shaped(-u) * turnLeft;
        yaw = lerp(yaw, angleTo(tangent, painting.facing) + around, sit);
        lookY = lerp(lookY, 10 * Math.tan(painting.pitch) - (mouse.sy - ay) * W.lookPitchStill, sit);
      }
      dir.copy(tangent).applyAxisAngle(up, yaw);
      const bob = Math.sin(progress * pathLen * 1.2) * W.bob * (1 - sit); // gentle footsteps

      camera.position.set(point.x, W.eyeHeight + heightAt(progress) + bob, point.z);
      if (sit > 0) {
        // on the bench, leaning a little toward whatever you look at (so the seat you're sitting
        // on isn't spread across the foot of the view)
        camera.position.x = lerp(camera.position.x, bench.x + dir.x * W.sitLean, sit);
        camera.position.z = lerp(camera.position.z, bench.z + dir.z * W.sitLean, sit);
        camera.position.y = lerp(camera.position.y, bench.y + W.sitHeight, sit);
      }
      // craning: your head leans out toward the side you're looking
      camera.position.addScaledVector(right, crane * W.craneLean * (1 - sit)).addScaledVector(dir, Math.abs(crane) * 0.12 * (1 - sit));
      look.copy(camera.position).addScaledVector(dir, 10);
      look.y += lookY;
      camera.lookAt(look);
      camera.rotateZ(-crane * W.craneRoll * (1 - sit)); // a slight head tilt
      // seated, wherever you rest your eyes it's seen as a painter frames it: a longer lens, the
      // layers drawn closer together, the distance less faded. It settles in slowly as you rest
      // on a view, and eases off again as you look about.
      if (painting) {
        const resting = sit > 0.9 && (performance.now() - movedAt) / 1000 > W.frameRest ? 1 : 0;
        framing += (sit * resting - framing) * Math.min(1, dt * (resting ? W.frameEase : W.frameEase * 3));
        const k = framing * framing * (3 - 2 * framing);
        const fov = lerp(CONFIG.render.fov, painting.fov, k);
        if (Math.abs(camera.fov - fov) > 0.01) {
          camera.fov = fov;
          camera.updateProjectionMatrix();
        }
        globals.uAtmScale.value = lerp(1, painting.clarity, k);
      }
      globals.uSoft.value = sit; // seated, the distant trees soften (ink/post.js)
    },
  };
}
