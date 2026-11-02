import * as THREE from "three";
import { CONFIG } from "./config.js";
import { SITE } from "./content.js";
import { globals, PAPER } from "./ink/material.js";
import { InkField } from "./ink/field.js";
import { WatercolorPass } from "./ink/post.js";
import { buildWorld } from "./world/index.js";
import { createWalker } from "./app/walker.js";
import { createDrops } from "./app/drops.js";
import { createColour } from "./app/colour.js";
import { createUI, createMarkers, createHint } from "./app/ui.js";
import { createBrush } from "./app/brush.js";
import { createPicker } from "./app/picker.js";
import { createKeepsake } from "./app/keepsake.js";
import { createLoader } from "./app/loader.js";

// Dev URL options:
//   ?t=0.5      start halfway along the walk (0 = start, 1 = end)
//   ?instant    skip the opening; ink has already spread around you
//   ?inked      ...and along the whole walk, as if you'd walked it (to see the painting at the end)
//   ?look=-0.6  start looking left (+ = right), until you move the mouse
//   ?warp=4     run time 4× faster (testing slow things like blooms)
//   ?go         skip the scroll you're greeted with (so do ?instant and ?inked)
const params = new URLSearchParams(location.search);
const warp = parseFloat(params.get("warp")) || 1;
const skipGreeting = params.has("go") || params.has("instant") || params.has("inked");

document.title = SITE.name;
const loader = createLoader(); // the scroll that greets you while the world is built (index.html)

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

boot();

async function boot() {
  await loader.painted(); // let the greeting paint first: building the world holds up the page

  // ---------- The world, you, the ink, the words ----------
  const world = buildWorld(scene);
  const walker = createWalker({
    camera, world,
    startT: parseFloat(params.get("t")) || 0,
    startLook: parseFloat(params.get("look")) || 0,
  });
  const drops = createDrops({
    field, scene, camera, walker, world, instant: params.has("instant"), inked: params.has("inked"),
    onFlick: (x, z) => colour.splash(x, z, globals.uTime.value), // a little colour bleeds out of a splat
  });
  const ui = createUI({
    onJump: (t) => {
      walker.jumpTo(t);
      drops.dropAt(t);
    },
  });
  const markers = createMarkers(world.markers); // your points, floating in the world
  const picker = createPicker({ camera, clickables: world.clickables }); // the GitHub / LinkedIn / Email rocks
  const brush = createBrush({ canSplat: () => !picker.hovered }); // the pointer
  const colour = createColour({ renderer, scene, walker, world }); // stand still + crane → colour blooms
  const hint = createHint(SITE.stillHint);
  const keepsake = createKeepsake({ renderer, scene, camera, walker }); // the views from the bench, to keep
  if (params.has("debug")) window.site = { walker, drops, colour, world, globals, camera, scene, keepsake, field }; // poke around in the console
  let walked = 0; // metres, so the hint waits until you've had a wander

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
    const dt = THREE.MathUtils.clamp(timer.getDelta(), 0, 0.05) * warp; // never backwards (first frame can be)
    const now = (globals.uTime.value += dt);

    walker.update(dt);
    globals.uCam.value.copy(camera.position);
    drops.update(now);
    field.update(now);
    const ready = drops.introStart !== null && now - drops.introStart > 2; // the opening has played
    colour.update(now, dt, ready);
    world.update(now, camera);

    walked += Math.abs(walker.speed) * dt;
    // your name writes itself in (unless the greeting has already set it there: it carries on)
    ui.update(walker.progress, skipGreeting ? clamp01((now - 0.3) / 1.4) : 1);
    markers.update(camera, drops.introStart === null ? 0 : clamp01((now - drops.introStart) / 2));
    picker.update();
    brush.update(dt / warp, colour.charge, colour.colour, !!picker.hovered);
    hint.update(ready && walked > 6 && walker.still > 0.6 && colour.blooms === 0 && walker.seated < 0.1, dt);
    keepsake.update(dt / warp);
    post.render(scene, camera);
    requestAnimationFrame(frame);
  }

  // warm up behind the scroll: compile every shader, and paint a first (blank) frame
  walker.update(0);
  globals.uCam.value.copy(camera.position);
  await renderer.compileAsync?.(scene, camera);
  post.render(scene, camera);
  if (skipGreeting) loader.dismiss();
  else {
    // ...until you begin: the greeting's drop falls to just where the world's first drop lands
    const spot = new THREE.Vector3();
    await loader.ready({
      landAt: () => {
        spot.copy(walker.point).addScaledVector(walker.tangent, 5).project(camera);
        return { x: (spot.x * 0.5 + 0.5) * innerWidth, y: (-spot.y * 0.5 + 0.5) * innerHeight };
      },
    });
    globals.uTime.value = CONFIG.intro.blankPaper - 0.001; // ...and it lands there at once
  }
  requestAnimationFrame(frame);
}
