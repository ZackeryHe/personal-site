// The pointer: a dot of ink, the mark a drop leaves on the paper. Mostly round, its edge a
// little ragged and darker where the ink pooled as it dried, its middle a thinner wash you can
// see through. Its middle takes the colour while a bloom fills in; over things you can click it
// spreads wider and clearer, into a ring; when you click it presses, and throws a few drops.
// Its middle is the hotspot. (Hidden on touch screens.)

const PAPER = "#efe7d6";
const INK = "#161a21";
const R = 6.5; // its radius at rest (px)
const SPREAD = 0.65; // ...and how much wider it spreads over things you can click

const SVG = `
<svg width="48" height="48" viewBox="-24 -24 48 48" aria-hidden="true">
  <defs>
    <!-- a ragged edge, as ink spreads into paper: not quite round, and frayed -->
    <filter id="dot-ragged" x="-50%" y="-50%" width="200%" height="200%">
      <feTurbulence type="fractalNoise" baseFrequency="0.28" numOctaves="3" seed="11" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <!-- pigment pools unevenly round the rim: darker here, thinner there -->
    <filter id="dot-pool" x="-50%" y="-50%" width="200%" height="200%">
      <feTurbulence type="fractalNoise" baseFrequency="0.22" numOctaves="2" seed="3" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.5 0 0 0 0.05" result="mask"/>
      <feComposite in="SourceGraphic" in2="mask" operator="in"/>
    </filter>
    <filter id="dot-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="0.7"/></filter>
    <!-- the wash: thin in the middle, darkening toward the edge -->
    <radialGradient id="dot-wash">
      <stop offset="0" stop-color="${INK}" stop-opacity="0.2"/>
      <stop offset="0.65" stop-color="${INK}" stop-opacity="0.3"/>
      <stop offset="1" stop-color="${INK}" stop-opacity="0.55"/>
    </radialGradient>
  </defs>
  <g filter="url(#dot-ragged)">
    <!-- a faint halo of paper, so it reads over dark ink too -->
    <circle r="${R + 1.6}" fill="none" stroke="${PAPER}" stroke-width="1.8" opacity="0.6" filter="url(#dot-soft)"/>
    <circle class="wash" r="${R}" fill="url(#dot-wash)"/>
    <!-- colour, taken into the middle while a bloom fills in -->
    <circle class="load" r="${R - 0.6}" fill="#5f9a6e" opacity="0"/>
    <!-- the rim: pigment pooled where it dried, bleeding a little way in -->
    <circle class="pool" r="${R - 1.5}" fill="none" stroke="${INK}" stroke-width="2.2" stroke-opacity="0.28" filter="url(#dot-soft)"/>
    <g filter="url(#dot-pool)">
      <circle class="rim" r="${R - 0.5}" fill="none" stroke="${INK}" stroke-width="1.5" stroke-opacity="0.95"/>
    </g>
  </g>
</svg>`;

export function createPointer({ canSplat = () => true } = {}) {
  const el = document.createElement("div");
  el.id = "pointer";
  el.innerHTML = SVG;
  document.body.appendChild(el);
  const wash = el.querySelector(".wash");
  const load = el.querySelector(".load");
  const rim = el.querySelector(".rim");
  const pool = el.querySelector(".pool");
  const splats = document.createElement("div");
  splats.id = "splats";
  document.body.appendChild(splats);

  let x = innerWidth / 2;
  let y = innerHeight / 2;
  let flick = 0;  // 1 → 0 after a click
  let lift = 0;   // 0 → 1 over links and buttons (and things in the world you can click)
  let overLink = false;
  let loadColour = INK;

  // a few drops of ink thrown out all round, as from a drop landing
  function spatter(px, py) {
    const n = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const d = document.createElement("i");
      const a = Math.random() * Math.PI * 2;
      const dist = 7 + Math.random() * 12;
      const size = 1.6 + Math.random() * 2.4;
      d.style.cssText = `left:${px}px;top:${py}px;width:${size}px;height:${size * (0.8 + Math.random() * 0.4)}px;background:${Math.random() < 0.6 ? INK : loadColour}`;
      splats.appendChild(d);
      d.animate(
        [
          { transform: "translate(-50%, -50%) scale(0.3)", opacity: 1 },
          { transform: `translate(calc(-50% + ${Math.cos(a) * dist}px), calc(-50% + ${Math.sin(a) * dist}px)) scale(1)`, opacity: 0.9, offset: 0.3 },
          { transform: `translate(calc(-50% + ${Math.cos(a) * dist * 1.1}px), calc(-50% + ${Math.sin(a) * dist * 1.1}px)) scale(1)`, opacity: 0 },
        ],
        { duration: 600 + Math.random() * 250, easing: "cubic-bezier(.2,.8,.3,1)" }
      ).onfinish = () => d.remove();
    }
  }

  addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    x = e.clientX;
    y = e.clientY;
    overLink = !!e.target.closest?.("a, button");
    el.classList.add("on");
  });
  addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") return;
    flick = 1;
    if (!e.target.closest?.("a, button") && canSplat()) spatter(e.clientX, e.clientY);
  });
  document.documentElement.addEventListener("mouseleave", () => el.classList.remove("on"));

  return {
    /**
     * charge: 0–1 how much colour it has taken in; colour: CSS colour of it;
     * overThing: the pointer is over something clickable in the world (a link rock)
     */
    update(dt, charge = 0, colour = null, overThing = false) {
      flick = Math.max(0, flick - dt * 5);
      lift += ((overLink || overThing ? 1 : 0) - lift) * Math.min(1, dt * 10);
      const spread = 1 + SPREAD * lift;
      const press = 1 - 0.2 * Math.sin(Math.PI * (1 - flick)); // (a quick press as you click)
      el.style.transform = `translate(${(x - 24).toFixed(1)}px, ${(y - 24).toFixed(1)}px) scale(${(spread * press).toFixed(3)})`;
      // spread out, the wash goes clearer and the rim stays fine and lighter: a ring
      rim.setAttribute("stroke-width", ((1.5 * (1 + 0.15 * lift)) / spread).toFixed(3));
      rim.setAttribute("stroke-opacity", (0.95 - 0.3 * lift).toFixed(3));
      pool.setAttribute("stroke-opacity", (0.28 * (1 - 0.7 * lift)).toFixed(3));
      wash.setAttribute("opacity", ((1 - 0.7 * lift) * (1 - 0.5 * charge)).toFixed(3));
      if (colour) {
        loadColour = colour;
        load.setAttribute("fill", colour);
      }
      load.setAttribute("opacity", (charge * 0.8 * (1 - 0.5 * lift)).toFixed(3));
    },
  };
}
