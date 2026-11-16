import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { SidebarApi } from '../shared/api'
import {
  DEFAULT_APPEARANCE, TAB_STYLES, THEMES,
  type Appearance, type DownloadInfo, type PinnedSiteInfo, type Side, type TabInfo,
} from '../shared/types'

interface State {
  tabs: (Omit<TabInfo, 'isActive' | 'pinnedSiteId'> & { pinId?: string })[]
  active: number | null
  collapsed: boolean
  settings: { pins: PinnedSiteInfo[]; side: Side; keepOpen?: boolean; appearance?: Partial<Appearance> }
  downloads: DownloadInfo[]
  playerTarget: number | null
  fullscreen: boolean
}
const subscribers = new Set<(state: State) => void>()
let cached: State | undefined
/** The saved look, with anything this build does not know replaced by the default. */
function appearance(s: State): Appearance {
  const saved = s.settings.appearance
  return {
    theme: THEMES.find(t => t === saved?.theme) ?? DEFAULT_APPEARANCE.theme,
    tabStyle: TAB_STYLES.find(t => t === saved?.tabStyle) ?? DEFAULT_APPEARANCE.tabStyle,
  }
}
function accept(state: State) {
  cached = state
  const root = document.documentElement
  root.dataset.fullscreen = String(state.fullscreen)
  const look = appearance(state)
  root.dataset.theme = look.theme
  root.dataset.tabStyle = look.tabStyle
  subscribers.forEach(cb => cb(state))
}
const ready = listen<State>('browser-state', e => accept(e.payload))
  .then(async () => { if (!cached) accept(await invoke<State>('get_state')) })
const state = async () => { await ready; return cached! }
const tabs = (s: State): TabInfo[] => s.tabs.map(t => ({ ...t, isActive: s.active === t.id, pinnedSiteId: t.pinId ?? undefined }))
function subscribe<T>(pick: (s: State) => T, cb: (value: T) => void) {
  const handler = (s: State) => cb(pick(s))
  subscribers.add(handler)
  ready.then(() => { if (subscribers.has(handler) && cached) handler(cached) })
  return () => { subscribers.delete(handler) }
}
function event<T>(name: string, cb: (payload: T) => void) {
  let disposed = false
  const pending = listen<T>(name, e => { if (!disposed) cb(e.payload) })
  return () => { disposed = true; pending.then(unlisten => unlisten()) }
}
function error(reason: unknown) {
  console.error(reason)
  let banner = document.getElementById('native-error')
  if (!banner) { banner = document.createElement('button'); banner.id = 'native-error'; banner.setAttribute('role', 'alert'); banner.onclick = () => banner?.remove(); document.body.append(banner) }
  banner.textContent = String(reason)
}
event<string>('browser-error', error)
const act = (type: string, args: Record<string, unknown> = {}) => {
  void invoke('act', { action: { type, ...args } }).catch(error)
}
const query = <T>(kind: string, id?: number) => invoke<T>('query', { kind, id }).catch(reason => {
  // The player handles transport failures in context; never create a persistent
  // native-error banner or disguise a failed toggle as a successful result.
  if (kind === 'playPause' || kind === 'nextTrack' || kind === 'mute') throw reason
  if (kind !== 'preview' && kind !== 'media') error(reason)
  return (kind === 'mute' || kind === 'nextTrack' ? false : null) as T
})

const api: SidebarApi = {
  appearance: {
    get: async () => appearance(await state()),
    onChange: cb => {
      let last = ''
      return subscribe(appearance, look => {
        const key = `${look.theme}/${look.tabStyle}`
        if (key === last) return
        last = key
        cb(look)
      })
    },
    set: look => act('setAppearance', { theme: look.theme, tabStyle: look.tabStyle }),
  },
  shell: {
    commitPlacement: (x, y) => act('placement', { x, y }),
    setDragging: dragging => act('dragging', { dragging }),
    showContextMenu: (x, y) => act('menu', { x, y }),
    showShell: () => act('show'),
    showPlayer: (id, x, y, anchorX, anchorY, anchorWidth, anchorHeight) => act('showPlayer', { id, x, y, anchorX, anchorY, anchorWidth, anchorHeight, anchorTop: anchorY - window.screenY }),
    hidePlayer: () => act('hidePlayer'),
    keepPlayerOpen: () => act('keepPlayer'),
    playerReady: id => act('playerReady', { id }),
    resizePlayer: (height, width) => act('resizePlayer', { height, width }),
    openPlayerTarget: () => act('openPlayer'),
    getPlayerTarget: async () => (await state()).playerTarget,
    onPlayerTargetChange: cb => subscribe(s => s.playerTarget, cb),
  },
  tabs: {
    getState: async () => tabs(await state()),
    getPinnedSites: async () => (await state()).settings.pins,
    getCollapsed: async () => (await state()).collapsed,
    getSide: async () => (await state()).settings.side,
    onChange: cb => subscribe(tabs, cb),
    onPinnedSitesChange: cb => subscribe(s => s.settings.pins, cb),
    onCollapsedChange: cb => subscribe(s => s.collapsed, cb),
    onSideChange: cb => subscribe(s => s.settings.side, cb),
    onAddressFocusRequest: cb => event('focus-address', cb),
    showToolbarMenu: () => act('toolbarMenu'),
    onToolbarCommand: cb => event<string>('toolbar-command', cb),
    dispatch: action => { const { type, ...args } = action; act(type, args) },
    showContextMenu: (id, x, y) => act('menu', { id, x, y }),
    showPinnedContextMenu: (siteId, x, y) => act('menu', { siteId, x, y }),
    launchPinnedSite: siteId => act('launchPin', { siteId }),
    setPaneWidth: (width, live) => act('setWidth', { width, live: live === true }),
    setResizeGuide: width => act('resizeGuide', { width }),
    capturePreview: id => query('preview', id),
    getAudioInfo: id => query('media', id),
    togglePlayPause: id => query('playPause', id),
    nextTrack: id => query('nextTrack', id),
    toggleMute: id => query('mute', id),
    reorderPinned: (fromSiteId, toSiteId, before = true) => act('reorderPins', { fromSiteId, toSiteId, before }),
    openActiveInDefaultBrowser: () => act('openExternal'),
    pin: id => act('pin', { id }),
    unpin: siteId => act('unpin', { siteId }),
    toggleFullscreen: () => act('fullscreen'),
    getKeepOpen: async () => (await state()).settings.keepOpen === true,
    onKeepOpenChange: cb => subscribe(s => s.settings.keepOpen === true, cb),
    toggleKeepOpen: () => act('toggleKeepOpen'),
    setPageHidden: hidden => act('setPageHidden', { hidden }),
  },
  downloads: {
    getState: async () => (await state()).downloads,
    onChange: cb => subscribe(s => s.downloads, cb),
    togglePanel: (x, y) => act('downloadsPanel', { x, y }),
    closePanel: () => act('closeDownloads'),
    open: id => act('openDownload', { id }),
    showInFolder: id => act('revealDownload', { id }),
    cancel: id => act('cancelDownload', { id }),
    clearFinished: () => act('clearDownloads'),
  },
}
window.sidebarApi = api
