import * as THREE from "three";
import { globals } from "../../ink/material.js";
import { noise2 } from "../../ink/noise.js";

// Drifting mist: soft puffs that rise, swell and fade on a loop. Paper-white, with a
// faint grey wash on their undersides, the way ink painters shade cloud.
// Everything is animated on the GPU (one draw call per cloud of puffs).

const vertexShader = /* glsl */ `
  attribute vec3 aCenter;
  attribute vec4 aParams; // size, seed, life offset, drift
  uniform float uTime, uLife, uRise, uGrow, uIntro;
  uniform vec3 uSun;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vSeed;
  varying float vSunward;
  void main() {
    float age = mod(uTime + aParams.z, uLife) / uLife; // 0 → 1 over a puff's life
    float s = aParams.y * 6.2831;
    vec3 c = aCenter + vec3(
      sin(s + uTime * 0.07) * aParams.w * (0.4 + age),
      uRise * age * uLife,
      cos(s * 1.3 + uTime * 0.05) * aParams.w * (0.4 + age)
    );
    float size = aParams.x * (0.7 + uGrow * age);
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 p = c + (right * position.x + up * position.y * 0.62) * size; // wider than tall
    vAlpha = smoothstep(0.0, 0.25, age) * (1.0 - smoothstep(0.55, 1.0, age)) * uIntro;
    vUv = uv;
    vSeed = aParams.y;
    vSunward = pow(max(dot(normalize(c - cameraPosition), normalize(uSun - cameraPosition)), 0.0), 24.0);
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uPaper, uShade, uSunGlow;
  uniform float uOpacity, uTime, uShadeAmount, uGlow;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vSeed;
  varying float vSunward;
  ${noise2}
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float n = fbm2(p * 1.7 + vec2(vSeed * 17.0, uTime * 0.04 + vSeed * 3.0));
    float r = length(p) + (n - 0.5) * 0.7; // a ragged, billowing edge
    float body = 1.0 - smoothstep(0.2, 1.0, r);
    float a = body * vAlpha * uOpacity;
    if (a < 0.01) discard;
    float under = 1.0 - smoothstep(-0.7, 0.2, p.y + (n - 0.5) * 0.5); // grey wash beneath
    vec3 lit = mix(uPaper, uSunGlow, vSunward * uGlow); // lit warm by the setting sun behind it
    vec3 col = mix(lit, uShade, under * uShadeAmount * body);
    gl_FragColor = vec4(col, a);
  }
`;

/**
 * A cloud of mist puffs.
 *   spots(i, rand) → [x, y, z]  where puff i lives
 *   size: [min, max] metres    life: seconds    rise: m/s    grow: how much a puff swells
 */
export function createMist(scene, rand, {
  count, spots, size = [2, 4], life = 6, rise = 0.4, grow = 0.8, drift = 1,
  opacity = 0.6, shade = "#6c7a86", shadeAmount = 0.35,
  glow = 0.55, // how warm the puffs toward the setting sun turn
}) {
  const base = new THREE.PlaneGeometry(2, 2);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute("position", base.attributes.position);
  g.setAttribute("uv", base.attributes.uv);
  const centers = new Float32Array(count * 3);
  const params = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    centers.set(spots(i, rand), i * 3);
    params.set([rand.range(size[0], size[1]), rand(), rand() * life, drift * rand.range(0.5, 1.5)], i * 4);
  }
  g.setAttribute("aCenter", new THREE.InstancedBufferAttribute(centers, 3));
  g.setAttribute("aParams", new THREE.InstancedBufferAttribute(params, 4));
  g.instanceCount = count;

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    // keep the scene's alpha (the watercolour pass reads it as the ink/sketch flag)
    blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    uniforms: {
      uTime: globals.uTime,
      uIntro: globals.uIntro,
      uPaper: globals.uPaper,
      uSun: globals.uSun,
      uSunGlow: globals.uSunGlow,
      uGlow: { value: glow },
      uShade: { value: new THREE.Color(shade) },
      uShadeAmount: { value: shadeAmount },
      uLife: { value: life },
      uRise: { value: rise },
      uGrow: { value: grow },
      uOpacity: { value: opacity },
    },
  });
  const mesh = new THREE.Mesh(g, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10; // after the solid things it veils
  scene.add(mesh);
  return mesh;
}
