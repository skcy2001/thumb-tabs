# Thumb Tabs

A docked browser ribbon for Windows with pinned sites, persistent logins, media
controls, and quick access from the screen edge. Built with Rust, Tauri 2, and
the system WebView2 runtime, with a React interface. Nothing from Electron or
Node ships with the app. Formerly part of Tabbar (originally Sidebar).

## Features

- Ribbon with pinned sites, drag reordering, drag across the divider to
  pin/unpin, unread badges, favicons, and a URL/search toolbar.
  Open pins have a small neutral dot below the icon; the selected pin also has
  a pink edge marker. Unread and media badges remain separate.
- Separate ribbon and content windows, 220–900px draggable pane width, remembered
  width per site, left/right docking, and monitor placement by dragging the grip.
- Pinning to the desktop reserves the ribbon's width through Windows AppBar.
  The unpinned ribbon auto-hides on mouse-out and returns after a 100ms edge hover.
  Both directions use a 300ms eased slide, with a 100ms mouse-out delay.
  Slides stay clipped to their monitor, including edges shared with another display.
  While collapsed, clicking another window or losing focus does not dismiss it.
  An open pane stays visible until an outside click or until it is closed;
  moving the pointer away alone does not dismiss it. Clicking outside collapses
  the pane, so the next edge hover reveals only the ribbon. When pinned, the
  ribbon stays visible while the pane collapses. Websites remain loaded.
- Native WebView2 tabs, persistent cookies, real history availability, reload,
  isolated login profiles, and per-site default/mobile/desktop user agents.
- Native website notifications while a site remains open, with an Allow/Block
  permission question and choices saved per origin and browser profile.
- Taskbar-style media player with album artwork or a video poster, title, play/pause, next
  track, and native mute. It slides in from the hovered tab over 300ms and uses
  Windows rounded corners and shadow. It dismisses on mouse-out, without a
  close button. The player does not capture or cache screenshots of the page.
  Empty players and recommendation previews do not open it. Loaded paused
  tracks can resume; unavailable actions are disabled and clicks run one at a time.
- Downloads panel with progress, cancellation, opening files, revealing files in
  Explorer, and clearing completed history. Downloads are tracked across profiles.
- Window fullscreen through the toolbar/menu, plus website/video fullscreen.
  Hover the docked screen edge to slide the ribbon over fullscreen content;
  moving back into the page hides it without moving or resizing the page.
- Sized popups retain `window.opener` and their parent profile for OAuth. Ordinary
  new-window links open in tabs.
- Settings (the gear tab at the bottom of the ribbon, which closes when you pick
  a tab) with an Appearance page: eight colour themes (Cocoa, Midnight, Graphite,
  Forest, Lagoon, Sunset, Amethyst and a black-and-white High contrast) and tab
  shapes in two expandable groups. Basic has Classic and Chrome,
  which share one layout and differ only in the highlight (accent bar vs. a
  rounded block). Binder has five shapes; the bulkier Chamfer, Rounded and Cove
  are drawn 15% shorter and spaced out so the tabs stay where they were. Changes
  apply at once and are remembered.
- Native Windows context menus open inward from the original click position,
  with automatic vertical adjustment near the screen boundary.
- Tray controls, open in the default browser, single-instance handoff, and
  `tabbar://` links that select a matching pinned host when possible.
- Automatic import of pins, site options, and dock settings from the older
  Electron edition of Tabbar.

Custom keyboard shortcuts are not included. Standard website and text-input
behavior remains available. Open ordinary tabs and download history are
session-only.

## Website notifications

Enable desktop notifications in the website's own settings. When it requests
permission, the app asks whether to allow notifications from the displayed origin:
**Yes** allows them, **No** blocks them, and **Cancel** leaves the choice unset.
Allow and block choices survive app restarts and are separate for isolated
profiles. Other website permissions keep their existing behavior.

To change a choice, right-click an open tab or its pinned icon and choose
**Notifications → Allow / Block / Ask next time**. Reload the website if it caches
the previous permission. Notifications use WebView2's native Windows display and
respect Windows notification settings, including Do not disturb. The site can
notify while its tab is in the background or the ribbon is collapsed, as long
as the page is still running. WebView2 does not support Web Push or persistent
service-worker notifications; sites that require those APIs need a full browser.

## Build and run

Requires Windows WebView2, Node 20+, Rust stable MSVC, and Microsoft C++ Build
Tools with the Windows SDK and tools for the intended architecture.

```powershell
npm ci
npm run desktop       # Native development app and Vite
npm run build         # TypeScript and production UI assets
npm run check:native  # Native Rust check
npm run test:core     # Pure Rust behavior tests
npm run test:ui       # Shared UI tests in Edge with mocked native IPC
npm run test:notifications # Windows notification integration (disposable profiles)
npm run bundle        # Release executable and NSIS installer
```

The release executable is `src-tauri/target/release/tabbar.exe`; an
explicit `--target` adds the target triple before `release`. `npm run bundle`
builds an unsigned NSIS installer for the current architecture; pass
`-- --target aarch64-pc-windows-msvc` (or `x86_64-pc-windows-msvc`) to build for
the other one. The installer obtains WebView2 if needed instead of bundling Chromium.

This native integration currently targets Windows. macOS and Linux need their
own platform implementations. The multi-webview API is still marked unstable
by Tauri, so the Rust Tauri version and dependency lockfiles are pinned.

## Project layout

- `src/`: React interface, with `bridge.ts` implementing the native API over Tauri
- `shared/`: types and the API contract between the interface and the native side
- `src-tauri/`: the Tauri app (windows, docking, WebView2, notifications)
- `core/`: platform-free Rust logic (settings, URLs, unread parsing, slide maths)
- `tests/`: Playwright UI tests with a mocked native bridge
- `scripts/`: notification integration test and Electron session import helper

## Existing data

Settings live in `%APPDATA%/com.samya.sidebar.tauri/settings.json`. Browser data
lives in `%LOCALAPPDATA%/com.samya.sidebar.tauri`. On first start, the app merges
pins from `%APPDATA%/sidebar/pinned-sites.json` and imports the shell placement.
These legacy identifiers and partition names are intentionally retained across
the renames to preserve settings, logins, and installer upgrade identity.
The Electron edition's files remain intact.

To transfer existing cookies from an Electron Tabbar installation, close
Electron Tabbar, then run this from a checkout of the old Tabbar repository
(it needs that repository's `node_modules/electron`), pointing at this script:

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
& node_modules/electron/dist/electron.exe <path-to-thumb-tabs>/scripts/import-electron-sessions.cjs
```

The helper reads cookies through Electron's own session API and stages Windows
DPAPI-encrypted transfer files. The app consumes each profile's transfer when that
profile is first opened, deletes the encrypted transfer, and writes only counts
to a migration report. Cookie values are not logged. IndexedDB, local storage,
and service workers do not transfer between engines; some sites may require a
new sign-in. Changing a site to an isolated profile likewise starts a separate
login session. Newly pinned tabs retain their existing shared login until
isolation is selected explicitly.

`tabbar://` and the legacy `sidebar://` alias are registered for the current
Windows user at startup. Launching the app with an HTTP(S) URL as a command-line
argument also works.

## Security and size

Only the four bundled UI webviews receive native capabilities. Website and
popup webviews cannot call the shell commands, and browsing-state events are
sent only to the trusted interface. Website navigation is restricted to HTTP(S).
Profiles are derived from encoded partition names under the app's data folder.

Distribution size is much smaller than an Electron app because WebView2 is
supplied by Windows. This does not establish a RAM reduction: measure the
complete app and WebView2 process tree with identical websites and profiles.
Isolated profiles require additional browser environments.

## Testing

The UI test suite covers navigation/search safety, state selection, reordering,
unread parsing, deep-link routing, imported-pin UI, downloads controls, media
controls, fullscreen controls, and error handling. UI tests mock native IPC;
real Windows/WebView2 behavior also needs native integration checks.
The notification integration check opens its own disposable profiles, answers
test permission dialogs, verifies profile isolation and revocation, and briefly
shows one silent native notification. It leaves the running app's tabs alone.

The November 9, 2026 Windows ARM64 release passed 18 live integration checks:
imports, AppBar reservation, navigation/history, native capture, media controls,
website IPC denial, OAuth opener, window/HTML fullscreen, downloads/cancellation,
profile isolation, user agents, shared-cookie retention, widths, reordering,
auto-hide, and edge-hover reveal. That executable was 3,426,816 bytes.
Edge animations also passed movement traces on both sides, collapsed and
expanded, with no backward jumps, gaps between the windows, or movement after
settling at the edge.

## License

MIT. See [LICENSE](LICENSE).
