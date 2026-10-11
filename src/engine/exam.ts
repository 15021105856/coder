import type { ExamAnswer, ExamState } from '../types'

export function examQuestionStartedAt(exam: ExamState): number {
  return exam.questionStartedAt ?? exam.startedAt
}

export function questionRemainSeconds(exam: ExamState, now: number): number | null {
  if (!exam.limitSeconds) return null
  const elapsed = Math.floor((now - examQuestionStartedAt(exam)) / 1000)
  return exam.limitSeconds - elapsed
}

/** 单题作答用时只封存一次；看答案停留时间不计入。 */
export function finalizeQuestionDuration(
  answer: ExamAnswer,
  questionStartedAt: number | undefined,
  now: number,
): ExamAnswer {
  if (answer.durationSeconds != null) {
    return answer
  }
  if (questionStartedAt == null) {
    return answer
  }
  return {
    ...answer,
    durationSeconds: Math.max(0, Math.floor((now - questionStartedAt) / 1000)),
  }
}

export function advanceExamQuestion(exam: ExamState, now: number): ExamState {
  const itemId = exam.itemIds[exam.index]
  const current = exam.answers[itemId] || { text: '', revealed: false }
  const started = examQuestionStartedAt(exam)
  const answers = { ...exam.answers, [itemId]: finalizeQuestionDuration(current, started, now) }
  const nextIndex = Math.min(exam.itemIds.length - 1, exam.index + 1)
  return { ...exam, answers, index: nextIndex, questionStartedAt: now }
}

export function createExamState(input: Omit<ExamState, 'questionStartedAt'> & { questionStartedAt?: number }): ExamState {
  const startedAt = input.startedAt
  return { ...input, questionStartedAt: input.questionStartedAt ?? startedAt }
}
