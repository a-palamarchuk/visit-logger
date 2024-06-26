# visit-logger

## What it does

Displays a simple button in the menu bar that toggles the indicator whether a web site was visited before. The action can also be called with F9. A repeated call to this action toggles the "R" toolbar icon badge on a site logged as visible. Note, google.com is always shown as not visited even when it is to prevent the fatigue of seing them every time one goes there.

ATTENTION!!! When running the extension with [temporary installation in Firefox](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox) make the following settings in the Firefox configuration to persist the extension data between browser restarts. Go to `about:config` and set both `extensions.webextensions.keepStorageOnUninstall` and `extensions.webextensions.keepUuidOnUninstall` to `true` (see [the instructions](https://extensionworkshop.com/documentation/develop/testing-persistent-and-restart-features)). Otherwise you'll be at risk of losing visit log data.

The extension keyboard shortcuts:
* F8 - generate and copy into clipboard a "contact" record for the current web site. TODO - ideally this functionality should live in a different extension. Keep here for convenience.
* F9 - mark a web site as visited, toggle the "R" toolbar icon badge after that.

The extension also provides the following local menu items:
* Export Logged Sites - exports the logged sites data collected so far as JSON file.
* Import Logged Sites - merges the logged sites data into the extension's visit log if they are not already there. The data should be provided in the same JSON format as the exported data.
* Continuously open page links not marked as visited - on a page containing hyperlinks to other sites starts opening those hyperlinks in new tabs keeping only a few of those tabs open. Skip the sites marked as visited by the main extension functionality.

The export/import functionality allows backup/restore, using external sources of site visits,  and integration with other external processing.

## Development

The icons are taken from https://fonts.google.com/icons.