import { useEffect, useState } from 'react'

/**
 * Divider colours taken from favicons: the alpha-weighted mean of the icon's
 * pixels, with its lightness pulled into a mid band so near-black and
 * near-white icons still yield a visible colour. binder.css darkens it further
 * for the selected tab so the logo stands out.
 *
 * Results are cached per URL for the life of the window; a favicon that cannot
 * be read (remote image without CORS, broken data) caches as null and the tab
 * keeps its palette colour.
 */

const cache = new Map<string, string | null>()
const inflight = new Set<string>()
const listeners = new Set<() => void>()

const SAMPLE = 32
const MIN_LIGHTNESS = 0.45
const MAX_LIGHTNESS = 0.62

async function meanColor(url: string): Promise<string | null> {
  try {
    const img = new Image()
    if (!url.startsWith('data:')) img.crossOrigin = 'anonymous'
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = SAMPLE
    canvas.height = SAMPLE
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE)
    const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE)
    let r = 0, g = 0, b = 0, weight = 0
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3] / 255
      if (a < 0.1) continue
      r += data[i] * a
      g += data[i + 1] * a
      b += data[i + 2] * a
      weight += a
    }
    if (weight === 0) return null
    return readable(r / weight, g / weight, b / weight)
  } catch {
    return null
  }
}

/** Keeps the mean's hue and saturation, clamping lightness to the readable band. */
function readable(r: number, g: number, b: number): string {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  let s = 0
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const lightness = Math.min(MAX_LIGHTNESS, Math.max(MIN_LIGHTNESS, l))
  return `hsl(${h.toFixed(0)} ${(s * 100).toFixed(0)}% ${(lightness * 100).toFixed(0)}%)`
}

/**
 * Returns a lookup from favicon URL to its divider colour. Colours are worked
 * out in the background; the component re-renders as each one lands.
 */
export function useFaviconColors(urls: ReadonlyArray<string | null | undefined>) {
  const [, setVersion] = useState(0)
  const key = urls.filter(Boolean).join('\n')

  useEffect(() => {
    const listener = () => setVersion(v => v + 1)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  useEffect(() => {
    for (const url of new Set(urls)) {
      if (!url || cache.has(url) || inflight.has(url)) continue
      inflight.add(url)
      meanColor(url).then(color => {
        inflight.delete(url)
        cache.set(url, color)
        for (const notify of listeners) notify()
      })
    }
    // `key` stands in for `urls`, which is a fresh array every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return (url: string | null | undefined): string | undefined =>
    (url && cache.get(url)) || undefined
}
