import { SITE } from "../content.js";

// The resume, on a hanging scroll (立轴): it unrolls down from its rod when you open it (the
// Resume marker over the crane, or "unroll it" in its panel), and rolls back up when you're
// done (Esc, a click beside it, or "roll it up"). It's written from content.js. While it's open
// the walk waits: the wheel scrolls the scroll, keys and clicks don't walk you or flick ink,
// and your view holds still.

const UNROLL = 900; // ms (style.css: .hanging-mount)

export function createReader({ walker }) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = document.createElement("div");
  root.id = "reader";
  root.hidden = true;
  root.innerHTML = `
    <div class="reader-veil"></div>
    <div class="hanging" role="dialog" aria-modal="true" aria-label="Resume" tabindex="-1">
      <div class="hanging-cord"></div>
      <div class="hanging-rod"></div>
      <div class="hanging-mount"><article class="hanging-paper">${resumeHTML()}</article></div>
      <div class="hanging-roller"><i></i><i></i></div>
      <button class="hanging-close" type="button">roll it up</button>
    </div>`;
  document.body.appendChild(root);
  const scroll = root.querySelector(".hanging");
  const mount = root.querySelector(".hanging-mount");
  const paper = root.querySelector(".hanging-paper");
  let isOpen = false;
  let hideTimer = 0;
  let returnFocus = null; // (where the keyboard was, to give it back when it rolls up)

  /** How far it unrolls: all of it, or as much as fits on the screen (then the paper scrolls). */
  const fullHeight = () => {
    const cs = getComputedStyle(mount);
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    return Math.min(paper.scrollHeight + pad, innerHeight * 0.78);
  };

  function open() {
    if (isOpen) return;
    isOpen = true;
    clearTimeout(hideTimer);
    returnFocus = document.activeElement;
    root.hidden = false;
    walker.hold(walker.gaze, "reader"); // (the view holds still while you read)
    paper.scrollTop = 0;
    mount.style.height = "0px";
    void mount.offsetHeight; // (from rolled up)
    requestAnimationFrame(() => {
      root.classList.add("open");
      mount.style.height = `${fullHeight()}px`;
      scroll.focus({ preventScroll: true });
    });
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    root.classList.remove("open");
    mount.style.height = "0px";
    walker.hold(null, "reader");
    returnFocus?.focus?.({ preventScroll: true });
    hideTimer = setTimeout(() => (root.hidden = true), reduced ? 0 : UNROLL);
  }

  root.addEventListener("click", (e) => {
    e.stopPropagation(); // (no ink flicked through it)
    if (e.target.classList.contains("reader-veil") || e.target.closest(".hanging-close")) close();
  });
  addEventListener("resize", () => isOpen && (mount.style.height = `${fullHeight()}px`));

  // while it's open, the walk doesn't hear the wheel, the walking keys or a swipe (the scroll's
  // own paper still scrolls: nothing here stops that)
  const swallow = (e) => {
    if (!isOpen) return;
    if (e.type === "keydown" && e.key === "Escape") {
      e.preventDefault();
      close();
    }
    e.stopImmediatePropagation();
  };
  addEventListener("keydown", swallow, { capture: true });
  for (const type of ["wheel", "touchstart", "touchmove"]) addEventListener(type, swallow, { capture: true, passive: true });

  return {
    get isOpen() { return isOpen; },
    open,
    close,
  };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** The resume, as HTML, from content.js. */
function resumeHTML() {
  const R = SITE.resume ?? {};
  const section = (zh, title, inner) =>
    `<section><h3><span class="zh">${zh}</span> ${title}</h3>${inner}</section>`;
  const entry = (head, when, sub, text) => `
    <div class="entry">
      <p class="entry-head"><span class="entry-name">${head}</span><span class="entry-when">${esc(when ?? "")}</span></p>
      ${sub ? `<p class="entry-sub">${sub}</p>` : ""}
      ${text ? `<p class="entry-text">${esc(text)}</p>` : ""}
    </div>`;
  const link = ([label, href]) => href.startsWith("mailto:")
    ? `<a href="${esc(href)}">${esc(label)}</a>`
    : `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(label)} ↗</a>`;

  const ed = R.education;
  const work = (SITE.experience ?? []).filter((e) => !e.education).reverse(); // newest first
  const projects = [...(SITE.projects ?? [])].reverse();
  return `
    <header>
      <h2>${esc(SITE.name)}</h2>
      ${R.line ? `<p class="resume-line">${esc(R.line)}</p>` : ""}
      ${R.links?.length ? `<p class="resume-links">${R.links.map(link).join(" · ")}</p>` : ""}
    </header>
    ${ed ? section("学历", "Education", entry(esc(ed.school), ed.when, esc(ed.degree))) : ""}
    ${section("经历", "Experience", work.map((e) =>
      entry(`${esc(e.name)}${e.tag ? ` <span class="entry-tag">${esc(e.tag)}</span>` : ""}`, e.when,
        [e.role, e.place].filter(Boolean).map(esc).join(" · "), e.brief)).join(""))}
    ${section("作品", "Projects", projects.map((p) =>
      entry(p.href ? `<a href="${esc(p.href)}" target="_blank" rel="noopener">${esc(p.name)} ↗</a>` : esc(p.name), p.when,
        p.subtitle ? esc(p.subtitle) : "", p.line)).join(""))}
    ${R.skills?.length ? section("技能", "Skills",
      `<dl class="skills">${R.skills.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`) : ""}
    ${R.pdf ? `<p class="resume-pdf"><a href="${esc(R.pdf)}" download>Download it as a PDF</a></p>` : ""}`;
}
