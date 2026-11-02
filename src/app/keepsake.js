import * as THREE from "three";
import { SITE } from "../content.js";
import { globals } from "../ink/material.js";
import { WatercolorPass } from "../ink/post.js";
import { inkBleed } from "./ui.js";

// 留念 — the keepsake. Sit on the bench at the end and you turn round to the walk laid out
// below you: the ink you left as you walked, the colour where you stopped to look. Any view from
// the bench is yours to keep: look around, and whatever you rest your eyes on is framed (ink
// corner marks show it). Hovering the button turns you back to the framed view, so you see what
// you'll get; one click and it's on your clipboard, rendered afresh with a seal and a line of
// colophon. (Or press S to keep just what you're looking at.)

const SIZE = [1800, 1200]; // the keepsake's pixels (3:2)

/** Linear → sRGB, for the pixels read back from the (linear, float) render target. */
const toSRGB = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

export function createKeepsake({ renderer, scene, camera, walker }) {
  const touch = matchMedia("(pointer: coarse)").matches; // (no looking round on a touch screen)
  const el = document.createElement("div");
  el.className = "keepsake";
  el.innerHTML = `<button class="keepsake-copy" type="button"><span class="keepsake-label"></span><kbd title="or press C">C</kbd></button>`;
  document.body.appendChild(el);
  const label = el.querySelector(".keepsake-label");
  const button = el.querySelector(".keepsake-copy");
  button.title = "Rest your eyes on any view you like: it's yours to keep";
  let saidAt = 0;
  /** What the button says (after a while, it goes back to offering the view you're looking at). */
  const say = (text, hold = 0) => {
    label.textContent = text;
    saidAt = hold ? performance.now() + hold * 1000 : 0;
  };
  const invite = () => say(touch ? "Copy your painting" : "Copy this view");
  invite();
  const set = inkBleed(el);

  // ink corner marks round the screen: the view that's framed for keeping
  const marks = document.createElement("div");
  marks.className = "frame-marks";
  marks.innerHTML = "<i></i><i></i><i></i><i></i>";
  document.body.appendChild(marks);

  let shown = 0;       // 0 → 1 as it writes itself in
  let settledFor = 0;  // seconds you've been sat right down (turned round)
  let framed = null;   // the gaze of the view that's framed (walker.gaze), null when standing
  let marksFor = 0;    // seconds left showing the corner marks
  let overPanel = false;
  let busy = false;
  el.addEventListener("pointerenter", () => (overPanel = true));
  el.addEventListener("pointerleave", () => (overPanel = false));

  /** Render the view you're keeping (offscreen) as a PNG blob, with its seal and colophon. */
  async function paint() {
    const [w, h] = SIZE;
    // finish turning to the view (the held one, if you're on the button), and take it from there
    walker.settleLook();
    walker.update(0);
    const cam = camera.clone();
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();

    const camWas = globals.uCam.value.clone();
    globals.uCam.value.copy(cam.position); // (the shaders' sense of where you are)
    const pass = new WatercolorPass(renderer);
    pass.setPixelSize(w, h);
    const out = new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType });
    const pixels = new Float32Array(w * h * 4);
    try {
      pass.render(scene, cam, out);
      renderer.readRenderTargetPixels(out, 0, 0, w, h, pixels);
    } finally {
      globals.uCam.value.copy(camWas);
      pass.dispose();
      out.dispose();
    }

    // into a 2D canvas (flipped: GL rows run bottom-up), then the seal and colophon
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = ((h - 1 - y) * w + x) * 4;
        const o = (y * w + x) * 4;
        img.data[o] = 255 * toSRGB(Math.min(1, Math.max(0, pixels[i])));
        img.data[o + 1] = 255 * toSRGB(Math.min(1, Math.max(0, pixels[i + 1])));
        img.data[o + 2] = 255 * toSRGB(Math.min(1, Math.max(0, pixels[i + 2])));
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // colophon (题跋): a line in the lower right
    await document.fonts?.ready;
    const s = h * 0.06;
    const sx = w - h * 0.025; // (the right edge of the lines)
    const sy = h - s - h * 0.05;
    ctx.textBaseline = "middle";
    const date = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    ctx.fillStyle = "rgba(29, 33, 40, 0.72)";
    ctx.textAlign = "right";
    ctx.font = `italic 400 ${Math.round(h * 0.024)}px "Cormorant Garamond", Georgia, serif`;
    ctx.fillText(`painted on a walk with ${SITE.name}`, sx - h * 0.02, sy + s * 0.32);
    ctx.font = `400 ${Math.round(h * 0.02)}px "Cormorant Garamond", Georgia, serif`;
    ctx.fillText(date, sx - h * 0.02, sy + s * 0.78);

    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no image"))), "image/png"));
  }

  async function keep() {
    if (busy) return;
    busy = true;
    say("Painting it…");
    marksFor = 1.2;
    const blob = paint(); // (a promise: the clipboard waits for it, still inside your click)
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("no clipboard");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      say("Copied: paste it anywhere", 3);
    } catch {
      // no image clipboard here (or it was refused): save it as a file instead
      const a = document.createElement("a");
      a.href = URL.createObjectURL(await blob);
      a.download = `${SITE.name.toLowerCase().replace(/\s+/g, "-")}-painting.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      say("Saved to your downloads", 3);
    } finally {
      busy = false;
    }
  }
  button.addEventListener("click", (e) => {
    e.stopPropagation(); // not an ink flick
    keep();
  });
  // S: keep just what you're looking at now
  addEventListener("keydown", (e) => {
    if ((e.key === "c" || e.key === "C") && !e.metaKey && !e.ctrlKey && shown > 0.5) {
      framed = walker.gaze;
      keep();
    }
  });

  return {
    paint, // (the painting as a PNG blob: handy from the console with ?debug)
    /** call once per frame */
    update(dt) {
      const sitting = walker.seated > 0.7;
      settledFor = walker.seated > 0.85 ? settledFor + dt : 0;
      if (!sitting) {
        framed = null;
        walker.hold(null);
      } else {
        if (!framed) framed = walker.gaze; // to begin with: the painting you turn round to
        // rest your eyes on a view (not the button) and it's framed for keeping
        const g = walker.gaze;
        if (!overPanel && !busy && walker.restingFor > 0.6 && Math.abs(g.x - framed.x) + Math.abs(g.y - framed.y) > 0.04) {
          framed = g;
          marksFor = 1.4;
          if (!saidAt) invite();
        }
        // on the button, you're turned back to the framed view: what you see is what you keep
        walker.hold(overPanel || busy ? framed : null);
      }
      if (saidAt && performance.now() > saidAt) invite(); // (back to offering the view)
      marksFor = Math.max(0, marksFor - dt);
      marks.classList.toggle("on", sitting && shown > 0.5 && (marksFor > 0 || overPanel));

      const want = settledFor > 0.3 || busy ? 1 : 0; // once you've all but turned round
      shown += (want - shown) * Math.min(1, dt * (want ? 1.6 : 3));
      const k = shown < 0.01 ? 0 : shown > 0.99 ? 1 : shown * shown * (3 - 2 * shown);
      set(k);
      el.style.pointerEvents = k > 0.6 ? "auto" : "none";
      if (k < 0.6) overPanel = false;
    },
  };
}
