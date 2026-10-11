import type { ExamAnswer, ExamState } from '../types'

export function examQuestionStartedAt(exam: ExamState): number {
  return exam.questionStartedAt ?? exam.startedAt
}

export function questionRemainSeconds(exam: ExamState, now: number): number | null {
  if (!exam.limitSeconds) return null
  const elapsed = Math.floor((now - examQuestionStartedAt(exam)) / 1000)
  return exam.limitSeconds - elapsed
}

export function sealQuestionDuration(answer: ExamAnswer, exam: ExamState, now: number): ExamAnswer {
  const elapsed = Math.max(0, Math.floor((now - examQuestionStartedAt(exam)) / 1000))
  return { ...answer, durationSeconds: elapsed }
}

export function advanceExamQuestion(exam: ExamState, now: number): ExamState {
  const itemId = exam.itemIds[exam.index]
  const current = exam.answers[itemId] || { text: '', revealed: false }
  const answers = { ...exam.answers, [itemId]: sealQuestionDuration(current, exam, now) }
  const nextIndex = Math.min(exam.itemIds.length - 1, exam.index + 1)
  return { ...exam, answers, index: nextIndex, questionStartedAt: now }
}

export function createExamState(input: Omit<ExamState, 'questionStartedAt'> & { questionStartedAt?: number }): ExamState {
  const startedAt = input.startedAt
  return { ...input, questionStartedAt: input.questionStartedAt ?? startedAt }
}
