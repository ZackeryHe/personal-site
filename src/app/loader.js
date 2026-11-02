import { SITE } from "../content.js";

// The greeting's page layer (the 3D of it is app/greeting.js): your name in white and a line
// of status over the dim grey, until the 3D greeting is drawn behind them. Click anywhere (even
// before it's ready: it goes as soon as it is), or scroll once it's ready: the drop falls into a
// scroll below, you follow it down into the paper, and the world opens out of that paper
// (it starts as blank paper too). (While it's up, scrolling doesn't walk you on unseen.)

const WALK_KEYS = ["ArrowUp", "ArrowDown", "w", "W", "s", "S", "PageDown", "PageUp", " "];

export function createLoader() {
  const el = document.getElementById("loader");
  const status = el?.querySelector(".loader-status");
  const inkCover = el?.querySelector(".loader-ink"); // (paper now: the scroll's, the world's)
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
     * fall into the scroll (fall(onCover): calls onCover({ x, y, r }) as the scroll's paper is
     * about to fill the view, with where its blot of ink is on screen). Resolves once the view
     * is all paper, the blot still on it.
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
          let covered = null;
          await fall((blot) => {
            // the same paper as the scroll's comes up over it, with the same blot on it, just there
            if (blot) {
              inkCover.style.setProperty("--blot-x", `${blot.x}px`);
              inkCover.style.setProperty("--blot-y", `${blot.y}px`);
              inkCover.style.setProperty("--blot-r", `${blot.r}px`);
            }
            el.classList.add("is-covered");
            covered = coverUp();
          });
          await (covered ?? coverUp());
          resolve();
        };
        if (wantsIn) ready();
      });
    },

    /** The world is drawing beneath the paper now, its ink spreading from the blot: clear away. */
    open() {
      if (!el) return;
      const r = parseFloat(inkCover.style.getPropertyValue("--blot-r")) || 0;
      inkCover.style.setProperty("--blot-r", `${Math.max(r * 6, 160)}px`); // (spreading out as it goes)
      el.classList.add("is-open");
      setTimeout(done, 1500);
    },

    /** Skip the greeting (dev: ?go, ?instant). */
    dismiss: done,
  };

  /** Resolves once the paper cover is fully up. */
  function coverUp() {
    return new Promise((resolve) => {
      const t = setTimeout(resolve, 500); // (in case the transition never fires)
      inkCover.addEventListener("transitionend", () => {
        clearTimeout(t);
        resolve();
      }, { once: true });
    });
  }
}
