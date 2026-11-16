import type { TabInfo, TabAction, Side, PinnedSiteInfo, MediaPlayerInfo, DownloadInfo, Appearance } from './types'

export interface SidebarApi {
  /** Colour theme and tab shape, shared by every window. */
  appearance: {
    get: () => Promise<Appearance>
    onChange: (cb: (appearance: Appearance) => void) => () => void
    set: (appearance: Appearance) => void
  }
  /** Ribbon shell: snap-to-edge placement from a screen point (e.g. pointer release after drag). */
  shell: {
    commitPlacement: (screenX: number, screenY: number) => void
    /** While true, suspend auto-hide (e.g. during placement drag). */
    setDragging: (dragging: boolean) => void
    showContextMenu: (clientX: number, clientY: number) => void
    showShell: () => void
    showPlayer: (
      tabId: number,
      screenX: number,
      screenY: number,
      anchorX: number,
      anchorY: number,
      anchorWidth: number,
      anchorHeight: number,
    ) => void
    hidePlayer: () => void
    /** Brings up the pane with its Settings panel open. */
    openSettings: () => void
    keepPlayerOpen: () => void
    /** The player has drawn this tab's title and artwork and can be shown. */
    playerReady?: (tabId: number) => void
    /** Height follows the card; `width`, when given, follows the cover art. */
    resizePlayer: (height: number, width?: number) => void
    openPlayerTarget: () => void
    getPlayerTarget: () => Promise<number | null>
    onPlayerTargetChange: (cb: (tabId: number | null) => void) => () => void
  }
  tabs: {
    getState: () => Promise<TabInfo[]>
    getPinnedSites: () => Promise<PinnedSiteInfo[]>
    onChange: (cb: (tabs: TabInfo[]) => void) => () => void
    onPinnedSitesChange: (cb: (sites: PinnedSiteInfo[]) => void) => () => void
    onCollapsedChange: (cb: (collapsed: boolean) => void) => () => void
    onSideChange: (cb: (side: Side) => void) => () => void
    onAddressFocusRequest: (cb: () => void) => () => void
    /** Native right-click menu for the page's top bar. */
    showToolbarMenu?: () => void
    /** Commands from that menu the page carries out itself (copyLink, customize, settings). */
    onToolbarCommand?: (cb: (command: string) => void) => () => void
    getCollapsed: () => Promise<boolean>
    getSide: () => Promise<Side>
    dispatch: (action: TabAction) => void
    showContextMenu: (tabId: number, clientX?: number, clientY?: number) => void
    showPinnedContextMenu: (siteId: string, clientX?: number, clientY?: number) => void
    launchPinnedSite: (siteId: string) => void
    /** `live` marks a width sent mid-drag, which is applied but not saved. */
    setPaneWidth: (width: number, live?: boolean) => void
    /** Shows a guide line where the pane edge would land at `width`; null hides it. */
    setResizeGuide?: (width: number | null) => void
    capturePreview: (tabId: number) => Promise<string | null>
    getAudioInfo: (tabId: number) => Promise<MediaPlayerInfo | null>
    togglePlayPause: (tabId: number) => Promise<void>
    nextTrack: (tabId: number) => Promise<boolean>
    toggleMute: (tabId: number) => Promise<boolean>
    /** Native hosts may expose fullscreen without a keyboard shortcut. */
    toggleFullscreen?: () => void
    /** Whether the open page stays expanded when focus moves elsewhere. */
    getKeepOpen?: () => Promise<boolean>
    onKeepOpenChange?: (cb: (keepOpen: boolean) => void) => () => void
    toggleKeepOpen?: () => void
    /** Hide the native page view so an in-pane panel can use its space. */
    setPageHidden?: (hidden: boolean) => void
    reorderPinned: (fromSiteId: string, toSiteId: string, before?: boolean) => void
    /** Hands the active tab's URL to the OS browser (http/https only). */
    openActiveInDefaultBrowser: () => void
    /** Pins an open tab to the ribbon. */
    pin: (tabId: number) => void
    /** Removes a pinned site, returning its tab to the unpinned list. */
    unpin: (siteId: string) => void
  }
  downloads: {
    getState: () => Promise<DownloadInfo[]>
    onChange: (cb: (downloads: DownloadInfo[]) => void) => () => void
    /** Opens or closes the downloads popover, anchored at a screen point. */
    togglePanel: (screenX: number, screenY: number) => void
    closePanel: () => void
    open: (id: number) => void
    showInFolder: (id: number) => void
    cancel: (id: number) => void
    clearFinished: () => void
  }
}
