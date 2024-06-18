/* generic error handler */
function onError(error) {
  console.log("ERROR!!!");
  console.log(error);
}

/* Makes the browserAction icon reflect the tab site logged state. */
function refreshIcon(tab) {
  const url = new URL(tab.url);
  const h = normalizeHostName(url.hostname);
  browser.storage.local.get({[h]: {}})
    .then((site) => {
      const logged = site[h].date;
      const action = browser.browserAction;

      action.setIcon({
        path: logged ? "icons/logged.svg" : "icons/not-logged.svg",
        tabId: tab.id
      });
      action.setTitle({
        title: logged ? "Toggle R mark on the site logged as visited (F9)" : "Log site visit (F9)",
        tabId: tab.id
      });

      action.setBadgeBackgroundColor({color: "#FFF600"});
      action.setBadgeText({text: site[h].r ? "R" : ""});
    });
}

/* The register visit browser action was triggered. */
function logVisit(tab) {
  const url = new URL(tab.url);
  const h = normalizeHostName(url.hostname);

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

  if (url.protocol === "http:" || url.protocol == "https:") {
    browser.storage.local.get({[h]: {}})
      .then((site) => markLogged(site))
      .then((site) => browser.storage.local.set(site))
      .then(() => refreshIcon(tab))
      .catch(onError);
  } else {
    console.log("Skipping site with protocol " + url.protocol);
    refreshIcon(tab);
  }
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
  }
});

function normalizeHostName(hostname) {
  if (hostname.startsWith("www.")) {
    hostname = hostname.substring(4);
  }
  return hostname;
}

browser.browserAction.onClicked.addListener(logVisit);


/* Refreshes the extension UI for the currently active tab. */
function updateActiveTab(tabs) {
  const gettingActiveTab = browser.tabs.query({active: true, currentWindow: true});
  gettingActiveTab.then((tabs) => {
    if (tabs[0]) {
      const tab = tabs[0];
      refreshIcon(tab);
    } else {
      console.log("WARN: no active tab was found");
    }
  });
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

browser.menus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
  case exportId:
    exportLoggedSites();
    break;
  case importId:
    importLoggedSites();
    break;
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
    .catch(onError);
}

function importLoggedSites() {
  try {
    browser.windows.create(
      {type: "popup", url: "/popup.html", top: 0, left: 0, width: 600, height: 400,});
  } catch (err) {
    console.error(err);
  }
  return;
}
