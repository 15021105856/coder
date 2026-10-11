import { describe, expect, it } from 'vitest'
import { advanceExamQuestion, createExamState, questionRemainSeconds } from '../src/engine/exam'

describe('exam per-question timer', () => {
  it('resets countdown when advancing to the next question', () => {
    const base = createExamState({
      id: 'e1',
      title: '限时',
      itemIds: ['a', 'b'],
      index: 0,
      startedAt: 0,
      questionStartedAt: 0,
      limitSeconds: 600,
      answers: {
        a: { text: 'x', revealed: true, durationSeconds: 0 },
        b: { text: '', revealed: false },
      },
    })
    expect(questionRemainSeconds(base, 400_000)).toBe(600 - 400)
    const next = advanceExamQuestion(base, 400_000)
    expect(next.answers.a.durationSeconds).toBe(400)
    expect(next.index).toBe(1)
    expect(next.questionStartedAt).toBe(400_000)
    expect(questionRemainSeconds(next, 410_000)).toBe(590)
    expect(questionRemainSeconds(next, 1_000_000)).toBe(600 - 600)
  })

  it('does not inherit elapsed time on the second question', () => {
    const exam = advanceExamQuestion(
      createExamState({
        id: 'e2',
        title: '两题',
        itemIds: ['q1', 'q2'],
        index: 0,
        startedAt: 0,
        questionStartedAt: 0,
        limitSeconds: 600,
        answers: { q1: { text: '', revealed: true }, q2: { text: '', revealed: false } },
      }),
      500_000,
    )
    expect(questionRemainSeconds(exam, 520_000)).toBe(580)
  })
})

describe('exam visibility contract', () => {
  it('uses item title for display; unrevealed answers stay hidden in model', () => {
    const itemTitle = '二 简述目标管理的定义、特点、过程及评价。'
    const exam = createExamState({
      id: 'vis',
      title: '闭卷',
      itemIds: ['item-1'],
      index: 0,
      startedAt: 1,
      limitSeconds: null,
      answers: { 'item-1': { text: '草稿', revealed: false } },
    })
    expect(itemTitle).not.toBe('闭卷题')
    expect(exam.answers['item-1'].revealed).toBe(false)
    expect(exam.itemIds[exam.index + 1]).toBeUndefined()
  })
})
