import * as THREE from "three";
import { inkMaterial, globals } from "../../ink/material.js";
import { noise2 } from "../../ink/noise.js";

// 红日 — the setting sun over the canyon: a disc of vermilion laid in wet, deeper where the
// pigment pooled at its rim, a warm wash spreading out across the sky around it (wider than
// tall, fading to bare paper), and long bands of cloud drifting across it.
const sunShader = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uPaper, uInk, uRed, uRedDeep, uSunGlow;
    uniform float uIntro, uTime;
    uniform vec2 uSize; // the billboard's half-size, in sun radii
    varying vec2 vUv;
    ${noise2}
    void main() {
      vec2 q = (vUv * 2.0 - 1.0) * uSize; // in sun radii, 0 at its centre
      float r = length(q);

      // the glow: strongest around the disc, and a broad warm band along the horizon
      float glow = exp(-max(r - 1.0, 0.0) * 1.15) * 0.62 + exp(-length(q * vec2(0.3, 1.1)) * 0.75) * 0.42;
      glow *= 0.8 + 0.4 * fbm2(q * 0.8 + vec2(uTime * 0.008, 3.0)); // broken, like a wash
      vec2 edge = abs(vUv * 2.0 - 1.0);
      glow *= (1.0 - smoothstep(0.55, 1.0, edge.x)) * (1.0 - smoothstep(0.5, 1.0, edge.y)); // to bare paper at its edges
      vec3 col = mix(uPaper, uSunGlow, clamp(glow, 0.0, 1.0));

      // the disc: a wet edge, mottled pigment, lighter and warmer in the middle
      float rr = r + (fbm2(q * 2.4 + 7.0) - 0.5) * 0.05;
      float disc = 1.0 - smoothstep(0.975, 1.02, rr);
      float mottle = fbm2(q * 3.0 + 2.0) - 0.5;
      vec3 red = mix(uRed, uRedDeep, clamp(smoothstep(0.15, 1.0, rr) * 0.8 + mottle * 0.35, 0.0, 1.0));
      red = mix(red, uRedDeep * 0.82, exp(-pow((1.0 - rr) / 0.06, 2.0)) * 0.55); // pooled at the rim
      col = mix(col, red, disc);

      // bands of cloud drifting across it: a long one low across the disc, a thin one higher up
      float b1 = (q.y + 0.4 + sin(q.x * 1.1 + uTime * 0.03) * 0.07) / 0.12;
      float b2 = (q.y - 0.16 + sin(q.x * 0.8 + 2.0 + uTime * 0.025) * 0.05) / 0.05;
      float bands = exp(-b1 * b1) * smoothstep(0.35, 0.65, fbm2(q * vec2(1.1, 4.0) + vec2(uTime * 0.02, 1.0)))
                  + exp(-b2 * b2) * smoothstep(0.45, 0.7, fbm2(q * vec2(1.5, 6.0) + vec2(uTime * 0.015, 5.0))) * 0.65;
      bands *= 1.0 - smoothstep(1.3, 3.4, abs(q.x)); // thinning out away from the sun
      col = mix(col, uInk, clamp(bands * mix(0.22, 0.45, disc), 0.0, 1.0));

      gl_FragColor = vec4(mix(uPaper, col, uIntro), 1.0);
    }
  `,
};

// Distant layered ranges, the red sun, and a few birds.
// These bloom in with the opening drop (global reveal) instead of the ink field.
export function build({ scene, places, rng }) {
  const rand = rng(51);
  const center = new THREE.Vector3(2, 0, -62); // middle of the walk

  // ---------- Layered distant ranges (三远: each layer paler) ----------
  // Rings around the whole walk, so they surround you with correct parallax.
  const layers = [
    { radius: 330, base: 22, amp: 70, density: 0.34 },
    { radius: 430, base: 40, amp: 95, density: 0.22 },
    { radius: 540, base: 60, amp: 120, density: 0.13 },
  ];
  // toward the sun the ridgelines sink into a broad, level saddle for it to set behind, with
  // higher shoulders either side framing it at the far end of the canyon
  const sunAt = Math.atan2(places.sun.pos.z - center.z, places.sun.pos.x - center.x);
  const saddle = (a) => {
    const d = Math.abs(Math.atan2(Math.sin(a - sunAt), Math.cos(a - sunAt)));
    return 1 - 0.55 * Math.exp(-((d / 0.24) ** 4)) + 0.3 * Math.exp(-(((d - 0.38) / 0.12) ** 2));
  };
  for (const L of layers) {
    const ridge = periodicNoise(rand, [6, 13, 29, 61], [1, 0.5, 0.22, 0.1]);
    const N = 480;
    const positions = [];
    const uvs = [];
    const index = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const a = u * Math.PI * 2;
      const x = center.x + Math.cos(a) * L.radius;
      const z = center.z + Math.sin(a) * L.radius;
      const top = (L.base + L.amp * Math.pow(ridge(u), 1.7)) * saddle(a);
      positions.push(x, -30, z, x, top, z);
      uvs.push(u, 0, u, 1);
      if (i < N) {
        const b = i * 2;
        index.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, inkMaterial({
      reveal: "global", variant: "backdrop", climb: 0, noiseScale: 0.01, noiseAmp: 0.25,
      edge: 0.02, rimWidth: 0.05, rim: 0.35, near: 2000, far: 3000, density: L.density,
      mist: 45, grain: 0.02, sil: 0, color: new THREE.Color("#3f5566"), side: THREE.DoubleSide,
      cloud: new THREE.Vector4(L.base + 10, 10, 0.7, 0.6), glow: 0.75,
    }));
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  // ---------- A huge red sun, setting over the canyon at the end of the walk ----------
  const S = places.sun;
  globals.uSun.value.copy(S.pos); // the mist and the sea of cloud toward it glow warm
  const size = [6.2, 3.2]; // the billboard's half-size in sun radii: room for the glow along the horizon
  const sun = new THREE.Mesh(
    new THREE.PlaneGeometry(S.r * 2 * size[0], S.r * 2 * size[1]),
    new THREE.ShaderMaterial({
      ...sunShader,
      uniforms: {
        uPaper: globals.uPaper,
        uSunGlow: globals.uSunGlow,
        uInk: { value: new THREE.Color("#5d5560") },
        uRed: { value: new THREE.Color("#dc5f3c") },
        uRedDeep: { value: new THREE.Color("#b5332a") },
        uIntro: globals.uIntro,
        uTime: globals.uTime,
        uSize: { value: new THREE.Vector2(...size) },
      },
    })
  );
  sun.position.copy(S.pos);
  scene.add(sun);

  // ---------- Birds circling ahead ----------
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute("position", new THREE.Float32BufferAttribute([
    0, 0, 0.18,   0, 0, -0.18,   1.0, 0.12, -0.1,
    1.0, 0.12, -0.1,   1.5, 0.05, -0.35,   0, 0, -0.18,
  ], 3));
  wingGeo.setAttribute("uv", new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
  wingGeo.computeVertexNormals();
  const birdMat = inkMaterial({
    reveal: "global", climb: 0, noiseAmp: 0, near: 2000, far: 3000, density: 0.95,
    mist: 0.01, grain: 2, sil: 0, side: THREE.DoubleSide,
  });
  const birds = [];
  for (let i = 0; i < 6; i++) {
    const bird = new THREE.Group();
    const left = new THREE.Mesh(wingGeo, birdMat);
    const right = new THREE.Mesh(wingGeo, birdMat);
    right.scale.x = -1;
    bird.add(left, right);
    bird.scale.setScalar(rand.range(0.9, 1.4));
    scene.add(bird);
    birds.push({
      bird, left, right,
      cx: rand.range(-25, 25), cz: rand.range(-140, -40), y: rand.range(28, 45),
      r: rand.range(25, 50), speed: rand.range(0.05, 0.09) * (rand() < 0.5 ? -1 : 1),
      phase: rand() * Math.PI * 2, flap: rand.range(4, 6),
    });
  }

  const next = new THREE.Vector3();
  return {
    update(time, camera) {
      sun.lookAt(camera.position);
      for (const b of birds) {
        const a = b.phase + time * b.speed;
        const pos = (ang) => next.set(b.cx + Math.cos(ang) * b.r, b.y + Math.sin(ang * 3) * 1.5, b.cz + Math.sin(ang) * b.r);
        b.bird.position.copy(pos(a));
        b.bird.lookAt(pos(a + 0.01 * Math.sign(b.speed)));
        // flap, with an occasional glide
        const glide = Math.sin(time * 0.4 + b.phase) > 0.3 ? 0.15 : 1;
        const f = Math.sin(time * b.flap + b.phase) * 0.55 * glide;
        b.left.rotation.z = f;
        b.right.rotation.z = -f;
      }
    },
  };
}

// 1-D noise that wraps around seamlessly (for ridgelines on a ring).
function periodicNoise(rand, periods, amps) {
  const tables = periods.map((p) => Array.from({ length: p }, () => rand()));
  const total = amps.reduce((a, b) => a + b, 0);
  return (u) => {
    let v = 0;
    periods.forEach((p, o) => {
      const x = u * p;
      const i = Math.floor(x);
      const f = x - i;
      const s = f * f * (3 - 2 * f);
      const t = tables[o];
      v += amps[o] * (t[i % p] * (1 - s) + t[(i + 1) % p] * s);
    });
    return v / total;
  };
}
