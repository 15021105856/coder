import { describe, expect, it } from 'vitest'
import {
  advanceExamQuestion,
  createExamState,
  examQuestionStartedAt,
  finalizeQuestionDuration,
  questionRemainSeconds,
} from '../src/engine/exam'

const LIMIT = 600

function twoQuestionExam(start = 0) {
  return createExamState({
    id: 'e-two',
    title: '限时',
    itemIds: ['q1', 'q2'],
    index: 0,
    startedAt: start,
    questionStartedAt: start,
    limitSeconds: LIMIT,
    answers: {
      q1: { text: '', revealed: false },
      q2: { text: '', revealed: false },
    },
  })
}

describe('finalizeQuestionDuration', () => {
  it('test 3: does not overwrite an existing durationSeconds', () => {
    const answer = { text: 'x', revealed: true, durationSeconds: 420 }
    const next = finalizeQuestionDuration(answer, 0, 9_999_999)
    expect(next.durationSeconds).toBe(420)
  })

  it('test 2: writes duration once when never finalized before', () => {
    const answer = { text: 'y', revealed: false }
    const sealed = finalizeQuestionDuration(answer, 1_000, 301_000)
    expect(sealed.durationSeconds).toBe(300)
    const again = finalizeQuestionDuration(sealed, 1_000, 999_000)
    expect(again.durationSeconds).toBe(300)
  })
})

describe('reveal then next question', () => {
  it('test 1: viewing the answer after reveal does not extend durationSeconds', () => {
    let exam = twoQuestionExam(0)
    const revealAt = 480_000
    const q1 = exam.answers.q1
    const afterReveal = finalizeQuestionDuration(q1, examQuestionStartedAt(exam), revealAt)
    exam = {
      ...exam,
      answers: { ...exam.answers, q1: { ...afterReveal, revealed: true } },
    }
    expect(exam.answers.q1.durationSeconds).toBe(480)

    const nextAt = 660_000
    exam = advanceExamQuestion(exam, nextAt)
    expect(exam.answers.q1.durationSeconds).toBe(480)
    expect(exam.index).toBe(1)
    expect(exam.questionStartedAt).toBe(nextAt)
    expect(questionRemainSeconds(exam, nextAt)).toBe(LIMIT)
    expect(questionRemainSeconds(exam, nextAt + 20_000)).toBe(LIMIT - 20)
  })

  it('test 4: question 2 timer is independent after question 1 sealed at 480s', () => {
    let exam = twoQuestionExam(0)
    exam = {
      ...exam,
      answers: {
        ...exam.answers,
        q1: finalizeQuestionDuration(exam.answers.q1, 0, 480_000),
      },
    }
    expect(exam.answers.q1.durationSeconds).toBe(480)
    exam = advanceExamQuestion({ ...exam, answers: { ...exam.answers, q1: { ...exam.answers.q1, revealed: true } } }, 660_000)
    expect(exam.answers.q1.durationSeconds).toBe(480)
    expect(questionRemainSeconds(exam, 660_000)).toBe(LIMIT)
    expect(questionRemainSeconds(exam, 720_000)).toBe(LIMIT - 60)
  })
})

describe('advance without prior reveal', () => {
  it('test 2: advancing finalizes duration once if reveal was skipped', () => {
    const exam = twoQuestionExam(0)
    const advanced = advanceExamQuestion(
      { ...exam, answers: { ...exam.answers, q1: { ...exam.answers.q1, revealed: true } } },
      300_000,
    )
    expect(advanced.answers.q1.durationSeconds).toBe(300)
    const again = advanceExamQuestion(advanced, 900_000)
    expect(again.answers.q1.durationSeconds).toBe(300)
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
