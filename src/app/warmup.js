import * as THREE from "three";

// Get the world ready to be shown, behind the greeting, without freezing it: every shader
// compiled, and everything uploaded to the GPU.
//
// A shader isn't waited for when it's asked for, only the first time something is drawn with
// it. On a phone without KHR_parallel_shader_compile that wait is long (around a tenth of a
// second each, and there are dozens): draw the whole world at once and you wait for all of them
// together, seconds, the greeting frozen. So: ask for them all (that doesn't wait; where the
// browser can, it compiles them in the background meanwhile), then draw the world a material at
// a time into a 1×1 target, as many as fit in ~10 ms, then let a frame through. Where shaders
// are slow, that's a short stutter each rather than one long freeze; where they're quick, it's
// over in a few frames. Last, the whole world once through the watercolour pass (its own
// shaders, and anything missed).

const LAYER = 31; // (only what's on it is drawn, by the camera that sees only it)
const BUDGET = 16; // ms of drawing before a frame is let through
const BATCH = 24; // things drawn at once, where nothing has to wait on a shader

export async function warmUp({ renderer, scene, camera, post, also = () => {}, onProgress = () => {} }) {
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  const target = new THREE.WebGLRenderTarget(1, 1);

  // 1. ask for every shader (where the browser compiles in the background, wait for that here,
  //    without blocking)
  await renderer.compileAsync(scene, camera);
  onProgress(0.2);

  // 2. the world a material at a time (instanced things apart: they're drawn with their own
  //    shader), hidden things too (splashes, blossoms...: shown later, and slow to show then)
  const groups = new Map();
  scene.traverse((o) => {
    if (!o.material || !(o.isMesh || o.isLine || o.isPoints || o.isSprite)) return;
    const key = [].concat(o.material).map((m) => m.uuid).join() + (o.isInstancedMesh ? "|instanced" : "");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  });
  // Many materials share a shader, and only the first thing drawn with each shader can wait on it.
  // Where the browser compiled them in the background (above), none will: everything goes many at
  // a time, just uploading. Where it can't, the first thing for each shader goes alone (each wait
  // a stutter of its own), then the rest many at a time.
  const parallel = renderer.extensions.has("KHR_parallel_shader_compile");
  const shaderOf = (things) => renderer.properties.get([].concat(things[0].material)[0]).currentProgram;
  const batches = [], rest = [], seen = new Set();
  for (const things of groups.values()) {
    const shader = shaderOf(things); // (unknown for hidden things: not asked for yet, so they go alone)
    if (parallel && shader) rest.push(things);
    else if (shader && seen.has(shader)) rest.push(things);
    else {
      if (shader) seen.add(shader);
      batches.push([things]);
    }
  }
  for (let i = 0; i < rest.length; i += BATCH) batches.push(rest.slice(i, i + BATCH));
  const eye = camera.clone();
  eye.layers.set(LAYER);
  for (let i = 0; i < batches.length;) {
    const start = performance.now();
    renderer.setRenderTarget(target); // (the greeting draws to the screen in between)
    while (i < batches.length && performance.now() - start < BUDGET) {
      const things = batches[i++].flat();
      const culled = things.map((o) => o.frustumCulled);
      const hidden = new Set(); // (it, or what it's in, is hidden for now: show it just for this)
      for (const o of things) {
        o.layers.enable(LAYER);
        o.frustumCulled = false; // (whether you can see it from here or not)
        for (let p = o; p; p = p.parent) if (!p.visible) hidden.add(p);
      }
      for (const p of hidden) p.visible = true;
      renderer.render(scene, eye);
      for (const p of hidden) p.visible = false;
      things.forEach((o, k) => {
        o.layers.disable(LAYER);
        o.frustumCulled = culled[k];
      });
    }
    renderer.setRenderTarget(null);
    onProgress(0.2 + (0.7 * i) / batches.length);
    await nextFrame();
  }

  // 3. and once as it'll be drawn: into a target, as the opening draws it into its scroll, and
  //    to the screen, as the walk does (its last step is a shader apiece for those two), all but
  //    one pixel of it scissored away: the greeting's on the screen, and paints over it next frame
  post.render(scene, camera, target);
  await nextFrame();
  const scissor = renderer.getScissor(new THREE.Vector4());
  const scissorTest = renderer.getScissorTest();
  renderer.setScissor(0, 0, 1, 1);
  renderer.setScissorTest(true);
  post.render(scene, camera, null);
  renderer.setScissor(scissor);
  renderer.setScissorTest(scissorTest);
  target.dispose();
  await nextFrame();
  also(); // (whatever else draws with shaders of its own: the ink field)
  onProgress(1);
}
