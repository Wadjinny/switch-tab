# switch-tab

A WXT browser extension that switches tabs with a vertical picker (icon, title, and hostname). The highlighted row is the tab that is actually active.

- `Ctrl+Q` moves forward
- `Ctrl+Shift+Q` moves backward
- The list stays open while you hold the shortcut; release Ctrl to close it
- Change shortcuts on the settings page, with warnings for reserved browser keys

On macOS the defaults use Control (`MacCtrl`), not Command, so they do not quit the browser.

## Run

```bash
npm install
npm run dev
```

Chrome opens with the unpacked extension loaded from `.output/chrome-mv3-dev`. Click the toolbar icon to open settings.

```bash
npm run dev:firefox
npm run build
npm test
```
