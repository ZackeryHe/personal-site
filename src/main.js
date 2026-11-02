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
import { createPointer } from "./app/pointer.js";
import { createPicker } from "./app/picker.js";
import { createKeepsake } from "./app/keepsake.js";
import { createReader } from "./app/reader.js";
import { warmUp } from "./app/warmup.js";
import { createLoader } from "./app/loader.js";
import { createGreeting } from "./app/greeting.js";

// Dev URL options:
//   ?t=0.5      start halfway along the walk (0 = start, 1 = end)
//   ?instant    skip the opening; ink has already spread around you
//   ?inked      ...and along the whole walk, as if you'd walked it (to see the painting at the end)
//   ?look=-0.6  start looking left (+ = right), until you move the mouse
//   ?warp=4     run time 4× faster (testing slow things like blooms)
//   ?go         skip the scroll you're greeted with (so do ?instant and ?inked)
//   ?fps        show frames per second, top right (always on in dev)
const params = new URLSearchParams(location.search);
const warp = parseFloat(params.get("warp")) || 1;
const skipGreeting = params.has("go") || params.has("instant") || params.has("inked");

document.title = SITE.name;
const loader = createLoader(); // the greeting's page layer: your name, the way in (index.html)

// ---------- Rendering ----------
const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.debug.checkShaderErrors = import.meta.env.DEV; // (built: don't stop to read each shader's compile log)
renderer.setPixelRatio(Math.min(devicePixelRatio, CONFIG.render.maxPixelRatio));
renderer.setClearColor(PAPER);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CONFIG.render.fov, 1, 0.5, CONFIG.render.far);

const field = new InkField(renderer); // how far the ink has spread, everywhere
globals.tField.value = field.texture;
globals.uFieldRect.value.copy(field.rect);
const post = new WatercolorPass(renderer); // repaints each frame as watercolour
const greeting = skipGreeting ? null : createGreeting(renderer); // the 3D greeting, while the world is built

boot();

async function boot() {
  if (greeting) {
    await greeting.start(); // (it draws itself every frame from here, until the world takes over)
    loader.live();
  }
  await loader.painted();

  // ---------- The world, you, the ink, the words ----------
  // (built a little at a time, so the greeting keeps moving: the drop swells as it goes)
  const world = await buildWorld(scene, { onProgress: (k) => greeting?.progress(k * 0.85) });
  const walker = createWalker({
    camera, world,
    startT: parseFloat(params.get("t")) || 0,
    startLook: parseFloat(params.get("look")) || 0,
  });
  const drops = createDrops({
    field, scene, camera, walker, world, instant: params.has("instant"), inked: params.has("inked"),
    onFlick: (x, z) => colour.splash(x, z, globals.uTime.value), // a little colour bleeds out of a splat
  });
  const reader = createReader({ walker }); // the resume, on a hanging scroll
  // open something on the page (a link in a panel, a marker, a tablet or lantern you click):
  // "resume" unrolls the scroll; "experience:2", "projects:0" are read in that point's panel
  const open = (what) => (what === "resume" ? reader.open() : ui.show(what));
  const ui = createUI({
    onJump: (t) => {
      walker.jumpTo(t);
      drops.dropAt(t);
    },
    onOpen: open,
  });
  const markers = createMarkers(world.markers, { onOpen: open }); // your points, floating in the world
  // things to click in the world: the GitHub / LinkedIn / Email rocks, the tablets, the lit lanterns
  const picker = createPicker({ camera, clickables: world.clickables, onOpen: open, blocked: () => reader.isOpen });
  const pointer = createPointer({ canSplat: () => !picker.hovered && !reader.isOpen }); // a dot of ink
  const colour = createColour({ renderer, scene, walker, world }); // stand still + crane → colour blooms
  const hint = createHint(SITE.stillHint);
  const keepsake = createKeepsake({ renderer, scene, camera, walker }); // the views from the bench, to keep
  if (params.has("debug")) window.site = { walker, drops, colour, world, globals, camera, scene, keepsake, field, ui, reader, picker }; // poke around in the console
  let walked = 0; // metres, so the hint waits until you've had a wander
  const fps = import.meta.env.DEV || params.has("fps") ? createFps() : null;

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
  let worldOut = null;  // where the world draws: the screen, or (as it begins) into the greeting's scroll
  let started = false;  // (its loop is running)

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
    // the opening note writes itself in once the first drop has landed and the ink is spreading
    ui.update(walker.progress, drops.introStart === null ? 0 : clamp01((now - drops.introStart - 1.2) / 1.4));
    markers.update(camera, drops.introStart === null ? 0 : clamp01((now - drops.introStart) / 2));
    picker.update();
    pointer.update(dt / warp, colour.charge, colour.colour, !!picker.hovered);
    hint.update(ready && walked > 6 && walker.still > 0.6 && colour.blooms === 0 && walker.seated < 0.1, dt);
    keepsake.update(dt / warp);
    post.render(scene, camera, worldOut); // (into the greeting's scroll at first: see below)
    fps?.tick(timestamp);
    requestAnimationFrame(frame);
  }

  // warm up behind the greeting, a little at a time: every shader compiled and drawn with once,
  // everything uploaded, before the world is ever shown, and without freezing it (app/warmup.js)
  walker.update(0);
  globals.uCam.value.copy(camera.position);
  await warmUp({
    renderer, scene, camera, post,
    also: () => { // the ink field's own pass (it first runs as the opening drop lands, mid-fall)
      field.dirty = true;
      field.update(globals.uTime.value);
    },
    onProgress: (k) => greeting?.progress(0.85 + 0.15 * k),
  });
  if (skipGreeting) loader.dismiss();
  else {
    // ...until you begin: the drop falls into the scroll. As it lands, the world starts, at the
    // moment of its own first ink landing (its own falling drop skipped: the scroll's was it),
    // drawn live into the scroll, where it paints itself out from the drop; and once you've come
    // down over it till it fills your view, the world simply carries on, on the screen.
    await loader.ready({
      fall: () => greeting.fall((target) => {
        globals.uTime.value = CONFIG.intro.blankPaper; // (the landing)
        worldOut = target;
        requestAnimationFrame(frame);
        started = true;
      }),
    });
    worldOut = null;
    greeting.dispose();
    resize();
    loader.open();
  }
  if (!started) requestAnimationFrame(frame);
}

/** A small frames-per-second readout, top right (averaged over half a second). */
function createFps() {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;top:10px;right:12px;z-index:60;pointer-events:none;"
    + "font:12px/1 ui-monospace,Menlo,monospace;color:#7d838b"; // (reads on the paper and the greeting's grey)
  document.body.append(el);
  let frames = 0, since = performance.now();
  return {
    tick(now) {
      frames++;
      if (now - since < 500) return;
      el.textContent = `${Math.round((frames * 1000) / (now - since))} fps`;
      frames = 0;
      since = now;
    },
  };
}
