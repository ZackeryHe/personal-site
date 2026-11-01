import * as THREE from "three";
import { SITE } from "../content.js";
import { STOPS } from "../world/places.js";

// HTML overlay: section text and view names that bleed in like ink, plus
// clickable markers on the progress line.

const SVG_NS = "http://www.w3.org/2000/svg";
let defs = null;
let filterCount = 0;

function svgDefs() {
  if (defs) return defs;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.position = "absolute";
  defs = document.createElementNS(SVG_NS, "defs");
  svg.appendChild(defs);
  document.body.appendChild(svg);
  return defs;
}

/**
 * Make an element able to condense out of (and dissolve back into) ink blots.
 * Returns set(k): 0 = gone, 1 = fully written. Below 1 the element is displaced,
 * blurred and thresholded by an SVG filter.
 */
function inkBleed(el) {
  const id = `bleed-${filterCount++}`;
  const filter = document.createElementNS(SVG_NS, "filter");
  filter.setAttribute("id", id);
  filter.setAttribute("x", "-30%");
  filter.setAttribute("y", "-30%");
  filter.setAttribute("width", "160%");
  filter.setAttribute("height", "160%");
  filter.setAttribute("color-interpolation-filters", "sRGB");
  filter.innerHTML = `
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="${filterCount * 7 + 3}" result="noise"/>
    <feDisplacementMap in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G" result="moved"/>
    <feGaussianBlur in="moved" stdDeviation="0" result="soft"/>
    <feComponentTransfer in="soft"><feFuncA type="linear" slope="1" intercept="0"/></feComponentTransfer>`;
  svgDefs().appendChild(filter);
  const disp = filter.querySelector("feDisplacementMap");
  const blur = filter.querySelector("feGaussianBlur");
  const alpha = filter.querySelector("feFuncA");
  let last = -1;

  return (k) => {
    if (Math.abs(k - last) < 0.004 && !(k === 1 && last !== 1) && !(k === 0 && last !== 0)) return;
    last = k;
    if (k <= 0) {
      el.style.visibility = "hidden";
      return;
    }
    el.style.visibility = "visible";
    if (k >= 1) {
      el.style.filter = "none"; // crisp when settled
      el.style.opacity = "1";
      return;
    }
    const inv = 1 - k;
    disp.setAttribute("scale", (inv * 28).toFixed(2));
    blur.setAttribute("stdDeviation", (inv * 3.5).toFixed(2));
    alpha.setAttribute("slope", (1 + inv * 5).toFixed(3));
    alpha.setAttribute("intercept", (-inv * 3).toFixed(3));
    el.style.filter = `url(#${id})`;
    el.style.opacity = Math.min(1, k * 4).toFixed(3);
  };
}

const ease = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

/** Build one section's HTML from src/content.js. */
function sectionElement(s) {
  const el = document.createElement("section");
  el.className = "station";
  if (s.titleCard) {
    el.innerHTML = `<div class="seal"></div><h1></h1><p class="hint"></p>`;
    el.querySelector(".seal").textContent = SITE.initials;
    el.querySelector("h1").textContent = SITE.name;
    el.querySelector(".hint").textContent = SITE.hint;
  } else {
    el.innerHTML = `<h2><span class="zh"></span> <span class="heading"></span></h2><div class="body"></div>`;
    el.querySelector(".zh").textContent = s.zh || "";
    el.querySelector(".heading").textContent = s.heading || s.label;
    el.querySelector(".body").innerHTML = s.body || ""; // your own HTML: links etc.
  }
  return el;
}

export function createUI({ onJump }) {
  const container = document.getElementById("stations");
  const stations = SITE.sections.map((s) => {
    if (!(s.stop in STOPS)) console.warn(`content.js: unknown stop "${s.stop}" (see STOPS in world/places.js)`);
    const el = sectionElement(s);
    container.appendChild(el);
    return { el, at: STOPS[s.stop] ?? 0, label: s.label, set: inkBleed(el) };
  });

  // Markers on the progress line: click to walk there
  const bar = document.getElementById("progress");
  for (const s of stations) {
    const m = document.createElement("button");
    m.className = "marker";
    m.style.top = `${s.at * 100}%`;
    m.dataset.label = s.label;
    m.setAttribute("aria-label", `Walk to ${s.label}`);
    m.addEventListener("click", (e) => {
      e.stopPropagation();
      onJump(s.at);
    });
    bar.appendChild(m);
  }
  const dot = document.getElementById("progress-dot");

  return {
    /** introText: 0 → 1 as the name first writes itself in */
    update(progress, introText) {
      for (const [i, s] of stations.entries()) {
        let k = clamp01((1 - Math.abs(progress - s.at) / 0.07) * 1.6);
        if (i === 0) k = Math.min(k, introText);
        s.set(ease(k));
      }
      dot.style.top = `calc(${(progress * 100).toFixed(2)}% - 4px)`;
    },
  };
}

/**
 * Poetic names for the garden's views, floating beside them in the world.
 * views: [{ zh, en, pos: Vector3, radius, minDist?, far? }] (see VIEWS in world/places.js)
 */
export function createViewLabels(views) {
  const layer = document.getElementById("views");
  const items = views.map((v) => {
    const el = document.createElement("div");
    el.className = v.far ? "view-label far" : "view-label";
    el.innerHTML = `<span class="zh"></span><span class="en"></span>`;
    el.querySelector(".zh").textContent = v.zh;
    el.querySelector(".en").textContent = v.en;
    layer.appendChild(el);
    return { v, el, set: inkBleed(el) };
  });
  const p = new THREE.Vector3();

  return {
    update(camera, intro) {
      for (const { v, el, set } of items) {
        const d = camera.position.distanceTo(v.pos);
        // near views fade in over the outer third of their radius; far ones over the last 20 m
        let k = 1 - THREE.MathUtils.smoothstep(d, v.far ? v.radius - 20 : v.radius * 0.65, v.radius);
        if (v.minDist) k *= THREE.MathUtils.smoothstep(d, v.minDist * 0.85, v.minDist);
        p.copy(v.pos).project(camera);
        const onScreen = p.z < 1 && Math.abs(p.x) < 0.92 && Math.abs(p.y) < 0.92;
        k = onScreen ? k * intro : 0;
        // far-off spectacles only name themselves when you turn to look at them
        if (v.far) k *= 1 - THREE.MathUtils.smoothstep(Math.abs(p.x), 0.45, 0.8);
        set(ease(clamp01(k)));
        if (k > 0) {
          const x = (p.x * 0.5 + 0.5) * innerWidth;
          const y = (-p.y * 0.5 + 0.5) * innerHeight;
          // near names sit above their anchor; far ones are centred beside the spectacle
          el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, ${v.far ? "-50%" : "-100%"})`;
        }
      }
    },
  };
}
