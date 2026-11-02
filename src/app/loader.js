import { SITE } from "../content.js";

// The greeting's page layer (the 3D of it is app/greeting.js): your name in white and a line
// of status over the dim grey, until the 3D greeting is drawn behind them. Click anywhere (even
// before it's ready: it goes as soon as it is), or scroll once it's ready: the drop falls toward
// you and fills your view with ink, and the world opens out of the ink from where its first drop
// lands. (While it's up, scrolling doesn't walk you on unseen.)

const WALK_KEYS = ["ArrowUp", "ArrowDown", "w", "W", "s", "S", "PageDown", "PageUp", " "];

export function createLoader() {
  const el = document.getElementById("loader");
  const status = el?.querySelector(".loader-status");
  const inkCover = el?.querySelector(".loader-ink");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const touch = matchMedia("(pointer: coarse)").matches;
  let wantsIn = false; // clicked while it was still getting ready
  let ready = null;    // set once ready: go
  document.body.classList.add("is-greeting"); // (the world's own words and marks wait: style.css)

  if (el) {
    // the name and seal come from content.js (index.html has them too, for the first moment)
    el.querySelector(".loader-title h1").textContent = SITE.name;
    el.querySelector(".loader-title .seal").textContent = SITE.initials;
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
     * fall (fall(): resolves as it fills the view). Resolves once the view is all ink.
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
          el.classList.add("is-falling"); // (the words fade; the ink cover comes up as the drop arrives)
          await Promise.all([fall(), coverUp()]);
          resolve();
        };
        if (wantsIn) ready();
      });
    },

    /** The world is drawing beneath the ink now: open the ink out from (x, y) on screen, and go. */
    open({ x, y }) {
      if (!el) return;
      inkCover.style.setProperty("--at", `${x}px ${y}px`);
      el.classList.add("is-open");
      setTimeout(done, reduced ? 700 : 1500);
    },

    /** Skip the greeting (dev: ?go, ?instant). */
    dismiss: done,
  };

  /** Resolves once the ink cover is fully up (its fade is timed to the drop's fall: style.css). */
  function coverUp() {
    return new Promise((resolve) => {
      const t = setTimeout(resolve, reduced ? 450 : 1350); // (in case the transition never fires)
      inkCover.addEventListener("transitionend", () => {
        clearTimeout(t);
        resolve();
      }, { once: true });
    });
  }
}
