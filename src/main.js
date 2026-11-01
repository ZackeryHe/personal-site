import * as THREE from "three";
import { CONFIG } from "./config.js";
import { SITE } from "./content.js";
import { globals, PAPER } from "./ink/material.js";
import { InkField } from "./ink/field.js";
import { WatercolorPass } from "./ink/post.js";
import { buildWorld } from "./world/index.js";
import { createWalker } from "./app/walker.js";
import { createDrops } from "./app/drops.js";
import { createUI, createViewLabels } from "./app/ui.js";

// Dev URL options:
//   ?t=0.5      start halfway along the walk (0 = start, 1 = end)
//   ?instant    skip the opening; ink has already spread around you
//   ?look=-0.6  start looking left (+ = right), until you move the mouse
const params = new URLSearchParams(location.search);

document.title = SITE.name;

// ---------- Rendering ----------
const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, CONFIG.render.maxPixelRatio));
renderer.setClearColor(PAPER);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CONFIG.render.fov, 1, 0.5, CONFIG.render.far);

const field = new InkField(renderer); // how far the ink has spread, everywhere
globals.tField.value = field.texture;
globals.uFieldRect.value.copy(field.rect);
const post = new WatercolorPass(renderer); // repaints each frame as watercolour

// ---------- The world, you, the ink, the words ----------
const world = buildWorld(scene);
const walker = createWalker({
  camera, world,
  startT: parseFloat(params.get("t")) || 0,
  startLook: parseFloat(params.get("look")) || 0,
});
const drops = createDrops({ field, scene, camera, walker, world, instant: params.has("instant") });
const ui = createUI({
  onJump: (t) => {
    walker.jumpTo(t);
    drops.dropAt(t);
  },
});
const labels = createViewLabels(world.views);

// ---------- Loop ----------
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  post.setSize(innerWidth, innerHeight);
}
addEventListener("resize", resize);
resize();

const timer = new THREE.Timer();
timer.connect(document); // pauses cleanly when the tab is hidden
const clamp01 = (x) => THREE.MathUtils.clamp(x, 0, 1);

function frame(timestamp) {
  timer.update(timestamp);
  const dt = Math.min(timer.getDelta(), 0.05);
  const now = (globals.uTime.value += dt);

  walker.update(dt);
  globals.uCam.value.copy(camera.position);
  drops.update(now);
  field.update(now);
  world.update(now, camera);

  ui.update(walker.progress, clamp01((now - 0.3) / 1.4));
  labels.update(camera, drops.introStart === null ? 0 : clamp01((now - drops.introStart) / 2));
  post.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
