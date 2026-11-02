import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { inkMaterial, SEAL_RED } from "../../ink/material.js";
import { SITE } from "../../content.js";
import { noise3 } from "../random.js";

/**
 * Lumpy rock: an icosphere swollen and dented by smooth noise. Its vertices are shared
 * (indexed), so it shades as one rounded, weathered surface rather than flat triangles.
 * Returns the geometry and the noise, for further shaping (call computeVertexNormals after).
 */
export function lumpyRock(rand, detail, amount) {
  const g = smoothSphere(detail);
  const n = noise3(rand);
  const o = [rand() * 50, rand() * 50, rand() * 50];
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const lumps = 0.65 * n(x * 1.1 + o[0], y * 1.1 + o[1], z * 1.1 + o[2])
                + 0.35 * n(x * 2.6 + o[1], y * 2.6 + o[2], z * 2.6 + o[0]);
    const b = 1 + amount * 1.1 * lumps;
    pos.setXYZ(i, x * b, y * b, z * b);
  }
  g.computeVertexNormals();
  g.userData.noise = n;
  return g;
}

/** An icosphere with shared vertices (and a blank uv, which the ink material reads). */
function smoothSphere(detail) {
  const base = new THREE.IcosahedronGeometry(1, detail);
  base.deleteAttribute("normal");
  base.deleteAttribute("uv");
  const g = mergeVertices(base);
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}

/**
 * Lettering carved into a rock and painted red: serif text, optionally followed by a
 * seal (a filled square with letters knocked out). Returns an alpha texture.
 */
function carvedTexture(text, { size = 150, seal = null, width = 1024, height = 384 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  const draw = () => {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 ${size}px "Cormorant Garamond", Georgia, serif`;
    ctx.fillText(text, seal ? width * 0.44 : width / 2, height / 2);
    if (seal) {
      const s = height * 0.34;
      const x = width * 0.83;
      ctx.fillRect(x, height / 2 - s / 2, s, s);
      ctx.globalCompositeOperation = "destination-out";
      ctx.font = `700 ${Math.round(s * 0.5)}px "Cormorant Garamond", Georgia, serif`;
      ctx.fillText(seal, x + s / 2, height / 2 - 2);
      ctx.globalCompositeOperation = "source-over";
    }
    tex.needsUpdate = true;
  };
  draw();
  document.fonts?.load(`600 ${size}px "Cormorant Garamond"`).then(draw).catch(() => {});
  return tex;
}

/** A boulder with a flattened face toward +z, so lettering can sit on it. */
function faceRock(rand, detail = 3) {
  const g = lumpyRock(rand, detail, 0.22);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    if (z > 0.4) pos.setZ(i, 0.4 + (z - 0.4) * 0.05);
  }
  g.computeVertexNormals();
  return g;
}

const rockInk = () => inkMaterial({
  channel: "mid", climb: 0.04, noiseScale: 0.5, noiseAmp: 0.3, near: 4, far: 50,
  density: 0.85, mist: 0.6, grain: 1.4, shade: 0.25, sil: 0.9, wash: 0.8,
});
const letteringInk = (map) => inkMaterial({
  variant: "decal", channel: "mid", bias: 0.05, climb: 0.02, noiseScale: 0.8, noiseAmp: 0.25,
  near: 4, far: 50, density: 0.9, mist: 0.01, grain: 2, sil: 0, color: SEAL_RED, map,
});

/**
 * A carved rock: boulder scaled to `scale` (x, y, z radii), lettering across its face,
 * placed at pos and turned to face `faces`.
 */
function carvedRock(scene, rand, { pos, faces, scale, text, textOpts, plate, turn = 0 }) {
  const g = new THREE.Group();
  const boulder = new THREE.Mesh(faceRock(rand), rockInk());
  boulder.scale.set(...scale);
  boulder.position.y = scale[1] * 0.77;
  g.add(boulder);
  const lettering = new THREE.Mesh(new THREE.PlaneGeometry(...plate), letteringInk(carvedTexture(text, textOpts)));
  lettering.position.set(0, scale[1] * 0.83, 0.44 * scale[2] + 0.02); // just proud of the flattened face
  g.add(lettering);
  g.position.copy(pos);
  g.rotation.y = Math.atan2(faces.x - pos.x, faces.z - pos.z) + turn;
  scene.add(g);
  return { group: g, lettering };
}

// By the lotus pond, small carved rocks for GitHub, LinkedIn and Email (click them); and the
// scholar's rocks around the garden.
export async function build({ scene, P, places, rng, breathe }) {
  const rand = rng(81);
  // (the boulder with your name that stood at the entrance drew these from the stream: skipped,
  // so the rocks after it keep their shapes)
  for (let i = 0; i < 514; i++) rand();

  // Contacts: smaller rocks on the pond's near shore, carved with their names. Clicking one opens it.
  places.clickables = [];
  for (const l of places.links) {
    await breathe(); // (each carved rock is a few ms)
    const point = SITE.points.find((p) => p.id === l.id);
    if (!point) continue;
    const { group, lettering } = carvedRock(scene, rand, {
      pos: l.pos, faces: P.at(P.nearestT(l.pos.x, l.pos.z) - 0.05, 0), turn: rand.range(-0.1, 0.1), // toward you as you come
      scale: [0.7, 0.42, 0.45], plate: [1.08, 0.34],
      text: `${point.label} ↗`, textOpts: { size: 190, width: 1024, height: 320 },
    });
    const density = lettering.material.uniforms.uDensity;
    places.clickables.push({
      object: group,
      href: point.href,
      label: point.label,
      hover: (on) => (density.value = on ? 1.3 : 0.9), // the lettering darkens under the brush
    });
  }

  // ---------- Scholar's rocks (太湖石): tall, twisted, weathered through with holes ----------
  const taihuMat = inkMaterial({
    channel: "mid", bias: 0.08, climb: 0.04, noiseScale: 0.6, noiseAmp: 0.3, near: 4, far: 45,
    density: 0.85, mist: 0.4, grain: 1.6, shade: 0.35, sil: 0.9, wash: 0.6, holes: 0.3,
    side: THREE.DoubleSide,
  });
  for (const { pos: p, h } of places.taihu) {
    await breathe();
    const g = lumpyRock(rand, 5, 0.42);
    const n = g.userData.noise;
    const pos = g.attributes.position;
    const twist = rand.range(-0.6, 0.6);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      // wrinkled (皱): soft creases worn into it, running mostly up and down
      const crease = 1 - Math.abs(n(x * 2.2 + 9, y * 0.9, z * 2.2 - 4));
      const worn = 1 - 0.22 * crease ** 4;
      const waist = (0.75 + 0.35 * Math.abs(y)) * worn; // narrower in the middle, top-heavy
      pos.setXYZ(i, x * waist + Math.sin(y * 2.2) * 0.25, y, z * waist + twist * y * 0.3);
    }
    g.computeVertexNormals();
    const stone = new THREE.Mesh(g, taihuMat);
    stone.scale.set(rand.range(0.5, 0.7), h / 2, rand.range(0.4, 0.55));
    stone.position.set(p.x, h / 2 - 0.1, p.z);
    stone.rotation.y = rand() * Math.PI * 2;
    scene.add(stone);
  }
}
