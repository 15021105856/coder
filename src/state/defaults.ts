import { content } from '../content'
import { DEFAULT_GAPS } from '../engine/schedule'
import { DEFAULT_DAY } from '../engine/dayplan'
import type { Persisted, Settings } from '../types'

export function defaultSettings(): Settings {
  return {
    theme: 'light',
    fontSize: 17,
    gaps: { ...DEFAULT_GAPS },
    day: { ...DEFAULT_DAY },
    showTimer: true,
  }
}

export function defaultPersisted(): Persisted {
  return {
    schemaVersion: content.meta.schemaVersion,
    contentVersion: content.meta.contentVersion,
    sourceHashes: { ...content.meta.sourceHashes },
    savedAt: Date.now(),
    attempts: [],
    notes: [],
    bookmarks: [],
    settings: defaultSettings(),
    relationOverrides: {},
    keywordOverrides: {},
    customKeywords: [],
    migrationReview: [],
    recall: null,
    recallQueue: [],
    exam: null,
    dayPlan: null,
    view: 'today',
    library: { source: 'A', chapterId: '', itemId: '', query: '', mode: 'all', pageAnchor: '' },
  }
}
