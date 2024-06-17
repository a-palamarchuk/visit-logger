# visit-logger

## What it does

Displays a simple button in the menu bar that toggles the indicator whether a web site was visited before. The action can also be called with F9. A repeated call to this action toggles the "R" indicator on a site logged as visible.

ATTENTION!!! When running the extension with [temporary installation in Firefox](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox) make the following settings in the Firefox configuration to persist the extension data between browser restarts. Go to `about:config` and set both `extensions.webextensions.keepStorageOnUninstall` and `extensions.webextensions.keepUuidOnUninstall` to `true` (see [the instructions](https://extensionworkshop.com/documentation/develop/testing-persistent-and-restart-features)). Otherwise you'll be at risk of losing visit log data.

The extension also provides the following local menu items:
* Export Logged Sites - exports the logged sites data collected so far as JSON file.
* Import Logged Sites - merges the logged sites data into the extension's visit log if they are not already there. The data should be provided in the same JSON format as the exported data. 

The export/import functionality allows backup/restore, using external sources of site visits,  and integration with other external processing.

## Development

The icons are taken from https://fonts.google.com/icons.