let currentTab;
let currentLogged;

/*
 * Updates the browserAction icon to reflect whether the current site
 * was already logged.
 */
function updateIcon() {
  browser.browserAction.setIcon({
    path: currentLogged ? "icons/logged.svg" : "icons/not-logged.svg",
    tabId: currentTab.id
  });
  browser.browserAction.setTitle({
    title: currentLogged ? "Site visit was logged" : "Log site visit (F9)",
    tabId: currentTab.id
  });
}

/*

 * Add or remove the bookmark on the current page.
 */
function toggleLog() {
  currentLogged = !currentLogged;
  console.log("Clicked for: " + currentTab.url);
  updateIcon();
}

browser.browserAction.onClicked.addListener(toggleLog);

/*
 * Switches currentTab and currentLogged to reflect the currently active tab
 */
function updateActiveTab(tabs) {

  function updateTab(tabs) {
    console.log("Current logged: " + currentLogged);
    if (tabs[0]) {
      currentTab = tabs[0];
      console.log(`Visit logger: url - '${currentTab.url}'`)
    }
  }

  let gettingActiveTab = browser.tabs.query({active: true, currentWindow: true});
  gettingActiveTab.then(updateTab);
}

// listen to tab URL changes
browser.tabs.onUpdated.addListener(updateActiveTab);

// listen to tab switching
browser.tabs.onActivated.addListener(updateActiveTab);

// listen for window switching
browser.windows.onFocusChanged.addListener(updateActiveTab);

// update when the extension loads initially
updateActiveTab();
