import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// The greeting, in 3D, while the world is built behind it: you stand low in a dim grey space,
// soft bubbles drifting up past you, looking up at a great brush hanging overhead (a glass
// handle, a stone ferrule, and bristles soaked with ink halfway up). A drop of ink gathers at its tip as the
// world loads. When you begin, the drop lets go and falls straight down, and you sink after it,
// down into the dark, until the ink takes your view (and the world opens out of it: app/loader.js).

const TIP = new THREE.Vector3(0, 2.5, -2.3); // the brush's tip, above and ahead of you
const LOOK = new THREE.Vector3(0, 5.6, -3.2); // where you look while you wait (up the brush)
const SIZE = 1.5; // how big the brush is (it should loom)
const FALL_TIME = 1.3; // seconds from letting go to filling your view
const DROP_TO = -7; // how far down the drop falls (it falls straight down, and you follow it)
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
  const ferruleStone = new THREE.MeshPhysicalMaterial({
    color: 0x3b4048, roughness: 0.22, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xc4ccd6, roughness: 0.06, transmission: 1, thickness: 0.5, ior: 1.45,
    attenuationColor: new THREE.Color(0x8f9aa6), attenuationDistance: 1.2, clearcoat: 1,
  });
  // bristles: a fat belly drawn to a fine point (y: up from the tip), pale dry hair above,
  // soaked black with ink from about halfway down (bristleTextures)
  const hair = bristleTextures();
  const bristles = new THREE.MeshPhysicalMaterial({
    map: hair.color, roughnessMap: hair.rough, bumpMap: hair.bump, bumpScale: 1.6,
    roughness: 1,
    envMapIntensity: 0.4, // (or the wet ink mirrors the room, and reads as silver, not black)
  });
  brush.add(new THREE.Mesh(lathe([[0, 0], [0.045, 0.07], [0.13, 0.28], [0.24, 0.58], [0.33, 0.92], [0.33, 1.08], [0.28, 1.3]], 128), bristles));
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
      // let go: it falls straight down, quickening, stretching as it goes; and you sink after
      // it, a moment behind, looking down on it as it drops away into the dark
      const t = (falling.t += dt);
      const k = Math.min(t / FALL_TIME, 1);
      dropPos.copy(falling.from);
      dropPos.y += (DROP_TO - falling.from.y) * k * k;
      const follow = Math.pow(k, 2.4);
      camera.position.set(0, (DROP_TO + 1.8) * follow, (falling.from.z + 1.1) * follow);
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
    if (falling) look.copy(dropPos); // (your eyes stay on it as it falls)
    else look.lerp(want, 1 - Math.exp(-dt * 2));
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

/**
 * The bristles' textures, laid out as the lathe's uv (x: round the brush, y: up from the tip):
 * fine strands of pale hair, and ink soaked up them from the tip to about halfway, its edge
 * ragged where it has wicked further up some strands than others. Wet ink is glossy, dry hair
 * matte (rough); the strands stand up a little (bump).
 */
function bristleTextures() {
  const W = 512, H = 1024;
  const make = () => {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    return [c, c.getContext("2d")];
  };
  const [cc, col] = make();
  const [rc, rough] = make();
  const [bc, bump] = make();
  // (canvas top = up by the ferrule, bottom = the tip)
  col.fillStyle = "#cbbd9f";
  col.fillRect(0, 0, W, H);
  rough.fillStyle = "#c8c8c8"; // dry: matte
  rough.fillRect(0, 0, W, H);
  bump.fillStyle = "#808080";
  bump.fillRect(0, 0, W, H);

  const rnd = Math.random;
  const STRANDS = 900;
  for (let i = 0; i < STRANDS; i++) {
    const x = rnd() * W;
    const w = 0.6 + rnd() * 1.4;
    const sway = (rnd() - 0.5) * 6;
    // the hair: lighter and darker strands
    const shade = 150 + rnd() * 90;
    col.strokeStyle = `rgba(${shade + 20}, ${shade + 8}, ${shade - 20}, ${0.35 + rnd() * 0.4})`;
    col.lineWidth = w;
    strand(col, x, sway, 0, H);
    bump.strokeStyle = `rgba(255, 255, 255, ${0.25 + rnd() * 0.35})`;
    bump.lineWidth = w;
    strand(bump, x, sway, 0, H);
    // the ink: up this strand from the tip, to its own height (the wicking edge)
    const wet = H * (0.5 + rnd() * 0.12 + Math.sin(x * 0.03) * 0.04); // canvas px up from the tip
    const top = H - wet;
    const grad = col.createLinearGradient(0, top - 40, 0, top + 30);
    grad.addColorStop(0, "rgba(12, 13, 16, 0)");
    grad.addColorStop(1, "rgba(12, 13, 16, 0.97)");
    col.strokeStyle = grad;
    col.lineWidth = w + 1.2;
    strand(col, x, sway, top - 40, H);
    const rg = rough.createLinearGradient(0, top - 30, 0, top + 20);
    rg.addColorStop(0, "rgba(80, 80, 80, 0)");
    rg.addColorStop(1, "rgba(80, 80, 80, 1)"); // wet: glossy
    rough.strokeStyle = rg;
    rough.lineWidth = w + 2;
    strand(rough, x, sway, top - 30, H);
  }
  // soaked through below the edge: a solid wash of ink under the strands, so no hair shows
  // through at the tip (fading out up toward the edge)
  const under = col.createLinearGradient(0, H * 0.55, 0, H);
  under.addColorStop(0, "rgba(10, 11, 14, 0)");
  under.addColorStop(0.35, "rgba(10, 11, 14, 0.85)");
  under.addColorStop(1, "rgba(8, 9, 11, 1)");
  col.fillStyle = under;
  col.fillRect(0, 0, W, H);
  const roughUnder = rough.createLinearGradient(0, H * 0.6, 0, H);
  roughUnder.addColorStop(0, "rgba(80, 80, 80, 0)");
  roughUnder.addColorStop(0.4, "rgba(80, 80, 80, 1)");
  rough.fillStyle = roughUnder;
  rough.fillRect(0, 0, W, H);

  const tex = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { color: tex(cc, true), rough: tex(rc, false), bump: tex(bc, false) };
}

/** One hair: a long, faintly wavering line down the canvas (wrapping round at the sides). */
function strand(g, x, sway, from, to) {
  for (const dx of [0, -512, 512]) {
    if (x + dx < -10 || x + dx > 522) continue;
    g.beginPath();
    g.moveTo(x + dx, from);
    g.bezierCurveTo(x + dx + sway, from + (to - from) * 0.33, x + dx - sway, from + (to - from) * 0.66, x + dx + sway * 0.3, to);
    g.stroke();
  }
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
