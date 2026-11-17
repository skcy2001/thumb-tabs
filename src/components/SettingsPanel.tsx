import { useState } from 'react'
import type { ReactNode } from 'react'
import { binderShape, binderShapeIds } from '../binderShapes'
import { THEMES, type BinderShapeId, type ThemeId } from '../../shared/types'
import { useAppearance } from '../state/useAppearance'

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

const BINDER_LABEL: Record<BinderShapeId, string> = {
  wave: 'Wave',
  chamfer: 'Chamfer',
  rounded: 'Rounded',
  cove: 'Cove',
  trapezoid: 'Trapezoid',
}

/** A miniature ribbon in a flat tab shape, drawn in the current theme's colours. */
function TabStylePreview({ style }: { style: 'classic' | 'chrome' }) {
  const tab = (y: number, active: boolean) => (
    <g key={y}>
      {active && style === 'classic' && <rect x="0" y={y + 6} width="3" height="16" rx="1.5" fill="var(--accent)" />}
      {active && style === 'chrome' && <rect x="4" y={y + 2} width="26" height="24" rx="8" fill="var(--bg-active)" />}
      <circle cx="17" cy={y + 14} r="5" fill="var(--text-secondary)" />
    </g>
  )
  return (
    <svg className="tab-style-preview" viewBox="0 0 34 100" width="34" height="100" aria-hidden="true">
      <rect width="34" height="100" rx="4" fill="var(--bg-strip)" />
      {[6, 36, 66].map((y, i) => tab(y, i === 1))}
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

type Page = 'menu' | 'appearance'

/**
 * Full-pane settings: a short menu of sections, today just Appearance. Opens
 * from the Settings button at the bottom of the ribbon, over the same space
 * the toolbar customizer uses.
 */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState<Page>('menu')
  const title = page === 'menu' ? 'Settings' : 'Appearance'

  return (
    <div className="toolbar-customizer settings-panel" role="dialog" aria-label="Settings" onContextMenu={e => e.stopPropagation()}>
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
        <button className="customizer-done" type="button" onClick={onClose}>Done</button>
      </div>
      <div className="customizer-body">
        {page === 'menu' ? (
          <button className="settings-item" type="button" onClick={() => setPage('appearance')}>
            <span className="customizer-icon" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 2a6 6 0 1 0 0 12c1 0 1.5-.7 1.5-1.4 0-.9-.7-1.1-.7-1.9 0-.7.6-1.2 1.4-1.2H12a2 2 0 0 0 2-2c0-3-2.7-5.5-6-5.5Z" />
                <circle cx="5" cy="7.5" r=".7" fill="currentColor" />
                <circle cx="8" cy="5" r=".7" fill="currentColor" />
                <circle cx="11" cy="7" r=".7" fill="currentColor" />
              </svg>
            </span>
            <span className="customizer-text">
              <span className="customizer-name">Appearance</span>
            </span>
            <span className="settings-chevron" aria-hidden="true">›</span>
          </button>
        ) : (
          <AppearancePage />
        )}
      </div>
    </div>
  )
}

function AppearancePage() {
  const [appearance, update] = useAppearance()
  // The group holding the current shape starts open; the other can be expanded.
  const [open, setOpen] = useState({ basic: appearance.tabStyle !== 'binder', binder: appearance.tabStyle === 'binder' })
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
      <section className="customizer-group">
        <h3>Tab shape</h3>
        <Subsection title="Basic" open={open.basic} onToggle={() => setOpen(o => ({ ...o, basic: !o.basic }))}>
          {(['classic', 'chrome'] as const).map(id => (
            <Choice
              key={id}
              selected={appearance.tabStyle === id}
              label={id === 'classic' ? 'Classic' : 'Chrome'}
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
