import * as THREE from "three";
import { CONFIG } from "../config.js";

// The ink field: a top-down map of how far ink has spread across the world.
//
// Every "drop" (one lands at your feet every few steps, or wherever you click)
// grows outward over time. Each texel stores, per channel, how far inside the
// nearest growing drop it is:  margin = growth(age) - distance / reach
//   > 0  → ink has arrived     < 0 → still dry paper
// Different channels spread at different scales so small things need you close
// and mountains catch the ink from far away:
//   x: mid    (trees, buildings, river)  reach 30
//   y: far    (mountains)                reach 240
//   z: ground (the wash at your feet)    reach 14
//   w: wetness (fresh ink, dries over time)

export const MAX_DROPS = 128;

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const fragmentShader = /* glsl */ `
  #define MAX_DROPS ${MAX_DROPS}
  uniform vec4 uDrops[MAX_DROPS]; // x, z, birth time, packed strength + speed (see add())
  uniform int uCount;
  uniform float uTime;
  uniform vec4 uRect;   // x0, z0, width, depth (world units)
  uniform vec4 uReach;  // per-channel reach (world units)
  uniform vec4 uGrow;   // per-channel growth time constant (seconds)
  uniform float uQuick; // quick drops grow this many times faster
  uniform float uDry;   // how long fresh ink stays wet (seconds)
  varying vec2 vUv;

  void main() {
    vec2 xz = uRect.xy + vUv * uRect.zw;
    vec4 m = vec4(-1.0);
    float wet = 0.0;
    for (int i = 0; i < MAX_DROPS; i++) {
      if (i >= uCount) break;
      vec4 dp = uDrops[i];
      float age = uTime - dp.z;
      if (age <= 0.0) continue;
      float quick = step(9.5, dp.w);        // w = strength (0..1) + 10 if quick
      float strength = dp.w - quick * 10.0;
      float d = distance(xz, dp.xy);
      // fast at first, then slows, like a real bloom
      vec4 grow = 1.0 - exp(-age * mix(1.0, uQuick, quick) / uGrow);
      vec4 mm = grow - d / (uReach * strength);
      m = max(m, mm);
      wet = max(wet, smoothstep(-0.02, 0.15, mm.z) * exp(-age / uDry));
    }
    gl_FragColor = vec4(clamp(m.xyz, -1.0, 1.0), wet);
  }
`;

export class InkField {
  /**
   * reach / grow: [mid, far, ground] (metres / seconds). Defaults are the ink's;
   * app/colour.js makes a second field with its own for the colour stage.
   */
  constructor(renderer, {
    rect = new THREE.Vector4(...CONFIG.ink.fieldRect),
    resolution = CONFIG.ink.fieldResolution,
    reach = CONFIG.ink.reach,
    grow = CONFIG.ink.grow,
    quick = CONFIG.ink.quick,
    dry = CONFIG.ink.dry,
  } = {}) {
    this.renderer = renderer;
    this.rect = rect;
    this.target = new THREE.WebGLRenderTarget(resolution, resolution, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.drops = Array.from({ length: MAX_DROPS }, () => new THREE.Vector4(0, 0, 1e9, 1));
    this.kinds = [];
    this.count = 0;
    this.lastDropTime = -Infinity;

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uDrops: { value: this.drops },
        uCount: { value: 0 },
        uTime: { value: 0 },
        uRect: { value: rect },
        uReach: { value: new THREE.Vector4(...reach, 1) },
        uGrow: { value: new THREE.Vector4(...grow, 1) },
        uQuick: { value: quick },
        uDry: { value: dry },
      },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.dirty = true;
  }

  get texture() {
    return this.target.texture;
  }

  nearest(x, z) {
    let m = Infinity;
    for (let i = 0; i < this.count; i++) {
      const d = this.drops[i];
      m = Math.min(m, Math.hypot(d.x - x, d.y - z));
    }
    return m;
  }

  /**
   * kind:  "walk" drops are permanent; "flick" drops get recycled when the pool is full.
   * quick: grows uQuick× faster (everything except the slow opening bloom).
   */
  add(x, z, time, strength = 1, kind = "walk", quick = true) {
    let i = this.count;
    if (i >= MAX_DROPS) {
      // Recycle the oldest flick
      i = -1;
      let oldest = Infinity;
      for (let j = 0; j < this.count; j++) {
        if (this.kinds[j] === "flick" && this.drops[j].z < oldest) {
          oldest = this.drops[j].z;
          i = j;
        }
      }
      if (i < 0) return false;
    } else {
      this.count++;
    }
    this.drops[i].set(x, z, time, strength + (quick ? 10 : 0));
    this.kinds[i] = kind;
    this.lastDropTime = Math.max(this.lastDropTime, time);
    this.dirty = true;
    this.lastIndex = i; // so a caller can strengthen this drop later (setStrength)
    return true;
  }

  /** Change how far a drop reaches (0–1), e.g. a colour bloom filling in while you look. */
  setStrength(i, strength) {
    const quick = this.drops[i].w >= 9.5;
    this.drops[i].w = strength + (quick ? 10 : 0);
    this.dirty = true;
  }

  update(time) {
    // Once every drop has finished spreading and drying, the field stops changing
    if (!this.dirty && time - this.lastDropTime > 35) return;
    this.dirty = false;
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uCount.value = this.count;
    const prev = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(prev);
  }
}
