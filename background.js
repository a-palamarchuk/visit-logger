/* generic error handler */
function onError(error) {
  console.log("ERROR!!!");
  console.log(error);
}

const openedTabKeysId = "openedTabKeys";

/* Tabs the page highlighter runs in: tabs opened from the queue, and tabs
 * opened from those.
 *
 * Kept in memory rather than in storage.session. The background page is
 * persistent and storage.session is cleared by the same events, and unlike a
 * storage read-modify-write, a Set can't drop an update when several tabs open
 * at once.
 */
const highlightTabs = new Set();

/* tabId -> Map(frameId -> report) of what highlighter.js found in each frame. */
const highlightReports = new Map();

/* tabId -> the state last sent to the tab's panel, as JSON, so repeats are skipped. */
const pushedHighlightStates = new Map();

/* "tabId:groupId" -> {frameId, index} of the match the panel showed last. */
const jumpCursors = new Map();

/* Panel layout, shared by all tabs until the browser restarts. */
let panelPrefs = {collapsed: false, left: false};

/* Makes the browserAction icon reflect the tab site logged state. */
async function refreshIcon(tab) {
  const url = new URL(tab.url);
  const h = normalizeHostName(url.hostname);
  const action = browser.browserAction;

  const stored = await browser.storage.session.get(openedTabKeysId);
  const openedKey = (stored[openedTabKeysId] || {})[tab.id];
  if (openedKey && openedKey !== h) {
    const site = await browser.storage.local.get({[openedKey]: {}});
    const r = site[openedKey].r;
    action.setIcon({path: "icons/logged.svg", tabId: tab.id});
    action.setTitle({
      title: withHighlightSummary(
          (r ? "Resume submitted to " : "Logged ") + openedKey + " (opened from the queue)", tab.id),
      tabId: tab.id
    });
    action.setBadgeBackgroundColor({color: r ? "#FFF600" : "#4CAF50", tabId: tab.id});
    action.setBadgeText({text: r ? "R" : "\u2713", tabId: tab.id});
    return;
  }

  if (isAtsHost(h)) {
    action.setIcon({path: "icons/not-logged.svg", tabId: tab.id});
    action.setTitle({
      title: withHighlightSummary("Applicant tracking system - log the employer's own site instead", tab.id),
      tabId: tab.id
    });
    action.setBadgeBackgroundColor({color: "#BDBDBD", tabId: tab.id});
    action.setBadgeText({text: "ATS", tabId: tab.id});
    return;
  }
  browser.storage.local.get({[h]: {}})
      .then((site) => {
        // Don't show that "google.com" is logged even when it is.
        // It would be annoying to see the icon every time one goes to Google.
        if (h === "google.com") {
          site = {[h]: {}};
        }

        const logged = site[h].date;
        const action = browser.browserAction;

        action.setIcon({
          path: logged ? "icons/logged.svg" : "icons/not-logged.svg",
          tabId: tab.id
        });
        action.setTitle({
          title: withHighlightSummary(
              logged ? "Toggle R mark on the site logged as visited (F9)" : "Log site visit (F9)", tab.id),
          tabId: tab.id
        });

        action.setBadgeBackgroundColor({color: "#FFF600", tabId: tab.id});
        action.setBadgeText({text: site[h].r ? "R" : "", tabId: tab.id});
      })
      .catch(onError);
}

/* Removes the active tab's host from the visit log.
 *
 * F9 cycles unlogged -> logged -> logged+R and never back, so without this a
 * mistaken mark is permanent, short of hand-editing an export. This is also how
 * an ATS host logged before the guard existed gets cleaned out, so it applies
 * to hosts that logVisit now refuses to mark.
 */
function unmarkSite(tab) {
  const url = new URL(tab.url);
  const h = normalizeHostName(url.hostname);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    console.log("Skipping site with protocol " + url.protocol);
    return;
  }

  browser.storage.local.get({[h]: {}})
      .then((site) => {
        if (!site[h].date) {
          console.log("Not logged, nothing to unmark: " + h);
          return;
        }
        return browser.storage.local.remove(h).then(() => {
          console.log("Unmarked " + h);
          playSound();
        });
      })
      .then(() => refreshIcon(tab))
      .catch(onError);
}

/* The register visit browser action was triggered. */
async function logVisit(tab) {
  const url = new URL(tab.url);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    console.log("Skipping site with protocol " + url.protocol);
    return refreshIcon(tab);
  }

  // A tab opened from the queue may be logged against a different site than the
  // one it displays - an ATS board, or a separate careers domain. Act on the
  // key it was opened for, so F9 toggles R for the employer rather than being
  // refused for the vendor.
  const stored = await browser.storage.session.get(openedTabKeysId);
  const openedKey = (stored[openedTabKeysId] || {})[tab.id];
  const h = openedKey || normalizeHostName(url.hostname);

  if (isAtsHost(h)) {
    console.log("Refusing to log ATS host " + h);
    return refreshIcon(tab);
  }

  function markLogged(site) {
    if (!site[h].date) {
      site[h].date = new Date().toISOString().substring(0, 10);
    } else {
      if (site[h].r) {
        delete site[h].r;
      } else {
        site[h].r = true;
      }
    }
    return site;
  }

  return browser.storage.local.get({[h]: {}})
      .then((site) => markLogged(site))
      .then((site) => browser.storage.local.set(site))
      .then(() => refreshIcon(tab))
      .catch(onError);
}

/* Records a visit for a host that is not necessarily the active tab's host.
 *
 * Used by the tab queue when a link is marked data-visit-mark="auto", so a
 * career page on an applicant tracking system is recorded against the employer's own site.
 */
function logVisitForHost(host) {
  if (!host || isAtsHost(host)) {
    console.log("Refusing to auto-log host " + host);
    return Promise.resolve();
  }

  return browser.storage.local.get({[host]: {}})
      .then((site) => {
        if (site[host].date) {
          return;  // already logged; keep the original date
        }
        site[host].date = new Date().toISOString().substring(0, 10);
        return browser.storage.local.set(site);
      })
      .catch(onError);
}

browser.commands.onCommand.addListener((command, tab) => {
  if (command === "copy-contact") {
    const url = new URL(tab.url);
    const h = normalizeHostName(url.hostname);
    const date = new Date().toISOString().substring(0, 10);
    navigator.clipboard.writeText(`<site url="${h}" name="${tab.title}" rating="2">
    <address zone=""></address>
    <comment date="${date}"></comment>
  </site>`);
    console.log("Copied contact record to the clipboard for " + h);
    playSound();
  } else if (command === "open-first-careers-link") {
    openFirstCareersLink(tab.id);
  }
});

function normalizeHostName(hostname) {
  if (hostname.startsWith("www.")) {
    hostname = hostname.substring(4);
  }
  return hostname;
}

/* Fills in defaults for a link entry collected from a page.
 *
 * The key is what visit state is recorded against. It defaults to the URL's
 * host, which is the right answer for ordinary pages, but a generated list can
 * override it so a link on an ATS or a separate careers domain is tracked
 * against the employer's own site instead.
 */
function normalizeEntry(entry) {
  let key = entry.key;
  if (!key) {
    try {
      key = normalizeHostName(new URL(entry.url).hostname);
    } catch (e) {
      key = "";
    }
  }
  return {url: entry.url, key: normalizeHostName(key), mark: entry.mark};
}

function playSound() {
  new Audio("copied.ogg").play();
}

browser.browserAction.onClicked.addListener(logVisit);


/* Refreshes the extension UI for the currently active tab. */
function updateActiveTab() {
  browser.tabs.query({active: true, currentWindow: true})
      .then((tabs) => {
        if (tabs[0]) {
          refreshIcon(tabs[0]);
        } else {
          console.log("WARN: no active tab was found");
        }
      })
      .catch(onError);
}

// listen to tab URL changes
browser.tabs.onUpdated.addListener(updateActiveTab);

// listen to tab switching
browser.tabs.onActivated.addListener(updateActiveTab);

// listen for window switching
browser.windows.onFocusChanged.addListener(updateActiveTab);

// update when the extension loads initially
updateActiveTab();


const exportId = "export-logged-sites";
const importId = "import-logged-sites";
const unmarkId = "unmark-logged-site";
const openLinksId = "open-links";
const stopOpeningLinksId = "stop-opening-links";

browser.menus.create({
  id: exportId,
  title: "Export Logged Sites",
  contexts: ["all"]
});

browser.menus.create({
  id: importId,
  title: "Import Logged Sites",
  contexts: ["all"]
});

browser.menus.create({
  id: unmarkId,
  title: "Unmark Site as Visited",
  contexts: ["all"]
});

browser.menus.create({
  id: openLinksId,
  title: "Start to continuously open not visited links",
  contexts: ["all"]
});

browser.menus.create({
  id: stopOpeningLinksId,
  title: "Stop opening links",
  contexts: ["all"]
});


browser.menus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
  case exportId:
    exportLoggedSites();
    break;
  case importId:
    importLoggedSites();
    break;
  case unmarkId:
    unmarkSite(tab);
    break;
  case openLinksId:
    browser.tabs.executeScript({
      code:
      `(() => {
         const marked = document.querySelectorAll("a[data-visit-open]");
         const anchors = marked.length ? marked : document.getElementsByTagName("a");
         const entries = [];
         for (const a of anchors) {
           entries.push({
             url: a.href,
             key: a.dataset.visitKey || "",
             mark: a.dataset.visitMark || ""
           });
       }
       return entries;
      })();
      `,
    })
        .then((r) => {
          const entries = [];
          for (const entry of r[0]) {
            if (!entry.url.startsWith("https://www.google.com")) {
              entries.push(normalizeEntry(entry));
            }
          }
          return startOpeningUrls(tab, entries);
        })
        .catch(onError);
    break;
  case stopOpeningLinksId:
    return browser.storage.session.remove("openUrlsProgress");
  }
})

/* Exports the extension local storage to a downloadable file. */
function exportLoggedSites() {
  const filename =
        "visitedSites_"
        + new Date().toISOString()
         .replaceAll(":", "")
         .replace("T", "_")
         .substring(0, 15)
        + ".json";
  browser.storage.local.get()
    .then((sites) => new Blob([JSON.stringify(sites)], {type: "application/json"}))
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      // instead of messing with download events just delete it in 5 minutes
      setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
      return url;
    })
    .then((url) => browser.downloads.download(
      {
        url: url,
        filename: filename
      }))
    .then(() => playSound())
    .catch(onError);
}

function importLoggedSites() {
  try {
    browser.windows.create(
      {type: "popup", url: "/popup.html", top: 0, left: 0, width: 600, height: 400,});
  } catch (err) {
    console.error(err);
  }
}

function startOpeningUrls(tab, entries) {
  const openUrlsProgress = {
    windowId: tab.windowId,
    tabIndex: tab.index,
    entries: entries,
  }

  return browser.storage.session.set({openUrlsProgress: openUrlsProgress})
      .then(maybeKeepOpeningUrls);
}

async function maybeKeepOpeningUrls() {
  const key = await browser.storage.session.get("openUrlsProgress");
  if (!key.openUrlsProgress) {
    return;
  }

  const progress = key.openUrlsProgress;
  const tabs = await browser.tabs.query({windowId: progress.windowId});
  if (!progress.entries.length || !tabs.length) {
    console.log("Stopped opening URLs");
    return browser.storage.session.remove("openUrlsProgress");
  }

  const targetTabCount = 5;
  let tabCount = tabs.length;
  if (tabCount >= targetTabCount) {
    // we have a sufficient number of open tabs
    return;
  }

  while (progress.entries.length && tabCount < targetTabCount) {
    const entry = progress.entries.shift();
    if (!entry.key) {
      console.log("Skipping entry with no key: " + entry.url);
      continue;
    }
    const site = await browser.storage.local.get({[entry.key]: {}});
    if (site[entry.key].date) {
      continue;
    }
    const newTab = await browser.tabs.create({
      url: entry.url, windowId: progress.windowId, index: progress.tabIndex + 1, active: false});
    enableHighlighting(newTab.id);
    if (entry.mark === "auto") {
      await logVisitForHost(entry.key);
      await rememberOpenedTabKey(newTab.id, entry.key);
    }
    tabCount++;
  }

  return browser.storage.session.set({openUrlsProgress: progress});
}

/* Remembers which visit key a queued tab was opened for.
 *
 * Without this, opening an ATS page marks the employer's site with no visible sign of it:
 * the toolbar would show the ATS badge and nothing else.
 */
async function rememberOpenedTabKey(tabId, key) {
  const stored = await browser.storage.session.get(openedTabKeysId);
  const keys = stored[openedTabKeysId] || {};
  keys[tabId] = key;
  return browser.storage.session.set({[openedTabKeysId]: keys});
}

async function forgetOpenedTabKey(tabId) {
  const stored = await browser.storage.session.get(openedTabKeysId);
  const keys = stored[openedTabKeysId] || {};
  if (keys[tabId] === undefined) {
    return;
  }
  delete keys[tabId];
  return browser.storage.session.set({[openedTabKeysId]: keys});
}

// try opening new tabs when an existing is closed
browser.tabs.onRemoved.addListener((tabId) => {
  forgetOpenedTabKey(tabId);
  highlightTabs.delete(tabId);
  forgetHighlightReports(tabId);
  maybeKeepOpeningUrls();
});

/* Turns the page highlighter on for a tab. */
function enableHighlighting(tabId) {
  highlightTabs.add(tabId);
  // The page may already have asked, before the tab was recorded, and been told no.
  browser.tabs.sendMessage(tabId, {type: "vl-enable"}).catch(() => {});
}

/* Drops what the highlighter reported for a tab, e.g. when the tab loads a new page. */
function forgetHighlightReports(tabId) {
  highlightReports.delete(tabId);
  pushedHighlightStates.delete(tabId);
  for (const key of jumpCursors.keys()) {
    if (key.startsWith(tabId + ":")) {
      jumpCursors.delete(key);
    }
  }
}

/* Answers highlighter.js starting up in a frame. It runs only in highlight tabs.
 *
 * The highlight colors are inserted as an extension stylesheet, which the
 * page's content security policy doesn't apply to and which adds nothing to
 * the page's DOM.
 */
async function greetHighlighter(tabId, frameId) {
  const enabled = highlightTabs.has(tabId);
  if (enabled) {
    await browser.tabs.insertCSS(tabId, {code: highlightCss(TERM_GROUPS), frameId: frameId})
        .catch(onError);
  }
  return {enabled: enabled, top: frameId === 0};
}

function storeHighlightReport(tabId, frameId, report) {
  if (!highlightTabs.has(tabId) || !report) {
    return;
  }
  let frames = highlightReports.get(tabId);
  if (!frames) {
    frames = new Map();
    highlightReports.set(tabId, frames);
  }
  // The top frame's first report means its panel just started and has never
  // been rendered, so it needs the state even if nothing changed.
  const firstFromTop = frameId === 0 && !frames.has(0);
  frames.set(frameId, report);
  pushHighlightState(tabId, firstFromTop);
}

/* Combines the reports from all frames of a tab into what the panel shows. */
function highlightState(tabId) {
  const frames = Array.from((highlightReports.get(tabId) || new Map()).entries())
      .sort((a, b) => a[0] - b[0]);
  const counts = {};
  const links = [];
  let careersPage = false;
  for (const [frameId, report] of frames) {
    for (const [id, count] of Object.entries(report.counts || {})) {
      counts[id] = (counts[id] || 0) + count;
    }
    for (const link of report.links || []) {
      links.push(Object.assign({frameId: frameId}, link));
    }
    careersPage = careersPage || !!report.careersPage;
  }
  return {
    groups: TERM_GROUPS.map((g) => ({id: g.id, label: g.label, kind: g.kind, count: counts[g.id] || 0})),
    careersPage: careersPage,
    links: links,
    prefs: panelPrefs
  };
}

function pushHighlightState(tabId, force) {
  const state = highlightState(tabId);
  const json = JSON.stringify(state);
  if (!force && pushedHighlightStates.get(tabId) === json) {
    return;
  }
  pushedHighlightStates.set(tabId, json);
  browser.tabs.sendMessage(tabId, {type: "vl-state", state: state}, {frameId: 0}).catch(() => {});
  browser.tabs.get(tabId).then(refreshIcon).catch(onError);
}

/* Follows the first link the panel lists, in the same tab. A link with a URL is
 * loaded directly: clicking the page's element from a keyboard command has no
 * user activation, so a link that opens a new window could be blocked. A
 * script button has no URL, so its frame clicks it. */
function openFirstCareersLink(tabId) {
  if (!highlightReports.has(tabId)) {
    return;
  }
  const link = highlightState(tabId).links[0];
  if (!link) {
    return;
  }
  if (link.url) {
    browser.tabs.update(tabId, {url: link.url}).catch(onError);
  } else {
    browser.tabs.sendMessage(tabId, {type: "vl-open-local", index: link.index}, {frameId: link.frameId})
        .catch(onError);
  }
}

/* One line of counts for the toolbar tooltip, or "" if the tab isn't highlighted. */
function highlightSummary(tabId) {
  if (!highlightReports.has(tabId)) {
    return "";
  }
  const state = highlightState(tabId);
  return state.groups
      .map((g) => g.label + " " + (g.kind === "links" && state.careersPage && !g.count ? "here" : g.count))
      .join(", ");
}

function withHighlightSummary(title, tabId) {
  const summary = highlightSummary(tabId);
  return summary ? title + "\n" + summary : title;
}

/* Shows the next visible match of a group, cycling through all frames of the tab.
 *
 * Each frame skips its own hidden matches, so hidden content costs one message
 * per frame rather than one per match.
 */
async function jumpToNextMatch(tabId, groupId) {
  const group = TERM_GROUPS.find((g) => g.id === groupId);
  const frames = Array.from((highlightReports.get(tabId) || new Map()).entries())
      .map(([frameId, report]) => ({frameId: frameId, count: (report.counts || {})[groupId] || 0}))
      .filter((f) => f.count > 0)
      .sort((a, b) => a.frameId - b.frameId);
  const total = frames.reduce((sum, f) => sum + f.count, 0);
  if (!group || !total) {
    return {status: ""};
  }

  const cursorKey = tabId + ":" + groupId;
  const last = jumpCursors.get(cursorKey);
  let start = last ? frames.findIndex((f) => f.frameId === last.frameId) : 0;
  let from = 0;
  if (start < 0) {
    start = 0;
  } else if (last) {
    from = last.index + 1;
  }

  // One extra step comes back to the starting frame for the matches before the cursor.
  for (let step = 0; step <= frames.length; step++) {
    const position = (start + step) % frames.length;
    const frame = frames[position];
    const reply = await browser.tabs.sendMessage(
        tabId, {type: "vl-jump-local", group: groupId, from: from}, {frameId: frame.frameId})
        .catch(() => null);
    if (reply && reply.index >= 0) {
      jumpCursors.set(cursorKey, {frameId: frame.frameId, index: reply.index});
      const before = frames.slice(0, position).reduce((sum, f) => sum + f.count, 0);
      return {status: `${group.label}: ${before + reply.index + 1} of ${total}`};
    }
    from = 0;
  }
  return {
    status: `${group.label}: ${total === 1 ? "the match is" : "all " + total + " matches are"}`
        + " in hidden content, such as a collapsed section or a closed menu"
  };
}

// Tabs opened from a highlight tab, e.g. a careers link with target="_blank".
browser.tabs.onCreated.addListener((tab) => {
  if (tab.openerTabId !== undefined && highlightTabs.has(tab.openerTabId)) {
    enableHighlighting(tab.id);
  }
});

// A new page in the tab replaces everything the old one reported.
browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    forgetHighlightReports(tabId);
  }
});

browser.runtime.onMessage.addListener((message, sender) => {
  const tabId = sender.tab && sender.tab.id;
  if (tabId === undefined || !message) {
    return;
  }
  switch (message.type) {
  case "vl-hello":
    return greetHighlighter(tabId, sender.frameId);
  case "vl-report":
    storeHighlightReport(tabId, sender.frameId, message.report);
    return;
  case "vl-jump":
    return jumpToNextMatch(tabId, message.group);
  case "vl-open":
    browser.tabs.sendMessage(tabId, {type: "vl-open-local", index: message.index}, {frameId: message.frameId})
        .catch(onError);
    return;
  case "vl-prefs":
    panelPrefs = {collapsed: !!message.prefs.collapsed, left: !!message.prefs.left};
    for (const id of highlightReports.keys()) {
      pushHighlightState(id, false);
    }
    return;
  }
});
