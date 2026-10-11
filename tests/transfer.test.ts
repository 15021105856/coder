import { describe, expect, it } from 'vitest'
import { content } from '../src/content'
import { commitImport, inspectImport } from '../src/engine/transfer'
import { memoryKv } from '../src/engine/storage'
import { defaultPersisted } from '../src/state/defaults'
import type { Attempt, Persisted } from '../src/types'

function attempt(id: string, itemId: string): Attempt {
  return {
    id,
    itemId,
    startedAt: 1,
    finishedAt: 2,
    durationSeconds: 1,
    highestHintUsed: 'none',
    hintSequence: [],
    checkedPointIds: [],
    missingPointIds: [],
    termErrors: ['融合继承性'],
    redlineErrors: [],
    sportsExampleMissing: false,
    evidenceState: 'independent',
    selfConfidence: 3,
    reviewKind: 'initial',
  }
}

describe('import and backup', () => {
  const known = new Set(content.items.map((item) => item.id))
  const current = defaultPersisted()
  current.attempts = [attempt('old', content.items[0].id)]

  it('rejects broken JSON without describing a write', () => {
    const result = inspectImport('{', current, content.meta, known)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('没有改动')
  })

  it('rejects a newer schema', () => {
    const result = inspectImport(JSON.stringify({ schemaVersion: 9, attempts: [] }), current, content.meta, known)
    expect(result.ok).toBe(false)
  })

  it('summarizes a cross-version file and parks unmatched attempts', () => {
    const file: Persisted = {
      ...current,
      contentVersion: '1999-01-01-v0',
      sourceHashes: { A: '0'.repeat(64), B: '1'.repeat(64) },
      attempts: [attempt('keep', content.items[1].id), attempt('lost', 'missing-item')],
    }
    const result = inspectImport(JSON.stringify(file), current, content.meta, known)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.crossVersion).toBe(true)
    expect(result.summary.unmatched).toBe(1)
    expect(result.summary.added).toBe(1)
    expect(result.next.attempts.some((row) => row.id === 'keep')).toBe(true)
    expect(result.next.attempts.some((row) => row.id === 'lost')).toBe(false)
    expect(result.next.migrationReview.some((row) => row.attemptId === 'lost')).toBe(true)
    expect(result.next.attempts.some((row) => row.id === 'old')).toBe(true)
  })

  it('writes a backup before replacing data and can roll back a failed write', () => {
    const kv = memoryKv()
    const raw = JSON.stringify(current)
    kv.setItem('pku346-recall-v1', raw)
    const next = JSON.stringify({ ...current, attempts: [attempt('new', content.items[0].id)] })
    const ok = commitImport(kv, raw, next)
    expect(ok.ok).toBe(true)
    expect(kv.getItem('pku346-recall-backup-v1')).toBe(raw)
    expect(JSON.parse(kv.getItem('pku346-recall-v1') || '{}').attempts[0].id).toBe('new')

    const failing = {
      getItem: () => raw,
      setItem: (key: string, value: string) => {
        if (key === 'pku346-recall-v1' && value === 'boom') throw new Error('quota')
        kv.setItem(key, value)
      },
      removeItem: (key: string) => kv.removeItem(key),
    }
    const failed = commitImport(failing, raw, 'boom')
    expect(failed.ok).toBe(false)
    expect(kv.getItem('pku346-recall-v1')).toBe(raw)
  })
})
