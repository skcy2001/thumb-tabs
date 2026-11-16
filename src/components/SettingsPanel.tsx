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
  const tab = (y: number, active: boolean) =>
    style === 'classic' ? (
      <g key={y}>
        <rect x="4" y={y + 2} width="26" height="24" rx="5" fill={active ? 'var(--bg-active)' : 'none'} />
        {active && <rect x="0" y={y + 6} width="3" height="16" rx="1.5" fill="var(--accent)" />}
        <circle cx="17" cy={y + 14} r="5" fill="var(--text-secondary)" />
      </g>
    ) : (
      <g key={y}>
        {active
          ? <path d={`M0 ${y - 4} q0 4 4 4 H0 Z M2 ${y} H24 q8 0 8 8 v10 q0 8 -8 8 H2 Z M0 ${y + 26} q4 0 4 4 H0 Z`} fill="var(--bg-toolbar)" stroke="var(--border)" strokeWidth="0.75" />
          : <rect x="2" y={y + 2} width="24" height="22" rx="6" fill="var(--bg-active)" opacity="0.5" />}
        <circle cx="16" cy={y + 14} r="4" fill="var(--text-secondary)" />
      </g>
    )
  return (
    <svg className="tab-style-preview" viewBox="0 0 34 100" width="34" height="100" aria-hidden="true">
      <rect width="34" height="100" rx="4" fill={style === 'chrome' ? 'var(--bg-dark)' : 'var(--bg-strip)'} />
      {[6, 36, 66].map((y, i) => tab(y, i === 1))}
    </svg>
  )
}

/** One binder tab at the size it has in the ribbon, so the outline reads true. */
function BinderPreview({ id, divider }: { id: BinderShapeId; divider: number }) {
  return (
    <span className="binder-frame" aria-hidden="true">
      <span className="binder-swatch" data-divider={divider} style={{ clipPath: binderShape(id, 'right') }}>
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
      <Choices title="Tab shape">
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
      </Choices>
      <Choices title="Binder" wide>
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
      </Choices>
    </>
  )
}

function Choices({ title, wide, children }: { title: string; wide?: boolean; children: ReactNode }) {
  return (
    <section className="customizer-group">
      <h3>{title}</h3>
      <div className={`choice-grid ${wide ? 'choice-grid-narrow' : ''}`} role="radiogroup" aria-label={title}>{children}</div>
    </section>
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
