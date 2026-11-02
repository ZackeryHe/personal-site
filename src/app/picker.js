import * as THREE from "three";

// Things in the world you can click (world.clickables): the GitHub, LinkedIn and Email rocks
// (href: opens the link), the tablets and the lit lanterns (opens: their story, via onOpen).
// Hovering one darkens its lettering or brightens its light (and the pointer opens into a
// ring); clicking it acts instead of flicking ink. Nothing is picked through the page's own
// words and links, nor while blocked() (the resume scroll is open).
export function createPicker({ camera, clickables, reach = 30, onOpen = () => {}, blocked = () => false }) {
  const ray = new THREE.Raycaster();
  ray.far = reach;
  const ndc = new THREE.Vector2(9, 9); // off-screen until the mouse moves
  const objects = clickables.map((c) => c.object);
  const overPage = (e) => !!e.target.closest?.("a, button, #reader");
  let hovered = null;
  let onPage = false; // the pointer is over the page's own links, or the scroll

  addEventListener("pointermove", (e) => {
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    onPage = overPage(e);
  });
  // capture phase: runs before the ink flick (app/drops.js) and stops it
  addEventListener("click", (e) => {
    if (!hovered || overPage(e) || blocked()) return;
    if (hovered.opens) {
      e.stopImmediatePropagation();
      onOpen(hovered.opens);
      return;
    }
    if (!hovered.href) return;
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
      let next = null;
      if (!onPage && !blocked()) {
        ray.setFromCamera(ndc, camera);
        const hit = ray.intersectObjects(objects, true)[0];
        next = hit ? owner(hit.object) : null;
      }
      if (next === hovered) return;
      hovered?.hover?.(false);
      next?.hover?.(true);
      hovered = next;
    },
  };
}
