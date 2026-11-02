import * as THREE from "three";
import { SITE } from "../content.js";
import { STOPS } from "../world/places.js";
import { story } from "./stories.js";

// HTML overlay: your points' panels and markers, which bleed in like ink, plus the
// progress line and the occasional hint.

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
export function inkBleed(el) {
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
const pointById = (id) => SITE.points.find((p) => p.id === id);

/** Build one panel's HTML from a point in src/content.js. */
function panelElement(p) {
  const el = document.createElement("section");
  el.className = "station";
  if (p.titleCard) {
    // the opening note, on the right (the panels along the walk stay on the left)
    el.classList.add("station--intro");
    el.innerHTML = `<div class="body"></div>`;
    for (const line of SITE.intro) {
      const para = document.createElement("p");
      para.textContent = line;
      el.querySelector(".body").appendChild(para);
    }
  } else {
    el.innerHTML = `<h2><span class="zh"></span> <span class="heading"></span></h2><div class="body"></div>`;
    el.querySelector(".zh").textContent = p.zh || "";
    el.querySelector(".heading").textContent = p.heading || p.label;
    el.querySelector(".body").innerHTML = p.body || ""; // your own HTML: links etc.
  }
  return el;
}

/**
 * Panels that write themselves in at each stop, and the progress line's dots: one for each
 * point with a panel (a body), or with a stop of its own in world/places.js (e.g. Contacts).
 * A panel can be rewritten with a story (a tablet's, a lantern's: stories.js) while you're
 * there; it goes back to what it said when you walk on. onOpen(what): a link in a panel
 * that opens something here (data-opens: "experience:2", "resume", ...).
 */
export function createUI({ onJump, onOpen = () => {} }) {
  const container = document.getElementById("stations");
  const stations = SITE.points
    .filter((p) => p.titleCard || p.body || p.id in STOPS)
    .map((p) => {
      if (!(p.id in STOPS)) console.warn(`content.js: point "${p.id}" has no stop in world/places.js`);
      const station = { id: p.id, at: STOPS[p.id] ?? 0, label: p.label, later: p.panelLater || 0 };
      if (p.titleCard || p.body) {
        station.el = panelElement(p);
        container.appendChild(station.el);
        station.set = inkBleed(station.el);
        station.body = station.el.querySelector(".body");
        station.plain = station.body.innerHTML; // what it says until you open something in it
      }
      return station;
    });
  const panels = stations.filter((s) => s.el);

  /** Write html into a panel's body: it bleeds in afresh. */
  function rewrite(s, html) {
    s.body.innerHTML = html;
    s.reading = html !== s.plain;
    s.body.classList.remove("rewrite");
    void s.body.offsetWidth; // (so the animation starts again)
    s.body.classList.add("rewrite");
  }
  // links in the panels that open things here, and "back" to what the panel said
  container.addEventListener("click", (e) => {
    const a = e.target.closest?.("[data-opens], [data-back]");
    if (!a) return;
    e.preventDefault();
    e.stopPropagation(); // (not an ink flick)
    if (a.hasAttribute("data-back")) {
      const s = panels.find((s) => s.el.contains(a));
      if (s) rewrite(s, s.plain);
    } else onOpen(a.dataset.opens);
  });

  // dots on the progress line: click to walk there
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
    /** introText: 0 → 1 as the opening note first writes itself in */
    update(progress, introText) {
      for (const s of panels) {
        let k = clamp01((1 - Math.abs(progress - s.at - s.later) / 0.07) * 1.6);
        if (s === panels[0]) k = Math.min(k, introText); // the opening note waits for the first drop
        s.set(ease(k));
        if (k <= 0 && s.reading) { // walked on: it'll say what it said, next time
          s.body.innerHTML = s.plain;
          s.reading = false;
        }
      }
      dot.style.top = `calc(${(progress * 100).toFixed(2)}% - 4px)`;
    },
    /** Read a tablet's or a lantern's story ("experience:2", "projects:0") in its panel. */
    show(what) {
      const st = story(what);
      const s = st && panels.find((s) => s.id === st.point);
      if (s) rewrite(s, st.html);
      return !!s;
    },
  };
}

/** A quiet hint at the bottom of the screen that writes itself in and out. */
export function createHint(text) {
  const el = document.createElement("div");
  el.className = "still-hint";
  el.textContent = text;
  document.body.appendChild(el);
  const set = inkBleed(el);
  let k = 0;
  return {
    update(show, dt) {
      k += ((show ? 1 : 0) - k) * Math.min(1, dt * (show ? 1.2 : 4));
      set(k < 0.01 ? 0 : k > 0.99 ? 1 : ease(k));
    },
  };
}

/**
 * Your points' markers, floating beside the things that stand for them
 * (world.markers, from MARKERS in world/places.js; text and links from content.js), and small
 * ones of their own (m.label, m.small: the names over the lit lanterns). A marker with an
 * href is a link; one that opens something here (p.opens / m.opens) calls onOpen(what).
 */
export function createMarkers(markers, { onOpen = () => {} } = {}) {
  const layer = document.getElementById("markers");
  const items = markers.map((m) => {
    const p = m.label ? { label: m.label, opens: m.opens } : pointById(m.id) || { label: m.id };
    const link = p.href || p.opens;
    const el = document.createElement(link ? "a" : "div");
    el.className = `marker-label${link ? " link" : ""}${m.small ? " small" : ""}`;
    if (p.href) {
      el.href = p.href;
      el.target = "_blank";
      el.rel = "noopener";
      el.addEventListener("click", (e) => e.stopPropagation()); // following a link isn't an ink flick
    } else if (p.opens) {
      el.href = `#${p.opens.replace(":", "-")}`;
      el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation(); // (nor is this)
        onOpen(p.opens);
      });
    }
    el.innerHTML = `${p.zh ? '<span class="zh"></span>' : ""}<span class="en"></span>`;
    if (p.zh) el.querySelector(".zh").textContent = p.zh;
    el.querySelector(".en").textContent = p.label + (p.href ? " ↗" : "");
    layer.appendChild(el);
    return { m, el, set: inkBleed(el) };
  });
  const v = new THREE.Vector3();

  return {
    update(camera, intro) {
      for (const { m, el, set } of items) {
        const d = camera.position.distanceTo(m.pos);
        let k = 1 - THREE.MathUtils.smoothstep(d, m.radius * 0.65, m.radius);
        v.copy(m.pos).project(camera);
        const onScreen = v.z < 1 && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95;
        k = onScreen ? k * intro : 0;
        set(ease(clamp01(k)));
        el.style.pointerEvents = k > 0.5 ? "auto" : "none";
        if (k > 0) {
          const x = (v.x * 0.5 + 0.5) * innerWidth;
          const y = (-v.y * 0.5 + 0.5) * innerHeight;
          el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
        }
      }
    },
  };
}
