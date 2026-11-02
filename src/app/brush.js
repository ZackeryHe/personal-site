// The pointer: a calligraphy brush (毛笔), painted in ink like everything else. Its tip
// is the hotspot. It leans as you move, its bristles load with colour while a bloom
// fills in, and when you click it flicks and spatters a few drops. It lifts a little
// over things you can click. (Hidden on touch screens.)

const PAPER = "#efe7d6";
const INK = "#161a21";

const SVG = `
<svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
  <defs>
    <!-- hand-painted: roughened edges, and a thin halo of paper so it reads over dark ink -->
    <filter id="brush-ink" x="-25%" y="-25%" width="150%" height="150%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" xChannelSelector="R" yChannelSelector="G" result="rough"/>
      <feMorphology in="rough" operator="dilate" radius="1.3" result="fat"/>
      <feFlood flood-color="${PAPER}" flood-opacity="0.85"/>
      <feComposite in2="fat" operator="in" result="halo"/>
      <feMerge><feMergeNode in="halo"/><feMergeNode in="rough"/></feMerge>
    </filter>
    <filter id="brush-wet"><feGaussianBlur stdDeviation="1.3"/></filter>
  </defs>
  <g filter="url(#brush-ink)">
    <!-- the cord and a red tassel at the top of the handle -->
    <path d="M57.4 5.6 Q62.2 2.6 61.6 9" fill="none" stroke="${INK}" stroke-width="0.8" stroke-linecap="round"/>
    <path d="M61.6 9 C60.2 11.6 60.6 14 61.7 15.8 C62.8 14 63.1 11.6 61.6 9 Z" fill="#b8322a"/>
    <!-- the handle: one tapered stroke, with a broken dry-brush highlight -->
    <path d="M20.4 39.4 L55.9 4.9 Q58.3 3 58.1 7.1 L23.6 42.6 Z" fill="#2b2622" fill-opacity="0.92"/>
    <path d="M24.4 39.6 L55.2 8.8" stroke="${PAPER}" stroke-width="0.8" stroke-dasharray="7 2 10 3 4 2" opacity="0.55"/>
    <!-- bamboo joints -->
    <path d="M34.2 25.2 L37.8 28.8 M45.4 14 L49 17.6" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/>
    <!-- the ferrule -->
    <path d="M21.1 41.9 L23.7 39.3" stroke="${INK}" stroke-width="5.8" stroke-linecap="round"/>
    <!-- the bristles, wet with ink (and a faint bleed around them) -->
    <path d="M17.6 40.4 C12.5 44.5 7.5 51.5 6 58 C12.6 55.6 19.6 50.6 24.2 45.8 Z" fill="${INK}" opacity="0.35" filter="url(#brush-wet)"/>
    <path d="M17.6 40.4 C12.5 44.5 7.5 51.5 6 58 C12.6 55.6 19.6 50.6 24.2 45.8 Z" fill="${INK}"/>
    <!-- colour loaded into the tip while a bloom fills in -->
    <path class="load" d="M12.6 47 C9.5 50.8 7 54.5 6 58 C9.8 56.6 13.6 54.2 16.8 51.2 Z" fill="#5f9a6e" opacity="0"/>
  </g>
</svg>`;

export function createBrush({ canSplat = () => true } = {}) {
  const el = document.createElement("div");
  el.id = "brush";
  el.innerHTML = SVG;
  document.body.appendChild(el);
  const load = el.querySelector(".load");
  const splats = document.createElement("div");
  splats.id = "splats";
  document.body.appendChild(splats);

  let x = innerWidth / 2;
  let y = innerHeight / 2;
  let lastX = x;
  let tilt = 0;   // leans with sideways motion
  let flick = 0;  // 1 → 0 after a click
  let lift = 0;   // over links and buttons
  let overLink = false;
  let loadColour = INK;

  // a few drops of ink thrown off the tip
  function spatter(px, py) {
    const n = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const d = document.createElement("i");
      const a = -Math.PI * 0.25 + (Math.random() - 0.5) * 2.2; // mostly up and to the right, as flicked
      const dist = 8 + Math.random() * 18;
      const size = 2 + Math.random() * 3.5;
      d.style.cssText = `left:${px}px;top:${py}px;width:${size}px;height:${size * (0.8 + Math.random() * 0.4)}px;background:${Math.random() < 0.6 ? INK : loadColour}`;
      splats.appendChild(d);
      d.animate(
        [
          { transform: "translate(-50%, -50%) scale(0.3)", opacity: 1 },
          { transform: `translate(calc(-50% + ${Math.cos(a) * dist}px), calc(-50% + ${Math.sin(a) * dist}px)) scale(1)`, opacity: 0.9, offset: 0.3 },
          { transform: `translate(calc(-50% + ${Math.cos(a) * dist * 1.1}px), calc(-50% + ${Math.sin(a) * dist * 1.1 + 4}px)) scale(1)`, opacity: 0 },
        ],
        { duration: 650 + Math.random() * 250, easing: "cubic-bezier(.2,.8,.3,1)" }
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
     * charge: 0–1 how loaded with colour the bristles are; colour: CSS colour of the load;
     * overThing: the pointer is over something clickable in the world (a link rock)
     */
    update(dt, charge = 0, colour = null, overThing = false) {
      const vx = (x - lastX) / Math.max(dt, 1e-3);
      lastX = x;
      tilt += (Math.max(-0.35, Math.min(0.35, vx * 0.0006)) - tilt) * Math.min(1, dt * 8);
      flick = Math.max(0, flick - dt * 3.5);
      lift += ((overLink || overThing ? 1 : 0) - lift) * Math.min(1, dt * 10);
      const angle = tilt - 0.5 * Math.sin(Math.PI * (1 - flick)) - lift * 0.14;
      const scale = 1.3 * (1 + lift * 0.14);
      el.style.transform = `translate(${(x - 6).toFixed(1)}px, ${(y - 58).toFixed(1)}px) rotate(${angle.toFixed(3)}rad) scale(${scale.toFixed(3)})`;
      if (colour) {
        loadColour = colour;
        load.setAttribute("fill", colour);
      }
      load.setAttribute("opacity", (charge * 0.95).toFixed(3));
    },
  };
}
