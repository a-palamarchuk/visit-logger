/* Term groups the page highlighter looks for. Edit this file, then reload the extension.
 *
 * Groups appear in the panel in this order, and an earlier group's highlight is
 * drawn on top where two overlap.
 *
 *   id           Highlight name suffix: letters, digits, and hyphens only.
 *   label        Shown in the panel and the toolbar tooltip.
 *   kind         "text": highlight matches anywhere in the page text.
 *                "links": find links to careers pages and highlight the links.
 *                At most one group should be "links".
 *   background,
 *   color        Highlight and chip colors.
 *   terms        Strings match case-insensitively as whole words. In a string,
 *                a space matches any run of spaces or hyphens, a hyphen is
 *                optional ("on-site" also finds "onsite" and "on site"), and an
 *                apostrophe also matches the typographic one. RegExp values are
 *                used as written: add the "i" flag for case-insensitive matching.
 *                For a "links" group, terms are matched against link text,
 *                aria-label, title, and image alt text.
 *   urlPatterns  "links" only. Tested against a link's host followed by its
 *                path, e.g. "careers.example.com/" or "example.com/about/careers".
 *
 * Loaded as a separate script into both the background page and the content
 * script, so it uses var (see ats-hosts.js).
 */
var TERM_GROUPS = [
  {
    id: "careers",
    label: "Careers",
    kind: "links",
    background: "#b7ebc6",
    color: "#0b3d1e",
    terms: [
      "careers", "career", "current opportunities", "explore all jobs",
      "jobs", "openings", "open positions", "open roles", "job offers",
      "join us", "join our team", "join the team", "work with us", "work for us",
      "we're hiring", "we are hiring", "now hiring"
    ],
    urlPatterns: [
      // careers.example.com, jobs.example.com
      /^(?:careers?|jobs)\./i,
      // example.com/careers, example.com/en/jobs.html, example.com/join-us/
      // Bare "/join" is left out: it is usually a sign-up page.
      /\/(?:careers?|jobs|openings|current-openings|open-positions|open-roles|join-us|join-our-team|work-with-us|work-for-us|job-offers|job-openings)(?=[/._-]|$)/i
    ]
  },
  {
    id: "clearance",
    label: "Clearance",
    kind: "text",
    background: "#ffc2bd",
    color: "#5c0b05",
    terms: [
      "clearance", "security clearance", "cleared", "TS/SCI", "top secret",
      "secret clearance", "polygraph", "public trust", "SCI", "DoD", "ITAR",
      "export control", "export controls", "export controlled"
    ]
  },
  {
    id: "pay-amount",
    label: "Pay $",
    kind: "text",
    background: "#ffd24d",
    color: "#3b2a00",
    terms: [
      // $150,000  $150,000.00  $150K  $1.5M  $65/hr  $120 per hour  $95
      // A "$" must be followed by a number with at least two digits, a comma
      // group, or a K/M suffix, so "$1" in a code sample does not count.
      /\$\s?(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?\s?[km]\b|\d{2,}(?:\.\d+)?)(?:\s?(?:\/|per\s)\s?(?:hour|hr|year|yr|annum)\b)?/i
    ]
  },
  {
    id: "pay-words",
    label: "Pay words",
    kind: "text",
    background: "#fff0b3",
    color: "#3b2a00",
    terms: ["salary", "compensation", "pay range", "base pay", "pay transparency", "OTE"]
  },
  {
    id: "work-mode",
    label: "Work mode",
    kind: "text",
    background: "#bcdcff",
    color: "#0a2a52",
    terms: ["remote", "hybrid", "on-site", "in office"]
  },
  {
    id: "role",
    label: "Target roles",
    kind: "text",
    background: "#dccbff",
    color: "#2e1065",
    terms: [
      // Generic software titles
      "software engineer", "software developer", "software development engineer",
      "SDE", "SWE", "member of technical staff",
      // Backend and distributed systems ("back-end" also finds "backend", "back end")
      "back-end engineer", "back-end developer", "back-end",
      "distributed systems", "control plane",
      "Java engineer", "Java developer",
      // Platform and infrastructure (phrases only: bare "platform" is too noisy)
      "platform engineer", "infrastructure engineer",
      // AI and developer tooling
      "AI engineer", "LLM engineer", "agent engineer",
      "developer tools", "developer productivity", "developer experience", "devtools"
    ]
  },
  {
    id: "level",
    label: "Seniority",
    kind: "text",
    background: "#a8e6df",
    color: "#053b35",
    terms: [
      // Level word, highlighted only when an engineer/developer title follows
      // within three words: "Senior Software Engineer", "Sr. Back-End Engineer",
      // "Staff Engineer, Platform". Skips "senior leadership", "Senior Engineering Manager".
      /\b(?:senior|sr|staff|principal|lead)\b\.?(?=[\s,\/-]+(?:[\w.+&\/-]+[\s,]+){0,3}(?:engineer|developer|SDE|SWE)\b)/i,
      // Numbered levels: "Software Engineer III", "SDE III", "SDE-3". II is left out
      // because it is mid-level at most large companies.
      /\b(?:(?:engineer|developer)[\s,-]+(?:III|IV|V)|(?:SDE|SWE)[\s-]*(?:III|IV|V|[3-5]))\b/i,
      "tech lead", "technical lead"
    ]
  }
];
