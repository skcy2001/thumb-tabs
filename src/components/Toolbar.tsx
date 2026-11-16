import React, { useState, useRef, useEffect } from 'react'
import type { DownloadInfo, TabInfo } from '../../shared/types'
import { TOOLBAR_BUTTONS, useToolbarButtons, type ToolbarButtonDef, type ToolbarButtonId, type ToolbarMode, type ToolbarModes } from './toolbarButtons'

import { SettingsPanel } from './SettingsPanel'

const HOME_URL = 'https://www.google.com/'

interface Props {
  activeTab: TabInfo | null
  collapsed: boolean
  focusRequest: number
  downloads: DownloadInfo[]
  onBack: () => void
  onForward: () => void
  onReload: () => void
  onNavigate: (url: string) => void
}

export function Toolbar({
  activeTab,
  collapsed,
  focusRequest,
  downloads,
  onBack,
  onForward,
  onReload,
  onNavigate,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [keepOpen, setKeepOpen] = useState(false)
  const [panel, setPanel] = useState<null | 'customize' | 'settings'>(null)
  const customizing = panel === 'customize'
  const setCustomizing = (open: boolean) => setPanel(open ? 'customize' : null)
  const urlRef = useRef<string | undefined>(undefined)
  urlRef.current = activeTab?.url

  // Commands from the native toolbar menu that the page carries out itself.
  useEffect(() => window.sidebarApi?.tabs.onToolbarCommand?.(command => {
    if (command === 'customize') setPanel('customize')
    if (command === 'settings') setPanel('settings')
    if (command === 'closePanel') setPanel(null)
    if (command === 'copyLink' && urlRef.current) {
      void navigator.clipboard?.writeText(urlRef.current).catch(() => {})
    }
  }), [])
  const { modes, setMode, reset } = useToolbarButtons()

  // The native page view sits over the pane below the toolbar; step it aside
  // while the customize or settings panel uses that space.
  useEffect(() => {
    if (collapsed) setPanel(null)
  }, [collapsed])
  const panelOpen = panel !== null
  useEffect(() => {
    window.sidebarApi?.tabs.setPageHidden?.(panelOpen)
    if (!panelOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanel(null) }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.sidebarApi?.tabs.setPageHidden?.(false)
    }
  }, [panelOpen])

  // Tells the ribbon, whose Settings button acts like a tab, when it is open.
  const settingsOpen = panel === 'settings'
  const settingsReported = useRef(false)
  useEffect(() => {
    if (settingsReported.current === settingsOpen) return
    settingsReported.current = settingsOpen
    window.sidebarApi?.shell.setSettingsOpen?.(settingsOpen)
  }, [settingsOpen])
  useEffect(() => {
    const tabs = window.sidebarApi?.tabs
    tabs?.getKeepOpen?.().then(setKeepOpen)
    return tabs?.onKeepOpenChange?.(setKeepOpen)
  }, [])
  const [inputVal, setInputVal] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingFocus = useRef(false)
  const lastAppliedFocusRequest = useRef(0)

  useEffect(() => {
    if (!editing) setInputVal(activeTab?.url ?? '')
  }, [activeTab?.url, editing])

  useEffect(() => {
    setEditing(false)
    setInputVal(activeTab?.url ?? '')
  }, [activeTab?.id])

  useEffect(() => {
    if (focusRequest === 0) return
    pendingFocus.current = true
    if (collapsed) return
    // Apply immediately when pane is visible.
    lastAppliedFocusRequest.current = focusRequest
    pendingFocus.current = false
    setInputVal('')
    setEditing(true)
  }, [collapsed, focusRequest])

  useEffect(() => {
    if (collapsed) return
    if (!pendingFocus.current) return
    // Apply after expand OR after tab creation finishes swapping activeTab.
    lastAppliedFocusRequest.current = focusRequest
    pendingFocus.current = false
    setInputVal('')
    setEditing(true)
  }, [collapsed])

  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing, focusRequest])

  useEffect(() => {
    // If we just requested focus (plus button), don't immediately cancel editing
    // due to the new activeTab swapping in.
    if (collapsed) {
      setEditing(false)
      setInputVal(activeTab?.url ?? '')
      return
    }
    if (pendingFocus.current) return
    if (lastAppliedFocusRequest.current === focusRequest && editing) return
    // When active tab changes via normal clicks, exit editing mode.
    setEditing(false)
    setInputVal(activeTab?.url ?? '')
  }, [activeTab?.id])

  const commit = () => {
    setEditing(false)
    if (inputVal.trim()) onNavigate(inputVal.trim())
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') { setEditing(false); setInputVal(activeTab?.url ?? '') }
  }

  const title = activeTab?.title?.trim() || displayUrl(activeTab?.url)
  const activeDownloads = downloads.filter(d => d.state === 'progressing' || d.state === 'paused')
  const downloadProgress = overallProgress(activeDownloads)

  const openDownloads = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    // Anchor just under the button, in screen coordinates.
    window.sidebarApi?.downloads.togglePanel(
      window.screenX + r.left + r.width / 2,
      window.screenY + r.bottom + 4,
    )
  }

  const api = window.sidebarApi?.tabs
  // A button is offered only where the host supports it.
  const available = (id: ToolbarButtonId) =>
    id === 'keepOpen' ? !!api?.toggleKeepOpen
    : id === 'fullscreen' ? !!api?.toggleFullscreen
    : true
  // "When needed": Pin open while the page is pinned, Downloads while there are any.
  const needed = (id: ToolbarButtonId) =>
    id === 'keepOpen' ? keepOpen : id === 'downloads' ? downloads.length > 0 : true
  const isShown = (b: ToolbarButtonDef) =>
    available(b.id) && (modes[b.id] === 'on' || (modes[b.id] === 'auto' && needed(b.id)))
  const navButtons = TOOLBAR_BUTTONS.filter(b => b.group === 'nav' && isShown(b))
  const cornerButtons = TOOLBAR_BUTTONS.filter(b => b.group === 'corner' && isShown(b))

  const renderButton = (b: ToolbarButtonDef) => {
    switch (b.id) {
      case 'back':
        return <button key={b.id} className="toolbar-btn" disabled={!activeTab?.canGoBack} onClick={onBack} title="Back" aria-label="Go back">{b.icon}</button>
      case 'forward':
        return <button key={b.id} className="toolbar-btn" disabled={!activeTab?.canGoForward} onClick={onForward} title="Forward" aria-label="Go forward">{b.icon}</button>
      case 'reload':
        return <button key={b.id} className="toolbar-btn" onClick={onReload} title="Reload" aria-label="Reload">{b.icon}</button>
      case 'home':
        return <button key={b.id} className="toolbar-btn" onClick={() => onNavigate(HOME_URL)} title="Home" aria-label="Home">{b.icon}</button>
      case 'keepOpen':
        return (
          <button key={b.id} className={`toolbar-btn keep-open-btn ${keepOpen ? 'active' : ''}`}
            onClick={() => api?.toggleKeepOpen?.()}
            title={keepOpen ? 'Unpin: collapse when you click elsewhere' : 'Pin open: stay open when you click elsewhere'}
            aria-label="Keep page open" aria-pressed={keepOpen}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill={keepOpen ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
              <path d="M6 2h4l-.6 4.2 2.6 2.3v1H4v-1l2.6-2.3Z" />
              <path d="M8 9.5V14" fill="none" />
            </svg>
          </button>
        )
      case 'fullscreen':
        return <button key={b.id} className="toolbar-btn" onClick={() => api?.toggleFullscreen?.()} title="Toggle fullscreen" aria-label="Toggle fullscreen">{b.icon}</button>
      case 'downloads':
        return (
          <button key={b.id} className={`toolbar-btn downloads-btn ${activeDownloads.length > 0 ? 'active' : ''}`}
            onClick={openDownloads}
            title={activeDownloads.length > 0 ? `${activeDownloads.length} downloading` : 'Downloads'}
            aria-label="Downloads">
            {b.icon}
            {downloadProgress !== null && (
              <span className="downloads-progress"
                style={{ '--p': `${Math.round(downloadProgress * 100)}%` } as React.CSSProperties}
                aria-hidden="true" />
            )}
          </button>
        )
      case 'copyLink':
        return <button key={b.id} className="toolbar-btn" disabled={!activeTab?.url}
          onClick={() => { if (activeTab?.url) void navigator.clipboard?.writeText(activeTab.url).catch(() => {}) }}
          title="Copy link" aria-label="Copy link">{b.icon}</button>
      case 'newTab':
        return <button key={b.id} className="toolbar-btn" onClick={() => api?.dispatch({ type: 'create' })} title="New tab" aria-label="New tab">{b.icon}</button>
      case 'closeTab':
        return <button key={b.id} className="toolbar-btn" disabled={!activeTab}
          onClick={() => { if (activeTab) api?.dispatch({ type: 'close', id: activeTab.id }) }}
          title="Close tab" aria-label="Close tab">{b.icon}</button>
      case 'openExternal':
        return <button key={b.id} className="toolbar-btn open-external-btn" disabled={!isWebUrl(activeTab?.url)}
          onClick={() => api?.openActiveInDefaultBrowser()}
          title="Open in default browser" aria-label="Open in default browser">{b.icon}</button>
    }
  }

  // Right-click: the native menu (close, copy link, fullscreen, open in
  // browser, pin open, customize). Hosts without one open the customizer.
  const openMenu = (e: React.MouseEvent) => {
    // Keep the normal text menu in the address field.
    if (e.target instanceof HTMLInputElement) return
    e.preventDefault()
    if (api?.showToolbarMenu) api.showToolbarMenu()
    else setCustomizing(true)
  }

  return (
    <div className={`toolbar ${editing ? 'editing' : ''}`}
      style={{ '--corner-w': `${cornerButtons.length * 30 + 6}px` } as React.CSSProperties}
      onContextMenu={openMenu}>
      {!collapsed && (
        <>
          <div className="toolbar-title" title={title}>
            {title}
          </div>

          <div className="toolbar-controls">
            {navButtons.map(renderButton)}

            <div className="url-bar-wrap">
              {editing ? (
                <input
                  ref={inputRef}
                  className="url-input"
                  value={inputVal}
                  onChange={e => setInputVal(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={commit}
                  spellCheck={false}
                  autoFocus
                />
              ) : (
                <button
                  className="url-display"
                  onClick={() => {
                    setInputVal(activeTab?.url ?? '')
                    setEditing(true)
                    setTimeout(() => inputRef.current?.select(), 10)
                  }}
                  title={activeTab?.url}
                >
                  <span className="url-text">{displayUrl(activeTab?.url)}</span>
                </button>
              )}
            </div>
          </div>

          {/* Outside .toolbar-controls: that container is hidden until hover, and
              these need to stay visible. */}
          <div className="toolbar-corner">
            {cornerButtons.map(renderButton)}
          </div>

          {customizing && (
            <ToolbarCustomizer modes={modes} onChange={setMode} onReset={reset} onClose={() => setCustomizing(false)} />
          )}
          {panel === 'settings' && <SettingsPanel onClose={() => setPanel(null)} />}
        </>
      )}
    </div>
  )
}

/**
 * Full-pane panel for choosing toolbar buttons: grouped rows with icon, name,
 * description and a switch. Opens from a right-click on the toolbar.
 */
function ToolbarCustomizer({ modes, onChange, onReset, onClose }: {
  modes: ToolbarModes
  onChange: (id: ToolbarButtonId, mode: ToolbarMode) => void
  onReset: () => void
  onClose: () => void
}) {
  const groups: { key: ToolbarButtonDef['group']; title: string; hint: string }[] = [
    { key: 'nav', title: 'Navigation', hint: 'Next to the address bar, shown when you hover the toolbar' },
    { key: 'corner', title: 'Always visible', hint: 'At the right end of the toolbar' },
  ]
  return (
    <div className="toolbar-customizer" role="dialog" aria-label="Customize toolbar" onContextMenu={e => e.stopPropagation()}>
      <div className="customizer-head">
        <span className="customizer-title">Customize toolbar</span>
        <button className="customizer-done" type="button" onClick={onClose}>Done</button>
      </div>
      <div className="customizer-body">
        {groups.map(g => (
          <section key={g.key} className="customizer-group">
            <h3>{g.title}</h3>
            <p className="customizer-hint">{g.hint}</p>
            {TOOLBAR_BUTTONS.filter(b => b.group === g.key).map(b => (
              <CustomizerRow key={b.id} button={b} mode={modes[b.id]} onChange={mode => onChange(b.id, mode)} />
            ))}
          </section>
        ))}
      </div>
      <div className="customizer-foot">
        <button className="customizer-reset" type="button" onClick={onReset}>Reset to default</button>
      </div>
    </div>
  )
}

const MODE_LABEL: Record<ToolbarMode, string> = { off: 'Hidden', auto: 'When needed', on: 'Always' }

/**
 * One button's row. Buttons with a "when needed" setting get a three-stop
 * slider (Hidden, When needed, Always); the rest an on/off switch. The current
 * setting is spelled out beside the control when the row has room.
 */
function CustomizerRow({ button: b, mode, onChange }: {
  button: ToolbarButtonDef
  mode: ToolbarMode
  onChange: (mode: ToolbarMode) => void
}) {
  const stops: ToolbarMode[] = b.auto ? ['off', 'auto', 'on'] : ['off', 'on']
  const description = mode === 'auto' && b.auto ? b.auto : b.description
  return (
    <div className={`customizer-row mode-${mode}`}>
      <span className="customizer-icon" aria-hidden="true">{b.icon}</span>
      <span className="customizer-text">
        <span className="customizer-name">{b.label}</span>
        <span className="customizer-desc">{description}</span>
      </span>
      {b.auto ? (
        <input
          type="range"
          className="customizer-slider"
          min={0}
          max={2}
          step={1}
          value={stops.indexOf(mode)}
          onChange={e => onChange(stops[Number(e.target.value)])}
          aria-label={b.label}
          aria-valuetext={MODE_LABEL[mode]}
        />
      ) : (
        <input
          type="checkbox"
          role="switch"
          className="customizer-switch"
          checked={mode === 'on'}
          onChange={e => onChange(e.target.checked ? 'on' : 'off')}
          aria-label={b.label}
        />
      )}
      <span className="customizer-state" aria-hidden="true">{MODE_LABEL[mode]}</span>
    </div>
  )
}

/** Combined 0..1 progress across in-flight downloads, or null when unknowable. */
function overallProgress(active: DownloadInfo[]): number | null {
  if (active.length === 0) return null
  const total = active.reduce((sum, d) => sum + d.totalBytes, 0)
  if (total <= 0) return null
  const received = active.reduce((sum, d) => sum + d.receivedBytes, 0)
  return Math.min(1, received / total)
}

/** Only http(s) pages can meaningfully be handed to the OS browser. */
function isWebUrl(url?: string): boolean {
  if (!url) return false
  try {
    const protocol = new URL(url).protocol
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

function displayUrl(url?: string) {
  if (!url) return 'about:blank'
  try {
    const u = new URL(url)
    return u.hostname + (u.pathname !== '/' ? u.pathname : '')
  } catch {
    return url
  }
}
