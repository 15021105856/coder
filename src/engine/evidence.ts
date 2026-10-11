import type { CheckPoint, EvidenceState, HintLevel } from '../types'

export function theoryPoints(points: CheckPoint[]): CheckPoint[] {
  return points.filter((p) => p.level === 1 && p.role !== 'sports' && p.role !== 'expansion')
}

export function gradedSecondary(points: CheckPoint[]): CheckPoint[] {
  return points.filter((p) => p.level === 2 && p.role !== 'sports' && p.role !== 'expansion')
}

function secondaryMissRate(missed: number, total: number): number {
  if (total <= 0) return 0
  return missed / total
}

/** 无提示时的记忆证据；与考场答案完整性（examReady）分开。 */
export function deriveEvidence(input: {
  highestHintUsed: HintLevel
  checkPoints: CheckPoint[]
  checkedPointIds: string[]
}): EvidenceState {
  if (input.highestHintUsed === 'full_answer') return 'relearned'
  if (input.highestHintUsed === 'heading' || input.highestHintUsed === 'keyword') return 'cue_dependent'

  const theory = theoryPoints(input.checkPoints)
  const secondary = gradedSecondary(input.checkPoints)
  const missedTheory = theory.filter((p) => !input.checkedPointIds.includes(p.id))
  const missedSecondary = secondary.filter((p) => !input.checkedPointIds.includes(p.id))
  const secMissed = missedSecondary.length
  const secTotal = secondary.length
  const secRate = secondaryMissRate(secMissed, secTotal)

  if (theory.length === 0) {
    if (secTotal === 0) return 'independent'
    if (secMissed === 0) return 'independent'
    if (secMissed <= 1 || secRate <= 0.1) return 'independent'
    if (secRate <= 0.2) return 'minor_omission'
    return 'relearned'
  }

  if (missedTheory.length > 0) {
    if (missedTheory.length === 1 && theory.length >= 2 && secRate <= 0.2) return 'minor_omission'
    return 'relearned'
  }

  if (secMissed === 0) return 'independent'
  if (secMissed <= 1 || secRate <= 0.1) return 'independent'
  if (secRate <= 0.2) return 'minor_omission'
  return 'relearned'
}

export function missingPointIds(points: CheckPoint[], checked: string[]): string[] {
  return points.filter((p) => p.role !== 'expansion' && !checked.includes(p.id)).map((p) => p.id)
}

export function sportsExampleMissing(points: CheckPoint[], checked: string[]): boolean {
  const sports = points.filter((p) => p.role === 'sports')
  if (!sports.length) return false
  return sports.some((p) => !checked.includes(p.id))
}

export interface ExamReadiness {
  examReady: boolean
  sportsExampleMissing: boolean
  message: string
}

/** 考场答案完整性提示，不写入 evidenceState。 */
export function assessExamReadiness(checkPoints: CheckPoint[], checkedPointIds: string[]): ExamReadiness {
  const sportsMissing = sportsExampleMissing(checkPoints, checkedPointIds)
  const theory = theoryPoints(checkPoints)
  const secondary = gradedSecondary(checkPoints)
  const missedTheory = theory.filter((p) => !checkedPointIds.includes(p.id))
  const missedSecondary = secondary.filter((p) => !checkedPointIds.includes(p.id))
  const secRate = secondaryMissRate(missedSecondary.length, secondary.length)
  const theoryOk = missedTheory.length === 0
  const bodyOk = secRate <= 0.2
  const examReady = theoryOk && bodyOk && !sportsMissing
  const parts: string[] = []
  if (sportsMissing) parts.push('体育例证尚未核对，不能当作考场答案完整。')
  if (!theoryOk) parts.push('一级骨架仍有缺项。')
  else if (secRate > 0.2) parts.push('二级采分点遗漏超过 20%，考场答案尚不完整。')
  else if (examReady) parts.push('采分点核对较完整，可作考场草稿参考。')
  else parts.push('仍有少量遗漏，建议继续补骨架。')
  return { examReady, sportsExampleMissing: sportsMissing, message: parts.join('') }
}
