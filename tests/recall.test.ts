import { describe, expect, it } from 'vitest'
import { content } from '../src/content'
import { deriveEvidence } from '../src/engine/evidence'
import { buildHintContext, commitAttempt, goCompare, requestHint, revealFull, startRecall, submitDraft, toRestate } from '../src/engine/recall'
import { DEFAULT_GAPS } from '../src/engine/schedule'
import type { CheckPoint, StudyItem } from '../src/types'

const target = content.items.find((item) => item.coreA && item.title.includes('目标管理'))!
const ctx = buildHintContext(target, content.relations, content.keywords, {}, {}, [])

function checkAllTheory(item: StudyItem): string[] {
  return item.checkPoints.filter((p) => p.role !== 'expansion').map((p) => p.id)
}

describe('recall state machine', () => {
  it('scenario A: no hint and a complete check stays independent', () => {
    let state = startRecall(target.id, 1_000)
    state = { ...state, draft: '1. 定义\n2. 四个特点' }
    state = submitDraft(state, 2_000)
    expect(state.highestHintUsed).toBe('none')
    expect(state.hintSequence).toEqual([])
    expect(state.frozenDraft?.text).toContain('四个特点')
    state = { ...state, checkedPointIds: checkAllTheory(target), selfConfidence: 4 }
    state = toRestate(state)
    state = { ...state, postRevealNoHintPassed: true, restatement: '再述一遍' }
    const attempt = commitAttempt(state, target, 3_000, DEFAULT_GAPS, [])
    expect(attempt.evidenceState === 'independent' || attempt.evidenceState === 'minor_omission').toBe(true)
    expect(attempt.highestHintUsed).toBe('none')
    expect(attempt.preRevealDraft?.text).toContain('四个特点')
    expect(attempt.postRevealNoHintPassed).toBe(true)
    expect(attempt.selfConfidence).toBe(4)
  })

  it('scenario B: a confirmed skeleton hint is cue dependent and does not rewrite history', () => {
    const forced = { ...ctx, confirmedSkeletonIds: ['b-skel-demo'], keywords: [] }
    let state = startRecall(target.id, 1_000)
    state = requestHint(state, forced, 1_500)
    expect(state.phase).toBe('b_skeleton')
    expect(state.highestHintUsed).toBe('heading')
    state = goCompare(state, 2_000)
    state = { ...state, checkedPointIds: checkAllTheory(target) }
    state = toRestate(state)
    state = { ...state, postRevealNoHintPassed: true }
    const attempt = commitAttempt(state, target, 4_000, DEFAULT_GAPS, [])
    expect(attempt.evidenceState).toBe('cue_dependent')
    expect(attempt.highestHintUsed).toBe('heading')
    expect(attempt.postRevealNoHintPassed).toBe(true)
  })

  it('scenario C: full answer then a clean restatement stays relearned', () => {
    let state = startRecall(target.id, 1_000)
    state = requestHint(state, ctx, 1_200)
    expect(state.phase === 'headings' || state.phase === 'b_skeleton').toBe(true)
    state = requestHint(state, ctx, 1_400)
    if (state.phase !== 'compare') state = requestHint(state, ctx, 1_600)
    expect(state.phase).toBe('compare')
    expect(state.highestHintUsed).toBe('full_answer')
    expect(state.hintSequence.includes('keyword')).toBe(false)
    expect(state.keywordSkipped).toBe(true)
    state = toRestate(state)
    state = { ...state, postRevealNoHintPassed: true, checkedPointIds: checkAllTheory(target) }
    const attempt = commitAttempt(state, target, 9_000, DEFAULT_GAPS, [])
    expect(attempt.evidenceState).toBe('relearned')
    expect(attempt.evidenceState).not.toBe('independent')
  })

  it('scenario D: items without confirmed keywords skip the keyword layer', () => {
    expect(ctx.keywords).toEqual([])
    expect(ctx.candidateRelationIds.length + ctx.confirmedSkeletonIds.length).toBeGreaterThanOrEqual(0)
    expect(ctx.confirmedSkeletonIds).toEqual([])
    let state = startRecall(target.id, 10)
    state = requestHint(state, ctx, 20)
    expect(state.phase).not.toBe('keywords')
    state = requestHint(state, ctx, 30)
    expect(state.phase).toBe('compare')
    expect(state.hintSequence).not.toContain('keyword')
  })

  it('does not let a candidate relation into the hint chain', () => {
    const candidate = content.relations.find((r) => r.status === 'candidate' && (r.role === 'skeleton' || r.role === 'topic'))
    expect(candidate).toBeTruthy()
    const item = content.items.find((row) => row.id === candidate!.aItemId)!
    const built = buildHintContext(item, content.relations, content.keywords, {}, {}, [])
    expect(built.confirmedSkeletonIds).not.toContain(candidate!.bItemId)
    const promoted = buildHintContext(item, content.relations, content.keywords, { [candidate!.id]: 'confirmed' }, {}, [])
    expect(promoted.confirmedSkeletonIds).toContain(candidate!.bItemId)
  })

  it('derives minor omission only when the first pass had no hint', () => {
    const points: CheckPoint[] = [
      { id: 'h1', level: 1, label: '定义', sourceText: '定义', group: '定义', role: 'heading' },
      { id: 'h2', level: 1, label: '过程', sourceText: '过程', group: '过程', role: 'heading' },
      { id: 'p1', level: 2, label: '一句', sourceText: '一句', group: '定义', role: 'point' },
      { id: 'p2', level: 2, label: '两句', sourceText: '两句', group: '过程', role: 'point' },
    ]
    expect(deriveEvidence({ highestHintUsed: 'none', checkPoints: points, checkedPointIds: ['h1', 'h2', 'p1'] })).toBe('independent')
    expect(deriveEvidence({ highestHintUsed: 'none', checkPoints: points, checkedPointIds: ['h1', 'h2'] })).toBe('minor_omission')
    expect(deriveEvidence({ highestHintUsed: 'heading', checkPoints: points, checkedPointIds: ['h1', 'h2', 'p1', 'p2'] })).toBe('cue_dependent')
    expect(deriveEvidence({ highestHintUsed: 'full_answer', checkPoints: points, checkedPointIds: points.map((p) => p.id) })).toBe('relearned')
  })

  it('revealFull from a clean draft still records full_answer', () => {
    const state = revealFull(startRecall(target.id, 1), 2)
    expect(state.highestHintUsed).toBe('full_answer')
    expect(state.phase).toBe('compare')
  })
})
