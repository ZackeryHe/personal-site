import { SITE } from "../content.js";

// What you read when you open a tablet or a lantern: "experience:2", "projects:0" (content.js).
// Returns the point whose panel it's read in, and the HTML for that panel's body; or null.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const back = '<p class="hint"><a href="#" data-back>← back</a></p>';

export function story(what) {
  const [kind, n] = String(what).split(":");
  const i = Number(n);
  if (kind === "experience" && SITE.experience?.[i]) {
    const e = SITE.experience[i];
    return {
      point: "experience",
      html: `
        <p class="story-title">${esc(e.name)}${e.tag ? ` <span class="story-tag">${esc(e.tag)}</span>` : ""}</p>
        <p class="story-meta">${[e.role, e.when, e.place].filter(Boolean).map(esc).join(" · ")}</p>
        ${e.notes?.length > 1
          ? `<ul class="story-notes">${e.notes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`
          : `<p>${esc(e.notes?.[0] ?? "")}</p>`}
        ${back}`,
    };
  }
  if (kind === "projects" && SITE.projects?.[i]) {
    const p = SITE.projects[i];
    return {
      point: "projects",
      html: `
        <p class="story-title">${esc(p.name)} <span class="story-tag">${[p.subtitle, p.when].filter(Boolean).map(esc).join(" · ")}</span></p>
        <p>${esc(p.line)}</p>
        ${p.notes ? `<p class="story-more">${esc(p.notes)}</p>` : ""}
        <p class="hint">${p.href ? `<a href="${esc(p.href)}" target="_blank" rel="noopener">See it ↗</a> · ` : ""}<a href="#" data-back>← back</a></p>`,
    };
  }
  return null;
}
