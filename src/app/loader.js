import { SITE } from "../content.js";

// The greeting: while the world is built and its shaders compiled, ink washes drift across the
// paper, a brush hangs on its cord with a drop of ink gathering at its tip, and your name waits
// where the title card will be, a stroke of ink drawing itself out beneath it as things load
// (all in index.html + style.css, so it shows before any of this has loaded, and its animation
// runs on the compositor while the page is busy).
// Click anywhere (even before it's ready: it goes as soon as it is), or scroll once it's ready:
// the drop falls to exactly where the world's first drop lands, and the world blooms from there
// as the greeting clears. (While it's up, scrolling doesn't walk you on unseen.)

const WALK_KEYS = ["ArrowUp", "ArrowDown", "w", "W", "s", "S", "PageDown", "PageUp", " "];

export function createLoader() {
  const el = document.getElementById("loader");
  const status = el?.querySelector(".loader-status");
  const drop = el?.querySelector(".loader-drop-body");
  const bar = el?.querySelector(".loader-bar");
  const stroke = bar?.querySelector("i");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const touch = matchMedia("(pointer: coarse)").matches;
  let wantsIn = false; // clicked while it was still getting ready
  let ready = null;    // set once ready: go

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

  /** The falling drop: a copy of the one at the tip, dropped to (x, y) on screen. */
  function fall(to) {
    const r = drop.getBoundingClientRect();
    const copy = document.createElement("div");
    copy.className = "loader-falling";
    copy.style.width = `${r.width}px`;
    copy.style.height = `${r.height}px`;
    copy.style.left = `${r.left}px`;
    copy.style.top = `${r.top}px`;
    copy.appendChild(drop.querySelector("svg").cloneNode(true));
    el.appendChild(copy);
    el.classList.add("is-falling");
    const dx = to.x - (r.left + r.width / 2);
    const dy = to.y - (r.top + r.height);
    const ms = Math.min(720, 260 + Math.sqrt(Math.max(dy, 0)) * 16); // further to fall, a little longer
    const falling = copy.animate([
      { transform: "translate(0, 0) scale(1, 1)" },
      { transform: `translate(${dx * 0.3}px, ${dy * 0.18}px) scale(0.92, 1.22)`, offset: 0.4 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.8, 1.4)` },
    ], { duration: ms, easing: "cubic-bezier(0.45, 0, 0.9, 0.55)", fill: "forwards" });
    return falling.finished.then(() => {
      copy.remove();
      // the splash: a ring spreading out where it lands (the world's own ripple carries it on)
      const ring = document.createElement("div");
      ring.className = "loader-splash";
      ring.style.left = `${to.x}px`;
      ring.style.top = `${to.y}px`;
      el.appendChild(ring);
      ring.animate([
        { transform: "scale(0.1)", opacity: 0.85 },
        { transform: "scale(1.6)", opacity: 0 },
      ], { duration: 900, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)", fill: "forwards" });
    });
  }

  return {
    /** Resolves once the greeting has had a chance to paint. */
    painted: () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 30))),

    /**
     * The ink loading bar: draw it out to `k` (0–1), taking `seconds` (it carries on by itself, on
     * the compositor, while the page is busy building the world).
     */
    progress(k, seconds = 1) {
      if (!stroke) return;
      el.classList.add("is-loading");
      stroke.style.setProperty("--bar-time", `${seconds}s`);
      stroke.style.transform = `scaleX(${Math.max(0.04, Math.min(1, k)).toFixed(3)})`;
      bar.setAttribute("aria-valuenow", String(Math.round(k * 100)));
    },

    /**
     * Ready: wait for the visitor (or go at once, if they already clicked). Resolves as the drop
     * lands. landAt() → { x, y }: where on screen the world's first drop will land.
     */
    ready({ landAt }) {
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
          if (!reduced) await fall(landAt());
          resolve();
          el.classList.add("is-gone"); // the greeting clears, the world blooming beneath it
          setTimeout(() => {
            el.remove();
            unswallow();
          }, 1200);
        };
        if (wantsIn) ready();
      });
    },

    /** Skip the greeting (dev: ?go, ?instant). */
    dismiss() {
      el?.remove();
      unswallow();
    },
  };
}
