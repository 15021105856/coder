import { describe, expect, it } from 'vitest'
import { normalizeUiSettings, readingScaleFromLegacyFontSize } from '../src/state/uiSettings'

describe('ui settings backward compatibility', () => {
  it('defaults readingScale to standard when missing', () => {
    expect(normalizeUiSettings({}).readingScale).toBe('standard')
    expect(normalizeUiSettings({}).focusReading).toBe(false)
  })

  it('maps legacy fontSize to readingScale', () => {
    expect(readingScaleFromLegacyFontSize(15)).toBe('compact')
    expect(readingScaleFromLegacyFontSize(21)).toBe('recite')
    expect(normalizeUiSettings({ fontSize: 15 }).readingScale).toBe('compact')
  })

  it('preserves explicit readingScale over legacy fontSize', () => {
    expect(normalizeUiSettings({ fontSize: 15, readingScale: 'recite' }).readingScale).toBe('recite')
  })
})
