# Visit Logger

A Firefox extension for managing website visits during a job search workflow.

## Features

**Visit tracking**
- Toolbar icon badge indicates whether the current site has been visited
- Press F9 to mark a site as visited; press again to toggle the "R" badge indicating a resume was
  submitted to the website
- Visited state persists across browser restarts
- Export and import visit log as JSON for backup, analysis, or integration with external tools
- Applicant tracking systems and job boards (Greenhouse, Lever, Workday, iCIMS, and similar) are
  recognized and cannot be marked visited: their hostnames are shared by thousands of employers,
  so logging one would silently skip every company using that ATS. The toolbar badge shows "ATS"
  on those pages.
- Unmark a site through the context menu ("Unmark Site as Visited") to remove its visit log
  entry, including the "R" mark. F9 alone cannot undo a mark, so this is the way to correct a
  mistaken one - or to clear an ATS hostname logged before the guard existed.

**Automated tab queue**
- On any page containing hyperlinks, start continuous tab opening with a single menu action
- The extension opens links in new tabs, maintaining a maximum number of open tabs (now: 5)
- When you close a tab, the extension automatically opens the next unvisited link in the background
- Skips links already marked as visited
- After restart, already-visited sites are skipped automatically when starting a new queue
- Generated link lists can control the queue through `data-` attributes. When a page contains any
  `a[data-visit-open]` anchor, only those links are queued, so helper links on the same row
  (company website, search links) are ignored. On pages without them, every link is queued as
  before.
- `data-visit-key` overrides which host a link is tracked against. A careers page on an applicant
  tracking system or a separate careers domain can therefore be recorded against the employer's
  own site.
- `data-visit-mark="auto"` marks a link's key as visited when its tab opens, so working through a
  generated list needs no keypress per row and an interrupted pass resumes where it left off.
  Up to a few tabs' worth of links at the end of a session are marked without being reviewed;
  unmark them individually if that matters.

**Keyboard shortcuts**
- F9 - mark current site as visited / toggle resume-submitted badge. On tabs opened from a queue
  with `data-visit-mark="auto"`, F9 acts on the link's key rather than the tab's own host, so it
  toggles the "R" mark for the employer even when the tab shows an applicant tracking system.
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
- **ATS hosts** are listed in `ATS_HOSTS` and matched by domain suffix. Marking is refused on
  them, since visit state is keyed by hostname and an ATS hostname identifies the vendor rather
  than the employer.
- **Tab queue progress** is stored in `browser.storage.session`. This is intentionally ephemeral -
  the queue does not survive a browser restart.
- **Icon and badge state** is updated reactively by listening to `tabs.onUpdated`,
  `tabs.onActivated`, and `windows.onFocusChanged`.
- **Tab queue** is driven by `tabs.onRemoved`: when any tab closes, the extension checks
  whether the open tab count has fallen below the threshold and opens the next unvisited URL.
- **Import UI** opens as a browser popup window (`popup.html`); the background script
  handles export directly via `browser.downloads`.
- **Link collection** returns `{url, key, mark}` entries rather than bare URLs. `key` comes from
  `data-visit-key`, defaulting to the URL's normalized host; `mark` comes from `data-visit-mark`.
  Both are read only from pages that opt in via `data-visit-open`.
- **Queued tab keys** are stored in `browser.storage.session` as a tab-id-to-key map, so the
  toolbar can show which site a tab was logged against when that differs from the tab's own host.
  Entries are dropped when the tab closes.

## Development

Icons sourced from [Google Fonts Icons](https://fonts.google.com/icons).
