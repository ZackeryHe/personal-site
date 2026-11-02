// What it says: everything on the page that's about you.

const EMAIL = "zackeryhe03@gmail.com";
const GITHUB = "https://github.com/ZackeryHe";
const LINKEDIN = "https://www.linkedin.com/in/zackery-he";
const SOURCE = "https://github.com/ZackeryHe/personal-site";

// a link in a panel that opens something on the page instead of going anywhere:
// "experience:2" (a tablet's story), "projects:0" (a lantern's), "resume" (the scroll)
const opens = (what, text) => `<a href="#${what.replace(":", "-")}" data-opens="${what}">${text}</a>`;

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
  //   href:   makes the marker a link;  opens: ...or makes it open something here ("resume")
  //   body:   a panel of text that writes itself in when you arrive (HTML, so links work;
  //           opens(...) links open a tablet's or a lantern's story, or the resume)
  //   panelLater: shifts when the panel writes itself in, as a fraction of the walk (0.01 = a little later)
  points: [
    { id: "start", label: "Start", titleCard: true },
    // the lotus pond: a label over three carved rocks on its near shore (click them)
    {
      id: "contacts", label: "Contacts", zh: "联系",
      panelLater: 0.015,
      body: `<a href="${GITHUB}">GitHub</a> · <a href="${LINKEDIN}">LinkedIn</a> · <a href="mailto:${EMAIL}">Email</a>`,
    },
    { id: "github", label: "GitHub", href: GITHUB },
    { id: "linkedin", label: "LinkedIn", href: LINKEDIN },
    { id: "email", label: "Email", href: `mailto:${EMAIL}` },
    // along the walk
    {
      id: "experience", label: "Experience", zh: "经历",
      body: `In March 2027 I'm joining ${opens("experience:4", "Databricks")} as a software engineer, back where
        I ${opens("experience:3", "interned in 2026")}. Before that: ${opens("experience:2", "Forge Rewards")} (YC W24),
        ${opens("experience:1", "AWS")}, and computer science at ${opens("experience:0", "UC Irvine")}.
        <p class="hint">Each tablet is one of them: click it to read it.</p>`,
    },
    {
      id: "projects", label: "Projects", zh: "作品",
      body: `Three lit lanterns, three things I've built: ${opens("projects:2", "Anteater API")},
        ${opens("projects:1", "Hey Chef")} and ${opens("projects:0", "Bobyard")}.
        <p class="hint">Click a lantern to read about it.</p>`,
    },
    {
      id: "resume", label: "Resume", zh: "履历", opens: "resume",
      body: `All of it, on one scroll: ${opens("resume", "unroll it")}.`,
    },
    {
      // the well in the meadows (源, "the source"): this site's own source
      id: "source", label: "Source code", zh: "源码", href: SOURCE,
      body: `How this walk was made: <a href="${SOURCE}">its source, on GitHub</a>.`,
    },
    // the end: sit on the bench, turn round to the walk below you, and keep the painting
    { id: "painting", label: "The painting" },
  ],

  // Experience: carved on the tablets along the avenue (world/places.js: steles), in the order
  // you pass them, oldest first. Click a tablet to read it in the Experience panel.
  //   name, role: carved large, and under it;  carved: carved small, above
  //   when, place: under the name when you read it;  notes: what you read;  brief: one line for the resume
  experience: [
    {
      education: true, // (on the resume, it's under Education: resume.education)
      name: "UC Irvine", role: "B.S. Computer Science", carved: "Class of 2026",
      when: "Graduating Dec. 2026", place: "Irvine, CA",
      notes: ["Computer science, GPA 3.9 / 4.0. Graduating this December."],
    },
    {
      name: "Amazon Web Services", role: "Software Engineer Intern", carved: "2025",
      when: "Jun. – Sep. 2025", place: "Arlington, VA",
      notes: [
        "An ingestion pipeline on AWS Glue and Spark that added 150M tags to optimization recommendations.",
        "Tuned its Scala Spark ETL jobs with caching and repartitioning: 65% less time and compute.",
        "Ran the jobs across 22 regions with Lambda and SQS, and built the TypeScript filter for searching 10M recommendations.",
      ],
      brief: "Spark and Glue ingestion for optimization recommendations: 150M tags, ETL 65% faster and cheaper, 22 regions.",
    },
    {
      name: "Forge Rewards", tag: "YC W24", role: "Software Engineer", carved: "2025 – 2026",
      when: "Oct. 2025 – May 2026", place: "Remote",
      notes: [
        "Led the mobile platform's move to React Native: room to onboard 3× as many partners.",
        "Shipped 20+ Flutter and React Native apps to 600K+ users, one into the App Store's Top 100.",
        "Built the loyalty service on Cloud Functions with Stripe and MenuSifu: 10K+ payments a month.",
      ],
      brief: "Led the move to React Native; 20+ apps, 600K+ users, a Top 100 App Store ranking.",
    },
    {
      name: "Databricks", role: "Software Engineer Intern", carved: "2026",
      when: "Jun. – Sep. 2026", place: "Mountain View, CA",
      notes: [
        "Led Scala support for Spark Declarative Pipelines, opening SDP to workloads that make up ~20% of all Jobs compute.",
        "Let Scala workloads move over from Lakeflow Jobs, cutting their pipeline compute costs by up to 75%.",
        "Versioned Scala sandboxes, JAR and Maven dependencies from Unity Catalog Volumes, and cross-language contract tests.",
      ],
      brief: "Led Scala support for Spark Declarative Pipelines: ~20% of all Jobs compute, up to 75% cheaper to run.",
    },
    {
      name: "Databricks", role: "Software Engineer", carved: "2027 –",
      when: "From March 2027", place: "Mountain View, CA",
      notes: ["Going back, full-time, in March 2027."],
    },
  ],

  // Projects: the lit lanterns along the bamboo path, in the order you pass them, oldest first.
  // Click one to read it in the Projects panel.  href: a link to it (optional)
  projects: [
    {
      name: "Bobyard", when: "2023",
      line: "An AI-powered construction takeoff tool, for a startup that went on to raise a $3.5M seed.",
      notes: "I built it in React, with PostgreSQL schemas and Django models behind it, images in S3, and the pages designed in Figma with the client.",
    },
    {
      name: "Hey Chef", subtitle: "Responsive glasses", when: "2025",
      line: "Smart glasses with a voice assistant that sees what you see. 2nd of 70 teams at SB Hacks.",
      notes: "A live image feed turned into context with o1-mini, a LiveKit voice agent that can search the web through Perplexity, and a memory of the conversation in SingleStore.",
    },
    {
      name: "Anteater API", when: "2026", href: "https://github.com/icssc/anteater-api",
      line: "An open-source REST and GraphQL API for UC Irvine's public data: 40K+ students, 200K+ requests a day.",
      notes: "I built endpoints and Cheerio scrapers with Hono, TypeScript, Drizzle and Docker, and fixed its PostgreSQL pooling at the edge with Cloudflare Hyperdrive.",
    },
  ],

  // The resume: a hanging scroll that unrolls when you open it (the Resume marker, or its panel).
  // It's made from everything above, plus these.
  resume: {
    pdf: null, // a PDF to offer on the scroll: put it in public/ and name it here, e.g. "/Zackery_He_Resume.pdf"
    line: "Software engineer. Joining Databricks in March 2027.",
    education: { school: "University of California, Irvine", degree: "B.S. Computer Science · GPA 3.9", when: "Dec. 2026" },
    skills: [
      ["Languages", "Scala, Python, TypeScript, Java, C++, JavaScript, SQL"],
      ["Frameworks", "Apache Spark, React, React Native, Node.js, Django"],
      ["Infrastructure", "AWS, GCP, PostgreSQL, Docker, GitHub Actions"],
    ],
    links: [["GitHub", GITHUB], ["LinkedIn", LINKEDIN], ["Email", `mailto:${EMAIL}`]],
  },
};
