# visit-logger

## What it does

Displays a simple button in the menu bar that toggles the indicator whether a web site was visited before. The action can also be called with F9. A repeated call to this action toggles the "R" indicator on a site logged as visible.

When running the extension with [temporary installation in Firefox](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox) make the following settings in the Firefox configuration to persist the extension data between browser restarts. Go to `about:config` and set both `extensions.webextensions.keepStorageOnUninstall` and `extensions.webextensions.keepUuidOnUninstall` to `true` (see [the instructions](https://extensionworkshop.com/documentation/develop/testing-persistent-and-restart-features)).

## Development

The icons are taken from https://fonts.google.com/icons.