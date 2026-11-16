import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Buttons the page toolbar can show. "nav" buttons sit with the address bar
 * and appear on hover; "corner" buttons stay visible at the right. The user
 * picks which appear in the toolbar's customize panel.
 */
export type ToolbarButtonId =
  | 'back'
  | 'forward'
  | 'reload'
  | 'home'
  | 'keepOpen'
  | 'fullscreen'
  | 'downloads'
  | 'copyLink'
  | 'newTab'
  | 'closeTab'
  | 'openExternal'

/** Off, shown only when it applies ("auto"), or always on. */
export type ToolbarMode = 'off' | 'auto' | 'on'

export interface ToolbarButtonDef {
  id: ToolbarButtonId
  group: 'nav' | 'corner'
  label: string
  description: string
  /** Buttons with a "when needed" setting, and what that means for them. */
  auto?: string
  icon: ReactNode
}

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export const TOOLBAR_BUTTONS: ToolbarButtonDef[] = [
  { id: 'back', group: 'nav', label: 'Back', description: 'Go to the previous page',
    icon: <svg width="14" height="14" viewBox="0 0 16 16" {...stroke} strokeWidth={1.8}><path d="M11 2 5 8l6 6" /></svg> },
  { id: 'forward', group: 'nav', label: 'Forward', description: 'Go to the next page',
    icon: <svg width="14" height="14" viewBox="0 0 16 16" {...stroke} strokeWidth={1.8}><path d="M5 2l6 6-6 6" /></svg> },
  { id: 'reload', group: 'nav', label: 'Reload', description: 'Load the page again',
    icon: <svg width="14" height="14" viewBox="0 0 16 16" {...stroke}><path d="M13.5 2.5A6.5 6.5 0 1 1 7 1.5" /><path d="M7 1.5V5l2.5-2L7 1.5Z" fill="currentColor" stroke="none" /></svg> },
  { id: 'home', group: 'nav', label: 'Home', description: 'Go to Google',
    icon: <svg width="14" height="14" viewBox="0 0 16 16" {...stroke}><path d="M2.5 7.5 8 3l5.5 4.5" /><path d="M4 6.5V13h3V9.5h2V13h3V6.5" /></svg> },
  { id: 'keepOpen', group: 'corner', label: 'Pin open', description: 'Keep the page open when you click elsewhere',
    auto: 'Only while the page is pinned open',
    icon: <svg width="14" height="14" viewBox="0 0 16 16" {...stroke} strokeWidth={1.4}><path d="M6 2h4l-.6 4.2 2.6 2.3v1H4v-1l2.6-2.3Z" /><path d="M8 9.5V14" /></svg> },
  { id: 'fullscreen', group: 'corner', label: 'Fullscreen', description: 'Fill the whole screen with the page',
    icon: <svg width="14" height="14" viewBox="0 0 16 16" {...stroke} strokeWidth={1.5}><path d="M6 2H2v4m8-4h4v4M2 10v4h4m8-4v4h-4" /></svg> },
  { id: 'downloads', group: 'corner', label: 'Downloads', description: 'Show your downloads',
    auto: 'Only while there are downloads',
    icon: <svg width="14" height="14" viewBox="0 0 16 16" {...stroke}><path d="M8 2v8" /><path d="M4.5 7 8 10.5 11.5 7" /><path d="M2.5 13h11" /></svg> },
  { id: 'copyLink', group: 'corner', label: 'Copy link', description: "Copy the page's address",
    icon: <svg width="14" height="14" viewBox="0 0 16 16" {...stroke}><path d="M6.5 9.5a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-.8.8" /><path d="M9.5 6.5a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l.8-.8" /></svg> },
  { id: 'newTab', group: 'corner', label: 'New tab', description: 'Open a new tab',
    icon: <svg width="14" height="14" viewBox="0 0 16 16" {...stroke}><path d="M8 3v10M3 8h10" /></svg> },
  { id: 'closeTab', group: 'corner', label: 'Close tab', description: 'Close this tab',
    icon: <svg width="14" height="14" viewBox="0 0 16 16" {...stroke}><path d="M4 4l8 8M12 4l-8 8" /></svg> },
  { id: 'openExternal', group: 'corner', label: 'Open in browser', description: 'Open the page in your default browser',
    icon: <svg width="14" height="14" viewBox="0 0 16 16" {...stroke}><path d="M9 2.5h4.5V7" /><path d="M13.5 2.5 7.5 8.5" /><path d="M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3" /></svg> },
]

export type ToolbarModes = Record<ToolbarButtonId, ToolbarMode>

export const DEFAULT_TOOLBAR: ToolbarModes = {
  back: 'on',
  forward: 'on',
  reload: 'on',
  home: 'off',
  keepOpen: 'on',
  fullscreen: 'on',
  downloads: 'auto',
  copyLink: 'off',
  newTab: 'off',
  closeTab: 'off',
  openExternal: 'on',
}

const STORAGE_KEY = 'tabbar.toolbar.v2'
const OLD_KEY = 'tabbar.toolbar.v1'

function load(): ToolbarModes {
  const modes = { ...DEFAULT_TOOLBAR }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Record<string, unknown>
      for (const b of TOOLBAR_BUTTONS) {
        const m = saved[b.id]
        if (m === 'on' || m === 'off' || (m === 'auto' && b.auto)) modes[b.id] = m
      }
      return modes
    }
    // The first version saved a plain list of shown buttons.
    const old = localStorage.getItem(OLD_KEY)
    if (old) {
      const list = JSON.parse(old) as unknown[]
      for (const b of TOOLBAR_BUTTONS) {
        modes[b.id] = list.includes(b.id) ? (b.id === 'downloads' ? 'auto' : 'on') : 'off'
      }
    }
  } catch {
    /* unreadable: defaults */
  }
  return modes
}

/** The toolbar's chosen button modes, saved in this window's storage. */
export function useToolbarButtons() {
  const [modes, setModes] = useState<ToolbarModes>(load)
  const save = useCallback((next: ToolbarModes) => {
    setModes(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* storage unavailable: the choice lasts until the window reloads */
    }
  }, [])
  const setMode = useCallback((id: ToolbarButtonId, mode: ToolbarMode) => {
    save({ ...modes, [id]: mode })
  }, [modes, save])
  const reset = useCallback(() => save({ ...DEFAULT_TOOLBAR }), [save])
  return { modes, setMode, reset }
}
