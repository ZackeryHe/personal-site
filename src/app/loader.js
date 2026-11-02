import { SITE } from "../content.js";

// The greeting's page layer (the 3D of it is app/greeting.js): your name in white and a line
// of status over the dim grey, until the 3D greeting is drawn behind them. Click anywhere (even
// before it's ready: it goes as soon as it is), or scroll once it's ready: the drop falls into a
// scroll below, the world paints itself out over the scroll from where it lands, and you come
// down over it till it is the world (greeting.js). (While it's up, scrolling doesn't walk you on unseen.)

const WALK_KEYS = ["ArrowUp", "ArrowDown", "w", "W", "s", "S", "PageDown", "PageUp", " "];

export function createLoader() {
  const el = document.getElementById("loader");
  const status = el?.querySelector(".loader-status");
  const touch = matchMedia("(pointer: coarse)").matches;
  let wantsIn = false; // clicked while it was still getting ready
  let ready = null;    // set once ready: go
  document.body.classList.add("is-greeting"); // (the world's own words and marks wait: style.css)

  if (el) {
    // the name comes from content.js (index.html has it too, for the first moment)
    el.querySelector(".loader-title h1").textContent = SITE.name;
    const enter = (e) => {
      e.preventDefault();
      e.stopPropagation(); // (not an ink flick)
      if (ready) ready();
      else if (!wantsIn) {
        wantsIn = true;
        status.textContent = "a moment…";
      }
    };
    el.addEventListener("click", enter);
    el.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && enter(e));
  }

  // while the greeting is up, scrolling, swiping and the walking keys don't reach the walk (you'd
  // be walked on unseen); once it's ready, they're the way in
  const swallow = (e) => {
    if (!document.getElementById("loader")) return;
    if (e.type === "keydown" && !WALK_KEYS.includes(e.key) && e.key !== "Enter") return;
    e.stopImmediatePropagation();
    if (ready && (e.type === "wheel" ? Math.abs(e.deltaY) > 2 : e.type !== "touchstart")) ready();
  };
  const kinds = ["wheel", "touchstart", "touchmove", "keydown"];
  if (el) for (const k of kinds) addEventListener(k, swallow, { capture: true, passive: true });
  const unswallow = () => {
    for (const k of kinds) removeEventListener(k, swallow, { capture: true });
  };
  const done = () => {
    el?.remove();
    unswallow();
    document.body.classList.remove("is-greeting");
  };

  return {
    /** The 3D greeting is drawing now: let it show through. */
    live: () => el?.classList.add("is-live"),

    /** Resolves once the page has had a chance to paint. */
    painted: () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 30))),

    /**
     * Ready: wait for the visitor (or go at once, if they already clicked), then let the drop
     * fall into the scroll (fall(): resolves once the world, painted out over the scroll, fills
     * the view). Resolves then.
     */
    ready({ fall }) {
      if (!el) return Promise.resolve();
      el.classList.add("is-ready");
      el.removeAttribute("aria-busy");
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", `Begin: ${SITE.name}`);
      el.tabIndex = 0;
      el.focus({ preventScroll: true });
      status.textContent = touch ? "tap or swipe to begin" : "click or scroll to begin";
      return new Promise((resolve) => {
        let gone = false;
        ready = async () => {
          if (gone) return;
          gone = true;
          el.removeAttribute("role");
          el.classList.add("is-falling"); // (the words fade)
          await fall();
          resolve();
        };
        if (wantsIn) ready();
      });
    },

    /** The world has the screen now: clear away. */
    open: done,

    /** Skip the greeting (dev: ?go, ?instant). */
    dismiss: done,
  };
}
