import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { binderShape, binderShapeIds } from '../binderShapes'
import { BACKGROUNDS, THEMES, type BackgroundId, type BinderShapeId, type ThemeId } from '../../shared/types'
import { useAppearance } from '../state/useAppearance'
import { APP_NAME, APP_VERSION, AUTHOR, COFFEE_URL, REPO_URL } from '../about'
import logo from '../../src-tauri/icons/thumbtab.svg'

const THEME_LABEL: Record<ThemeId, string> = {
  cocoa: 'Cocoa',
  midnight: 'Midnight',
  graphite: 'Graphite',
  forest: 'Forest',
  lagoon: 'Lagoon',
  sunset: 'Sunset',
  dracula: 'Dracula',
  contrast: 'High contrast',
}

const BACKGROUND_LABEL: Record<BackgroundId, string> = {
  solid: 'Solid',
  transparent: 'Transparent',
  sand: 'Glitter sand',
}

/** The slider each background offers, if any: what it sets and what it is called. */
const BACKGROUND_AMOUNT: Partial<Record<BackgroundId, { key: 'transparency' | 'glitter'; label: string }>> = {
  transparent: { key: 'transparency', label: 'Transparency' },
  sand: { key: 'glitter', label: 'Glitter brightness' },
}

const BINDER_LABEL: Record<BinderShapeId, string> = {
  wave: 'Wave',
  chamfer: 'Chamfer',
  rounded: 'Rounded',
  cove: 'Cove',
  trapezoid: 'Trapezoid',
  'wave-square': 'Square wave',
  'chamfer-square': 'Square chamfer',
  'rounded-square': 'Square rounded',
  'cove-square': 'Square cove',
}

type BasicStyle = 'classic' | 'chrome' | 'light'
const BASIC_LABEL: Record<BasicStyle, string> = { classic: 'Classic', chrome: 'Chrome', light: 'Light' }

/** A miniature ribbon in a flat tab shape, drawn in the current theme's colours. */
function TabStylePreview({ style }: { style: BasicStyle }) {
  // The middle tab is selected; it and the top one are open; the bottom one is closed.
  const tab = (y: number, active: boolean, open: boolean) => (
    <g key={y}>
      {active && style === 'classic' && <rect x="0" y={y + 6} width="3" height="16" rx="1.5" fill="var(--accent)" />}
      {active && style === 'chrome' && <rect x="4" y={y + 2} width="26" height="24" rx="8" fill="var(--bg-active)" />}
      <circle cx="17" cy={y + 14} r="5" fill="var(--text-secondary)" />
      {open && style !== 'light' && <circle cx="17" cy={y + 24} r="1.3" fill="var(--text-secondary)" />}
      {open && style === 'light' && <circle cx="28" cy={y + 24} r="1.8" fill={active ? 'var(--accent)' : 'var(--text-secondary)'} />}
    </g>
  )
  return (
    <svg className="tab-style-preview" viewBox="0 0 34 100" width="34" height="100" aria-hidden="true">
      <rect width="34" height="100" rx="4" fill="var(--bg-strip)" />
      {[6, 36, 66].map((y, i) => tab(y, i === 1, i <= 1))}
    </svg>
  )
}

/** One binder tab at the size it has in the ribbon, so the outline reads true. */
function BinderPreview({ id, divider }: { id: BinderShapeId; divider: number }) {
  return (
    <span className="binder-frame" aria-hidden="true">
      <span className="binder-swatch" data-divider={divider} data-shape={id} style={{ clipPath: binderShape(id, 'right') }}>
        <span className="binder-swatch-logo" />
      </span>
    </span>
  )
}

export type SettingsPage = 'menu' | 'appearance' | 'about'

const PAGE_TITLE: Record<SettingsPage, string> = { menu: 'Settings', appearance: 'Appearance', about: 'About' }

const SETTINGS_URL = 'thumb-tabs://settings'

/** The address the toolbar shows for a settings page. */
export function settingsUrl(page: SettingsPage): string {
  return page === 'menu' ? SETTINGS_URL : `${SETTINGS_URL}/${page}`
}

/** The settings page an address names (any case, trailing slash allowed), or null. */
export function parseSettingsUrl(url: string): SettingsPage | null {
  const m = /^thumb-tabs:\/\/settings(?:\/(appearance|about))?\/?$/i.exec(url.trim())
  if (!m) return null
  return (m[1]?.toLowerCase() as SettingsPage | undefined) ?? 'menu'
}

/**
 * Settings as a page of its own, thumb-tabs://settings: a short menu of
 * sections, Appearance (thumb-tabs://settings/appearance) and About
 * (thumb-tabs://settings/about). It takes
 * the place of the web page below the toolbar, which shows its title and
 * address; you leave it like any page, by picking a tab or going somewhere
 * else. Opens from the ribbon's Settings button or its right-click menu.
 */
export function SettingsPanel({ page, onPageChange: setPage }: {
  page: SettingsPage
  onPageChange: (page: SettingsPage) => void
}) {
  const title = PAGE_TITLE[page]
  // Each page comes back scrolled where you left it, even after Settings closes.
  const body = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (body.current) body.current.scrollTop = remembered.scroll[page]
  }, [page])

  return (
    <div className="toolbar-customizer settings-panel" role="main" aria-label={title} onContextMenu={e => e.stopPropagation()}>
      <div className="customizer-head">
        <span className="settings-heading">
          {page !== 'menu' && (
            <button className="settings-back" type="button" onClick={() => setPage('menu')} aria-label="Back to settings" title="Back">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 3 5 8l5 5" />
              </svg>
            </button>
          )}
          <span className="customizer-title">{title}</span>
        </span>
      </div>
      <div className="customizer-body" ref={body} onScroll={e => { remembered.scroll[page] = e.currentTarget.scrollTop }}>
        {page === 'menu' ? (
          <>
            <MenuItem label="Appearance" onOpen={() => setPage('appearance')}>
              <path d="M8 2a6 6 0 1 0 0 12c1 0 1.5-.7 1.5-1.4 0-.9-.7-1.1-.7-1.9 0-.7.6-1.2 1.4-1.2H12a2 2 0 0 0 2-2c0-3-2.7-5.5-6-5.5Z" />
              <circle cx="5" cy="7.5" r=".7" fill="currentColor" />
              <circle cx="8" cy="5" r=".7" fill="currentColor" />
              <circle cx="11" cy="7" r=".7" fill="currentColor" />
            </MenuItem>
            <MenuItem label="About" onOpen={() => setPage('about')}>
              <circle cx="8" cy="8" r="6" />
              <path d="M8 7.2v3.6" />
              <circle cx="8" cy="5" r=".7" fill="currentColor" />
            </MenuItem>
          </>
        ) : page === 'appearance' ? (
          <AppearancePage />
        ) : (
          <AboutPage />
        )}
      </div>
    </div>
  )
}

/** One row of the Settings menu: an icon (SVG children), a name and a chevron. */
function MenuItem({ label, onOpen, children }: { label: string; onOpen: () => void; children: ReactNode }) {
  return (
    <button className="settings-item" type="button" onClick={onOpen}>
      <span className="customizer-icon" aria-hidden="true">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          {children}
        </svg>
      </span>
      <span className="customizer-text">
        <span className="customizer-name">{label}</span>
      </span>
      <span className="settings-chevron" aria-hidden="true">›</span>
    </button>
  )
}

/** Who made the app, its version, where its code lives, and a way to say thanks. */
function AboutPage() {
  const open = (url: string) => window.sidebarApi?.tabs.openLink?.(url)
  return (
    <section className="about-page">
      <img className="about-logo" src={logo} alt="" aria-hidden="true" />
      <h3 className="about-name">{APP_NAME}</h3>
      <p className="about-version">Version {APP_VERSION}</p>
      <p className="about-author">Made by {AUTHOR}</p>
      <div className="about-actions">
        {COFFEE_URL && (
          <button className="about-button about-coffee" type="button" onClick={() => open(COFFEE_URL)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2.5 6h9v4a3.5 3.5 0 0 1-3.5 3.5H6A3.5 3.5 0 0 1 2.5 10Z" />
              <path d="M11.5 7h1a1.75 1.75 0 0 1 0 3.5h-1.1" />
              <path d="M5.5 2.5c-.4.6.4 1 0 1.6M8.5 2.5c-.4.6.4 1 0 1.6" />
            </svg>
            Buy me a coffee
          </button>
        )}
        <button className="about-button" type="button" onClick={() => open(REPO_URL)}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 1a7 7 0 0 0-2.2 13.6c.35.07.48-.15.48-.33v-1.2c-1.95.42-2.36-.94-2.36-.94-.32-.81-.78-1.03-.78-1.03-.64-.43.05-.42.05-.42.7.05 1.07.72 1.07.72.62 1.07 1.64.76 2.04.58.06-.45.24-.76.44-.94-1.56-.18-3.2-.78-3.2-3.47 0-.77.27-1.4.72-1.89-.07-.18-.31-.9.07-1.86 0 0 .59-.19 1.93.72a6.6 6.6 0 0 1 3.5 0c1.34-.91 1.93-.72 1.93-.72.38.97.14 1.68.07 1.86.45.5.72 1.12.72 1.89 0 2.7-1.65 3.29-3.21 3.46.25.22.48.65.48 1.3v1.93c0 .19.13.41.48.34A7 7 0 0 0 8 1Z" />
          </svg>
          View on GitHub
        </button>
      </div>
    </section>
  )
}

/** What Settings keeps between visits while the app runs: scroll and folded groups. */
const remembered = {
  scroll: { menu: 0, appearance: 0, about: 0 } as Record<SettingsPage, number>,
  open: { basic: true, binder: true },
}

function AppearancePage() {
  const [appearance, update] = useAppearance()
  // Both groups start open; either can be folded away, and stays so.
  const [open, setOpenState] = useState(remembered.open)
  const setOpen = (next: (o: typeof open) => typeof open) =>
    setOpenState(o => (remembered.open = next(o)))
  return (
    <>
      <Choices title="Theme">
        {THEMES.map(id => (
          <Choice key={id} selected={appearance.theme === id} label={THEME_LABEL[id]} onSelect={() => update({ theme: id })}>
            <span className="theme-swatch" data-theme={id} aria-hidden="true">
              <span className="theme-swatch-strip" />
              <span className="theme-swatch-bar" />
              <span className="theme-swatch-dot" />
            </span>
          </Choice>
        ))}
      </Choices>
      <Choices title="Background">
        {BACKGROUNDS.map(id => (
          <Choice key={id} selected={appearance.background === id} label={BACKGROUND_LABEL[id]} onSelect={() => update({ background: id })}>
            <span className="background-swatch" data-background={id} data-theme={appearance.theme} aria-hidden="true">
              <span className="background-swatch-strip" />
            </span>
          </Choice>
        ))}
      </Choices>
      <AmountSlider
        setting={BACKGROUND_AMOUNT[appearance.background]}
        value={(s => (s ? appearance[s.key] : 0))(BACKGROUND_AMOUNT[appearance.background])}
        onChange={(key, value) => update({ [key]: value })}
      />
      <section className="customizer-group">
        <h3>Tab shape</h3>
        <Subsection title="Basic" open={open.basic} onToggle={() => setOpen(o => ({ ...o, basic: !o.basic }))}>
          {(['classic', 'chrome', 'light'] as const).map(id => (
            <Choice
              key={id}
              selected={appearance.tabStyle === id}
              label={BASIC_LABEL[id]}
              onSelect={() => update({ tabStyle: id })}
            >
              <span className="tab-style-frame" data-theme={appearance.theme}><TabStylePreview style={id} /></span>
            </Choice>
          ))}
        </Subsection>
        <Subsection title="Binder" open={open.binder} onToggle={() => setOpen(o => ({ ...o, binder: !o.binder }))}>
          {binderShapeIds().map((id, i) => (
            <Choice
              key={id}
              selected={appearance.tabStyle === 'binder' && appearance.binderShape === id}
              label={BINDER_LABEL[id]}
              onSelect={() => update({ tabStyle: 'binder', binderShape: id })}
            >
              <span className="tab-style-frame binder-card-frame" data-theme={appearance.theme}>
                <BinderPreview id={id} divider={i % 6} />
              </span>
            </Choice>
          ))}
        </Subsection>
      </section>
    </>
  )
}

/** The chosen background's one adjustment, as a 0 to 100% slider. */
function AmountSlider({ setting, value, onChange }: {
  setting?: { key: 'transparency' | 'glitter'; label: string }
  value: number
  onChange: (key: 'transparency' | 'glitter', value: number) => void
}) {
  // While you drag, the slider follows the pointer from its own state; the
  // saved value only catches up through the app, and an older one arriving
  // mid-drag must not pull the thumb back. Changes go out at most every 33ms,
  // plus the final value when you let go.
  const [draft, setDraft] = useState<number | null>(null)
  const pending = useRef<number | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const flush = () => {
    window.clearTimeout(timer.current)
    timer.current = undefined
    if (setting && pending.current !== null) onChange(setting.key, pending.current)
    pending.current = null
  }
  const release = () => {
    flush()
    // Let the saved value arrive before the slider goes back to showing it.
    window.setTimeout(() => setDraft(null), 400)
  }
  useEffect(() => () => window.clearTimeout(timer.current), [])
  if (!setting) return null
  const percent = Math.round((draft ?? value) * 100)
  return (
    <label className="amount-slider">
      <span className="amount-slider-label">{setting.label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        aria-label={setting.label}
        onChange={e => {
          const next = Number(e.target.value) / 100
          setDraft(next)
          pending.current = next
          if (timer.current === undefined) timer.current = window.setTimeout(flush, 33)
        }}
        onPointerUp={release}
        onKeyUp={release}
        onBlur={release}
      />
      <span className="amount-slider-value">{percent}%</span>
    </label>
  )
}

function Choices({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="customizer-group">
      <h3>{title}</h3>
      <div className="choice-grid" role="radiogroup" aria-label={title}>{children}</div>
    </section>
  )
}

/** A collapsible group of choices inside a section. */
function Subsection({ title, open, onToggle, children }: {
  title: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="choice-section">
      <button className="choice-section-toggle" type="button" aria-expanded={open} onClick={onToggle}>
        <span className="choice-section-chevron" aria-hidden="true">›</span>
        {title}
      </button>
      {open && <div className="choice-grid choice-grid-narrow" role="radiogroup" aria-label={`${title} tab shapes`}>{children}</div>}
    </div>
  )
}

function Choice({ selected, label, onSelect, children }: {
  selected: boolean
  label: string
  onSelect: () => void
  children: ReactNode
}) {
  return (
    <button className={`choice ${selected ? 'selected' : ''}`} type="button" role="radio" aria-checked={selected} onClick={onSelect}>
      {children}
      <span className="choice-label">{label}</span>
    </button>
  )
}
