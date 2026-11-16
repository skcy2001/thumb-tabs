# Index

A map of the repository. Start with [README.md](README.md) for what Thumb Tabs
is and how to run it, and [AGENTS.md](AGENTS.md) for working on the code.

## Documents

| File | What it covers |
| --- | --- |
| [README.md](README.md) | Features, notifications, build, tests, data migration |
| [AGENTS.md](AGENTS.md) | Guidance for coding agents: commands, pitfalls, tracing |
| [LICENSE](LICENSE) | MIT licence |

## Frontend: `src/`

| Path | Role |
| --- | --- |
| [src/main.tsx](src/main.tsx) | Entry; installs the bridge, picks the window's shell from `?role=`, sets the tab style |
| [src/bridge.ts](src/bridge.ts) | Implements `sidebarApi` over Tauri `invoke` and events |
| [src/App.tsx](src/App.tsx) | Ribbon, pane, downloads and edge shells |
| [src/components/TabStrip.tsx](src/components/TabStrip.tsx) | The ribbon: tabs, pinned sites, reordering, divider colours |
| [src/components/Toolbar.tsx](src/components/Toolbar.tsx) | Pane toolbar, right-click menu, toolbar customizer |
| [src/components/toolbarButtons.tsx](src/components/toolbarButtons.tsx) | Toolbar button registry and saved modes |
| [src/components/PaneResizeHandle.tsx](src/components/PaneResizeHandle.tsx) | Dragging the pane's outer edge |
| [src/components/PlayerPreview.tsx](src/components/PlayerPreview.tsx) | Media preview card |
| [src/components/faviconColor.ts](src/components/faviconColor.ts) | Tab colours from favicon mean colour |
| [src/state/useTabs.ts](src/state/useTabs.ts) | Tab state hook over the native bridge |
| [src/index.css](src/index.css) | Theme tokens (colours, ribbon width) |
| [src/App.css](src/App.css) | Classic layout and components |
| [src/binder.css](src/binder.css) | Binder tab style (shape, overlap, colours) |
| [src/customizer.css](src/customizer.css) | Toolbar customizer panel |
| [src/native.css](src/native.css) | Styles specific to the native shell |
| [shared/](shared/) | Types and the `sidebarApi` bridge contract |

## Native: `src-tauri/` and `core/`

| Path | Role |
| --- | --- |
| [src-tauri/src/main.rs](src-tauri/src/main.rs) | App setup, the action handler (`apply`), menus, tabs |
| [src-tauri/src/shell.rs](src-tauri/src/shell.rs) | Window layout, docking, slide animation, player, guide |
| [src-tauri/src/native.rs](src-tauri/src/native.rs) | Win32/WebView2: appbar, regions, window moves, popups |
| [src-tauri/src/notifications.rs](src-tauri/src/notifications.rs) | Notification permission and Windows toasts |
| [src-tauri/src/trace.rs](src-tauri/src/trace.rs) | Opt-in timing trace (`TABBAR_TRACE`) |
| [core/src/lib.rs](core/src/lib.rs) | Platform-free logic: settings, URLs, unread parsing, slide maths |
| [src-tauri/icons/](src-tauri/icons/) | App icons; `thumbtab.svg` is the source logo |
| [tests/](tests/) | Playwright UI tests with a mocked native bridge |
| [scripts/](scripts/) | Notification smoke test and Electron session import helper |
