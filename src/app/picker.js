import * as THREE from "three";

// Things in the world you can click: the GitHub, LinkedIn and Email rocks (world.clickables).
// Hovering one darkens its lettering (and the brush lifts); clicking opens its link
// instead of flicking ink.
export function createPicker({ camera, clickables, reach = 30 }) {
  const ray = new THREE.Raycaster();
  ray.far = reach;
  const ndc = new THREE.Vector2(9, 9); // off-screen until the mouse moves
  const objects = clickables.map((c) => c.object);
  let hovered = null;

  addEventListener("pointermove", (e) => {
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  });
  // capture phase: runs before the ink flick (app/drops.js) and stops it
  addEventListener("click", (e) => {
    if (!hovered?.href) return;
    e.stopImmediatePropagation();
    if (hovered.href.startsWith("mailto:")) location.href = hovered.href; // the mail app, no blank tab
    else window.open(hovered.href, "_blank", "noopener");
  }, { capture: true });

  const owner = (obj) => clickables.find((c) => {
    for (let o = obj; o; o = o.parent) if (o === c.object) return true;
    return false;
  });

  return {
    get hovered() { return hovered; },
    update() {
      if (!objects.length) return;
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(objects, true)[0];
      const next = hit ? owner(hit.object) : null;
      if (next === hovered) return;
      hovered?.hover?.(false);
      next?.hover?.(true);
      hovered = next;
    },
  };
}
