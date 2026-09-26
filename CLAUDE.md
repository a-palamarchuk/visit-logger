# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Visit Logger is a Firefox-only WebExtension (Manifest V2, `strict_min_version` 140) for a job search.
It logs which company sites have been reviewed, opens lists of links in a throttled tab queue, and
highlights job-search terms on the pages the queue opens. `README.md` describes the user-facing
features and has an **Architecture** section. Read that section before changing behavior, and keep
it and the feature list up to date: almost every commit updates `README.md` alongside the code.

## Development

There is no build step, package manager, linter, or test suite. The files are plain JavaScript
loaded directly by Firefox.

- Run: in `about:debugging` → This Firefox → Load Temporary Add-on, then select any file in the
  repo. After an edit, click **Reload** there. Content-script changes only reach pages loaded after
  the reload.
- To keep the visit log across reinstalls, set `extensions.webextensions.keepStorageOnUninstall`
  and `extensions.webextensions.keepUuidOnUninstall` to `true` in `about:config`.
- Quick syntax check without a browser: `node --check <file>.js`.
- `matcher.js` has no DOM or extension API access on purpose, so its functions can be exercised in
  Node. Keep it that way.

Use Firefox's promise-based `browser.*` APIs; there is no `chrome.*` compatibility layer.

## Architecture

**Script contexts.** `background.js` runs in a persistent background page and owns all state and
decisions. `highlighter.js` is a content script declared for every frame of every page. It stays
dormant until the background answers its `vl-hello` message by saying the tab should be
highlighted. `popup.html`/`popup.js` is the JSON import window, opened with `windows.create` from
the context menu. Export is handled in the background.

**Shared scripts.** `ats-hosts.js`, `terms.js`, and `matcher.js` are loaded in front of both
`background.js` and `highlighter.js`, and the two script lists in `manifest.json` must stay in
matching order. They communicate through globals: use top-level `var`/`function` declarations as
they already do, and add any new shared script to both lists.

**Where state lives:**
- `storage.local` holds the visit log, keyed by normalized hostname (`www.` stripped by
  `normalizeHostName`). Values are `{date: "YYYY-MM-DD", r?: true}`, where `r` means a resume was
  submitted. Export and import move this object as-is.
- `storage.session` holds the tab-queue progress (`openUrlsProgress`) and the tab-id → visit-key
  map (`openedTabKeys`). Neither is expected to survive a browser restart.
- Background memory holds highlight state (`highlightTabs`, `highlightReports`, `jumpCursors`,
  `panelPrefs`). It is kept out of storage deliberately, because a Set can't lose an update when
  several tabs open at once (see the comment at the top of `background.js`). This relies on the
  background page being persistent.

**Visit keys and job boards.** A queued link carries `{url, key, mark}`, taken from
`data-visit-open`, `data-visit-key` and `data-visit-mark` on generated link lists. The visit is
recorded against `key`, not necessarily against the tab's own host. Every code path that marks a
site must refuse hosts where `isAtsHost()` is true: those vendors' hostnames are shared by
thousands of employers, so marking one would silently skip them all in future queues.

**Highlighter messages** (`vl-*`). Each frame scans itself and sends `vl-report` with its counts
and careers links. The background merges the reports per tab, pushes `vl-state` to the top frame's
panel, and updates the toolbar tooltip. "Next match" and "open link" clicks from the panel go to
the background as `vl-jump`/`vl-open`, and it routes them to the owning frame as
`vl-jump-local`/`vl-open-local`. Highlight CSS is inserted by the background with `tabs.insertCSS`,
because the page's content security policy doesn't apply to it. Page markup is never modified: the
extension uses the CSS Custom Highlight API, and the panel lives in a closed shadow root built with
`textContent` only.

**Term groups** are data in `terms.js`: `kind: "text"` or `"links"`, strings or RegExps, plus
`urlPatterns` for the links group. The format is documented in that file's header comment.
`compileGroup` in `matcher.js` validates the groups and turns each one into regexes.
