/* Highlights job-search terms on pages opened from the Visit Logger queue.
 *
 * Registered for every frame of every page, but dormant: it asks the background
 * page whether its tab came from the queue and does nothing more otherwise.
 *
 * Highlights use the CSS Custom Highlight API, so the page's own markup is not
 * changed. The only nodes this script adds are its panel (top frame only) and a
 * style element in each shadow root that contains a match. Nothing it finds is
 * stored; the background keeps the latest counts in memory for the panel.
 */
(() => {
  "use strict";

  const GROUPS = TERM_GROUPS.map(compileGroup);
  const CAREERS = GROUPS.find((g) => g.kind === "links");
  const TEXT_GROUPS = GROUPS.filter((g) => g.kind === "text");

  // Why a link counts as a careers link, strongest first. Links are listed in this order.
  const REASONS = ["ATS host", "link text", "URL"];

  const SKIP_ELEMENTS = new Set([
    "script", "style", "noscript", "template", "textarea", "select", "svg", "iframe", "object"
  ]);
  const LINK_SELECTOR = "a[href], button, [role='link'], [onclick]";
  const MAX_LINK_TEXT = 60;       // longer text is a card or paragraph, not a link label
  const MAX_REPORTED_LINKS = 20;
  const MAX_SHOWN_LINKS = 8;
  const SCAN_DELAY_MS = 750;
  const MIN_SCAN_INTERVAL_MS = 2000;
  const CURRENT_MATCH_MS = 2500;

  const ownNodes = new WeakSet();
  const observedRoots = new WeakSet();
  const styledShadowRoots = new WeakSet();

  let enabled = false;
  let highlights = null;   // wrapper over CSS.highlights, null if unusable
  let panel = null;        // top frame only
  let observer = null;
  let scanTimer = 0;
  let lastScanAt = 0;
  let currentMatchTimer = 0;
  let found = {ranges: new Map(), links: []};

  browser.runtime.onMessage.addListener((message) => {
    switch (message && message.type) {
    case "vl-enable":
      if (!enabled) {
        hello();
      }
      return;
    case "vl-state":
      if (panel) {
        panel.render(message.state);
      }
      return;
    case "vl-jump-local":
      return Promise.resolve(jumpLocal(message.group, message.from));
    case "vl-open-local":
      openLink(message.index);
      return;
    }
  });

  hello();

  /* Asks the background whether this tab is a queue tab; starts if it is. */
  function hello() {
    browser.runtime.sendMessage({type: "vl-hello"})
        .then((reply) => {
          if (reply && reply.enabled) {
            start(reply.top);
          }
        })
        .catch(() => {});  // extension reloading or background not ready yet
  }

  function start(isTop) {
    if (enabled) {
      return;
    }
    enabled = true;
    highlights = highlightApi();
    if (isTop) {
      panel = createPanel();
    }
    scan();
    observe(document.documentElement);
  }

  /* Returns a small wrapper over CSS.highlights, or null if it cannot be used.
   *
   * Tries the content script's own view of the page first. Firefox shields
   * content scripts from page objects (Xray vision); if that view refuses the
   * API, this falls back to the page's unwrapped objects. The page could
   * interfere with those, which is why they are only the fallback.
   */
  function highlightApi() {
    const views = [["content", window], ["page", window.wrappedJSObject]];
    for (const [name, view] of views) {
      try {
        const registry = view && view.CSS && view.CSS.highlights;
        const Highlight = view && view.Highlight;
        if (!registry || typeof Highlight !== "function") {
          continue;
        }
        registry.set(CURRENT_HIGHLIGHT, new Highlight());  // probe
        registry.delete(CURRENT_HIGHLIGHT);
        return {
          set(highlightId, ranges, priority) {
            const highlight = new Highlight();
            highlight.priority = priority;
            for (const range of ranges) {
              highlight.add(range);
            }
            registry.set(highlightId, highlight);
          },
          clear(highlightId) {
            registry.delete(highlightId);
          }
        };
      } catch (e) {
        console.log(`Visit Logger: highlight API unusable through the ${name} view`, e);
      }
    }
    console.log("Visit Logger: highlighting disabled; counts and links still work");
    return null;
  }

  /* Rescans after the page changes, e.g. links rendered by script after load.
   *
   * The first change schedules a scan and later ones join it, with scans at
   * least MIN_SCAN_INTERVAL_MS apart, so a page that never stops changing (a
   * ticker, a clock) still gets scanned without being scanned constantly.
   */
  function observe(root) {
    if (observedRoots.has(root)) {
      return;
    }
    observedRoots.add(root);
    if (!observer) {
      observer = new MutationObserver((records) => {
        if (!records.every(isOwnMutation)) {
          scheduleScan();
        }
      });
    }
    observer.observe(root, {childList: true, subtree: true, characterData: true});
  }

  function isOwnMutation(record) {
    if (record.type !== "childList") {
      return false;
    }
    const nodes = Array.from(record.addedNodes).concat(Array.from(record.removedNodes));
    return nodes.length > 0 && nodes.every((node) => ownNodes.has(node));
  }

  function scheduleScan() {
    if (scanTimer) {
      return;
    }
    const wait = Math.max(SCAN_DELAY_MS, lastScanAt + MIN_SCAN_INTERVAL_MS - Date.now());
    scanTimer = setTimeout(() => {
      scanTimer = 0;
      scan();
    }, wait);
  }

  /* Finds every match in the document and its shadow roots, then highlights and reports. */
  function scan() {
    lastScanAt = Date.now();
    const pageKind = careersPageKind();
    const ranges = new Map(GROUPS.map((g) => [g.id, []]));
    const links = [];
    const seenLinks = new Set();
    const roots = [document.body || document.documentElement];

    // scanText appends shadow roots it discovers, so this loop reaches them too.
    for (let i = 0; i < roots.length; i++) {
      const root = roots[i];
      const matched = scanText(root, ranges, roots) + scanLinks(root, pageKind, links, seenLinks);
      if (i > 0) {
        observe(root);
        if (matched) {
          ensureShadowStyle(root);
        }
      }
    }

    links.sort((a, b) => linkRank(a) - linkRank(b));
    if (CAREERS) {
      ranges.set(CAREERS.id, links.map((link) => link.range));
    }
    found = {ranges, links};

    if (highlights) {
      GROUPS.forEach((group, i) => {
        highlights.set(highlightName(group.id), ranges.get(group.id), GROUPS.length - i);
      });
    }
    report(pageKind !== "");
  }

  /* "ats" on a job board, "careers" on an employer's careers page, "" otherwise. */
  function careersPageKind() {
    const host = location.hostname.replace(/^www\./, "");
    if (isAtsHost(host)) {
      return "ats";
    }
    if (CAREERS && matchesAny(host + location.pathname, CAREERS.urlPatterns)) {
      return "careers";
    }
    return "";
  }

  function scanText(root, ranges, roots) {
    let matched = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return /\S/.test(node.data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
      if (ownNodes.has(node) || SKIP_ELEMENTS.has(node.localName)) {
        return NodeFilter.FILTER_REJECT;
      }
      // openOrClosedShadowRoot is Firefox's content-script-only way into closed roots.
      const shadow = node.openOrClosedShadowRoot || node.shadowRoot;
      if (shadow && !roots.includes(shadow)) {
        roots.push(shadow);
      }
      return NodeFilter.FILTER_SKIP;
    });

    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (const group of TEXT_GROUPS) {
        for (const [start, end] of findMatches(node.data, group.regexes)) {
          const range = document.createRange();
          range.setStart(node, start);
          range.setEnd(node, end);
          ranges.get(group.id).push(range);
          matched++;
        }
      }
    }
    return matched;
  }

  /* Collects careers links in one root.
   *
   * On a job board every link is a job, so nothing is collected there. On an
   * employer's careers page, only links out to a job board are collected, which
   * catches "View open roles" pointing at the real board.
   */
  function scanLinks(root, pageKind, links, seen) {
    if (!CAREERS || pageKind === "ats") {
      return 0;
    }
    let matched = 0;
    for (const el of root.querySelectorAll(LINK_SELECTOR)) {
      // Prefer the innermost clickable element: a div with onclick wrapping a link is the link.
      if (el.localName !== "a" && el.querySelector(LINK_SELECTOR)) {
        continue;
      }
      const link = describeLink(el, pageKind);
      if (!link || seen.has(link.key)) {
        continue;
      }
      seen.add(link.key);
      link.range = document.createRange();
      link.range.selectNodeContents(el);
      links.push(link);
      matched++;
    }
    return matched;
  }

  function describeLink(el, pageKind) {
    let url = null;
    if (el.localName === "a") {
      try {
        url = new URL(el.getAttribute("href"), document.baseURI);
      } catch (e) {
        return null;
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        url = null;  // javascript:, mailto:, tel: - judge by text alone
      }
    }

    const image = el.querySelector("img[alt]");
    const texts = [el.textContent, el.getAttribute("aria-label"), el.getAttribute("title"), image && image.alt]
        .map(clean)
        .filter((t) => t && t.length <= MAX_LINK_TEXT);

    const reasons = [];
    if (url && isAtsHost(url.hostname.replace(/^www\./, ""))) {
      reasons.push("ATS host");
    }
    if (pageKind === "") {
      if (texts.some((t) => matchesAny(t, CAREERS.regexes))) {
        reasons.push("link text");
      }
      if (url && matchesAny(url.hostname.replace(/^www\./, "") + url.pathname, CAREERS.urlPatterns)) {
        reasons.push("URL");
      }
    }
    if (!reasons.length) {
      return null;
    }

    const label = texts[0] || clean(el.textContent) || "(no text)";
    return {
      key: url ? url.href : "button:" + label,
      label: truncate(label, 40),
      url: url ? url.href : "",
      dest: url ? truncate(url.hostname.replace(/^www\./, "") + url.pathname.replace(/\/$/, ""), 48) : "button",
      reasons,
      el
    };
  }

  function linkRank(link) {
    return Math.min(...link.reasons.map((r) => REASONS.indexOf(r)));
  }

  function clean(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function truncate(text, max) {
    return text.length > max ? text.slice(0, max - 1) + "\u2026" : text;
  }

  /* Adds the highlight styles to a shadow root; a document's own styles don't reach inside. */
  function ensureShadowStyle(root) {
    if (styledShadowRoots.has(root)) {
      return;
    }
    styledShadowRoots.add(root);
    const style = document.createElement("style");
    // Set the text before inserting: Firefox checks an empty style element
    // against the page's CSP (bug 1706787) and would block it on strict pages.
    style.textContent = highlightCss(GROUPS);
    ownNodes.add(style);
    root.appendChild(style);
  }

  function report(careersPage) {
    const counts = {};
    for (const group of GROUPS) {
      counts[group.id] = found.ranges.get(group.id).length;
    }
    const links = found.links.slice(0, MAX_REPORTED_LINKS).map((link, index) => ({
      index,
      label: link.label,
      dest: link.dest,
      url: link.url,
      reasons: link.reasons
    }));
    browser.runtime.sendMessage({type: "vl-report", report: {counts, careersPage, links}})
        .catch(() => {});
  }

  /* Shows the first visible match of a group at or after index `from` in this frame. */
  function jumpLocal(groupId, from) {
    const ranges = found.ranges.get(groupId) || [];
    for (let i = Math.max(0, from || 0); i < ranges.length; i++) {
      if (isVisible(ranges[i])) {
        reveal(ranges[i]);
        return {index: i};
      }
    }
    return {index: -1};
  }

  function isVisible(range) {
    const el = elementOf(range);
    if (!el || !el.isConnected) {
      return false;
    }
    if (typeof el.checkVisibility === "function"
        && !el.checkVisibility({visibilityProperty: true, checkVisibilityCSS: true})) {
      return false;
    }
    return range.getClientRects().length > 0;
  }

  function reveal(range) {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    elementOf(range).scrollIntoView({block: "center", inline: "nearest", behavior: reduceMotion ? "auto" : "smooth"});
    if (highlights) {
      highlights.set(CURRENT_HIGHLIGHT, [range], GROUPS.length + 1);
      clearTimeout(currentMatchTimer);
      currentMatchTimer = setTimeout(() => highlights.clear(CURRENT_HIGHLIGHT), CURRENT_MATCH_MS);
    }
  }

  function elementOf(range) {
    const node = range.startContainer;
    return node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  }

  /* Follows a careers link found in this frame. Clicking the element keeps its
   * target and any script routing; the URL is the fallback if it is gone. */
  function openLink(index) {
    const link = found.links[index];
    if (!link) {
      return;
    }
    if (link.el.isConnected) {
      link.el.click();
    } else if (link.url) {
      location.assign(link.url);
    }
  }

  const PANEL_CSS = `
    :host {
      all: initial !important;
      position: fixed !important;
      top: 12px !important;
      right: 12px !important;
      z-index: 2147483647 !important;
    }
    :host(.left) {
      right: auto !important;
      left: 12px !important;
    }
    .panel {
      box-sizing: border-box;
      max-width: min(340px, calc(100vw - 24px));
      max-height: 45vh;
      overflow: auto;
      padding: 6px 8px 8px;
      font: 12px/1.35 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      color: #1f2328;
      background: #ffffff;
      border: 1px solid #8c959f;
      border-radius: 6px;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
    }
    button,
    a {
      font: inherit;
      color: inherit;
      background: none;
      border: 0;
      padding: 0;
      cursor: pointer;
      text-decoration: none;
    }
    button:focus-visible,
    a:focus-visible {
      outline: 2px solid #0b57d0;
      outline-offset: 1px;
    }
    .bar {
      display: flex;
      align-items: baseline;
      gap: 10px;
      margin-bottom: 6px;
    }
    .title {
      font-weight: 600;
      margin-right: auto;
    }
    .bar button {
      color: #0b57d0;
    }
    .bar button:hover {
      text-decoration: underline;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .chip {
      display: inline-flex;
      align-items: baseline;
      gap: 5px;
      padding: 1px 6px;
      color: var(--fg);
      background: var(--bg);
      border: 1px solid var(--fg);
      border-radius: 3px;
    }
    .chip .count {
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .chip.empty {
      color: #5b6470;
      background: transparent;
      border-style: dashed;
    }
    .chip:disabled {
      cursor: default;
    }
    .links {
      list-style: none;
      margin: 6px 0 0;
      padding: 0;
    }
    .links:empty {
      display: none;
    }
    .links button,
    .links a {
      box-sizing: border-box;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: baseline;
      width: 100%;
      padding: 8px 10px;
      font-size: 20px;
      text-align: left;
      border-left: 3px solid var(--careers);
    }
    .links li + li {
      margin-top: 2px;
    }
    .links button:hover,
    .links a:hover {
      background: #f1f3f5;
    }
    .dest,
    .more {
      color: #5b6470;
    }
    .dest {
      font-size: 14px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .more {
      padding: 2px 9px;
    }
    .status {
      margin-top: 4px;
      color: #5b6470;
    }
    .status:empty {
      display: none;
    }
    .panel.collapsed {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px;
    }
    .panel.collapsed .bar {
      order: 2;
      margin: 0;
    }
    .panel.collapsed .title,
    .panel.collapsed .move,
    .panel.collapsed .label,
    .panel.collapsed .links,
    .panel.collapsed .status {
      display: none;
    }
  `;

  /* Builds the panel in a closed shadow root so page styles and scripts can't
   * reach it. It is attached on the first render, once there is something to show. */
  function createPanel() {
    const host = document.createElement("visit-logger-panel");
    ownNodes.add(host);
    const shadow = host.attachShadow({mode: "closed"});
    const style = document.createElement("style");
    style.textContent = PANEL_CSS;  // before inserting, see ensureShadowStyle
    shadow.appendChild(style);

    const box = element("div", "panel");
    const bar = element("div", "bar");
    const move = element("button", "move");
    const toggle = element("button", "toggle");
    bar.append(element("span", "title", "Visit Logger"), move, toggle);
    const chips = element("div", "chips");
    const linkList = element("ul", "links");
    const status = element("div", "status");
    status.setAttribute("role", "status");
    box.append(bar, chips, linkList, status);
    shadow.appendChild(box);

    // Keep panel clicks away from page handlers, e.g. "click outside closes the menu".
    for (const type of ["click", "mousedown", "pointerdown"]) {
      box.addEventListener(type, (event) => event.stopPropagation());
    }

    let prefs = {collapsed: false, left: false};
    move.addEventListener("click", () => setPrefs({collapsed: prefs.collapsed, left: !prefs.left}));
    toggle.addEventListener("click", () => setPrefs({collapsed: !prefs.collapsed, left: prefs.left}));

    function setPrefs(next) {
      applyPrefs(next);
      browser.runtime.sendMessage({type: "vl-prefs", prefs: next}).catch(() => {});
    }

    function applyPrefs(next) {
      prefs = next;
      box.classList.toggle("collapsed", prefs.collapsed);
      host.classList.toggle("left", prefs.left);
      move.textContent = prefs.left ? "Move right" : "Move left";
      toggle.textContent = prefs.collapsed ? "Expand" : "Collapse";
    }

    function renderChip(group, state) {
      const entry = state.groups.find((g) => g.id === group.id);
      const count = entry ? entry.count : 0;
      const here = group.kind === "links" && state.careersPage && count === 0;

      const chip = element("button", "chip");
      chip.style.setProperty("--bg", group.background);
      chip.style.setProperty("--fg", group.color);
      chip.append(element("span", "label", group.label), element("span", "count", here ? "here" : String(count)));
      chip.classList.toggle("empty", count === 0 && !here);
      chip.disabled = count === 0;
      chip.title = chipTitle(group, count, here);
      chip.setAttribute("aria-label", group.label + ": " + (here ? "this is a careers page" : count));
      chip.addEventListener("click", () => {
        browser.runtime.sendMessage({type: "vl-jump", group: group.id})
            .then((reply) => {
              status.textContent = (reply && reply.status) || "";
            })
            .catch((e) => console.log("Visit Logger:", e));
      });
      return chip;
    }

    /* Entries with a URL are real links, so Ctrl+click, middle-click and the
     * context menu open them in a new tab. A plain click still follows the
     * page's own element, which keeps its target and any script routing. */
    function renderLink(link) {
      const button = element(link.url ? "a" : "button");
      if (link.url) {
        button.href = link.url;
      }
      button.append(element("span", "link-label", link.label), element("span", "dest", link.dest));
      button.title = (link.url || "Button without a link address") + "\nFound by: " + link.reasons.join(", ");
      button.addEventListener("click", (event) => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
          return;  // the browser opens the link in a new tab or window
        }
        event.preventDefault();
        if (link.frameId === 0) {
          openLink(link.index);  // this frame; keeps the click's user activation for new tabs
        } else {
          browser.runtime.sendMessage({type: "vl-open", frameId: link.frameId, index: link.index})
              .catch((e) => console.log("Visit Logger:", e));
        }
      });
      const item = element("li");
      item.append(button);
      return item;
    }

    return {
      render(state) {
        applyPrefs(state.prefs || prefs);
        chips.replaceChildren(...GROUPS.map((group) => renderChip(group, state)));

        const careers = CAREERS && state.groups.find((g) => g.id === CAREERS.id);
        const items = state.links.slice(0, MAX_SHOWN_LINKS).map(renderLink);
        const notShown = (careers ? careers.count : 0) - items.length;
        if (notShown > 0) {
          items.push(element("li", "more", `${notShown} more not shown`));
        }
        linkList.replaceChildren(...items);
        linkList.style.setProperty("--careers", CAREERS ? CAREERS.color : "#8c959f");

        if (!host.isConnected) {
          document.documentElement.appendChild(host);
        }
      }
    };
  }

  function chipTitle(group, count, here) {
    if (here) {
      return "This page is a careers page or contains a job board";
    }
    if (!count) {
      return group.kind === "links" ? "No careers links found" : "No matches";
    }
    const noun = group.kind === "links"
      ? (count === 1 ? "careers link" : "careers links")
      : (count === 1 ? "match" : "matches");
    return `${count} ${noun}. Click to show the next one.`;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }
})();
