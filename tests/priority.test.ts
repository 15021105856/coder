import { describe, expect, it } from 'vitest'
import { buildDayPlan, DEFAULT_DAY, resolveEvening } from '../src/engine/dayplan'
import { rankItems } from '../src/engine/priority'
import type { Attempt, Relation, StudyItem } from '../src/types'

function item(partial: Partial<StudyItem> & Pick<StudyItem, 'id' | 'title'>): StudyItem {
  return {
    source: 'B',
    kind: 'skeleton',
    chapterId: 'c',
    chapter: '第二章',
    chapterIndex: 2,
    pdfPages: [1],
    anchor: partial.id,
    originalMarkdown: '短',
    sections: [],
    tables: [],
    reviewedHeadingHints: [],
    reviewedKeywordHints: [],
    redlineIds: [],
    confirmedRelatedIds: [],
    candidateRelatedIds: [],
    sourceSignals: [],
    checkPoints: [],
    coreA: false,
    appendixFullAnswer: false,
    fullTextForLookup: false,
    ...partial,
  }
}

describe('priority', () => {
  it('does not change order when markdown length changes', () => {
    const short = item({ id: 'short', title: '甲骨架', originalMarkdown: 'x' })
    const long = item({ id: 'long', title: '乙骨架', originalMarkdown: '长'.repeat(20000), fullTextForLookup: true, chapter: '第九章 领导', chapterIndex: 9 })
    const order = (rows: StudyItem[]) => rankItems(rows, [], 0).map((row) => row.item.id)
    expect(order([short, long])).toEqual(order([{ ...short, originalMarkdown: '长'.repeat(20000) }, { ...long, originalMarkdown: 'x' }]))
    const ranked = rankItems([long, short], [], 0)
    expect(ranked[0].item.id).toBe('short')
    expect(ranked[1].reasons.join('')).toContain('不因篇幅')
  })

  it('ranks a due relearned item ahead of an unseen A question, and a high signal ahead of a long chapter', () => {
    const due = item({ id: 'due', title: '到期题' })
    const unseenA = item({ id: 'a', title: 'A题', source: 'A', kind: 'full_answer', coreA: true, chapterIndex: 1 })
    const high = item({
      id: 'high',
      title: '高信号',
      sourceSignals: [{ type: 'aggregation', label: '原资料标注：题册聚合 7 次', value: 7 }],
    })
    const fat = item({ id: 'fat', title: '第九章长文', fullTextForLookup: true, chapterIndex: 9, originalMarkdown: 'x'.repeat(8000) })
    const attempt: Attempt = {
      id: 'a1',
      itemId: 'due',
      startedAt: 1,
      finishedAt: 2,
      durationSeconds: 1,
      highestHintUsed: 'full_answer',
      hintSequence: ['full_answer'],
      checkedPointIds: [],
      missingPointIds: [],
      termErrors: [],
      redlineErrors: [],
      sportsExampleMissing: false,
      evidenceState: 'relearned',
      selfConfidence: 2,
      dueAt: 10,
      reviewKind: 'initial',
    }
    const ids = rankItems([fat, high, unseenA, due], [attempt], 20).map((row) => row.item.id)
    expect(ids[0]).toBe('due')
    expect(ids[1]).toBe('a')
    expect(ids.indexOf('high')).toBeLessThan(ids.indexOf('fat'))
  })
})

describe('day plan', () => {
  it('keeps the evening block when the day is short', () => {
    const items = [
      item({ id: 'a1', title: 'A1', source: 'A', kind: 'full_answer', coreA: true, chapterIndex: 1 }),
      item({ id: 'b1', title: 'B1' }),
    ]
    const plan = buildDayPlan(items, [], { ...DEFAULT_DAY, totalMinutes: 30, eveningMinutes: 40, protectEvening: true }, 1, 7)
    const evening = plan.blocks.find((block) => block.phase === 'V')
    expect(evening?.protected).toBe(true)
    expect(evening?.minutes).toBeGreaterThan(0)
    expect(plan.blocks.some((block) => block.phase === 'III' && block.itemIds.includes('b1'))).toBe(false)
  })

  it('resolves evening from items already touched today', () => {
    const items = [
      item({ id: 'a1', title: 'A1', source: 'A', kind: 'full_answer', coreA: true }),
      item({ id: 'a2', title: 'A2', source: 'A', kind: 'full_answer', coreA: true }),
      item({ id: 'b1', title: 'B1' }),
    ]
    const now = new Date('2026-10-11T21:00:00').getTime()
    const attempts: Attempt[] = [
      {
        id: 't1',
        itemId: 'a1',
        startedAt: now - 1000,
        finishedAt: now - 500,
        durationSeconds: 1,
        highestHintUsed: 'none',
        hintSequence: [],
        checkedPointIds: [],
        missingPointIds: [],
        termErrors: [],
        redlineErrors: [],
        sportsExampleMissing: false,
        evidenceState: 'independent',
        selfConfidence: 4,
        reviewKind: 'initial',
      },
    ]
    const ids = resolveEvening(items, attempts, now, 3)
    expect(ids).toContain('a1')
    expect(ids.filter((id) => id.startsWith('a')).length).toBeGreaterThanOrEqual(2)
  })

  it('excludes confirmed prompt-only B skeletons from phase III scheduling', () => {
    const aCore = item({ id: 'a-core', title: 'A题', source: 'A', kind: 'full_answer', coreA: true, chapterIndex: 5 })
    const bPrompt = item({ id: 'b-prompt', title: '目标管理骨架', chapterIndex: 5 })
    const bStandalone = item({ id: 'b-alone', title: '独立B', chapterIndex: 2 })
    const relations: Relation[] = [
      {
        id: 'rel-1',
        aItemId: 'a-core',
        bItemId: 'b-prompt',
        reason: 'test',
        status: 'confirmed-by-source',
        role: 'skeleton',
        evidenceQuote: 'test',
      },
    ]
    const plan = buildDayPlan([aCore, bPrompt, bStandalone], [], { ...DEFAULT_DAY, totalMinutes: 600 }, 1, 99, relations, {})
    const phase3 = plan.blocks.filter((b) => b.phase === 'III').flatMap((b) => b.itemIds)
    expect(phase3).not.toContain('b-prompt')
    expect(phase3).toContain('b-alone')
  })
})
