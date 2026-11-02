import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// The greeting, in 3D, while the world is built behind it: you stand in a dim grey space,
// looking up at a great brush hanging overhead (a shaft of green jade, a cup of polished horn,
// and bristles soaked with ink halfway up), a thread of incense smoke curling up beside it. Nothing of the
// world shows out here: it's all inside the scroll. A drop of ink gathers at
// its tip as the world loads. When you begin, it lets go and falls straight down into a scroll
// lying unrolled below, your eyes following it down. Where it lands, the world itself paints
// itself out over the scroll, and you come down over it until it fills your view: then it is
// the world (main.js draws it live, into the scroll, from the moment the drop lands).

const TIP = new THREE.Vector3(0, 2.5, -2.3); // the brush's tip, above and ahead of you
const EYE = new THREE.Vector3(0, 0.9, 2.5); // where you are while you wait: back a little, so you see the brush's shape
const LOOK = new THREE.Vector3(0, 3.6, -2.3); // where you look while you wait: up at the brush (~30°: right under it, it foreshortens into a spike)
const SIZE = 1.5; // how big the brush is (it should loom)
const FALL_TIME = 1.1; // seconds from letting go to landing on the scroll
const PAPER_Y = -7.5;  // the scroll lies unrolled down below, under the brush
const SCROLL = { width: 9, depth: 2.9 }; // (a handscroll: long, and narrow)
const SPLAT_SCALE = 3; // how far the ink spreads, in screens across (so it goes on past them, over the scroll)
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
  // After a great Qing brush (大提笔; Wikimedia Commons: "Qing Writing Brush (9886986944).jpg"):
  // its bristles set in a cup (斗) of polished ox horn, a fine green band where that's drawn in
  // to the shaft, and the shaft of pale green nephrite. (No glass: nothing here needs three's
  // transmission pass, so it's one less render of the scene each frame.)
  const brush = new THREE.Group();
  brush.position.copy(TIP);
  brush.scale.setScalar(SIZE);
  const lathe = (pts, seg = 48) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const hornMap = hornTexture();
  const horn = new THREE.MeshPhysicalMaterial({
    map: hornMap, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1, side: THREE.DoubleSide,
    emissive: 0xffffff, emissiveMap: hornMap, emissiveIntensity: 0.12, // (light caught inside the horn: it glows a little, even in shadow)
  });
  const band = new THREE.MeshPhysicalMaterial({ color: 0x1f8a63, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 });
  const jade = new THREE.MeshPhysicalMaterial({ map: jadeTexture(), roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.2 });
  const SHAFT = { r: 0.14, length: 11, from: 2.21 }; // (its foot: just above the band)
  jade.map.repeat.set(1, SHAFT.length / (2 * Math.PI * SHAFT.r)); // (the mottling square on the surface, not stretched)
  // bristles: a fat belly drawn to a fine point (y: up from the tip), pale dry hair above,
  // soaked black with ink from about halfway down (bristleTextures)
  const hair = bristleTextures();
  const bristles = new THREE.MeshPhysicalMaterial({
    map: hair.color, roughnessMap: hair.rough, bumpMap: hair.bump, bumpScale: 1.6,
    roughness: 1,
    envMapIntensity: 0.4, // (or the wet ink mirrors the room, and reads as silver, not black)
  });
  brush.add(new THREE.Mesh(lathe([[0, 0], [0.045, 0.07], [0.13, 0.28], [0.24, 0.58], [0.33, 0.92], [0.33, 1.08], [0.28, 1.3]], 128), bristles));
  // the horn cup: a lip round the bristles, swelling, then drawn in like an egg to the shaft
  brush.add(new THREE.Mesh(lathe([
    [0.3, 1.25], [0.335, 1.2], [0.353, 1.27], [0.364, 1.39], [0.359, 1.53], [0.34, 1.68],
    [0.305, 1.83], [0.255, 1.97], [0.2, 2.08], [0.158, 2.16],
  ], 64), horn));
  brush.add(new THREE.Mesh(lathe([[0.15, 2.152], [0.168, 2.162], [0.168, 2.208], [0.15, 2.22]]), band));
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(SHAFT.r, SHAFT.r, SHAFT.length, 48, 1, false), jade);
  shaft.position.y = SHAFT.from + SHAFT.length / 2;
  brush.add(shaft);
  scene.add(brush);

  // ---------- the drop of ink at its tip ----------
  const ink = new THREE.MeshPhysicalMaterial({ color: 0x050608, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03 });
  const drop = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), ink);
  scene.add(drop);

  // ---------- the scroll the drop falls into, unrolled down below ----------
  const scroll = makeScroll();
  scroll.group.position.set(0, PAPER_Y, TIP.z);
  scene.add(scroll.group);

  // ---------- incense smoke, curling up through the grey ----------
  const smoke = makeSmoke(scene, EYE);

  // ---------- the world, painting itself onto the scroll ----------
  // Where the drop lands, the world (drawn live into worldTarget by main.js, its own first ink
  // spreading from that same drop) spreads out over the scroll's paper with a ragged ink edge.
  // Its middle is the shape of your screen; you come down over it, levelling out, until that
  // fills your view exactly. Then it is just what the world draws on the screen, and the world
  // can take over without a seam.
  const worldTarget = new THREE.WebGLRenderTarget(1, 1);
  // The spreading ink is much bigger than your screen (SPLAT_SCALE), so its ragged edge keeps on
  // going out over the scroll (only over its paper: ink doesn't hang in the air). Inside the
  // middle, screen-shaped part it is exactly the world; out beyond that, where the world draws
  // nothing, its colour is estimated: the world's own edge, softened, giving way to its paper.
  const painting = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), // (uv up = -z: "up" as you'll look down on it)
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        tWorld: { value: worldTarget.texture },
        uSpread: { value: 0 },       // how far the ink has spread (in screen heights, from the drop)
        uAspect: { value: 1 },
        uScale: { value: SPLAT_SCALE },
        uBounds: { value: new THREE.Vector4() }, // the scroll's paper (world x0, z0, x1, z1)
        uPaperTone: { value: new THREE.Color("#efe7d6").multiplyScalar(0.93) }, // (the world's paper, its vignette and all)
        uSeam: { value: 1 }, // 1 → 0 once you've locked on: the vignette where the world melts into its estimate fades away
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec2 vWorld;
        void main() {
          vUv = uv;
          vWorld = (modelMatrix * vec4(position, 1.0)).xz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tWorld;
        uniform float uSpread, uAspect, uScale;
        uniform vec4 uBounds;
        uniform vec3 uPaperTone;
        uniform float uSeam;
        varying vec2 vUv;
        varying vec2 vWorld;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
        }
        void main() {
          // only on the scroll's paper
          if (vWorld.x < uBounds.x || vWorld.x > uBounds.z || vWorld.y < uBounds.y || vWorld.y > uBounds.w) discard;
          vec2 q = (vUv - 0.5) * uScale + 0.5;             // where this is in the world's frame (0 → 1 on screen)
          vec2 p = (q - 0.5) * vec2(uAspect, 1.0);          // ...in screen heights, from the drop
          // the spreading edge: ragged, with lobes and fine fraying
          float d = length(p) + (n(p * 3.0) - 0.5) * 0.35 + (n(p * 9.0) - 0.5) * 0.12 + (n(p * 30.0) - 0.5) * 0.03;
          float inside = uSpread - d; // > 0: ink has reached here
          float a = smoothstep(-0.01, 0.02, inside);
          // the world, where there is one; beyond it, an estimate of it: a wash bled out of it,
          // blurred wide and wavering like water, mottled, giving way unevenly to its paper
          vec3 world = texture2D(tWorld, q).rgb;
          float beyond = length(max(abs(q - 0.5) - 0.5, 0.0)); // how far outside the screen's frame
          float fromEdge = min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y)); // how far inside it
          // a light vignette: near the screen's edges the world melts into the wash (faded away once
          // you've locked on: uSeam), and beyond them it is all wash
          float edgeK = (1.0 - smoothstep(0.0, 0.24, fromEdge)) * 0.6;
          float seam = beyond > 0.0 ? mix(0.6, 1.0, smoothstep(0.0, 0.08, beyond)) : edgeK * uSeam;
          vec3 c = world;
          if (seam > 0.0) {
            vec2 warp = (vec2(n(p * 1.3 + 3.1), n(p * 1.3 + 8.3)) - 0.5) * 0.36; // (wavering, like water)
            vec2 at = clamp(q, 0.26, 0.74) + warp; // (wavering after the clamp: no streaks along the edge)
            vec3 wash = vec3(0.0);
            for (int i = -2; i <= 2; i++) {
              for (int j = -2; j <= 2; j++) {
                wash += texture2D(tWorld, at + vec2(float(i), float(j)) * 0.09).rgb;
              }
            }
            wash /= 25.0;
            wash *= 1.0 - (n(p * 5.0 + 1.3) - 0.5) * 0.05; // (mottled, as a wash dries)
            float toPaper = smoothstep(0.0, 0.26, beyond + (n(p * 3.5 + 4.7) - 0.5) * 0.12);
            wash = mix(wash, uPaperTone, toPaper);
            c = mix(world, wash, seam);
          }
          // the dark ink edge: pigment pooled where the wash stops, darkening a little inside it
          vec3 ink = vec3(0.04, 0.045, 0.055);
          float rim = exp(-pow(inside / 0.035, 2.0));
          float pool = smoothstep(0.22, 0.0, inside) * step(0.0, inside);
          c = mix(c, ink, clamp(rim * 0.9 + pool * 0.22, 0.0, 0.92));
          gl_FragColor = vec4(c, a);
          #include <colorspace_fragment>
        }
      `,
    }),
  );
  painting.renderOrder = 2;
  painting.visible = false;
  scene.add(painting);
  const PAINT_H = 2; // how deep (m) the painting is on the scroll, once you look down on it
  const SPREAD_TIME = 1.5; // seconds for it to spread from the drop out to the scroll's... your screen's edges
  const LOCK_FADE = 0.7; // ...and for the vignette round its edges to fade once you've locked on

  // ---------- state ----------
  let progress = 0; // how much of the world is built (0–1): the drop swells with it
  let shown = 0;    // ...eased, so it swells smoothly
  let falling = null; // { t, from, onLand, resolve, ... } once it lets go
  let running = false;
  let last = 0;
  const look = LOOK.clone();
  const dropPos = new THREE.Vector3();
  const qLook = new THREE.Quaternion();
  const above = new THREE.PerspectiveCamera(); // where you end up: right over the painting, looking down on it (a camera: its lookAt faces it)

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    // (on a tall phone screen, widen the view so the brush still fits)
    camera.fov = camera.aspect < 0.8 ? 70 : 55;
    camera.updateProjectionMatrix();
    smoke.layout(camera.aspect);
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    worldTarget.setSize(size.x, size.y);
    painting.scale.set(PAINT_H * camera.aspect * SPLAT_SCALE, 1, PAINT_H * SPLAT_SCALE);
    painting.material.uniforms.uAspect.value = camera.aspect;
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
    let settle = 0; // 0 → 1: how far you've come to rest right over the painting
    if (!falling) {
      // hanging from the tip (which sways with the brush), heavy, trembling as it fills
      dropPos.set(0, 0, 0).applyMatrix4(brush.matrixWorld);
      dropPos.y -= r * 0.95;
      const tremble = 1 + Math.sin(time * 7) * 0.025 * shown;
      drop.scale.set(r / tremble, r * 1.12 * tremble, r / tremble);
    } else {
      // let go: it falls straight down, quickening, stretching as it goes, into the scroll
      // below, and you sink after it, your eyes coming round to follow it down
      const t = (falling.t += dt);
      const k = Math.min(t / FALL_TIME, 1);
      dropPos.copy(falling.from);
      dropPos.y += (PAPER_Y + r * 0.6 - falling.from.y) * k * k;
      brush.position.y = TIP.y + Math.sin(Math.min(t * 6, Math.PI)) * 0.08 * Math.exp(-t * 2); // (the brush springs up)
      if (k < 1) {
        const stretch = 1 + 0.35 * Math.min(1, k * 2);
        drop.scale.set(r / Math.sqrt(stretch), r * stretch, r / Math.sqrt(stretch));
      } else if (!falling.landed) {
        // landed: the drop is gone into the paper; the world starts there, and paints itself out
        falling.landed = true;
        drop.visible = false;
        painting.position.set(dropPos.x, PAPER_Y + 0.006, dropPos.z);
        const sp = scroll.group.position; // (the paper inside its silk mounting: see makeScroll)
        painting.material.uniforms.uBounds.value.set(sp.x - SCROLL.width * 0.425, sp.z - SCROLL.depth * 0.465, sp.x + SCROLL.width * 0.425, sp.z + SCROLL.depth * 0.465);
        painting.visible = true;
        above.position.set(dropPos.x, PAPER_Y + PAINT_H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))), dropPos.z);
        above.up.set(0, 0, -1);
        above.lookAt(painting.position);
        falling.onLand(worldTarget);
      }
      if (falling.landed) {
        const age = t - FALL_TIME;
        scroll.splash(dropPos.x - scroll.group.position.x, dropPos.z - scroll.group.position.z, age);
        const s = Math.min(age / SPREAD_TIME, 1);
        // (past the screen's corners, ragged edge and all, well before you settle; and on out)
        const cover = Math.hypot(camera.aspect, 1) / 2 + 0.3;
        painting.material.uniforms.uSpread.value = (1 - Math.pow(1 - s, 2.2)) * cover * 1.5;
        // locked on (the painting fills your view): hold there while the vignette fades away,
        // and then hand over
        const lock = age - SPREAD_TIME;
        painting.material.uniforms.uSeam.value = 1 - THREE.MathUtils.smoothstep(lock, 0, LOCK_FADE);
        if (lock > LOCK_FADE && falling.resolve) {
          falling.resolve();
          falling.resolve = null;
        }
      }
      // you: down from where you stood to right over where it lands, and level out over the
      // painting in the last part of the way
      const dive = THREE.MathUtils.clamp((t - FALL_TIME * 0.25) / (FALL_TIME * 0.75 + SPREAD_TIME), 0, 1);
      const e = dive * dive * (3 - 2 * dive);
      const end = above.position.y ? above.position : new THREE.Vector3(falling.from.x, PAPER_Y + PAINT_H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))), falling.from.z);
      camera.position.lerpVectors(EYE, end, e);
      settle = falling.landed ? THREE.MathUtils.smoothstep(dive, 0.45, 1) : 0;
    }
    drop.position.copy(dropPos);

    // where you look: up the brush while you wait (drifting a touch); then your eyes come round
    // to the drop and follow it down (quicker as it quickens, so it never gets away from you)
    if (falling) {
      look.lerp(dropPos, 1 - Math.exp(-dt * (4 + 30 * Math.min(falling.t / FALL_TIME, 1))));
      // (and "up" turns, as you come to look down, from the sky to the far end of the scroll, so
      // looking straight down never spins you round)
      const turn = THREE.MathUtils.smoothstep(falling.t, FALL_TIME * 0.3, FALL_TIME);
      camera.up.set(0, 1 - turn, -turn).normalize();
    } else {
      look.lerp(LOOK.clone().add(new THREE.Vector3(Math.sin(time * 0.2) * 0.15, Math.sin(time * 0.27) * 0.1, 0)), 1 - Math.exp(-dt * 2));
    }
    camera.lookAt(look);
    if (settle > 0) {
      // ...and you level out, right over the painting, till it fills your view
      qLook.copy(camera.quaternion);
      camera.quaternion.slerpQuaternions(qLook, above.quaternion, settle);
    }

    // the smoke: gone as you go down after the drop (looking down on them, its cards would show)
    if (!reduced) smoke.update(dt);
    smoke.fade(falling ? 1 - THREE.MathUtils.smoothstep(falling.t, 0.1, 0.55) : 1);
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  }

  return {
    /** Start drawing it (every frame, until stop()). Resolves once it has been drawn. */
    async start() {
      resize();
      addEventListener("resize", resize);
      camera.position.copy(EYE);
      camera.lookAt(look);
      // its shaders first: where the browser compiles them in the background, the page (your
      // name, already showing) stays free meanwhile, and the first frame doesn't wait on them
      await renderer.compileAsync(scene, camera);
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
    /**
     * Let the drop go. onLand(target): called as it lands on the scroll: from then on, draw the
     * world (live, its first ink landing just then) into target, and it paints itself out over
     * the scroll from there. Resolves once it fills your view: the world can take the screen.
     */
    fall(onLand = () => {}) {
      if (reduced) {
        onLand(null);
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        falling = { t: 0, from: dropPos.clone(), landed: false, onLand, resolve };
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
      worldTarget.dispose();
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

/**
 * Polished ox horn, for the cup the bristles are set in (laid out as its lathe's uv: x round the
 * cup, y from the lip up to the shaft): olive-brown at the lip, honey on the swell, paler amber
 * where it's drawn in thin by the shaft, all through with the fine lengthwise grain of horn.
 */
function hornTexture() {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  const img = g.createImageData(S, S);
  // the grain: fine, uneven streaks round the cup (made of whole waves, so it meets itself all
  // the way round), over a broad clouding, lighter where it's clearer and with darker inclusions
  const N = 1024;
  const grain = new Float32Array(N);
  let total = 0;
  for (let k = 0; k < 40; k++) {
    const f = 6 + k * 3 + Math.floor(Math.random() * 3), a = 1 / (1 + k * 0.15), p = Math.random() * Math.PI * 2;
    total += a;
    for (let i = 0; i < N; i++) grain[i] += Math.sin((i / N) * f * Math.PI * 2 + p) * a;
  }
  const clouding = tileNoise(S, 3, 4);
  const lip = [104, 90, 52], body = [196, 164, 96], neck = [216, 190, 124], streak = [84, 64, 32];
  const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  for (let y = 0; y < S; y++) {
    const v = 1 - y / S; // 0: the lip → 1: the shaft (the canvas's top row is the top of the cup)
    const base = v < 0.35 ? mix(lip, body, v / 0.35) : v < 0.55 ? body : mix(body, neck, (v - 0.55) / 0.45);
    for (let x = 0; x < S; x++) {
      const s = grain[(Math.floor((x / S) * N + Math.sin(v * 9 + x * 0.05) * 4) + N) % N] / total * 3; // (wavering a little)
      const m = clouding[y * S + x];
      const shade = (0.95 + 0.1 * s) * (0.8 + 0.4 * m);
      const dark = Math.min(1, Math.max(0, s - 0.75) * 1.2 + Math.max(0, 0.36 - m) * 1.5); // dark streaks, cloudy inclusions
      const i = (y * S + x) * 4;
      for (let ch = 0; ch < 3; ch++) img.data[i + ch] = base[ch] * shade + (streak[ch] - base[ch] * shade) * dark;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/**
 * Pale green nephrite, for the shaft: celadon, clouded grey-green, with milky patches and a few
 * fine veins. Tiles both ways (it's repeated up the shaft).
 */
function jadeTexture() {
  const S = 128;
  const clouds = tileNoise(S, 4, 4), milk = tileNoise(S, 2, 3), veins = tileNoise(S, 3, 4);
  const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  const img = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const cl = smooth(0.42, 0.75, clouds[i]) * 0.7;
    const wh = smooth(0.55, 0.8, milk[i]) * 0.5;
    const ve = (1 - smooth(0, 0.02, Math.abs(veins[i] - 0.5))) * 0.12;
    const rgb = [176, 188, 172].map((v, ch) => {
      v += ([132, 150, 134][ch] - v) * cl;
      v += ([206, 212, 200][ch] - v) * wh;
      return v + ([110, 128, 112][ch] - v) * ve;
    });
    img.data.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Value noise (a few octaves, 0–1) on an S×S grid that wraps round seamlessly both ways. */
function tileNoise(S, cells, octaves) {
  const out = new Float32Array(S * S);
  let amp = 0.5, total = 0;
  for (let o = 0, n = cells; o < octaves; o++, n *= 2, amp *= 0.5) {
    const lattice = Float32Array.from({ length: n * n }, Math.random);
    const at = (i, j) => lattice[(j % n) * n + (i % n)];
    total += amp;
    for (let y = 0; y < S; y++) {
      const fy = (y / S) * n, iy = Math.floor(fy), ty = fy - iy, sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < S; x++) {
        const fx = (x / S) * n, ix = Math.floor(fx), tx = fx - ix, sx = tx * tx * (3 - 2 * tx);
        const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
        const bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
        out[y * S + x] += (top + (bottom - top) * sy) * amp;
      }
    }
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/**
 * The scroll the drop falls into: a handscroll lying unrolled, its paper mounted in grey-blue
 * silk at either end, wound on dark wooden rollers with pale jade knobs. splash(x, z, age):
 * the drop's ink spreading into the paper where it landed (x, z: on the scroll), age seconds on.
 */
function makeScroll() {
  const { width: W, depth: D } = SCROLL;
  const group = new THREE.Group();

  // the paper and its silk mounting, painted onto one canvas
  const c = document.createElement("canvas");
  c.width = 2048;
  c.height = Math.round((2048 * D) / W);
  const g = c.getContext("2d");
  const cw = c.width, ch = c.height;
  g.fillStyle = "#efe7d6";
  g.fillRect(0, 0, cw, ch);
  for (let i = 0; i < 2600; i++) { // fibres in the paper
    const x = Math.random() * cw, y = Math.random() * ch, a = Math.random() * Math.PI;
    const l = 4 + Math.random() * 16;
    g.strokeStyle = `rgba(150, 130, 100, ${0.04 + Math.random() * 0.08})`;
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  const silk = cw * 0.075;
  for (const x0 of [0, cw - silk]) { // the silk at either end, with a fine border where it meets the paper
    g.fillStyle = "#6f7f8c";
    g.fillRect(x0, 0, silk, ch);
    for (let y = 0; y < ch; y += 6) {
      g.fillStyle = `rgba(255, 255, 255, ${0.03 + (y % 12 ? 0 : 0.03)})`;
      g.fillRect(x0, y, silk, 2);
    }
    g.fillStyle = "#c8b78f";
    g.fillRect(x0 === 0 ? silk - 6 : x0, 0, 6, ch);
  }
  g.fillStyle = "rgba(111, 127, 140, 0.9)"; // (silk bands along the long edges too)
  g.fillRect(0, 0, cw, ch * 0.035);
  g.fillRect(0, ch * 0.965, cw, ch * 0.035);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const paper = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map, roughness: 0.95, envMapIntensity: 0.9 }),
  );
  group.add(paper);

  // the rollers it's wound on, at either end, with jade knobs
  const wood = new THREE.MeshPhysicalMaterial({ color: 0x2c2018, roughness: 0.45, clearcoat: 0.6 });
  const jade = new THREE.MeshPhysicalMaterial({ color: 0xbfd0c4, roughness: 0.15, clearcoat: 1 }); // (solid: no see-through, so no extra transmission pass)
  for (const s of [-1, 1]) {
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, D + 0.3, 32).rotateX(Math.PI / 2), wood);
    roller.position.set(s * (W / 2 + 0.1), 0.11, 0);
    group.add(roller);
    for (const e of [-1, 1]) {
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.16, 32).rotateX(Math.PI / 2), jade);
      knob.position.set(s * (W / 2 + 0.1), 0.11, e * (D / 2 + 0.22));
      group.add(knob);
    }
  }

  // the splash: a blot of ink, spreading into the paper
  const blot = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: blotTexture(), transparent: true, depthWrite: false, color: 0xffffff }),
  );
  blot.position.y = 0.003;
  blot.visible = false;
  group.add(blot);

  return {
    group,
    splash(x, z, age) {
      blot.visible = true;
      blot.position.x = x;
      blot.position.z = z;
      blot.scale.setScalar(0.1 + 0.3 * (1 - Math.exp(-age * 3.5))); // (fast, then slowly creeping out)
    },
    /** The blot's middle (world space) and the radius of its body of ink (m). */
    blotWorld() {
      group.updateMatrixWorld();
      return { center: blot.getWorldPosition(new THREE.Vector3()), radius: blot.scale.x * 0.27 };
    },
  };
}

/** A blot of ink soaking into paper: a ragged, feathered round (it spreads; it doesn't splatter). */
function blotTexture() {
  const S = 512;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  g.filter = "blur(3px)";
  g.fillStyle = "rgba(10, 11, 14, 0.95)";
  for (let i = 0; i < 70; i++) { // overlapping lobes: a ragged edge
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * S * 0.12;
    g.beginPath();
    g.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, S * (0.12 + Math.random() * 0.12), 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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

/**
 * Incense smoke, rising from somewhere down below: a thread that comes up straight, starts to
 * waver, and higher up curls and comes apart into wisps that thin away into the grey. Each
 * thread is a shader on a tall card turned to face you (no textures: nothing to make or load).
 *   at:     its source (m), well below what you see, so the thread comes up into view
 *   narrowX: ...its x on a tall phone screen, where there's less room beside the brush
 *   size:   the card it's drawn on, wide and tall (m), up from the source
 *   shape:  m above the source where it starts to waver, where it's all curls, where it's gone
 *   thick:  its half-width at the source, and up where it's gone (m)
 */
const SMOKE = [
  { at: [1.35, -4, -1.6], narrowX: 0.95, size: [4.5, 12.5], shape: [6.4, 9.6, 12], thick: [0.01, 0.3], opacity: 0.55, seed: 0.37 },
  // ...and a fainter one further back
  { at: [8.5, -6, -13], size: [8, 20], shape: [12, 16, 19.5], thick: [0.03, 0.6], opacity: 0.22, seed: 2.71 },
];

function makeSmoke(scene, eye) {
  const threads = SMOKE.map(({ at, narrowX = at[0], size, shape, thick, opacity, seed }) => {
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uSeed: { value: seed },
        uOpacity: { value: opacity },
        uSize: { value: new THREE.Vector2(...size) },
        uShape: { value: new THREE.Vector3(...shape) },
        uThick: { value: new THREE.Vector2(...thick) },
        uColor: { value: new THREE.Color(0xd9dde2) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime, uSeed, uOpacity;
        uniform vec2 uSize, uThick;
        uniform vec3 uShape, uColor;
        varying vec2 vUv;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
        }
        float fbm(vec2 p) {
          float s = 0.0, a = 0.5;
          for (int i = 0; i < 4; i++) { s += a * n(p); p = p * 2.03 + 17.1; a *= 0.5; }
          return s;
        }
        void main() {
          vec2 p = vec2((vUv.x - 0.5) * uSize.x, vUv.y * uSize.y); // m: across from the thread, up from its source
          float t = uTime + uSeed * 10.0;
          float waver = smoothstep(uShape.x, uShape.y, p.y); // 0: a straight thread → 1: all curls
          float k = smoothstep(uShape.x, uShape.z, p.y);     // 0 → 1: from where it starts to go, to gone
          // the whole column leans and sways, slowly
          float sway = (n(vec2(p.y * 0.3 - t * 0.12, uSeed * 7.0)) - 0.5) * 1.0 * waver;
          // ripples running up the thread as it starts to go
          float ripple = sin(p.y * 2.6 - t * 1.1 + uSeed * 4.0) * 0.12 * smoothstep(uShape.x, mix(uShape.x, uShape.y, 0.5), p.y);
          // eddies: the air stirring it, carried up with it
          vec2 q = vec2(p.x * 1.1, p.y - t * 0.45) * 0.8;
          vec2 eddy = vec2(fbm(q + uSeed), fbm(q + uSeed + vec2(5.2, 1.3))) - 0.5;
          vec2 pw = p + eddy * 2.2 * waver * waver;
          float x = pw.x - sway - ripple;
          // a ribbon, twisting as it rises: edge-on it's thin and bright, face-on wider and fainter
          float twist = 0.55 + 0.9 * n(vec2(p.y * 1.4 - t * 0.45, uSeed * 3.0));
          float w = mix(uThick.x, uThick.y, k * k) * twist;
          float a = exp(-x * x / (w * w)) / twist;
          // faint where it first comes up, still and straight
          a *= mix(0.25, 1.0, smoothstep(uShape.x - 1.5, uShape.x + 1.0, p.y));
          // higher up it comes apart into wisps
          float wisps = smoothstep(0.35, 0.7, fbm(pw * vec2(2.4, 1.2) - vec2(0.0, t * 0.6) + uSeed * 3.0));
          a *= mix(1.0, wisps, smoothstep(0.15, 0.8, k));
          // fainter as it spreads, and gone by the top
          a *= mix(1.0, 0.25, k) * (1.0 - smoothstep(0.7, 1.0, k)) * uOpacity;
          gl_FragColor = vec4(uColor, a);
          #include <colorspace_fragment>
        }
      `,
    });
    const card = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]).translate(0, size[1] / 2, 0), material);
    card.position.fromArray(at);
    scene.add(card);
    return { material, opacity, card, x: [at[0], narrowX] };
  });
  return {
    /** Where the threads rise, for this shape of screen (tall phone screens: narrowX). */
    layout(aspect) {
      for (const s of threads) {
        s.card.position.x = s.x[aspect < 0.8 ? 1 : 0];
        s.card.lookAt(eye.x, s.card.position.y, eye.z); // (upright, turned to face you)
      }
    },
    /** k: 1 → 0, the smoke fading away */
    fade(k) {
      for (const s of threads) s.material.uniforms.uOpacity.value = s.opacity * k;
    },
    update(dt) {
      for (const s of threads) s.material.uniforms.uTime.value += dt;
    },
  };
}
