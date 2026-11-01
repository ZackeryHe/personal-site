// What it says: everything on the page that's about you.

export const SITE = {
  name: "Zackery He", // the title card, the tab title, and carved on the entrance rock
  initials: "ZH",     // the red seal
  hint: "scroll or swipe to walk · move to look · click to flick ink",

  // Each section writes itself in when you reach its stop along the walk
  // (stop positions live in src/world/places.js). `body` is HTML, so links work.
  sections: [
    { stop: "start", label: "Start", titleCard: true },
    {
      stop: "about", label: "About", zh: "关于", heading: "About",
      body: "Placeholder. A few lines about who you are, written like a note on a stone tablet.",
    },
    {
      stop: "river", label: "Work", zh: "作品", heading: "Work",
      body: "Placeholder. Each lantern along the river could be one project.",
    },
    {
      stop: "pavilion", label: "Gallery", zh: "画廊", heading: "Gallery",
      body: "Placeholder. The pavilion is the museum room; the scrolls inside are the pieces.",
    },
    {
      stop: "end", label: "Colophon", zh: "题跋", heading: "Colophon",
      body: "Placeholder. Contact, links, and a place for visitors to leave their seal.",
    },
  ],
};
