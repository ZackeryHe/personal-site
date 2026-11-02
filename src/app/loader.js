// The greeting: while the world is built and its shaders compiled, a handscroll waits on the
// table, ink drifting in its paper and a few drops of ink hanging in the air above it (all in
// index.html + style.css, so it shows before any of this has loaded, and its animation runs on
// the compositor while the page is busy). When it's ready you begin: the rollers part, the
// scroll unrolls toward you until its blank paper fills the screen, and the first drop falls.

export function createLoader() {
  const el = document.getElementById("loader");
  const status = el?.querySelector(".loader-status");
  const begin = el?.querySelector(".loader-begin");
  const paper = el?.querySelector(".loader-paper");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  return {
    /** Resolves once the greeting has had a chance to paint. */
    painted: () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 30))),

    /** Offer to begin; resolves when the visitor does, as the scroll's paper fills the screen. */
    ready() {
      if (!el) return Promise.resolve();
      el.classList.add("is-ready");
      status.textContent = "the ink is ready";
      begin.hidden = false;
      begin.focus({ preventScroll: true });
      return new Promise((resolve) => {
        let gone = false;
        const go = (e) => {
          if (gone) return;
          gone = true;
          e?.preventDefault?.();
          e?.stopPropagation?.(); // (not an ink flick)
          removeEventListener("keydown", onKey);
          begin.disabled = true;
          // the paper grows from its size on the table to the whole screen
          const r = paper.getBoundingClientRect();
          el.style.setProperty("--to-x", (innerWidth / r.width) * 1.04);
          el.style.setProperty("--to-y", (innerHeight / r.height) * 1.04);
          el.style.setProperty("--shift-y", `${innerHeight / 2 - (r.top + r.height / 2)}px`);
          el.classList.add("is-opening");
          setTimeout(() => {
            resolve();
            el.classList.add("is-gone"); // then the scroll lifts away, leaving its paper: the world's
            setTimeout(() => el.remove(), 900);
          }, reduced ? 250 : 1250);
        };
        const onKey = (e) => (e.key === "Enter" || e.key === " ") && go(e);
        begin.addEventListener("click", go);
        addEventListener("keydown", onKey);
      });
    },

    /** Skip the greeting (dev: ?go, ?instant). */
    dismiss() {
      el?.remove();
    },
  };
}
