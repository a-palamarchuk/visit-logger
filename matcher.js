/* Term matching and highlight styling shared by the content script and the
 * background page.
 *
 * No DOM or extension API access, so this file can be tested outside the browser.
 * Loaded as a separate script into both contexts, so it uses var and
 * function declarations (see ats-hosts.js).
 */

const HIGHLIGHT_PREFIX = "visit-logger-";
const CURRENT_HIGHLIGHT = HIGHLIGHT_PREFIX + "current";

// Whole-word boundaries that also work for terms starting or ending with a
// non-word character, and for non-ASCII letters.
const WORD_START = "(?<![\\p{L}\\p{N}_])";
const WORD_END = "(?![\\p{L}\\p{N}_])";

// What a space or hyphen inside a term may match on the page: spaces and the
// hyphen variants pages actually use (hyphen-minus, hyphen, non-breaking hyphen).
const TERM_SEPARATOR = "[\\s\\-\\u2010\\u2011]";

function highlightName(groupId) {
  return HIGHLIGHT_PREFIX + groupId;
}

/* Converts a plain-text term into a regex source fragment.
 *
 * A space matches one or more separators and a hyphen matches an optional one,
 * so "on-site" finds "onsite" and "on site", and "in office" finds "in-office".
 * An apostrophe also matches the typographic apostrophe. Everything else is
 * literal.
 */
function termToPattern(term) {
  return term.trim().split(/(\s+|-|')/).map((part) => {
    if (part === "-") {
      return TERM_SEPARATOR + "?";
    }
    if (part === "'") {
      return "['\\u2019]";
    }
    if (/^\s+$/.test(part)) {
      return TERM_SEPARATOR + "+";
    }
    return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("");
}

/* Validates a group from terms.js and compiles its terms into global regexes. */
function compileGroup(group) {
  if (!/^[a-z0-9-]+$/i.test(group.id || "")) {
    throw new Error(`Visit Logger: term group id "${group.id}" may only contain letters, digits, and hyphens`);
  }
  if (group.kind !== "text" && group.kind !== "links") {
    throw new Error(`Visit Logger: term group "${group.id}" has unknown kind "${group.kind}"`);
  }

  const terms = group.terms || [];
  // Longest first, so "security clearance" wins over "clearance" at the same position.
  const words = terms
      .filter((t) => typeof t === "string" && t.trim())
      .sort((a, b) => b.length - a.length)
      .map(termToPattern);

  const regexes = [];
  if (words.length) {
    regexes.push(new RegExp(WORD_START + "(?:" + words.join("|") + ")" + WORD_END, "giu"));
  }
  for (const term of terms) {
    if (term instanceof RegExp) {
      regexes.push(new RegExp(term.source, term.flags.includes("g") ? term.flags : term.flags + "g"));
    }
  }

  return Object.assign({}, group, {regexes: regexes, urlPatterns: group.urlPatterns || []});
}

/* Returns [start, end] offsets of the matches in text, sorted and non-overlapping.
 *
 * Where matches overlap, the one starting first is kept, and at the same start
 * the longer one.
 */
function findMatches(text, regexes) {
  const found = [];
  for (const re of regexes) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;  // a pattern that can match nothing would loop forever
        continue;
      }
      found.push([m.index, m.index + m[0].length]);
    }
  }
  if (found.length < 2) {
    return found;
  }

  found.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const kept = [found[0]];
  for (const match of found.slice(1)) {
    if (match[0] >= kept[kept.length - 1][1]) {
      kept.push(match);
    }
  }
  return kept;
}

/* True if any of the regexes matches somewhere in text. */
function matchesAny(text, regexes) {
  return regexes.some((re) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}

/* CSS for the named highlights, one rule per group plus the current match. */
function highlightCss(groups) {
  return groups
      .map((g) => `::highlight(${highlightName(g.id)}) { background-color: ${g.background}; color: ${g.color}; }`)
      .concat(`::highlight(${CURRENT_HIGHLIGHT}) { background-color: #1f2328; color: #ffffff; }`)
      .join("\n");
}
