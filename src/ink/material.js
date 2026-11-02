import * as THREE from "three";
import { noise3 } from "./noise.js";
import { LAND, RIM_FADE } from "../world/path.js";

export const PAPER = new THREE.Color("#efe7d6");
export const INK = new THREE.Color("#161a21");
export const FAR_TINT = new THREE.Color("#6b7b89"); // distant things go pale blue-grey
export const OCHRE = new THREE.Color("#c99a62");    // 赭石: warm wash on lit faces
export const INDIGO = new THREE.Color("#5f7d92");   // 花青: cool wash in shadow
export const SEAL_RED = new THREE.Color("#b8322a");
export const SUN_GLOW = new THREE.Color("#efb48a"); // the warm wash the setting sun spreads (sky.js)

// 设色: the colours things take on where colour has bloomed (app/colour.js).
//   wash: what lit / pale areas turn toward   ink: what the dark ink turns toward
const tint = (wash, ink, amount) => ({ wash: new THREE.Color(wash), ink: new THREE.Color(ink), amount });
export const TINTS = {
  foliage: tint("#a9c47f", "#24503a", 0.9),
  wood: tint("#c09a6b", "#43301f", 0.55),
  rock: tint("#cfae7f", "#33485a", 0.45),
  ground: tint("#c9dca0", "#4d6e3c", 0.8),
  water: tint("#a3cbc6", "#256478", 0.8),
  mountain: tint("#86b596", "#2b5f95", 0.85), // 青绿 "blue-green landscape": malachite + azurite
  blossom: tint("#f2a7b4", "#c41f3d", 1.0),
};

// Uniforms shared by every ink material (same object references, so updating
// one value here updates every material).
export const globals = {
  tField: { value: null },                       // InkField texture
  tColour: { value: null },                      // colour-stage field (app/colour.js)
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
  uSun: { value: new THREE.Vector3(0, 100, -700) }, // where the sun is (sky.js sets it)
  // the land rising to the canyon's rim (path.js groundAt): the brink (x, z), the way to the
  // canyon (x, z), and how high the rim rises. Ink climbs objects from the ground they stand on.
  uAtmScale: { value: 1 },  // pushes the atmospheric fade further off (the painting at the end: app/walker.js)
  uSoft: { value: 0 },      // 0 → 1: seated at the lookout, distant trees soften (ink/post.js)
  uLand: { value: new THREE.Vector4(0, -1e5, 0, -1) },
  uLandHeight: { value: 0 },
  uSunGlow: { value: SUN_GLOW },
};

const CHANNELS = {
  mid: new THREE.Vector4(1, 0, 0, 0),
  far: new THREE.Vector4(0, 1, 0, 0),
  ground: new THREE.Vector4(0, 0, 1, 0),
};

// the height of the ground under x, z: the same as path.js groundAt (LAND, roll)
const f = (x) => x.toFixed(4);
const landGLSL = /* glsl */ `
  uniform vec4 uLand;        // the brink (x, z), the way out over the canyon (x, z)
  uniform float uLandHeight; // how high the rim rises
  float landProfile(float d) {
    if (d <= ${f(LAND.base)}) return 0.0;
    float foot = smoothstep(${f(LAND.base)}, ${f(LAND.foot)}, d);
    float s = max(0.0, (d - ${f(LAND.foot)}) / ${f(LAND.brow - LAND.foot)});
    float a = pow(s, ${f(LAND.steep)});
    float h = max(${f(LAND.round)} - abs(a - 1.0), 0.0) / ${f(LAND.round)};
    float face = min(a, 1.0) - h * h * ${f(LAND.round)} * 0.25;
    return ${f(LAND.footShare)} * foot + ${f(1 - LAND.footShare)} * face;
  }
  float groundAt(vec2 p) {
    vec2 rel = p - uLand.xy;
    float d = dot(rel, uLand.zw);
    float lat = dot(rel, vec2(-uLand.w, uLand.z));
    float roll = 1.0 + 0.22 * (sin(lat * 0.045 + 0.7) - sin(0.7)) + 0.1 * (sin(lat * 0.11 + 2.1) - sin(2.1));
    float ridge = 1.0 - ${f(1 - LAND.low)} * smoothstep(${f(LAND.spread[0])}, ${f(LAND.spread[1])}, abs(lat));
    return uLandHeight * roll * ridge * landProfile(d);
  }
  // 0 → 1: how far the rim has faded into mist here (the same as path.js rimFade)
  float rimFade(vec2 p) {
    vec2 rel = p - uLand.xy;
    float d = dot(rel, uLand.zw);
    float lat = dot(rel, vec2(-uLand.w, uLand.z));
    return smoothstep(${f(RIM_FADE.from[0])}, ${f(RIM_FADE.from[1])}, d) * smoothstep(${f(RIM_FADE.lat[0])}, ${f(RIM_FADE.lat[1])}, abs(lat));
  }
`;

const vertexShader = /* glsl */ `
  ${landGLSL}
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
    if (uSway > 0.0) { // wind: tops move, roots don't (measured from the ground they stand on)
      float h = max(w.y - groundAt(w.xz), 0.0);
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
  uniform float uNear, uFar, uMinFar, uDensity, uMist, uMistBase, uGrain, uSil, uWash, uDots;
  uniform float uShade, uNeedles, uRagged, uMistFloor;
  uniform float uSketchR, uSketch;
  uniform float uHoles;
  uniform sampler2D tColour;
  uniform vec4 uColourChannel;
  uniform vec3 uTintWash, uTintInk;
  uniform float uTint;
  uniform vec3 uSun, uSunGlow;
  uniform float uGlow, uSoftObj, uCun, uRimFade;
  uniform float uAtmScale;
  ${landGLSL}
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
    float atmK = mix(1.0, uAtmScale, smoothstep(80.0, 200.0, uFar)); // (mountain-scale things only)
    float atm = smoothstep(uNear * atmK, uFar * atmK, dist);
    vec3 q = vWorld * uNoiseScale;
    float blot = fbm3(q + 3.1);

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
    // (the fingers only matter near the front: computed only there)
    float margin = reach - uBias - max(vWorld.y - groundAt(vWorld.xz), 0.0) * uClimb
                 + (blot - 0.5) * uNoiseAmp;
    float fingers = 0.5;
    if (abs(margin) < uNoiseAmp * 0.25 + uEdge * 2.0 + 0.02) fingers = fbm3lo(q * 4.7 + 7.7);
    margin += (fingers - 0.5) * uNoiseAmp * 0.45;
    float wet = smoothstep(-uEdge, uEdge, margin);
  #ifndef GROUND
    if (wet < 0.01) {
      // No ink yet. Near you it is still *drawn* (白描): left as blank paper, and
      // alpha 0.5 tells the watercolour pass to sketch its outline. Further out: nothing.
      float sketchMargin = (uSketchR - distance(vWorld.xz, uCam.xz)) / 15.0
                         + (blot - 0.5) * 0.8 * min(1.0, uSketchR / 20.0);
      if (uRimFade > 0.5 && rimFade(vWorld.xz) > 0.5) discard; // (faded into the mist: not even drawn)
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
    // (mistBase: where the mist is thickest; mist: the height it clears by)
    float mist = smoothstep(uMistBase, uMist, vWorld.y + (blot - 0.5) * (uMist - uMistBase) * 0.8);
    float cloud = 0.0;
    if (uCloud.z > 0.0) {
      float drift = uTime * uCloud.w;
      float cy = uCloud.x + (fbm3lo(vec3(vWorld.x * 0.012 + drift * 0.01, 0.0, vWorld.z * 0.012)) - 0.5) * uCloud.y * 3.0;
      float dy = (vWorld.y - cy) / uCloud.y;
      cloud = exp(-dy * dy) * uCloud.z;
      // (soft-edged patches: crisp ones get outlined by the watercolour pass and read as holes)
      cloud *= smoothstep(0.15, 0.75, fbm3lo(vec3(vWorld.x * 0.03 + drift * 0.03, vWorld.y * 0.08, vWorld.z * 0.03)));
    }
    float air = mix(uMistFloor, 1.0, mist) * (1.0 - cloud);

    float ink = (tex * shade + sil * uSil) * wet + rim * uRim;

    // 皴 texture strokes, painted on a mountain (vUv: x round it, y from its summit out to its
    // foot): long hemp-fibre strokes (披麻皴) running down the slopes, wavering, breaking off here
    // and there, heavier on the steep flanks and the side away from the light; and faint ledges
    // (折带) across the steepest parts. Not at the very summit, nor down in the mist at the foot.
    if (uCun > 0.0) {
      float zone = smoothstep(0.08, 0.24, vUv.y) * (1.0 - smoothstep(0.8, 0.97, vUv.y));
      float closeBy = 1.0 - smoothstep(150.0, 320.0, dist); // (far off, too fine to draw)
      float reachK = zone * closeBy * uCun * wet;
      if (reachK > 0.01) { // (only where they can show: it's a lot of noise to compute)
        float ang = vUv.x * 6.2831853;
        vec3 pc = vec3(cos(ang), vUv.y * 2.5, sin(ang));
        float warp = fbm3lo(pc * 1.2 + 4.0) * 2.2;
        // (few strokes near the summit, more and more of them further down, as the fibres splay;
        // they waver only gently, so they run down the slopes rather than swirl)
        float few = smoothstep(0.86, 0.985, abs(sin((vUv.x * 56.0 + warp * 1.1) * 3.14159)));
        float many = smoothstep(0.87, 0.985, abs(sin((vUv.x * 150.0 + warp * 2.4) * 3.14159)));
        float fibres = mix(few, many, smoothstep(0.35, 0.75, vUv.y));
        float broken = smoothstep(0.35, 0.6, fbm3lo(vec3(cos(ang) * 7.0, vUv.y * 10.0, sin(ang) * 7.0) + 2.0));
        float flank = 1.0 - smoothstep(0.5, 0.92, N.y);
        float ledges = 0.0;
        if (N.y < 0.65) { // (ledges only across the steep parts, and only here and there)
          ledges = smoothstep(0.95, 0.997, abs(sin((vWorld.y + warp * 1.6) * 0.85))) * smoothstep(0.35, 0.8, 1.0 - N.y)
                 * smoothstep(0.45, 0.7, noise3(vec3(vWorld.x * 0.08, vWorld.y * 0.3, vWorld.z * 0.08) + 6.0));
        }
        ink += (fibres * broken * mix(0.3, 1.0, flank) * mix(1.0, 0.6, lit) * 0.55 + ledges * 0.14) * reachK;
      }
    }

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

  float rockInk = 0.0; // (ground: where it's steep enough to be rock)
  #ifdef GROUND
    {
      // a light wash at your feet: darker while wet, drying to a faint stain,
      // with a tide line where the bloom stopped
      float wetness = field.w;
      float stainTex = mix(0.6, 1.0, fbm3(vec3(vWorld.x, 0.0, vWorld.z) * uGrain));
      ink = stainTex * wet * mix(0.22, 1.0, wetness) + rim * uRim * mix(0.35, 1.0, wetness);
      // where it's steep (the face up to the rim) it's rock: firm hemp-fibre strokes running down
      // it (披麻皴), not the ground's pale wash (added after it, below: it carries a long way)
      float steep = 1.0 - smoothstep(0.72, 0.95, N.y);
      float fibres = fbm3(vec3(vWorld.x * 0.9, vWorld.y * 0.08, vWorld.z * 0.9));
      float strata = smoothstep(0.55, 0.8, fbm3lo(vec3(vWorld.x * 0.05, vWorld.y * 0.6, vWorld.z * 0.05)));
      // (inked as far out as the trees and rocks are, not just the ground's wash at your feet)
      float rockWet = smoothstep(-0.03, 0.03, field.x + (blot - 0.5) * 0.3);
      rockInk = steep * rockWet * (0.18 + 0.5 * fibres + 0.3 * strata);
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

  #ifdef CLOUDS
    {
      // a sea of cloud below the rim: soft grey hollows in white paper, drifting. The billows
      // are left bare on the side toward the sun, and shaded on the side away from it.
      vec3 cp = vec3(vWorld.x * 0.015 + uTime * 0.004, 0.0, vWorld.z * 0.02);
      float body = fbm3lo(cp);
      vec2 sunward = normalize((uSun - vWorld).xz);
      float slope = (fbm3lo(cp + vec3(sunward.x, 0.0, sunward.y) * 0.05) - body) * 14.0; // + facing the sun
      float detail = fbm3(cp * 3.0 + vec3(0.0, uTime * 0.01, 0.0));
      ink = smoothstep(0.3, 0.75, body) * (0.4 + 0.6 * detail) * 0.6;
      ink = (ink * (1.0 - clamp(slope, 0.0, 1.0) * 0.7) + clamp(-slope, 0.0, 1.0) * 0.18) * wet;
      // its grey thins away into the paper as it comes in to the rim (all along it, so it melts
      // into the land rather than meeting it in a line) and out toward its far edges
      vec2 rel = vWorld.xz - uLand.xy;
      float out_ = dot(rel, uLand.zw);                // metres out over the canyon from the brink
      float along = abs(dot(rel, vec2(-uLand.w, uLand.z)));
      ink *= smoothstep(6.0 + (blot - 0.5) * 16.0, 70.0, out_)
           * (1.0 - smoothstep(170.0, 400.0, along)) * (1.0 - smoothstep(560.0, 860.0, out_));
      air = 1.0; // it is the mist, so the ground mist doesn't fade it
    }
  #endif

  #ifdef WATERFALL
    {
      // falling water is left as bare paper: a few streaks racing down, darker rocky edges
      // (vUv.x across the falls, vUv.y from the lip (0) to the foot (1)).
      // Its sides fray and stream, and the water breaks over a ragged lip, so it never reads
      // as a flat board standing in the ravine.
      float fray = noise3(vec3(vUv.x * 5.0, vUv.y * 9.0 - uTime * 1.1, 1.7));
      if (abs(vUv.x - 0.5) * 2.0 > 0.9 + (fray - 0.5) * 0.3) discard;
      if (vUv.y < 0.03 + 0.05 * noise3(vec3(vUv.x * 6.0, 4.2, uTime * 0.2))) discard;
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
    // (the rock strokes fade with distance the way the mountains do, not like the ground's wash)
    float rockFar = smoothstep(30.0, 300.0, dist);
    rockInk *= mix(1.0, 0.35, rockFar);

    // light colour washes (浅绛): ochre on lit faces, indigo in shadow
    vec3 washCol = mix(uIndigo, uOchre, smoothstep(0.35, 0.75, lit));
    vec3 base = mix(uPaper, washCol, uWash * 0.4 * wet * air * (1.0 - atm * 0.7));
    vec3 inkCol = mix(uInk, uFarTint, atm);

    // 设色: colour blooms where you've stood still and looked (app/colour.js)
    if (uTint > 0.0) {
      vec4 cf = texture2D(tColour, (vWorld.xz - uFieldRect.xy) / uFieldRect.zw);
      float cm = dot(cf, uColourChannel) + (blot - 0.5) * 0.4 + (fingers - 0.5) * 0.15;
      float tint = smoothstep(0.0, 0.3, cm) * uTint * smoothstep(0.0, 0.6, air); // (colour fades in mist, like ink)
      base = mix(base, uTintWash, tint * 0.7 * mix(1.0, 0.55, atm));
      inkCol = mix(inkCol, uTintInk, tint * 0.9);
    }

    // the setting sun warms the paper (mist, cloud) of whatever lies toward it
    if (uGlow > 0.0) {
      float toward = max(dot(normalize(vWorld - uCam), normalize(uSun - uCam)), 0.0);
      base = mix(base, uSunGlow, pow(toward, 24.0) * uGlow);
    }

    // alpha flags for the watercolour pass: 1 = inked object, 0 = ground/sky (no outline),
    // 0.88 = an inked object that softens when you sit at the lookout (trees, bamboo)
  #ifdef GROUND
    float flag = 0.0;
  #else
    float flag = uSoftObj > 0.5 ? 0.88 : 1.0;
  #endif
    vec3 col = mix(base, inkCol, clamp(ink, 0.0, 1.0));
    if (rockInk > 0.0) col = mix(col, mix(uInk, uFarTint, rockFar), clamp(rockInk, 0.0, 1.0));
    // along the rim, away from the lookout, the ink thins away into the paper (留白) as the ridge
    // falls away into the cloud, unevenly, like a wash
    if (uRimFade > 0.5) {
      float rf = rimFade(vWorld.xz);
      col = mix(col, uPaper, clamp(rf * (0.9 + (blot - 0.5) * 0.5), 0.0, 0.92));
    }
    gl_FragColor = vec4(col, flag);
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
  near = 8, far = 60, minFar = 0.3, density = 1, mist = 2, mistBase = -0.5, grain = 1, sil = 0.6, wash = 0, dots = 0,
  mistFloor = 0.12,           // how much ink is left where the mist is thickest (0: it fades right out)
  shade = 0.4, needles = 0, ragged = 0, sway = 0,
  cloud = new THREE.Vector4(0, 1, 0, 0), flow = new THREE.Vector4(1, 0, 0, 0),
  sketch = true,              // line-drawn (白描) before the ink arrives; ignored for global/ground
  wiggle = 0, holes = 0,      // swimming koi; scholar's-rock holes
  glow = 0,                   // how much the setting sun warms its paper when you look toward the sun
  soft = false,               // fine detail (trees, bamboo) that softens when you sit at the lookout (ink/post.js)
  cun = 0,                    // texture strokes (皴) on a mountain built by massifGeometry (0 = none)
  rimFade = false,            // fades back into the paper along the rim, away from the lookout (path.js RIM_FADE)
  washLit = null, washShade = null, // per-material colour wash (default ochre / indigo)
  map = null,                 // alpha texture for variant "decal"
  // colour stage: a TINTS name ("foliage", "mountain", ...), "none", or { wash, ink, amount }.
  // Default: plain ink things take on rock colours; already-coloured things keep theirs.
  tint = undefined,
  color = INK, side = THREE.FrontSide,
} = {}) {
  const defines = {};
  if (reveal === "global") defines.GLOBAL_REVEAL = "";
  if (variant) defines[variant.toUpperCase()] = "";
  const tintName = tint ?? (color === INK && reveal !== "global" ? "rock" : "none");
  const T = typeof tintName === "string" ? TINTS[tintName] : tintName; // undefined for "none"

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
      uMistBase: { value: mistBase },
      uGrain: { value: grain },
      uSil: { value: sil },
      uWash: { value: wash },
      uDots: { value: dots },
      uShade: { value: shade },
      uNeedles: { value: needles },
      uRagged: { value: ragged },
      uMistFloor: { value: mistFloor },
      uSketch: { value: sketch && reveal !== "global" && variant !== "ground" && variant !== "decal" ? 1 : 0 },
      uWiggle: { value: wiggle },
      uHoles: { value: holes },
      uGlow: { value: glow },
      uSoftObj: { value: soft ? 1 : 0 },
      uCun: { value: cun },
      uRimFade: { value: rimFade ? 1 : 0 },
      ...(washLit ? { uOchre: { value: washLit } } : {}),
      ...(washShade ? { uIndigo: { value: washShade } } : {}),
      ...(map ? { uMap: { value: map } } : {}),
      uTint: { value: T && reveal !== "global" ? T.amount : 0 },
      uTintWash: { value: T ? T.wash : PAPER },
      uTintInk: { value: T ? T.ink : INK },
      uColourChannel: { value: channel === "far" ? CHANNELS.far : CHANNELS.mid },
      uSway: { value: sway },
      uCloud: { value: cloud },
      uFlow: { value: flow },
    },
  });
}
