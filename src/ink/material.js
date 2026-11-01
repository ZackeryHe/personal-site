import * as THREE from "three";
import { noise3 } from "./noise.js";

export const PAPER = new THREE.Color("#efe7d6");
export const INK = new THREE.Color("#161a21");
export const FAR_TINT = new THREE.Color("#6b7b89"); // distant things go pale blue-grey
export const OCHRE = new THREE.Color("#c99a62");    // 赭石: warm wash on lit faces
export const INDIGO = new THREE.Color("#5f7d92");   // 花青: cool wash in shadow
export const SEAL_RED = new THREE.Color("#b8322a");

// Uniforms shared by every ink material (same object references, so updating
// one value here updates every material).
export const globals = {
  tField: { value: null },                       // InkField texture
  uFieldRect: { value: new THREE.Vector4() },    // world rect the field covers
  uCam: { value: new THREE.Vector3() },
  uTime: { value: 0 },
  uIntro: { value: 0 },                          // 0 → 1 as the opening bloom sweeps the sky
  uSketchR: { value: 0 },                        // radius (m) around you that is line-drawn ahead of the ink
  uLastDrop: { value: new THREE.Vector4(0, 0, -100, 1) }, // for the ripple on impact
  uPaper: { value: PAPER },
  uFarTint: { value: FAR_TINT },
  uOchre: { value: OCHRE },
  uIndigo: { value: INDIGO },
};

const CHANNELS = {
  mid: new THREE.Vector4(1, 0, 0, 0),
  far: new THREE.Vector4(0, 1, 0, 0),
  ground: new THREE.Vector4(0, 0, 1, 0),
};

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uSway;
  uniform float uWiggle;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vUv;
  void main() {
    vec4 local = vec4(position, 1.0);
    vec3 n = normal;
    if (uWiggle > 0.0) { // swimming: a wave runs down the body (head at +z), strongest at the tail
      float ph = 0.0;
      #ifdef USE_INSTANCING
        ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 1.3;
      #endif
      local.x += sin(position.z * 9.0 + uTime * 9.0 + ph) * uWiggle * (1.0 - smoothstep(-0.45, 0.3, position.z));
    }
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
      n = mat3(instanceMatrix) * n;
    #endif
    vec4 w = modelMatrix * local;
    if (uSway > 0.0) { // wind: tops move, roots don't
      float h = max(w.y, 0.0);
      float phase = uTime * 0.9 + w.x * 0.15 + w.z * 0.11;
      w.x += sin(phase) * uSway * h * h;
      w.z += cos(phase * 0.8) * uSway * 0.6 * h * h;
    }
    vWorld = w.xyz;
    vNormal = normalize(mat3(modelMatrix) * n);
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D tField;
  uniform vec4 uFieldRect;
  uniform vec3 uCam;
  uniform float uTime;
  uniform float uIntro;
  uniform vec4 uLastDrop;
  uniform vec3 uPaper, uInk, uFarTint, uOchre, uIndigo;

  uniform vec4 uChannel;
  uniform float uBias, uClimb, uNoiseScale, uNoiseAmp, uEdge, uRimW, uRim;
  uniform float uNear, uFar, uMinFar, uDensity, uMist, uGrain, uSil, uWash, uDots;
  uniform float uShade, uNeedles, uRagged;
  uniform float uSketchR, uSketch;
  uniform float uHoles;
  #ifdef DECAL
    uniform sampler2D uMap;
  #endif
  uniform vec4 uCloud; // belt height, half-thickness, strength, drift speed
  uniform vec4 uFlow;  // river: flow direction xz, centre xz

  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vUv;

  ${noise3}

  void main() {
    float dist = distance(vWorld, uCam);
    float atm = smoothstep(uNear, uFar, dist);
    vec3 q = vWorld * uNoiseScale;
    float blot = fbm3(q + 3.1);
    float fingers = fbm3lo(q * 4.7 + 7.7);

    // ---------- Has the ink reached this point yet? ----------
  #ifdef GLOBAL_REVEAL
    float reach = uIntro * 1.4 - 0.3;
    #ifdef BACKDROP
      reach -= (1.0 - vUv.y) * 0.5; // ridgeline first, then the wash runs down
    #endif
    vec4 field = vec4(0.0);
  #else
    vec4 field = texture2D(tField, (vWorld.xz - uFieldRect.xy) / uFieldRect.zw);
    float reach = dot(field, uChannel);
  #endif
    // Ink climbs upward from the ground; noise makes the front blotchy with capillary fingers
    float margin = reach - uBias - max(vWorld.y, 0.0) * uClimb
                 + (blot - 0.5) * uNoiseAmp + (fingers - 0.5) * uNoiseAmp * 0.45;
    float wet = smoothstep(-uEdge, uEdge, margin);
  #ifndef GROUND
    if (wet < 0.01) {
      // No ink yet. Near you it is still *drawn* (白描): left as blank paper, and
      // alpha 0.5 tells the watercolour pass to sketch its outline. Further out: nothing.
      float sketchMargin = (uSketchR - distance(vWorld.xz, uCam.xz)) / 15.0
                         + (blot - 0.5) * 0.8 * min(1.0, uSketchR / 20.0);
      if (uSketch > 0.5 && uSketchR > 1.0 && sketchMargin > 0.0) {
        gl_FragColor = vec4(uPaper, 0.5);
        return;
      }
      discard;
    }
  #endif
    // scholar's rocks: weathered right through with holes
    if (uHoles > 0.0 && noise3(vWorld * 1.7 + 5.0) > 1.0 - uHoles) discard;
    // pigment piles up at the advancing edge: the dark watercolour rim
    float rim = wet * exp(-max(margin, 0.0) / uRimW);

    // ---------- Shading as ink density ----------
    vec3 N = normalize(vNormal);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(uCam - vWorld);
    float lit = clamp(dot(N, normalize(vec3(-0.4, 0.8, 0.3))) * 0.5 + 0.5, 0.0, 1.0);
    float shade = mix(1.0, uShade, lit); // upward/lit faces are left mostly as paper
    float sil = pow(1.0 - abs(dot(N, V)), 3.0);
    // ragged silhouettes: needle tips, dry-brush edges
    if (uRagged > 0.0 && sil * uRagged > noise3(vWorld * 9.0)) discard;

    // brush texture: long vertical strokes + dry-brush gaps
    float stroke = fbm3(vec3(vWorld.x * uGrain, vWorld.y * uGrain * 0.25, vWorld.z * uGrain));
    float dry = smoothstep(0.25, 0.6, fbm3lo(vWorld * uGrain * 3.0 + 11.0));
    float tex = mix(0.35, 1.0, stroke) * mix(0.7, 1.0, dry);

    // mist pools low; drifting cloud belts cut through the tall peaks
    float mist = smoothstep(-0.5, uMist, vWorld.y + (blot - 0.5) * uMist * 0.8);
    float cloud = 0.0;
    if (uCloud.z > 0.0) {
      float drift = uTime * uCloud.w;
      float cy = uCloud.x + (fbm3lo(vec3(vWorld.x * 0.012 + drift * 0.01, 0.0, vWorld.z * 0.012)) - 0.5) * uCloud.y * 3.0;
      float dy = (vWorld.y - cy) / uCloud.y;
      cloud = exp(-dy * dy) * uCloud.z;
      cloud *= smoothstep(0.25, 0.55, fbm3lo(vec3(vWorld.x * 0.03 + drift * 0.03, vWorld.y * 0.08, vWorld.z * 0.03)));
    }
    float air = mix(0.12, 1.0, mist) * (1.0 - cloud);

    float ink = (tex * shade + sil * uSil) * wet + rim * uRim;

    // pine needles: fine radiating streaks
    if (uNeedles > 0.0) {
      float nd = abs(sin(vUv.x * 140.0 + noise3(vWorld * 3.0) * 6.0));
      ink *= mix(1.0, mix(0.45, 1.15, smoothstep(0.2, 0.9, nd)), uNeedles);
    }

    // moss dots (苔点) on upward-facing ridges
    if (uDots > 0.0) {
      float dots = smoothstep(0.80, 0.86, noise3(vWorld * 1.1)) * smoothstep(0.45, 0.85, N.y);
      ink += dots * uDots * wet;
    }

  #ifdef GROUND
    {
      // a light wash at your feet: darker while wet, drying to a faint stain,
      // with a tide line where the bloom stopped
      float wetness = field.w;
      float stainTex = mix(0.6, 1.0, fbm3(vec3(vWorld.x, 0.0, vWorld.z) * uGrain));
      ink = stainTex * wet * mix(0.22, 1.0, wetness) + rim * uRim * mix(0.35, 1.0, wetness);
      // ripple where a drop just landed
      float age = uTime - uLastDrop.z;
      if (age > 0.0 && age < 3.0) {
        float rd = distance(vWorld.xz, uLastDrop.xy);
        float k = (rd - age * 4.0 * uLastDrop.w) / 0.45;
        ink += exp(-k * k) * exp(-age * 1.3) * 1.5;
      }
    }
  #endif

  #ifdef RIVER
    {
      // water is mostly left blank: long wavy ripple strokes + darker banks
      vec2 rel = vWorld.xz - uFlow.zw;
      float along = dot(rel, uFlow.xy);
      float across = dot(rel, vec2(-uFlow.y, uFlow.x));
      float t = uTime * 0.6;
      float w = fbm3lo(vec3(along * 0.08 - t * 0.2, 0.0, across * 0.3)) * 2.0;
      float ripple = abs(sin((across + w) * 2.6));
      float lineMask = smoothstep(0.93, 0.995, ripple);
      float broken = smoothstep(0.4, 0.62, fbm3lo(vec3(along * 0.25 - t, 2.0, across * 0.8)));
      float bank = smoothstep(2.2, 3.4, abs(across));
      ink = (lineMask * broken * 0.9 + bank * 0.35 + 0.04) * wet + rim * uRim * 0.5;
    }
  #endif

  #ifdef POND
    {
      // still water: faint rings drifting outward, darker toward the banks
      vec2 rel = vWorld.xz - uFlow.zw;
      float rr = length(rel);
      float R = uFlow.x;
      float w = fbm3lo(vec3(rel.x * 0.3, uTime * 0.15, rel.y * 0.3)) * 1.5;
      float rings = smoothstep(0.94, 0.995, abs(sin((rr + w) * 3.0)));
      rings *= smoothstep(0.35, 0.6, fbm3lo(vec3(rel.x * 0.5, 3.0 + uTime * 0.2, rel.y * 0.5)));
      float bank = smoothstep(R * 0.65, R, rr);
      ink = (rings * 0.55 + bank * 0.5 + 0.06) * wet + rim * uRim * 0.5;
    }
  #endif

  #ifdef WATERFALL
    {
      // falling water is left as bare paper: a few streaks racing down, darker rocky edges
      // (vUv.x across the falls, vUv.y from the lip (0) to the foot (1))
      float streaks = smoothstep(0.6, 0.9, noise3(vec3(vUv.x * 14.0, vUv.y * 3.0 - uTime * 1.6, 0.5)));
      float edge = smoothstep(0.3, 0.5, abs(vUv.x - 0.5));
      ink = (streaks * 0.55 + edge * 0.6) * wet + rim * uRim * 0.3;
    }
  #endif

  #ifdef DECAL
    {
      // painted lettering (e.g. the name carved into the entrance rock)
      float a = texture2D(uMap, vUv).a;
      if (a < 0.08) discard;
      ink = a * wet * mix(0.75, 1.0, stroke) + rim * uRim * a;
    }
  #endif

  #ifdef BACKDROP
    {
      // "boneless" distant ranges: darkest at the ridge, dissolving into mist below
      float h = clamp(vUv.y, 0.0, 1.0);
      float washTex = mix(0.5, 1.0, fbm3(vec3(vWorld.x * 0.02, vWorld.y * 0.05, vWorld.z * 0.02)));
      ink = washTex * pow(h, 1.6) * wet + rim * uRim * h;
    }
  #endif

    ink *= uDensity * mix(1.0, uMinFar, atm) * air;

    // light colour washes (浅绛): ochre on lit faces, indigo in shadow
    vec3 washCol = mix(uIndigo, uOchre, smoothstep(0.35, 0.75, lit));
    vec3 base = mix(uPaper, washCol, uWash * 0.4 * wet * air * (1.0 - atm * 0.7));
    vec3 inkCol = mix(uInk, uFarTint, atm);
    // alpha flags for the watercolour pass: 1 = inked object, 0 = ground/sky (no outline)
  #ifdef GROUND
    float flag = 0.0;
  #else
    float flag = 1.0;
  #endif
    gl_FragColor = vec4(mix(base, inkCol, clamp(ink, 0.0, 1.0)), flag);
  }
`;

/**
 * Make an ink material. Everything drawn with it appears only once the
 * spreading ink reaches it.
 *
 * channel  which spread scale to follow ("mid" | "far" | "ground"); ignored with reveal: "global"
 * bias     extra ink needed before it shows (higher = you must be closer)
 * climb    how much slower ink is to reach higher up (per world unit)
 */
export function inkMaterial({
  channel = "mid",
  reveal = "field",           // "field" | "global" (sky things that bloom in with the intro)
  variant = null,             // null | "ground" | "river" | "backdrop"
  bias = 0, climb = 0.03, noiseScale = 0.3, noiseAmp = 0.3, edge = 0.03, rimWidth = 0.08, rim = 0.6,
  near = 8, far = 60, minFar = 0.3, density = 1, mist = 2, grain = 1, sil = 0.6, wash = 0, dots = 0,
  shade = 0.4, needles = 0, ragged = 0, sway = 0,
  cloud = new THREE.Vector4(0, 1, 0, 0), flow = new THREE.Vector4(1, 0, 0, 0),
  sketch = true,              // line-drawn (白描) before the ink arrives; ignored for global/ground
  wiggle = 0, holes = 0,      // swimming koi; scholar's-rock holes
  washLit = null, washShade = null, // per-material colour wash (default ochre / indigo)
  map = null,                 // alpha texture for variant "decal"
  color = INK, side = THREE.FrontSide,
} = {}) {
  const defines = {};
  if (reveal === "global") defines.GLOBAL_REVEAL = "";
  if (variant) defines[variant.toUpperCase()] = "";

  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    defines,
    side,
    uniforms: {
      ...globals,
      uInk: { value: color },
      uChannel: { value: CHANNELS[channel] },
      uBias: { value: bias },
      uClimb: { value: climb },
      uNoiseScale: { value: noiseScale },
      uNoiseAmp: { value: noiseAmp },
      uEdge: { value: edge },
      uRimW: { value: rimWidth },
      uRim: { value: rim },
      uNear: { value: near },
      uFar: { value: far },
      uMinFar: { value: minFar },
      uDensity: { value: density },
      uMist: { value: mist },
      uGrain: { value: grain },
      uSil: { value: sil },
      uWash: { value: wash },
      uDots: { value: dots },
      uShade: { value: shade },
      uNeedles: { value: needles },
      uRagged: { value: ragged },
      uSketch: { value: sketch && reveal !== "global" && variant !== "ground" && variant !== "decal" ? 1 : 0 },
      uWiggle: { value: wiggle },
      uHoles: { value: holes },
      ...(washLit ? { uOchre: { value: washLit } } : {}),
      ...(washShade ? { uIndigo: { value: washShade } } : {}),
      ...(map ? { uMap: { value: map } } : {}),
      uSway: { value: sway },
      uCloud: { value: cloud },
      uFlow: { value: flow },
    },
  });
}
