import type { EvidenceState, GapSettings } from '../types'

export const DEFAULT_GAPS: GapSettings = {
  relearnedMin: 20,
  cueMin: 45,
  minorHours: 24,
  independentDays: 3,
  independentAgainDays: 7,
}

export function nextDueAt(
  evidence: EvidenceState,
  priorIndependentStreak: number,
  now: number,
  gaps: GapSettings = DEFAULT_GAPS,
): number {
  if (evidence === 'relearned') return now + gaps.relearnedMin * 60_000
  if (evidence === 'cue_dependent') return now + gaps.cueMin * 60_000
  if (evidence === 'minor_omission') return now + gaps.minorHours * 3_600_000
  const days = priorIndependentStreak >= 1 ? gaps.independentAgainDays : gaps.independentDays
  return now + days * 86_400_000
}

export function independentStreakBefore(evidencesNewestLast: EvidenceState[]): number {
  let streak = 0
  for (let i = evidencesNewestLast.length - 1; i >= 0; i--) {
    if (evidencesNewestLast[i] !== 'independent') break
    streak += 1
  }
  return streak
}
