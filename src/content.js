// What it says: everything on the page that's about you. (All placeholders for now.)

export const SITE = {
  name: "Zackery He", // the greeting, the tab title, and carved on the entrance rock
  // the note on the right as you arrive in the world (a line each), and the ways to move about
  intro: [
    "Stand still and appreciate the scenery.",
    "Click to fill the painting with colours.",
  ],
  stillHint: "linger — turn your head to look around", // shown the first time you stand still

  // Your points along the walk (where they are: src/world/places.js).
  //   label:  the marker that floats beside it in the world, and its dot on the progress line
  //   href:   makes the marker a link
  //   body:   a panel of text that writes itself in when you arrive (HTML, so links work)
  //   panelLater: shifts when the panel writes itself in, as a fraction of the walk (0.01 = a little later)
  points: [
    { id: "start", label: "Start", titleCard: true },
    // the lotus pond: a label over three carved rocks on its near shore (click them)
    {
      id: "contacts", label: "Contacts", zh: "联系",
      panelLater: 0.015,
      body: '<a href="https://github.com/">GitHub</a> · <a href="https://www.linkedin.com/">LinkedIn</a> · <a href="mailto:hello@example.com">Email</a>',
    },
    { id: "github", label: "GitHub", href: "https://github.com/" },
    { id: "linkedin", label: "LinkedIn", href: "https://www.linkedin.com/" },
    { id: "email", label: "Email", href: "mailto:hello@example.com" }, // placeholder address
    // along the walk
    {
      id: "experience", label: "Experience", zh: "经历",
      body: "Placeholder. Where you've worked and what you did there.",
    },
    {
      id: "projects", label: "Projects", zh: "作品",
      body: "Placeholder. Each lantern along the bamboo path could be one project.",
    },
    {
      id: "resume", label: "Resume", zh: "履历", href: "#",
      body: 'Placeholder. <a href="#">Download the PDF</a>.',
    },
    {
      // the well in the meadows (源, "the source"): this site's own source
      id: "source", label: "Source code", zh: "源码", href: "https://github.com/ZackeryHe/personal-site",
      body: 'Placeholder. How this walk was made: <a href="https://github.com/ZackeryHe/personal-site">its source, on GitHub</a>.',
    },
    // the end: sit on the bench, turn round to the walk below you, and keep the painting
    { id: "painting", label: "The painting" },
  ],
};
