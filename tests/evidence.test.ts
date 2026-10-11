import { describe, expect, it } from 'vitest'
import { assessExamReadiness, deriveEvidence } from '../src/engine/evidence'
import type { CheckPoint } from '../src/types'

function mkSecondary(n: number, prefix = 'p'): CheckPoint[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`,
    level: 2,
    label: `点${i}`,
    sourceText: `点${i}`,
    group: '正文',
    role: 'point',
  }))
}

describe('deriveEvidence secondary omission', () => {
  const headings: CheckPoint[] = [
    { id: 'h1', level: 1, label: '一', sourceText: '一', group: '一', role: 'heading' },
    { id: 'h2', level: 1, label: '二', sourceText: '二', group: '二', role: 'heading' },
  ]

  it('never gives independent/minor when level-1 all checked but most level-2 missing', () => {
    const points = [...headings, ...mkSecondary(10)]
    const checked = ['h1', 'h2']
    expect(deriveEvidence({ highestHintUsed: 'none', checkPoints: points, checkedPointIds: checked })).toBe('relearned')
  })

  it('allows independent with full level-1 and at most one secondary miss', () => {
    const points = [...headings, ...mkSecondary(10)]
    const checked = ['h1', 'h2', 'p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']
    expect(deriveEvidence({ highestHintUsed: 'none', checkPoints: points, checkedPointIds: checked })).toBe('independent')
  })

  it('allows minor_omission up to 20% secondary miss with complete level-1', () => {
    const points = [...headings, ...mkSecondary(10)]
    const checked = ['h1', 'h2', 'p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']
    expect(deriveEvidence({ highestHintUsed: 'none', checkPoints: points, checkedPointIds: checked })).toBe('minor_omission')
  })

  it('keeps full_answer as relearned even if everything is checked', () => {
    const points = [...headings, ...mkSecondary(2)]
    expect(
      deriveEvidence({
        highestHintUsed: 'full_answer',
        checkPoints: points,
        checkedPointIds: points.map((p) => p.id),
      }),
    ).toBe('relearned')
  })
})

describe('assessExamReadiness', () => {
  it('flags sports separately from evidence', () => {
    const points: CheckPoint[] = [
      { id: 'h1', level: 1, label: '定义', sourceText: '定义', group: '定义', role: 'heading' },
      { id: 's1', level: 2, label: '体育', sourceText: '体育', group: '体育转写', role: 'sports' },
    ]
    const ready = assessExamReadiness(points, ['h1'])
    expect(ready.sportsExampleMissing).toBe(true)
    expect(ready.examReady).toBe(false)
    expect(ready.message).toContain('体育例证')
  })
})
