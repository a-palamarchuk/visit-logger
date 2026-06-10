# Visit Logger

A Firefox extension for managing website visits during a job search workflow.

## Features

**Visit tracking**
- Toolbar icon badge indicates whether the current site has been visited
- Press F9 to mark a site as visited; press again to toggle the "R" badge indicating a resume was
  submitted to the website
- Visited state persists across browser restarts
- Export and import visit log as JSON for backup, analysis, or integration with external tools

**Automated tab queue**
- On any page containing hyperlinks, start continuous tab opening with a single menu action
- The extension opens links in new tabs, maintaining a maximum number of open tabs (now: 5)
- When you close a tab, the extension automatically opens the next unvisited link in the background
- Skips links already marked as visited
- After restart, already-visited sites are skipped automatically when starting a new queue

**Keyboard shortcuts**
- F9 - mark current site as visited / toggle resume-submitted badge
- F8 - copy a contact record for the current site to clipboard

## Installation

This extension is not listed on the Firefox Add-ons site. To install it as
a [temporary extension](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox)
for development and personal use:

1. Clone or download this repository
2. Open Firefox and navigate to `about:debugging`
3. Click **This Firefox** → **Load Temporary Add-on**
4. Select any file in the repository directory

**To persist data between browser restarts when using temporary installation:**
Go to `about:config` and set both `extensions.webextensions.keepStorageOnUninstall` and
`extensions.webextensions.keepUuidOnUninstall` to `true`.
See [Testing persistent and restart features](https://extensionworkshop.com/documentation/develop/testing-persistent-and-restart-features)
for details.

## Architecture

The extension has a single background script that handles all logic and state:

- **Visit state** is stored in `browser.storage.local`, keyed by normalized hostname
  (`www.` stripped). This persists across browser restarts.
- **Tab queue progress** is stored in `browser.storage.session`. This is intentionally ephemeral -
  the queue does not survive a browser restart.
- **Icon and badge state** is updated reactively by listening to `tabs.onUpdated`,
  `tabs.onActivated`, and `windows.onFocusChanged`.
- **Tab queue** is driven by `tabs.onRemoved`: when any tab closes, the extension checks
  whether the open tab count has fallen below the threshold and opens the next unvisited URL.
- **Import UI** opens as a browser popup window (`popup.html`); the background script
  handles export directly via `browser.downloads`.

## Development

Icons sourced from [Google Fonts Icons](https://fonts.google.com/icons).
