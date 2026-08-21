/* generic error handler */
function onError(error) {
  console.log("ERROR!!!");
  console.log(error);
}

/* Makes the browserAction icon reflect the tab site logged state. */
function refreshIcon(tab) {
  const url = new URL(tab.url);
  const h = normalizeHostName(url.hostname);
  if (isAtsHost(h)) {
    const action = browser.browserAction;
    action.setIcon({path: "icons/not-logged.svg", tabId: tab.id});
    action.setTitle({
      title: "Applicant tracking system - log the employer's own site instead",
      tabId: tab.id
    });
    action.setBadgeBackgroundColor({color: "#888888"});
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
          title: logged ? "Toggle R mark on the site logged as visited (F9)" : "Log site visit (F9)",
          tabId: tab.id
        });

        action.setBadgeBackgroundColor({color: "#FFF600"});
        action.setBadgeText({text: site[h].r ? "R" : ""});
      })
      .catch(onError);
}

/* The register visit browser action was triggered. */
function logVisit(tab) {
  const url = new URL(tab.url);
  const h = normalizeHostName(url.hostname);
  if (isAtsHost(h)) {
    console.log("Refusing to log ATS host " + h);
    refreshIcon(tab);
    return;
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

function logVisitForHost(host) {

  function markLogged(site) {
    site[host].date = new Date().toISOString().substring(0, 10);
    return site;
  }

  browser.storage.local.get({[host]: {}})
    .then((site) => markLogged(site))
    .then((site) => browser.storage.local.set(site))
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
  }
});

/* Hosts belonging to applicant tracking systems and job boards.
 *
 * Visit state is keyed by hostname, and these hosts are shared by thousands of
 * unrelated employers. Logging one would cause every future queue to skip every
 * company using that ATS - silently, since a skipped link looks the same as a
 * finished one. Marking is refused here; the company's own site is what should
 * be logged.
 */
const ATS_HOSTS = [
  "applicantpool.com", "applicantpro.com", "applicantstack.com", "applytojob.com",
  "appone.com", "appvault.com", "ashbyhq.com", "atsondemand.com", "avahr.com",
  "bamboohr.com", "betterteam.com", "brassring.com", "breezy.hr", "brightmove.com",
  "careerplug.com", "careerspage.io", "comeet.com", "csod.com", "dayforcehcm.com",
  "deel.com", "dover.com", "eightfold.ai", "exacthire.com", "freshteam.com",
  "gem.com", "governmentjobs.com", "gr8people.com", "greenhouse.io", "gusto.com",
  "harri.com", "hibob.com", "hireclick.com", "hireology.com", "hirebridge.com",
  "hiringthing.com", "hrmdirect.com", "hrsmart.com", "icims.com", "interfolio.com",
  "isolvedhire.com", "jobappnetwork.com", "jobscore.com", "jobvite.com",
  "lever.co", "munisselfservice.com", "myworkdayjobs.com", "myworkdaysite.com",
  "njoyn.com", "ns2cloud.com", "oraclecloud.com", "ourcareerpages.com",
  "pageuppeople.com", "paradox.ai", "paycomonline.net", "paylocity.com",
  "peopleadmin.com", "peoplematter.com", "pereless.com", "personio.com",
  "personio.de", "prismhr-hire.com", "recruitee.com", "recruitingbypaycor.com",
  "recruitmentplatform.com", "rippling.com", "saashr.com", "salesforce-sites.com",
  "schoolspring.com", "selectminds.com", "silkroad.com", "smartrecruiters.com",
  "successfactors.com", "taleo.net", "teamworkonline.com", "trakstar.com",
  "ultipro.com", "usajobs.gov", "viglobalcloud.com", "wizehire.com",
  "workable.com", "workforcenow.adp.com", "workstream.us", "zohorecruit.com"
];

/* True if the hostname is an ATS or job board rather than an employer's site.
 *
 * Matches subdomains only. Most of these vendors are themselves employers whose
 * own site should stay loggable: jobs.gusto.com is a board, gusto.com is Gusto.
 */
function isAtsHost(hostname) {
  return ATS_HOSTS.some((d) => hostname.endsWith("." + d));
}

function normalizeHostName(hostname) {
  if (hostname.startsWith("www.")) {
    hostname = hostname.substring(4);
  }
  return hostname;
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
  case openLinksId:
    browser.tabs.executeScript({
      code:
      `hrefs = [];
       links = document.getElementsByTagName("a");
       for (let i = 0; i < links.length; i++) {
         hrefs.push(links[i].href);
       }
       hrefs;
      `,
    })
      .then((r) => {
        const urls = [];
        for (let url of r[0]) {
          if (!url.startsWith("https://www.google.com")) {
            urls.push(url);
          }
        }
        return startOpeningUrls(tab, urls);
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

function startOpeningUrls(tab, urls) {
  const openUrlsProgress = {
    windowId: tab.windowId,
    tabIndex: tab.index,
    urls: urls,
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
  if (!progress.urls.length || !tabs.length) {
    console.log("Stopped opening URLs");
    return browser.storage.session.remove("openUrlsProgress");
  }

  const targetTabCount = 5;
  let tabCount = tabs.length;
  if (tabCount >= targetTabCount) {
    // we have a sufficient number of open tabs
    return;
  }

  while (progress.urls.length && tabCount < targetTabCount) {
    const url = progress.urls.shift();
    const h = normalizeHostName(new URL(url).hostname);
    const site = await browser.storage.local.get({[h]: {}});
    if (site[h].date) {
      continue;
    }
    await browser.tabs.create({
      url: url, windowId: progress.windowId, index: progress.tabIndex + 1, active: false});
    // logVisitForHost(h);
    tabCount++;
  }

  return browser.storage.session.set({openUrlsProgress: progress});
}

// try opening new tabs when an existing is closed
browser.tabs.onRemoved.addListener(maybeKeepOpeningUrls);

