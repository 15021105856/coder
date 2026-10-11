import type { Attempt, EvidenceState, StudyItem } from '../types'

export interface Dashboard {
  touchedToday: number
  aCoverage: number
  aTotal: number
  latestIndependent: number
  latestMinor: number
  latestCue: number
  latestRelearned: number
  restatementPassed: number
  restatementRecorded: number
  delayWindowPassed: number
  delayWindowTotal: number
  dueTomorrow: number
  dueNow: number
  termTop: { text: string; count: number }[]
  redlineTop: { text: string; count: number }[]
  byDay: { day: string; independent: number; minor_omission: number; cue_dependent: number; relearned: number }[]
}

function dayKey(ts: number): string {
  const d = new Date(ts)
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function latestMap(attempts: Attempt[]): Map<string, Attempt> {
  const map = new Map<string, Attempt>()
  for (const attempt of attempts) {
    const prev = map.get(attempt.itemId)
    if (!prev || attempt.finishedAt >= prev.finishedAt) map.set(attempt.itemId, attempt)
  }
  return map
}

function top(list: string[], n = 5): { text: string; count: number }[] {
  const map = new Map<string, number>()
  for (const text of list) map.set(text, (map.get(text) || 0) + 1)
  return [...map.entries()]
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, 'zh'))
    .slice(0, n)
}

export function buildDashboard(items: StudyItem[], attempts: Attempt[], now: number): Dashboard {
  const core = items.filter((item) => item.coreA)
  const latest = latestMap(attempts)
  const covered = core.filter((item) => latest.has(item.id)).length
  const countLatest = (state: EvidenceState) => core.filter((item) => latest.get(item.id)?.evidenceState === state).length
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const tomorrow = new Date(start)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const after = new Date(tomorrow)
  after.setDate(after.getDate() + 1)
  const touchedToday = new Set(attempts.filter((a) => a.finishedAt >= start.getTime()).map((a) => a.itemId)).size
  const restatement = attempts.filter((a) => a.postRevealNoHintPassed !== undefined)
  const delay = attempts.filter((a) => a.reviewKind === 'delay')
  const delayWindow = delay.filter((a) => {
    const prev = attempts.filter((p) => p.itemId === a.itemId && p.finishedAt < a.startedAt).sort((x, y) => y.finishedAt - x.finishedAt)[0]
    if (!prev) return false
    const gap = a.startedAt - prev.finishedAt
    return gap >= 20 * 60_000 && gap <= 60 * 60_000
  })
  const by = new Map<string, Dashboard['byDay'][number]>()
  for (const attempt of attempts) {
    const key = dayKey(attempt.finishedAt)
    const row = by.get(key) || { day: key, independent: 0, minor_omission: 0, cue_dependent: 0, relearned: 0 }
    row[attempt.evidenceState] += 1
    by.set(key, row)
  }
  return {
    touchedToday,
    aCoverage: covered,
    aTotal: core.length,
    latestIndependent: countLatest('independent'),
    latestMinor: countLatest('minor_omission'),
    latestCue: countLatest('cue_dependent'),
    latestRelearned: countLatest('relearned'),
    restatementPassed: restatement.filter((a) => a.postRevealNoHintPassed).length,
    restatementRecorded: restatement.length,
    delayWindowPassed: delayWindow.filter((a) => a.evidenceState === 'independent' || a.evidenceState === 'minor_omission').length,
    delayWindowTotal: delayWindow.length,
    dueTomorrow: [...latest.values()].filter((a) => a.dueAt && a.dueAt >= tomorrow.getTime() && a.dueAt < after.getTime()).length,
    dueNow: [...latest.values()].filter((a) => a.dueAt && a.dueAt <= now).length,
    termTop: top(attempts.flatMap((a) => a.termErrors)),
    redlineTop: top(attempts.flatMap((a) => a.redlineErrors)),
    byDay: [...by.values()].sort((a, b) => a.day.localeCompare(b.day)),
  }
}
