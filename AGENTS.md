# AGENTS.md

Guidance for coding agents working in this repository. For a map of the
files, see [INDEX.md](INDEX.md); for user-facing docs, see [README.md](README.md).

## What this is

Thumb Tabs (the Tauri edition of Tabbar, formerly Sidebar) is a docked browser
ribbon for Windows, built with Rust and the system WebView2. The React frontend
lives in `src/`; the native side is in `src-tauri/` and `core/`.

The app is three cooperating windows: the **ribbon** (53px tab strip at a
screen edge), the **pane** (toolbar plus one WebView2 view per tab), and small
helpers (player preview, downloads, resize guide). Each window loads
`index.html?role=…`; `src/main.tsx` picks the shell by role.

## Commands

| Task | Command |
| --- | --- |
| Install | `npm ci` |
| Dev app (Vite + `tauri dev`) | `npm run desktop` |
| Type-check | `npx tsc --noEmit` |
| UI tests (Playwright, mocked native bridge) | `npm run test:ui` |
| Core logic tests | `npm run test:core` |
| Native compile check | `npm run check:native` |
| Release exe + installer | `npm run bundle` → `src-tauri/target/release/` |

## Things that will bite you

- **One instance only.** The app uses a single-instance plugin: launching a
  second copy hands off to the running one and exits with code 0. To test a
  new build, stop the running Tabbar first (its process may be named after
  the exe file, not `tabbar`).
- **The dev server port.** `npm run test:ui` starts Vite on 1420 and fails if
  `npm run desktop` is already using it. Run the tests against a separate
  Vite on another port instead of reusing the dev server, whose HMR
  cache-busting breaks the tests' bridge mock.
- **Line endings.** Files are a mix of CRLF and LF. Preserve each file's
  existing endings when editing programmatically.
- **Shared state folder.** Dev and installed builds share one settings and
  WebView2 profile folder (`%APPDATA%\com.samya.sidebar.tauri`), so an older
  build silently drops settings fields it does not know. The legacy
  identifiers are kept on purpose so existing settings and logins carry over.
- **The page is a native view.** Each tab is a WebView2 child view drawn over
  the pane, so HTML in the pane cannot paint over the page area. Use
  `setPageHidden` (as the toolbar customizer does) or a native menu.
- **Docked windows refuse outside moves.** The ribbon and pane subclass
  `WM_WINDOWPOSCHANGING`; only moves wrapped in `native::own_move` (via
  `move_resize` / `move_pair`) go through. Move these windows only through
  those helpers.
- **The pane is a fixed frame.** The pane window stays at the maximum page
  width, anchored against the ribbon; the visible page is a window region
  (`shell::clip_pane`). Width changes move webviews and the region, never the
  window. Keep that when touching layout or the slide animation.

## Diagnosing native behaviour

Start the app with the `TABBAR_TRACE` environment variable set to log layout,
window moves, appbar reservations and window events, with millisecond
timestamps, to `%TEMP%\tabbar-trace.log` (see `src-tauri/src/trace.rs`).
While tracing is on, a second launch with `--trace-width=N` resizes the pane,
and `--trace-act={json}` runs one app action, so behaviour can be reproduced
without touching the mouse. Measure before guessing.

## Style

- The binder look lives in `src/binder.css` and is scoped to
  `html[data-tab-style="binder"]`. Its tunables are custom properties at the
  top of that file. The classic look in `src/App.css` must keep working
  without it.
- Comments explain why, not what. Keep the existing tone.
- Add a Playwright test in `tests/shell.spec.mjs` for UI behaviour you
  change; the mocked bridge records every native action in
  `window.testHost.actions`.
