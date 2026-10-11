import type { CheckPoint, EvidenceState, HintLevel } from '../types'

export function theoryPoints(points: CheckPoint[]): CheckPoint[] {
  return points.filter((p) => p.level === 1 && p.role !== 'sports' && p.role !== 'expansion')
}

export function gradedSecondary(points: CheckPoint[]): CheckPoint[] {
  return points.filter((p) => p.level === 2 && p.role !== 'sports' && p.role !== 'expansion')
}

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
  if (theory.length === 0) {
    if (missedSecondary.length === 0) return 'independent'
    if (missedSecondary.length <= 1) return 'minor_omission'
    return 'relearned'
  }
  if (missedTheory.length === 0 && missedSecondary.length <= 1) return 'independent'
  if (missedTheory.length === 0) return 'minor_omission'
  if (missedTheory.length === 1 && theory.length >= 2) return 'minor_omission'
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
