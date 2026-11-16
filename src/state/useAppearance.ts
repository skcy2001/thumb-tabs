import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_APPEARANCE, type Appearance } from '../../shared/types'

/** The saved look, plus a setter that applies a change at once and saves it. */
export function useAppearance(): [Appearance, (change: Partial<Appearance>) => void] {
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE)

  useEffect(() => {
    const api = window.sidebarApi?.appearance
    if (!api) return
    let live = true
    api.get().then(look => { if (live) setAppearance(look) })
    const off = api.onChange(setAppearance)
    return () => { live = false; off() }
  }, [])

  const update = useCallback((change: Partial<Appearance>) => {
    setAppearance(current => {
      const next = { ...current, ...change }
      window.sidebarApi?.appearance.set(next)
      return next
    })
  }, [])

  return [appearance, update]
}
