import type { ReadingScale, Settings } from '../types'

export const UI_VERSION = '2.2'

const SCALE_FROM_LEGACY_FONT: [number, ReadingScale][] = [
  [15, 'compact'],
  [17, 'standard'],
  [19, 'standard'],
  [21, 'recite'],
]

export function readingScaleFromLegacyFontSize(fontSize: number | undefined): ReadingScale {
  if (fontSize == null) return 'standard'
  let best: ReadingScale = 'standard'
  let dist = Infinity
  for (const [size, scale] of SCALE_FROM_LEGACY_FONT) {
    const d = Math.abs(size - fontSize)
    if (d < dist) {
      dist = d
      best = scale
    }
  }
  if (fontSize >= 20) return 'recite'
  if (fontSize <= 16) return 'compact'
  return best
}

export function normalizeUiSettings(partial: Partial<Settings> | undefined): Pick<Settings, 'readingScale' | 'focusReading' | 'fontSize'> {
  const readingScale =
    partial?.readingScale === 'compact' || partial?.readingScale === 'standard' || partial?.readingScale === 'recite'
      ? partial.readingScale
      : readingScaleFromLegacyFontSize(partial?.fontSize)
  const focusReading = Boolean(partial?.focusReading)
  const fontSize = partial?.fontSize ?? (readingScale === 'compact' ? 16 : readingScale === 'recite' ? 21 : 18)
  return { readingScale, focusReading, fontSize }
}

export function applyUiSettingsToDocument(settings: Pick<Settings, 'theme' | 'readingScale' | 'focusReading'>) {
  const root = document.documentElement
  root.dataset.theme = settings.theme
  root.dataset.readingScale = settings.readingScale
  root.dataset.focusReading = settings.focusReading ? 'true' : 'false'
}
