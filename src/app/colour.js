import * as THREE from "three";
import { CONFIG } from "../config.js";
import { globals, inkMaterial } from "../ink/material.js";
import { InkField } from "../ink/field.js";
import { butterfly, flutterAround } from "../world/garden/creatures.js";
import { rng } from "../world/random.js";

// 设色 — the colour stage. Painters lay in colour last, after the outline and the ink.
// Stand still and crane your head to the side, and colour blooms where you look:
// mineral blue-green on the mountains, green leaves, a spring wash on the ground,
// flowers springing up, butterflies arriving. What you colour stays coloured.

const PETALS = ["#d9455a", "#f19bb0", "#f2c14e", "#8f6fc8", "#f6f1e6"].map((c) => new THREE.Color(c));
const LEAF = new THREE.Color("#2f5a3a");
const WINGS = ["#c99a3a", "#d9455a", "#161a21", "#7a9ac8"].map((c) => new THREE.Color(c));
const BRUSH = ["#5f9a6e", "#d9455a", "#3f7f9a", "#c99a3a"]; // what the brush tip is loaded with, bloom by bloom

const easeOutBack = (x) => {
  const c1 = 1.70158;
  return 1 + (c1 + 1) * (x - 1) ** 3 + c1 * (x - 1) ** 2;
};

export function createColour({ renderer, scene, walker, world }) {
  const C = CONFIG.colour;
  const rand = rng(101);
  const clamp01 = (x) => THREE.MathUtils.clamp(x, 0, 1);

  // where colour has bloomed: a second ink field (near things, far things)
  const field = new InkField(renderer, {
    reach: [C.reach[0], C.reach[1], C.reach[0]],
    grow: [C.grow[0], C.grow[1], C.grow[0]],
    quick: 1,
  });
  globals.tColour.value = field.texture;

  // ---------- flowers that spring up where colour lands ----------
  const plantInk = (color, extra = {}) => inkMaterial({
    reveal: "global", tint: "none", climb: 0, noiseAmp: 0, near: 6, far: 60, minFar: 0.2,
    mist: 0.01, grain: 3, sil: 0, sway: 0.04, color, side: THREE.DoubleSide, ...extra,
  });
  const N = C.maxSprouts;
  const stems = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.012, 0.018, 1, 4).translate(0, 0.5, 0), plantInk(LEAF, { density: 0.85 }), N);
  const leaves = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.04, 0.3, 3).translate(0, 0.15, 0), plantInk(LEAF, { density: 0.9 }), N * 2);
  // a flower: five rounded petals, gently cupped
  const flowerGeo = (() => {
    const shape = new THREE.Shape();
    const R = 0.12;
    for (let i = 0; i <= 80; i++) {
      const a = (i / 80) * Math.PI * 2;
      const r = R * (0.3 + 0.7 * Math.pow(Math.abs(Math.cos(2.5 * a)), 0.7));
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const g = new THREE.ShapeGeometry(shape, 1).rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const rr = Math.hypot(pos.getX(i), pos.getZ(i)) / R;
      pos.setY(i, rr * rr * 0.05);
    }
    g.computeVertexNormals();
    return g;
  })();
  const heads = PETALS.map((col) => new THREE.InstancedMesh(flowerGeo, plantInk(col, { density: 0.8, shade: 0.3 }), N));
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const meshes = [stems, leaves, ...heads];
  for (const m of meshes) {
    for (let i = 0; i < m.count; i++) m.setMatrixAt(i, hidden);
    m.frustumCulled = false;
    scene.add(m);
  }

  const sprouts = new Array(N).fill(null); // ring buffer, slot = index
  let nextSlot = 0;
  function addSprout(x, z, born, viewer) {
    const slot = nextSlot;
    nextSlot = (nextSlot + 1) % N;
    const old = sprouts[slot];
    if (old) heads[old.c].setMatrixAt(slot, hidden); // recycled: hide its old flower
    sprouts[slot] = {
      slot, x, z, born, settled: false,
      h: rand.range(0.3, 0.7), size: rand.range(0.8, 1.2), c: Math.floor(rand() * PETALS.length),
      tiltX: rand.range(-0.25, 0.25), tiltZ: rand.range(-0.25, 0.25), yaw: rand() * Math.PI * 2,
      faceX: rand.range(0.5, 1.0), faceYaw: Math.atan2(viewer.x - x, viewer.z - z), // flowers open toward you
    };
  }

  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const tip = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const m4 = new THREE.Matrix4();
  function place(s, now) {
    const g = Math.max(1e-3, easeOutBack(clamp01((now - s.born) / 1.3))); // springs up, overshoots
    pos.set(s.x, 0, s.z);
    q.setFromEuler(e.set(s.tiltX, s.yaw, s.tiltZ, "YXZ"));
    stems.setMatrixAt(s.slot, m4.compose(pos, q, scl.set(1, s.h * g, 1)));
    for (let j = 0; j < 2; j++) {
      q2.setFromEuler(e.set(j ? 0.9 : -0.9, s.yaw + j * 1.7, 0, "YXZ"));
      leaves.setMatrixAt(s.slot * 2 + j, m4.compose(pos, q2, scl.setScalar(g * s.size)));
    }
    tip.set(0, s.h * g, 0).applyQuaternion(q).add(pos);
    q2.setFromEuler(e.set(s.faceX, s.faceYaw, 0, "YXZ"));
    heads[s.c].setMatrixAt(s.slot, m4.compose(tip, q2, scl.setScalar(g * s.size * 1.2)));
  }

  // ---------- butterflies that come to the new flowers ----------
  const flies = Array.from({ length: C.butterflies }, (_, i) => {
    const b = butterfly(rand, WINGS[i % WINGS.length], { reveal: "global", tint: "none" });
    b.group.visible = false;
    b.center = new THREE.Vector3();
    b.radius = 2;
    scene.add(b.group);
    return b;
  });
  let nextFly = 0;

  // ---------- blooms: colour comes in faint where you look, and fills in as you keep looking ----------
  const FAINT = 0.12; // how faint a new bloom starts
  const blooms = [];  // { i (field drop), x, z, strength, sprouted, butterflies, colour }
  let active = null;  // the bloom you're looking at right now
  const splashes = []; // blooms from ink you've flicked, still filling in

  function startBloom(x, z, now, { target = 1, splash = false } = {}) {
    if (!field.add(x, z, now, FAINT, "flick", false)) return null; // "flick": recycled if the pool fills
    const i = field.lastIndex;
    const reused = blooms.findIndex((b) => b.i === i); // the pool wrapped round: forget the old one
    if (reused >= 0) blooms.splice(reused, 1);
    globals.uLastDrop.value.set(x, z, now, 0.5); // a ripple where the colour lands
    const b = { i, x, z, strength: FAINT, target, splash, sprouted: 0, butterflies: splash, colour: BRUSH[blooms.length % BRUSH.length] };
    blooms.push(b);
    return b;
  }

  function nearestBloom(x, z, within) {
    let best = null;
    let bestD = within;
    for (const b of blooms) {
      const d = Math.hypot(b.x - x, b.z - z);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  function fill(b, now, dt) {
    if (b.strength < b.target) {
      b.strength = Math.min(b.target, b.strength + dt / (b.splash ? C.fill * 0.5 : C.fill));
      field.setStrength(b.i, b.strength);
    }
    // flowers come up from the middle outward as the colour fills in...
    const want = Math.round(b.strength * C.sproutsPerBloom);
    for (let tries = 0; b.sprouted < want && tries < 6; tries++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * C.sproutSpread * Math.sqrt(b.strength);
      const sx = b.x + Math.cos(a) * r;
      const sz = b.z + Math.sin(a) * r;
      if (world.distToPath(sx, sz) < 1.3 || world.blocked(sx, sz, { by: "grass" })) continue; // not on the path or water
      if (world.overCliff(sx, sz, 0.6)) continue; // nor out over the canyon, where there's no ground
      addSprout(sx, sz, now, walker.point);
      b.sprouted++;
    }
    // ...and butterflies come once it's well under way (to blooms on solid ground)
    if (!b.butterflies && b.strength > 0.45) {
      b.butterflies = true;
      if (world.overCliff(b.x, b.z, 1)) return;
      for (let j = 0; j < 2; j++) {
        const f = flies[nextFly++ % flies.length];
        f.center.set(b.x, 0, b.z);
        f.radius = rand.range(1.2, 2.6);
        f.group.visible = true;
      }
    }
  }

  const gaze = new THREE.Vector3();
  return {
    /** how many blooms you've started */
    get blooms() { return blooms.filter((b) => !b.splash).length; },

    /** A splat of ink lets a little colour bleed out where it lands (and a few flowers). */
    splash(x, z, now) {
      if (nearestBloom(x, z, 2)) return;
      const b = startBloom(x, z, now, { target: C.splash, splash: true });
      if (b) splashes.push(b);
    },
    /** 0–1: how full the bloom you're looking at is (0 when you're not colouring) */
    get charge() { return active ? active.strength : 0; },
    /** the colour the brush is loaded with right now */
    get colour() { return active ? active.colour : null; },

    /** ready: false until the opening has played */
    update(now, dt, ready) {
      const craning = ready && walker.still > 0.5 && Math.abs(walker.crane) > C.crane;
      if (craning) {
        walker.gazePoint(gaze);
        // looked somewhere new? colour starts coming in there (or carries on, if it's begun there before)
        if (!active || Math.hypot(gaze.x - active.x, gaze.z - active.z) > C.spacing) {
          active = nearestBloom(gaze.x, gaze.z, C.spacing) ?? startBloom(gaze.x, gaze.z, now);
        }
        if (active) fill(active, now, dt);
      } else {
        active = null;
      }
      // splashes fill in by themselves, a little way
      for (let i = splashes.length - 1; i >= 0; i--) {
        fill(splashes[i], now, dt);
        if (splashes[i].strength >= splashes[i].target) splashes.splice(i, 1);
      }
      field.update(now);

      let changed = false;
      for (const s of sprouts) {
        if (!s || s.settled) continue;
        place(s, now);
        changed = true;
        if (now - s.born > 1.6) s.settled = true;
      }
      if (changed) for (const m of meshes) m.instanceMatrix.needsUpdate = true;
      for (const b of flies) if (b.group.visible) flutterAround(b, now);
    },
  };
}
