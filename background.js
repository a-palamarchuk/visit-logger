/* generic error handler */
function onError(error) {
  console.log(error);
}

/*
 * Makes the browserAction icon reflect the tab site logged state.
 */
function refreshIcon(tab) {
  const url = new URL(tab.url);
  const h = url.hostname;
  browser.storage.local.get({[h]: {}})
    .then((site) => {
      const currentLogged = site[h].date;
      console.log(h + " was logged on " + site[h].date);

      browser.browserAction.setIcon({
        path: currentLogged ? "icons/logged.svg" : "icons/not-logged.svg",
        tabId: tab.id
      });
      browser.browserAction.setTitle({
        title: currentLogged ? "Site visit was logged" : "Log site visit",
        tabId: tab.id
      });
    });
}

/*
 * The register visit browser action was triggered.
 */
function logVisit(tab) {
  const url = new URL(tab.url);
  const h = url.hostname

  function markLogged(site) {
    if (!site[h].date) {
      console.log("Logging " + h);
      site[h].date = new Date().toISOString().substring(0, 10);
    } else {
      console.log("Already logged " + h + " on " + site[h].date);
    }
    return site;
  }

  if (url.protocol === "http:" || url.protocol == "https:") {
    browser.storage.local.get({[h]: {}})
      .then((site) => markLogged(site))
      .then((site) => browser.storage.local.set(site))
      .then(() => refreshIcon(tab))
      .catch(onError)
  } else {
    console.log("Skipping site with protocol " + url.protocol);
    refreshIcon(tab);
  }
}

browser.browserAction.onClicked.addListener(logVisit);


/*
 * Refreshes the extension UI for the currently active tab.
 */
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
