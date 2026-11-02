// Shared GLSL noise helpers.
import * as THREE from "three";

const NOISE3_SIZE = 128;
// the same hash the 3D noise always used, worked out once per lattice point in the GPU's 32-bit
// floats, so the lattice from -N/2 to N/2 matches the old noise exactly (the clouds, mist and
// washes, which are broad, stay where they were painted; only fine grain ever wraps round)
const f32 = Math.fround;
const fract = (x) => f32(x - Math.floor(x));
// (the hash's first step works on each axis alone, so it's done once per axis, not per point)
const axis = (v) => f32(fract(f32(f32(v * f32(0.3183099)) + f32(0.1))) * 17);
const hash3 = (x, y, z) => fract(f32(f32(f32(x * y) * z) * f32(f32(x + y) + z)));

/** The lattice for noise3 (bound as globals.tNoise3 in material.js). */
export function noiseTexture3D() {
  const N = NOISE3_SIZE;
  const data = new Uint8Array(N * N * N);
  // texel t holds lattice point t, or t - N past halfway
  const h = Array.from({ length: N }, (_, t) => axis(t < N / 2 ? t : t - N));
  for (let z = 0, k = 0; z < N; z++)
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) data[k++] = Math.round(hash3(h[x], h[y], h[z]) * 255);
  const tex = new THREE.Data3DTexture(data, N, N, N);
  tex.format = THREE.RedFormat;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

export const noise2 = /* glsl */ `
  float hash2(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise2(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1, 0)), u.x),
               mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm2(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise2(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return v;
  }
`;

export const noise3 = /* glsl */ `
  // the lattice's values come from a texture of hash3 (noiseTexture3D, below): one filtered
  // lookup, placed so the hardware's blend between texels follows the smoothstep curve, does
  // the work of eight hashes (the pattern repeats every ${NOISE3_SIZE} units)
  uniform highp sampler3D tNoise3;
  float noise3(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return texture(tNoise3, (i + f + 0.5) / ${NOISE3_SIZE}.0).r;
  }
  float fbm3(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise3(p); p = p * 2.02 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
    return v;
  }
  // cheaper 2-octave version for secondary detail
  float fbm3lo(vec3 p) {
    return 0.6667 * noise3(p) + 0.3333 * noise3(p * 2.02 + vec3(1.7, 9.2, 3.1));
  }
`;
