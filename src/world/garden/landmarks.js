import * as THREE from "three";
import { inkMaterial, SEAL_RED } from "../../ink/material.js";
import { SITE } from "../../content.js";

/** Lumpy rock: displaced icosphere, displacement keyed by position so it stays watertight. */
export function lumpyRock(rand, detail, amount) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position;
  const bumps = new Map();
  const f = [rand.range(1, 3), rand.range(1, 3), rand.range(1, 3), rand() * 6, rand() * 6];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = [x, y, z].map((v) => Math.round(v * 1000) + 0).join(",");
    if (!bumps.has(key)) {
      const smooth = Math.sin(x * f[0] + f[3]) * Math.sin(y * f[1]) * Math.sin(z * f[2] + f[4]);
      bumps.set(key, 1 + amount * (0.6 * smooth + 0.4 * (rand() - 0.5)));
    }
    const b = bumps.get(key);
    pos.setXYZ(i, x * b, y * b, z * b);
  }
  return g;
}

// Name lettering for the entrance rock: carved serif capitals painted red, plus a seal.
function nameTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 384;
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = '600 150px "Cormorant Garamond", Georgia, serif';
    ctx.fillText(SITE.name, 450, 190);
    // seal: a filled square with the initials knocked out
    ctx.fillRect(850, 120, 130, 130);
    ctx.globalCompositeOperation = "destination-out";
    ctx.font = '700 64px "Cormorant Garamond", Georgia, serif';
    ctx.fillText(SITE.initials, 915, 188);
    ctx.globalCompositeOperation = "source-over";
    tex.needsUpdate = true;
  };
  draw();
  document.fonts?.load('600 150px "Cormorant Garamond"').then(draw).catch(() => {});
  return tex;
}

// The entrance boulder with your name, and the scholar's rocks around the garden.
export function build({ scene, P, places, rng }) {
  const rand = rng(81);

  // ---------- Entrance: a boulder with your name, facing you as you arrive ----------
  const rockGeo = lumpyRock(rand, 3, 0.22);
  {
    // flatten the front so the lettering sits on a face
    const pos = rockGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      if (z > 0.4) pos.setZ(i, 0.4 + (z - 0.4) * 0.05);
    }
    rockGeo.computeVertexNormals();
  }
  const entrance = new THREE.Group();
  const boulder = new THREE.Mesh(rockGeo, inkMaterial({
    channel: "mid", climb: 0.04, noiseScale: 0.5, noiseAmp: 0.3, near: 4, far: 50,
    density: 0.85, mist: 0.6, grain: 1.4, shade: 0.25, sil: 0.9, wash: 0.8,
  }));
  boulder.scale.set(2.1, 1.5, 1.15);
  boulder.position.y = 1.15;
  entrance.add(boulder);
  const lettering = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 0.975),
    inkMaterial({
      variant: "decal", channel: "mid", bias: 0.05, climb: 0.02, noiseScale: 0.8, noiseAmp: 0.25,
      near: 4, far: 50, density: 0.9, mist: 0.01, grain: 2, sil: 0, color: SEAL_RED,
      map: nameTexture(),
    })
  );
  lettering.position.set(0, 1.25, 0.44 * 1.15 + 0.02); // just proud of the flattened face
  entrance.add(lettering);
  const rock = places.rock.pos;
  const start = P.at(0);
  entrance.position.copy(rock);
  entrance.rotation.y = Math.atan2(start.x - rock.x, start.z - rock.z) - 0.25;
  scene.add(entrance);

  // ---------- Scholar's rocks (太湖石): tall, twisted, weathered through with holes ----------
  const taihuMat = inkMaterial({
    channel: "mid", bias: 0.08, climb: 0.04, noiseScale: 0.6, noiseAmp: 0.3, near: 4, far: 45,
    density: 0.85, mist: 0.4, grain: 1.6, shade: 0.35, sil: 0.9, wash: 0.6, holes: 0.3,
    side: THREE.DoubleSide,
  });
  for (const { pos: p, h } of places.taihu) {
    const g = lumpyRock(rand, 4, 0.35);
    const pos = g.attributes.position;
    const twist = rand.range(-0.6, 0.6);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const waist = 0.75 + 0.35 * Math.abs(y); // narrower in the middle, top-heavy
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
