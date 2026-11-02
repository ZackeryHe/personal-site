import * as THREE from "three";
import { SITE } from "../content.js";
import { globals } from "../ink/material.js";
import { WatercolorPass } from "../ink/post.js";
import { inkBleed } from "./ui.js";

// 留念 — the keepsake. Sit on the bench at the end and you turn round to the walk laid out
// below you: the ink you left as you walked, the colour where you stopped to look. Keep looking
// at it, and it offers itself: one click and the painting (rendered afresh, framed the same way
// every time, with a seal and a line of colophon) is on your clipboard.

const SIZE = [1800, 1200]; // the keepsake's pixels (3:2)

/** Linear → sRGB, for the pixels read back from the (linear, float) render target. */
const toSRGB = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

export function createKeepsake({ renderer, scene, walker, world }) {
  const el = document.createElement("div");
  el.className = "keepsake";
  el.innerHTML = `
    <p class="keepsake-line"><span class="zh">留念</span><span class="keepsake-text"></span></p>
    <button class="keepsake-copy" type="button"><span class="keepsake-seal" aria-hidden="true"></span><span class="keepsake-label"></span></button>`;
  document.body.appendChild(el);
  const text = el.querySelector(".keepsake-text");
  const label = el.querySelector(".keepsake-label");
  const button = el.querySelector(".keepsake-copy");
  el.querySelector(".keepsake-seal").textContent = SITE.initials;
  const say = (line, action) => {
    text.textContent = line;
    label.textContent = action;
  };
  say("Your painting: the ink you left on the walk, the colour where you stopped to look.", "Copy it to your clipboard");
  const set = inkBleed(el);

  let shown = 0;   // 0 → 1 as it writes itself in
  let looked = 0;  // seconds you've been looking at the painting
  let busy = false;

  /** Render the painting (offscreen) and return it as a PNG blob, with its seal and colophon. */
  async function paint() {
    const [w, h] = SIZE;
    const cam = new THREE.PerspectiveCamera(40, w / h, 0.5, 900);
    walker.paintingView(cam);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();

    // the shaders' sense of where you are and how clear the distance is: as seen from the bench
    const camWas = globals.uCam.value.clone();
    const atmWas = globals.uAtmScale.value;
    globals.uCam.value.copy(cam.position);
    globals.uAtmScale.value = world.painting.clarity;
    const pass = new WatercolorPass(renderer);
    pass.setPixelSize(w, h);
    const out = new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType });
    const pixels = new Float32Array(w * h * 4);
    try {
      pass.render(scene, cam, out);
      renderer.readRenderTargetPixels(out, 0, 0, w, h, pixels);
    } finally {
      globals.uCam.value.copy(camWas);
      globals.uAtmScale.value = atmWas;
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

    // colophon (题跋): a line in the lower right, and the seal beside it
    await document.fonts?.ready;
    const s = h * 0.06;
    const sx = w - s - h * 0.045;
    const sy = h - s - h * 0.05;
    ctx.fillStyle = "rgba(184, 50, 42, 0.92)";
    ctx.fillRect(sx, sy, s, s);
    ctx.fillStyle = "#efe7d6";
    ctx.font = `600 ${Math.round(s * 0.42)}px "Cormorant Garamond", Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(SITE.initials, sx + s / 2, sy + s / 2 + 1);
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
    say("Painting it…", "One moment");
    const blob = paint(); // (a promise: the clipboard waits for it, still inside your click)
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("no clipboard");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      say("It's on your clipboard: paste it anywhere.", "Copy it again");
    } catch {
      // no image clipboard here (or it was refused): save it as a file instead
      const a = document.createElement("a");
      a.href = URL.createObjectURL(await blob);
      a.download = `${SITE.name.toLowerCase().replace(/\s+/g, "-")}-painting.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      say("Saved as a picture in your downloads.", "Save it again");
    } finally {
      busy = false;
    }
  }
  button.addEventListener("click", (e) => {
    e.stopPropagation(); // not an ink flick
    keep();
  });

  return {
    paint, // (the painting as a PNG blob: handy from the console with ?debug)
    /** call once per frame */
    update(dt) {
      const facing = walker.facingPainting > 0.9;
      looked = facing ? looked + dt : 0;
      const want = looked > 1.4 || (busy && shown > 0.5) ? 1 : walker.seated > 0.5 && shown > 0.5 && walker.facingPainting > 0.3 ? 1 : 0;
      shown += (want - shown) * Math.min(1, dt * (want ? 1.1 : 3));
      const k = shown < 0.01 ? 0 : shown > 0.99 ? 1 : shown * shown * (3 - 2 * shown);
      set(k);
      el.style.pointerEvents = k > 0.6 ? "auto" : "none";
    },
  };
}
