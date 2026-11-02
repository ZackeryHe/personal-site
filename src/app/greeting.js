import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// The greeting, in 3D, while the world is built behind it: you stand low in a dim grey space,
// soft bubbles drifting up past you, looking up at a great brush hanging overhead (a glass
// handle, a ferrule and bristles of polished stone). A drop of ink gathers at its tip as the
// world loads. When you begin, the drop lets go and falls toward you, your eyes following it
// down, until it fills your view (and the world opens out of it: app/loader.js).

const TIP = new THREE.Vector3(0, 2.5, -2.3); // the brush's tip, above and ahead of you
const LOOK = new THREE.Vector3(0, 5.6, -3.2); // where you look while you wait (up the brush)
const SIZE = 1.5; // how big the brush is (it should loom)
const FALL_TIME = 1.3; // seconds from letting go to filling your view
const LAND = new THREE.Vector3(0.04, -0.1, -0.22); // where the drop ends: just in front of your eyes
const DROP_R = [0.05, 0.17]; // the drop's radius: just a bead → full and heavy, as the world loads

export function createGreeting(renderer) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.02, 200);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- the space: a dim grey, lighter round the brush ----------
  scene.background = backdrop();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();
  const key = new THREE.DirectionalLight(0xffffff, 1.4); // from behind you, lighting the underside you see
  key.position.set(1.5, -2, 3);
  const rim = new THREE.DirectionalLight(0xdfe6ee, 2.2); // from above and beyond: bright edges on the glass
  rim.position.set(-1, 6, -6);
  scene.add(key, rim);

  // ---------- the brush ----------
  const brush = new THREE.Group();
  brush.position.copy(TIP);
  brush.scale.setScalar(SIZE);
  const lathe = (pts, seg = 48) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const stone = new THREE.MeshPhysicalMaterial({
    color: 0x1b1e23, roughness: 0.32, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.12,
  });
  const ferruleStone = new THREE.MeshPhysicalMaterial({
    color: 0x3b4048, roughness: 0.22, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xc4ccd6, roughness: 0.06, transmission: 1, thickness: 0.5, ior: 1.45,
    attenuationColor: new THREE.Color(0x8f9aa6), attenuationDistance: 1.2, clearcoat: 1,
  });
  // bristles: a fat belly drawn to a fine point (y: up from the tip)
  brush.add(new THREE.Mesh(lathe([[0, 0], [0.045, 0.07], [0.13, 0.28], [0.24, 0.58], [0.33, 0.92], [0.33, 1.08], [0.28, 1.3]]), stone));
  brush.add(new THREE.Mesh(lathe([[0.27, 1.28], [0.3, 1.34], [0.3, 1.78], [0.24, 1.84]]), ferruleStone));
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 11, 48, 1, false), glass);
  handle.position.y = 1.84 + 5.5;
  brush.add(handle);
  scene.add(brush);

  // ---------- the drop of ink at its tip ----------
  const ink = new THREE.MeshPhysicalMaterial({ color: 0x050608, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03 });
  const drop = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), ink);
  scene.add(drop);

  // ---------- bubbles drifting up through the grey ----------
  const bubbles = makeBubbles(scene);

  // ---------- state ----------
  let progress = 0; // how much of the world is built (0–1): the drop swells with it
  let shown = 0;    // ...eased, so it swells smoothly
  let falling = null; // { t, from, resolve } once it lets go
  let running = false;
  let last = 0;
  const look = LOOK.clone();
  const dropPos = new THREE.Vector3();

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    // (on a tall phone screen, widen the view so the brush still fits)
    camera.fov = camera.aspect < 0.8 ? 70 : 55;
    camera.updateProjectionMatrix();
  }

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min((now - (last || now)) / 1000, 0.05);
    last = now;
    const time = now / 1000;
    shown += (progress - shown) * (1 - Math.exp(-dt * 3));

    // the brush sways a little on its cord
    brush.rotation.z = Math.sin(time * 0.6) * 0.025;
    brush.rotation.x = Math.sin(time * 0.43 + 1) * 0.018;
    brush.updateMatrixWorld();

    const r = THREE.MathUtils.lerp(DROP_R[0], DROP_R[1], shown);
    if (!falling) {
      // hanging from the tip (which sways with the brush), heavy, trembling as it fills
      dropPos.set(0, 0, 0).applyMatrix4(brush.matrixWorld);
      dropPos.y -= r * 0.95;
      const tremble = 1 + Math.sin(time * 7) * 0.025 * shown;
      drop.scale.set(r / tremble, r * 1.12 * tremble, r / tremble);
    } else {
      // let go: it falls, and comes toward you, stretching as it goes; you follow it down
      const t = (falling.t += dt);
      const k = Math.min(t / FALL_TIME, 1);
      // (down with gravity, quickening; and in toward you, ending just before your eyes)
      dropPos.copy(falling.from);
      dropPos.y += (LAND.y - falling.from.y) * k * k;
      dropPos.z += (LAND.z - falling.from.z) * (k * k * (3 - 2 * k));
      dropPos.x += (LAND.x - falling.from.x) * k;
      const stretch = 1 + 0.35 * Math.min(1, k * 2);
      drop.scale.set(r / Math.sqrt(stretch), r * stretch, r / Math.sqrt(stretch));
      brush.position.y = TIP.y + Math.sin(Math.min(t * 6, Math.PI)) * 0.08 * Math.exp(-t * 2); // (the brush springs up)
      if (k >= 1 && falling.resolve) {
        falling.resolve();
        falling.resolve = null;
      }
    }
    drop.position.copy(dropPos);

    // where you look: up the brush while you wait (drifting a touch), then after the drop
    const want = falling ? dropPos : LOOK.clone().add(new THREE.Vector3(Math.sin(time * 0.2) * 0.15, Math.sin(time * 0.27) * 0.1, 0));
    look.lerp(want, 1 - Math.exp(-dt * (falling ? 12 : 2)));
    camera.lookAt(look);

    bubbles.update(dt, camera);
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  }

  return {
    /** Start drawing it (every frame, until stop()). Resolves once it has been drawn. */
    start() {
      resize();
      addEventListener("resize", resize);
      camera.position.set(0, 0, 0);
      camera.lookAt(look);
      running = true;
      return new Promise((resolve) => requestAnimationFrame((t) => {
        frame(t);
        resolve();
      }));
    },
    /** How much of the world is built (0–1). */
    progress(k) {
      progress = Math.max(progress, Math.min(1, k));
    },
    /** Let the drop go. Resolves as it fills your view. */
    fall() {
      if (reduced) return Promise.resolve();
      return new Promise((resolve) => {
        falling = { t: 0, from: dropPos.clone(), resolve };
      });
    },
    stop() {
      running = false;
      removeEventListener("resize", resize);
    },
    /** Free it all (after the world has taken over). */
    dispose() {
      this.stop();
      scene.traverse((o) => {
        o.geometry?.dispose();
        o.material?.map?.dispose();
        o.material?.dispose();
      });
      scene.background?.dispose();
      scene.environment?.dispose();
    },
  };
}

/** The dim grey backdrop: darker below, a soft light behind the brush. */
function backdrop() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d");
  const lin = g.createLinearGradient(0, 0, 0, 512);
  lin.addColorStop(0, "#3a3e44");
  lin.addColorStop(0.55, "#24272c");
  lin.addColorStop(1, "#131417");
  g.fillStyle = lin;
  g.fillRect(0, 0, 512, 512);
  const glow = g.createRadialGradient(256, 150, 0, 256, 150, 300);
  glow.addColorStop(0, "rgba(120, 128, 138, 0.35)");
  glow.addColorStop(1, "rgba(120, 128, 138, 0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A bubble: a faint grey film with a brighter rim and a glint; soft (out of focus) or crisp. */
function bubbleTexture(soft) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  if (soft) g.filter = "blur(5px)";
  const body = g.createRadialGradient(64, 64, 0, 64, 64, 52);
  body.addColorStop(0, "rgba(200, 205, 212, 0.06)");
  body.addColorStop(0.82, "rgba(200, 205, 212, 0.14)");
  body.addColorStop(0.95, "rgba(225, 230, 236, 0.55)");
  body.addColorStop(1, "rgba(225, 230, 236, 0)");
  g.fillStyle = body;
  g.beginPath();
  g.arc(64, 64, 52, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(255, 255, 255, 0.5)";
  g.beginPath();
  g.ellipse(46, 44, 9, 5, -0.7, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeBubbles(scene) {
  const crisp = new THREE.SpriteMaterial({ map: bubbleTexture(false), transparent: true, depthWrite: false, color: 0xb9bec5 });
  const soft = new THREE.SpriteMaterial({ map: bubbleTexture(true), transparent: true, depthWrite: false, color: 0xa7adb5 });
  const list = [];
  const place = (b, anywhere) => {
    // scattered through the space you're looking up into, near and far
    const d = THREE.MathUtils.randFloat(3, 30);
    b.sprite.position.set(
      THREE.MathUtils.randFloatSpread(d * 1.4),
      anywhere ? THREE.MathUtils.randFloat(-d * 0.3, d * 1.3) : -d * 0.4,
      -d * 0.75 + THREE.MathUtils.randFloatSpread(d * 0.5),
    );
    const size = THREE.MathUtils.randFloat(0.12, 0.45) * (0.6 + d * 0.06);
    b.sprite.scale.setScalar(size);
    b.sprite.material = d > 12 ? soft : crisp;
    b.speed = THREE.MathUtils.randFloat(0.15, 0.5) * (0.5 + d * 0.04);
    b.phase = Math.random() * 10;
    b.top = d * 1.4;
  };
  for (let i = 0; i < 70; i++) {
    const b = { sprite: new THREE.Sprite(crisp) };
    place(b, true);
    scene.add(b.sprite);
    list.push(b);
  }
  return {
    update(dt) {
      for (const b of list) {
        b.phase += dt;
        b.sprite.position.y += b.speed * dt;
        b.sprite.position.x += Math.sin(b.phase * 0.9) * 0.05 * dt;
        if (b.sprite.position.y > b.top) place(b, false);
      }
    },
  };
}
