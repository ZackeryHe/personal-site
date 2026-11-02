import * as THREE from "three";
import { inkMaterial } from "../../ink/material.js";

// Small lives along the way that react to you. Birds fly down to peck at the ground
// ahead of you and scatter when you get close; rabbits sit up in the grass, then bolt.
// They always settle somewhere ahead of where you are.

const FLOCKS = 3;
const UPV = new THREE.Vector3(0, 1, 0);
const BIRDS_PER_FLOCK = 4;
const RABBITS = 3;

export function build({ scene, P, rng }) {
  const rand = rng(103);
  const ink = (opts) => inkMaterial({
    reveal: "global", tint: "none", climb: 0, noiseAmp: 0, near: 6, far: 70, minFar: 0.2,
    mist: 0.01, grain: 2.5, sil: 0.6, shade: 0.45, side: THREE.DoubleSide, ...opts,
  });
  const dark = ink({ density: 1.0 });
  const pale = ink({ density: 0.14, sil: 1.1, shade: 0.15 });   // white, with an ink outline
  const tan = ink({ density: 0.42, wash: 1.4, sil: 1.0, shade: 0.35 });
  const part = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    return m;
  };

  // ---------- birds: magpie-ish, black with a white belly ----------
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.05, 0.2, 0, -0.03, 0.03, 0, -0.11], 3));
  wingGeo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 2));
  wingGeo.computeVertexNormals();
  function bird() {
    const g = new THREE.Group();
    const body = new THREE.Group(); // tilts to peck
    body.add(part(new THREE.SphereGeometry(1, 10, 8).scale(0.07, 0.065, 0.13), dark, 0, 0.12, 0));
    body.add(part(new THREE.SphereGeometry(1, 8, 6).scale(0.05, 0.045, 0.09), pale, 0, 0.1, 0.02));
    body.add(part(new THREE.SphereGeometry(0.05, 8, 6), dark, 0, 0.18, 0.11));
    const beak = part(new THREE.ConeGeometry(0.013, 0.05, 4), dark, 0, 0.175, 0.17);
    beak.rotation.x = Math.PI / 2;
    body.add(beak);
    const tail = part(new THREE.BoxGeometry(0.045, 0.01, 0.2), dark, 0, 0.14, -0.19);
    tail.rotation.x = -0.35;
    body.add(tail);
    const wl = new THREE.Mesh(wingGeo, dark);
    const wr = new THREE.Mesh(wingGeo, dark);
    wl.position.set(0.04, 0.14, 0);
    wr.position.set(-0.04, 0.14, 0);
    wr.scale.x = -1;
    body.add(wl, wr);
    g.add(body);
    for (const sx of [-0.025, 0.025]) g.add(part(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 3), dark, sx, 0.035, 0));
    g.scale.setScalar(1.7);
    g.visible = false;
    scene.add(g);
    return { g, body, wl, wr, from: new THREE.Vector3(), to: new THREE.Vector3(), vel: new THREE.Vector3(), next: 0, hop: 0, phase: rand() * 10 };
  }

  // ---------- rabbits ----------
  function rabbit() {
    const g = new THREE.Group();
    const inner = new THREE.Group(); // grows in / shrinks away
    inner.add(part(new THREE.SphereGeometry(1, 10, 8).scale(0.15, 0.14, 0.21), tan, 0, 0.15, 0));
    const head = new THREE.Group();
    head.position.set(0, 0.25, 0.15);
    head.add(part(new THREE.SphereGeometry(1, 10, 8).scale(0.085, 0.08, 0.1), tan, 0, 0, 0.02));
    const ears = [];
    for (const sx of [-0.035, 0.035]) {
      const ear = part(new THREE.CylinderGeometry(0.018, 0.024, 0.17, 5).translate(0, 0.085, 0), tan, sx, 0.05, -0.02);
      ear.rotation.set(-0.25, 0, sx * 4);
      head.add(ear);
      ears.push(ear);
    }
    inner.add(head);
    inner.add(part(new THREE.SphereGeometry(0.045, 6, 5), pale, 0, 0.17, -0.21));
    g.add(inner);
    g.scale.setScalar(1.5);
    g.visible = false;
    scene.add(g);
    return { g, inner, head, ears, state: "away", wait: rand.range(1, 6), hops: 0, t: 0, dir: new THREE.Vector3(), from: new THREE.Vector3(), phase: rand() * 10 };
  }

  const flocks = Array.from({ length: FLOCKS }, (_, i) => ({
    state: "away", wait: 2 + i * 3, t: 0, center: new THREE.Vector3(),
    birds: Array.from({ length: BIRDS_PER_FLOCK }, bird),
  }));
  const rabbits = Array.from({ length: RABBITS }, rabbit);

  /** A spot on open ground ahead of you: `ahead` metres along the path, `side` metres off it. */
  function spotAhead(camT, ahead, side, out) {
    const t = camT + ahead / P.pathLen;
    if (t > 0.95) return null; // nothing settles at the very end
    out.copy(P.at(t, side));
    if (P.blocked(out.x, out.z, { by: "grass" }) || P.overCliff(out.x, out.z, 3) || P.distToPath(out.x, out.z) < 1) return null;
    if (P.groundAt(out.x, out.z) > 0.05) return null; // only on the level: not up the rim's slope
    return out;
  }

  const away = new THREE.Vector3();
  const cam = new THREE.Vector3();
  const lastCam = new THREE.Vector3();
  let lastTime = null;
  let camSpeed = 0;

  return {
    flocks,
    rabbits,
    update(time, camera) {
      const dt = lastTime === null ? 0 : Math.min(0.1, Math.max(0, time - lastTime));
      lastTime = time;
      cam.copy(camera.position).setY(0);
      if (dt > 0) camSpeed += (cam.distanceTo(lastCam) / dt - camSpeed) * Math.min(1, dt * 4);
      lastCam.copy(cam);
      const camT = P.nearestT(cam.x, cam.z);
      const behind = (p) => (P.nearestT(p.x, p.z) - camT) * P.pathLen < -25; // well behind you

      // ----- birds -----
      for (const f of flocks) {
        f.t += dt;
        if (f.state === "away") {
          f.wait -= dt;
          if (f.wait > 0) continue;
          const side = (rand() < 0.5 ? -1 : 1) * rand.range(1.2, 5);
          if (!spotAhead(camT, rand.range(16, 32), side, f.center)) { f.wait = 1; continue; }
          f.state = "landing";
          f.t = 0;
          for (const b of f.birds) {
            b.to.set(f.center.x + rand.range(-1.2, 1.2), 0, f.center.z + rand.range(-1.2, 1.2));
            const a = rand() * Math.PI * 2;
            b.from.set(b.to.x + Math.cos(a) * 18, rand.range(9, 14), b.to.z + Math.sin(a) * 18);
            b.g.position.copy(b.from);
            b.g.visible = true;
          }
        }
        const dist = Math.hypot(f.center.x - cam.x, f.center.z - cam.z);
        if ((f.state === "landing" || f.state === "ground") && (dist < 7.5 || (dist < 13 && camSpeed > 4))) {
          f.state = "fleeing"; // too close: a hop, then away low and fast, curving off
          f.t = 0;
          for (const b of f.birds) {
            away.copy(b.g.position).sub(cam).setY(0).normalize().applyAxisAngle(UPV, rand.range(-0.9, 0.9));
            const speed = rand.range(4.5, 6.5);
            b.vel.set(away.x * speed, rand.range(1.4, 2.4), away.z * speed);
            b.delay = rand.range(0, 0.3);       // each reacts a beat apart
            b.turn = rand.range(-0.7, 0.7);     // rad/s it curves
            b.alt = rand.range(5, 11);          // the height it climbs to
          }
        } else if (f.state === "ground" && behind(f.center)) {
          f.state = "away"; // you've walked on; they slip away unseen
          f.wait = rand.range(1, 4);
          for (const b of f.birds) b.g.visible = false;
          continue;
        }

        for (const b of f.birds) {
          const flap = Math.sin(time * 26 + b.phase) * 0.9;
          if (f.state === "landing") {
            const k = Math.min(1, f.t / 2.4);
            const e = 1 - (1 - k) ** 3; // swoop in, slowing to land
            b.g.position.lerpVectors(b.from, b.to, e);
            b.g.position.y = b.from.y * (1 - e) ** 1.5;
            b.g.lookAt(b.to.x, b.g.position.y, b.to.z);
            b.wl.rotation.z = k < 0.9 ? flap : -1.1;
            b.wr.rotation.z = b.wl.rotation.z;
            if (k >= 1) {
              f.state = "ground";
              b.next = rand.range(0.2, 1);
            }
          } else if (f.state === "ground") {
            // hop, peck, look about
            b.next -= dt;
            if (b.next <= 0) {
              b.next = rand.range(0.4, 1.4);
              if (rand() < 0.5) {
                b.hop = 1;
                b.from.copy(b.g.position);
                b.g.rotation.y += rand.range(-1.2, 1.2);
                b.to.copy(b.from).add(new THREE.Vector3(Math.sin(b.g.rotation.y), 0, Math.cos(b.g.rotation.y)).multiplyScalar(0.25));
              } else {
                b.hop = -1; // peck
              }
            }
            if (b.hop > 0) {
              b.hop = Math.max(0, b.hop - dt * 4);
              const k = 1 - b.hop;
              b.g.position.lerpVectors(b.from, b.to, k);
              b.g.position.y = Math.sin(k * Math.PI) * 0.08;
            } else if (b.hop < 0) {
              b.hop = Math.min(0, b.hop + dt * 3);
              b.body.rotation.x = Math.sin(-b.hop * Math.PI) * 0.6;
            }
            b.wl.rotation.z = -1.1; // wings folded
            b.wr.rotation.z = -1.1;
          } else if (f.state === "fleeing") {
            if (f.t < b.delay) continue; // still startled
            const k = f.t - b.delay;
            b.vel.applyAxisAngle(UPV, b.turn * dt);                      // curving away
            const hs = Math.hypot(b.vel.x, b.vel.z);
            const grow = Math.min(9, hs * (1 + dt * 0.5)) / hs;             // picking up speed
            b.vel.x *= grow;
            b.vel.z *= grow;
            // flap-and-glide: climbs while flapping, sinks a touch while gliding
            const cycle = (time * 1.8 + b.phase) % 1;
            const flapping = k < 0.6 || cycle < 0.6;
            const wantUp = THREE.MathUtils.clamp((b.alt - b.g.position.y) * 0.7, -1, 3) - (flapping ? 0 : 0.8);
            b.vel.y += (wantUp - b.vel.y) * Math.min(1, dt * 2);
            b.g.position.addScaledVector(b.vel, dt);
            b.g.lookAt(b.g.position.clone().add(b.vel));
            b.g.rotateZ(-b.turn * 0.7); // banking into the turn
            b.body.rotation.x = 0;
            b.wl.rotation.z = flapping ? Math.sin(time * 30 + b.phase) * 1.1 : 0.15; // wings spread to glide
            b.wr.rotation.z = b.wl.rotation.z;
          }
        }
        if (f.state === "fleeing" && f.t > 5) {
          f.state = "away";
          f.wait = rand.range(3, 8);
          for (const b of f.birds) b.g.visible = false;
        }
      }

      // ----- rabbits -----
      for (const r of rabbits) {
        r.t += dt;
        if (r.state === "away") {
          r.wait -= dt;
          if (r.wait > 0) continue;
          const side = (rand() < 0.5 ? -1 : 1) * rand.range(3, 9);
          if (!spotAhead(camT, rand.range(14, 28), side, r.from)) { r.wait = 1; continue; }
          r.g.position.copy(r.from);
          r.g.rotation.y = rand() * Math.PI * 2;
          r.g.visible = true;
          r.state = "sitting";
          r.t = 0;
        }
        const dist = Math.hypot(r.g.position.x - cam.x, r.g.position.z - cam.z);
        if (r.state === "sitting") {
          r.inner.scale.setScalar(Math.min(1, r.t / 0.4)); // pops up out of the grass
          r.head.rotation.x = Math.max(0, Math.sin(time * 2.2 + r.phase)) * 0.35; // nibbling
          r.ears[0].rotation.z = -0.14 + Math.sin(time * 5 + r.phase) * 0.06;     // ear twitch
          if (dist < 9) {
            r.state = "bolting"; // off it goes, away from you
            r.t = 0;
            r.hops = 0;
            r.dir.copy(r.g.position).sub(cam).setY(0).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), rand.range(-0.6, 0.6));
            r.g.rotation.y = Math.atan2(r.dir.x, r.dir.z);
            r.from.copy(r.g.position);
            r.head.rotation.x = 0;
          } else if (behind(r.g.position)) {
            r.state = "away";
            r.wait = rand.range(2, 6);
            r.g.visible = false;
          }
        } else if (r.state === "bolting") {
          const hop = 0.32;
          const k = (r.t % hop) / hop;
          if (r.t >= (r.hops + 1) * hop) {
            r.hops++;
            r.from.addScaledVector(r.dir, 1.3);
          }
          r.g.position.copy(r.from).addScaledVector(r.dir, 1.3 * k);
          r.g.position.y = Math.sin(k * Math.PI) * 0.45;
          if (r.hops > 6) {
            r.inner.scale.setScalar(Math.max(0, 1 - (r.t - 7 * hop) / 0.3)); // gone into the grass
            if (r.t > 7 * hop + 0.3) {
              r.state = "away";
              r.wait = rand.range(4, 10);
              r.g.visible = false;
            }
          }
        }
      }
    },
  };
}
