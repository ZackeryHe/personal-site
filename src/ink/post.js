import * as THREE from "three";
import { noise2 } from "./noise.js";
import { PAPER, INK, globals } from "./material.js";

// Full-screen watercolor pass. The scene is rendered to a texture first, then
// this shader repaints it: wobbly hand-drawn edges, pigment pooling at the
// edges of washes, broken brush contour lines, granulation, and paper texture.

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 uRes;
  uniform float uNear, uFar;
  uniform float uSoft; // 0 → 1: sitting at the lookout, the distant trees soften
  uniform vec3 uPaper, uInk, uSketchCol;
  // the noise that stays put on the screen, baked once per size (bakeShader, below):
  // A: wobble x, wobble y, brush, dash   B: grove strokes, granulation, paper ×, paper −
  uniform sampler2D tNoiseA, tNoiseB;
  varying vec2 vUv;

  float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
  float isSketch(float a) { return step(0.25, a) * step(a, 0.75); }
  float darkAt(vec2 uv) { return clamp(1.0 - lum(texture2D(tColor, uv).rgb) / lum(uPaper), 0.0, 1.0); }
  // 1/depth is linear across flat surfaces, so its Laplacian only fires on silhouettes and creases
  float invDepth(vec2 uv) { float z = texture2D(tDepth, uv).x; return (uFar - z * (uFar - uNear)) / (uNear * uFar); }

  void main() {
    vec2 px = 1.0 / uRes;
    float aspect = uRes.x / uRes.y;
    vec2 p = vUv * vec2(aspect, 1.0);

    // 1. Hand-painted wobble
    vec4 nA = texture2D(tNoiseA, vUv);
    vec4 nB = texture2D(tNoiseB, vUv);
    vec2 wob = nA.xy - 0.5;
    vec2 uv = vUv + wob * 0.007;

    vec3 col = texture2D(tColor, uv).rgb;
    float d = darkAt(uv);

    // 0. Seated at the lookout, the trees and bamboo down in the valley go soft: blurred where
    // they are (and just round them, so their own fussy outlines soften too), from about 20 m off.
    // Each grove is then drawn as one shape, the way a painter does it: a light wash binding it
    // together, and a brushed contour round it where it stands against the mist and the land far
    // behind it (not between trees standing together, nor where a trunk meets the ground).
    float softened = 0.0;
    float groveLine = 0.0;
    if (uSoft > 0.001) {
      vec3 acc = vec3(0.0);
      float trees = 0.0;    // how many of the samples are trees (soft, from ~20 m off)
      float treeNear = 1e6; // the nearest of them (m)
      float openFar = 0.0;  // the furthest sample that isn't a tree (m)
      float r = 2.6 * uRes.y / 900.0;
      for (int i = 0; i < 12; i++) {
        float a = float(i) * 2.39996; // golden angle
        vec2 tuv = uv + vec2(cos(a), sin(a)) * sqrt((float(i) + 0.5) / 12.0) * r * px;
        vec4 t = texture2D(tColor, tuv);
        acc += t.rgb;
        float sd = 1.0 / invDepth(tuv);
        float isTree = step(0.82, t.a) * step(t.a, 0.94) * smoothstep(16.0, 34.0, sd);
        trees += isTree;
        if (isTree > 0.5) treeNear = min(treeNear, sd);
        else openFar = max(openFar, sd);
      }
      float here = texture2D(tColor, uv).a;
      float self = step(0.82, here) * step(here, 0.94) * smoothstep(16.0, 34.0, 1.0 / invDepth(uv));
      float cover = trees / 12.0;
      softened = clamp(max(self, cover * 1.6), 0.0, 1.0) * uSoft;
      col = mix(col, acc / 12.0, softened);
      col *= mix(1.0, 0.8, smoothstep(0.25, 0.85, cover) * uSoft); // the grove's wash
      if (trees > 0.5 && trees < 11.5) {
        // its contour: along the blurred edge of the grove, where what's beside it is far behind
        float band = smoothstep(0.06, 0.32, cover) * (1.0 - smoothstep(0.62, 0.94, cover));
        float behind = smoothstep(1.15, 1.45, openFar / treeNear);
        float strokes = mix(0.4, 1.0, smoothstep(0.3, 0.7, nB.x)); // (broken, like a brush's)
        groveLine = band * behind * strokes * uSoft * (1.0 - smoothstep(170.0, 320.0, treeNear));
      }
    }

    // 2. Edge darkening: pigment pools where a wash meets lighter paper
    float blur = 0.0;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7853982;
      blur += darkAt(uv + vec2(cos(a), sin(a)) * px * 5.0);
    }
    blur /= 8.0;
    float pool = smoothstep(0.0, 0.25, d - blur);

    // 3. Contour strokes from depth, only where ink has already spread
    float ic = invDepth(uv);
    float lap = abs(invDepth(uv + vec2(px.x * 1.5, 0.0)) + invDepth(uv - vec2(px.x * 1.5, 0.0))
                  + invDepth(uv + vec2(0.0, px.y * 1.5)) + invDepth(uv - vec2(0.0, px.y * 1.5))
                  - 4.0 * ic) / ic;
    float dist = 1.0 / ic;
    float edge = smoothstep(0.02, 0.1, lap);
    float inkGate = smoothstep(0.06, 0.25, max(d, blur));
    float brush = smoothstep(0.35, 0.65, nA.z); // breaks lines into strokes
    float line = edge * inkGate * mix(0.35, 1.0, brush) * (1.0 - smoothstep(40.0, 150.0, dist));

    // 3b. Sketch (白描): things the ink hasn't reached yet are flagged with alpha 0.5
    // (inked objects and sky are 1, ground 0). They get a light, broken
    // underdrawing instead of an ink outline.
    float sk = isSketch(texture2D(tColor, uv).a);
    sk = max(sk, isSketch(texture2D(tColor, uv + vec2(px.x * 1.5, 0.0)).a));
    sk = max(sk, isSketch(texture2D(tColor, uv - vec2(px.x * 1.5, 0.0)).a));
    sk = max(sk, isSketch(texture2D(tColor, uv + vec2(0.0, px.y * 1.5)).a));
    sk = max(sk, isSketch(texture2D(tColor, uv - vec2(0.0, px.y * 1.5)).a));
    float dash = smoothstep(0.32, 0.6, nA.w);
    float sketch = edge * sk * (1.0 - inkGate) * mix(0.15, 1.0, dash)
                 * (1.0 - smoothstep(28.0, 45.0, dist));

    line *= 1.0 - softened * 0.85; // (softened: no fussy outlines or pooled edges, just the grove's)
    pool *= 1.0 - softened * 0.6;
    vec3 c = mix(col, uInk, clamp(pool * 0.35 + line * 0.75 + groveLine * 0.8, 0.0, 0.9));
    c = mix(c, uSketchCol, sketch * 0.7);

    // 4. Granulation (pigment settling into paper tooth), only inside pigment
    float gran = nB.y;
    c *= mix(1.0, 0.8 + 0.3 * gran, d);

    // 5. Paper: stains, tooth, fibres and the aged vignette (all baked: see bakeShader)
    c = c * nB.z - nB.w;

    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`;

// Bakes the noise that stays put on the screen (it depends only on where on the screen you
// are), so the watercolour pass reads it instead of computing a dozen fbm's per pixel.
// Drawn twice: uPart 0 → tNoiseA, uPart 1 → tNoiseB (see the uniforms above).
const bakeShader = /* glsl */ `
  uniform vec2 uRes;
  uniform float uPart;
  varying vec2 vUv;
  ${noise2}
  void main() {
    float aspect = uRes.x / uRes.y;
    vec2 p = vUv * vec2(aspect, 1.0);
    if (uPart < 0.5) {
      gl_FragColor = vec4(fbm2(p * 5.0), fbm2(p * 5.0 + 11.3), fbm2(p * 18.0 + 4.0), fbm2(p * 40.0 + 9.0));
      return;
    }
    // paper: large soft stains + fine tooth + long xuan-paper fibres, and the aged vignette,
    // folded into c = c * mul - sub
    float stain = 0.95 + 0.07 * fbm2(p * 3.0);
    float tooth = (noise2(vUv * uRes * 0.9) - 0.5) * 0.03;
    float fib = 0.0;
    for (int k = 0; k < 2; k++) {
      float a = float(k) * 2.1 + 0.4;
      vec2 r = mat2(cos(a), -sin(a), sin(a), cos(a)) * p;
      fib += smoothstep(0.8, 0.95, noise2(vec2(r.x * 14.0, r.y * 170.0) + float(k) * 13.7));
    }
    fib *= smoothstep(0.45, 0.7, fbm2(p * 2.5 + 5.0)); // fibres only in patches
    float v = 1.0 - smoothstep(0.35, 1.2, length((vUv - 0.5) * vec2(aspect, 1.0)));
    float after = (1.0 - fib * 0.012) * mix(0.85, 1.0, v);
    gl_FragColor = vec4(fbm2(p * 22.0 + 7.0), noise2(vUv * uRes * 0.35), stain * after, tooth * after);
  }
`;

export class WatercolorPass {
  constructor(renderer) {
    this.renderer = renderer;
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.target.depthTexture = new THREE.DepthTexture(1, 1);

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        uRes: { value: new THREE.Vector2(1, 1) },
        uNear: { value: 0.5 },
        uFar: { value: 900 },
        uPaper: { value: PAPER },
        uInk: { value: INK },
        uSketchCol: { value: new THREE.Color("#6e5d4a") }, // light sepia underdrawing
        uSoft: globals.uSoft, // (shared: set by app/walker.js as you sit)
        tNoiseA: { value: null },
        tNoiseB: { value: null },
      },
    });
    const noiseTarget = () => new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false,
    });
    this.noise = [noiseTarget(), noiseTarget()];
    this.material.uniforms.tNoiseA.value = this.noise[0].texture;
    this.material.uniforms.tNoiseB.value = this.noise[1].texture;
    this.bakeMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: bakeShader,
      depthTest: false,
      depthWrite: false,
      uniforms: { uRes: { value: new THREE.Vector2(1, 1) }, uPart: { value: 0 } },
    });
    this.bakedAt = new THREE.Vector2(0, 0); // the size the noise was last baked at
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.quad = quad;
    this.scene = new THREE.Scene();
    this.scene.add(quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  setSize(w, h) {
    const pr = this.renderer.getPixelRatio();
    this.target.setSize(Math.floor(w * pr), Math.floor(h * pr));
    this.material.uniforms.uRes.value.set(Math.floor(w * pr), Math.floor(h * pr));
  }

  /** Size it in device pixels directly (e.g. for an offscreen keepsake), ignoring the pixel ratio. */
  setPixelSize(w, h) {
    this.target.setSize(w, h);
    this.material.uniforms.uRes.value.set(w, h);
  }

  /** Paint the scene: to the screen, or into `output` (a render target) if given. */
  render(scene, camera, output = null) {
    const res = this.material.uniforms.uRes.value;
    if (!this.bakedAt.equals(res)) this.bake(res);
    this.material.uniforms.uNear.value = camera.near;
    this.material.uniforms.uFar.value = camera.far;
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(output);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
  }

  /** Bake the screen's still noise at this size (only when the size changes). */
  bake(res) {
    this.bakedAt.copy(res);
    this.bakeMaterial.uniforms.uRes.value.copy(res);
    this.quad.material = this.bakeMaterial;
    for (let part = 0; part < 2; part++) {
      this.noise[part].setSize(res.x, res.y);
      this.bakeMaterial.uniforms.uPart.value = part;
      this.renderer.setRenderTarget(this.noise[part]);
      this.renderer.render(this.scene, this.camera);
    }
    this.quad.material = this.material;
  }

  dispose() {
    this.noise.forEach((t) => t.dispose());
    this.bakeMaterial.dispose();
    this.target.depthTexture?.dispose();
    this.target.dispose();
    this.material.dispose();
  }
}
