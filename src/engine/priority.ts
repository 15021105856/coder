import type { Attempt, Relation, RelationStatus, StudyItem } from '../types'
import { effectiveStatus } from './recall'

export interface RankedItem {
  item: StudyItem
  tier: number
  reasons: string[]
  dueAt?: number
}

export function isHighSignal(item: StudyItem): boolean {
  if (item.appendixFullAnswer) return true
  return item.sourceSignals.some(
    (s) =>
      s.type === 'actual_exam' ||
      s.type === 'teacher_must' ||
      s.type === 'mock' ||
      (s.type === 'aggregation' && (s.value ?? 0) >= 5),
  )
}

export function coveredByConfirmedSkeleton(
  item: StudyItem,
  relations: Relation[],
  overrides: Record<string, RelationStatus>,
): boolean {
  return relations.some((r) => {
    if (r.bItemId !== item.id) return false
    if (r.role !== 'skeleton' && r.role !== 'topic') return false
    const status = effectiveStatus(r.status, overrides[r.id])
    return status === 'confirmed' || status === 'confirmed-by-source'
  })
}

function latestOf(attempts: Attempt[], itemId: string): Attempt | undefined {
  let latest: Attempt | undefined
  for (const attempt of attempts) {
    if (attempt.itemId !== itemId) continue
    if (!latest || attempt.finishedAt >= latest.finishedAt) latest = attempt
  }
  return latest
}

export function rankItems(
  items: StudyItem[],
  attempts: Attempt[],
  now: number,
  relations: Relation[] = [],
  overrides: Record<string, RelationStatus> = {},
): RankedItem[] {
  const ranked = items.map((item) => {
    const latest = latestOf(attempts, item.id)
    const due = Boolean(latest?.dueAt && latest.dueAt <= now)
    const poor = latest?.evidenceState === 'cue_dependent' || latest?.evidenceState === 'relearned'
    const reasons: string[] = []
    let tier = 6
    if (due && poor) {
      tier = 1
      reasons.push('到期，且上次是提示依赖或看答案后才恢复')
    } else if (due) {
      tier = 1
      reasons.push('到期复测')
    } else if (item.coreA && !latest) {
      tier = 2
      reasons.push('A册核心题，还没有无提示首测')
    } else if (!item.coreA && item.kind !== 'reference' && isHighSignal(item) && !coveredByConfirmedSkeleton(item, relations, overrides)) {
      tier = 3
      reasons.push('原资料高信号，且不是已确认挂到 A 题上的骨架')
    } else if (poor) {
      tier = 4
      reasons.push('最近一轮提示依赖或看答案后才恢复')
    } else if (item.kind === 'skeleton' || item.kind === 'full_answer' || item.kind === 'redline' || item.kind === 'comparison' || item.kind === 'appendix') {
      tier = 5
      reasons.push(item.fullTextForLookup ? 'B级全文专题，按骨架练，不因篇幅加分' : '普通训练项')
    } else {
      tier = 6
      reasons.push('备查')
    }
    if (item.fullTextForLookup) reasons.push('第九或第十章全文只供查阅，不单独抬高优先级')
    return { item, tier, reasons, dueAt: latest?.dueAt }
  })
  ranked.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier
    const ad = a.dueAt ?? Number.MAX_SAFE_INTEGER
    const bd = b.dueAt ?? Number.MAX_SAFE_INTEGER
    if (ad !== bd) return ad - bd
    if (a.item.chapterIndex !== b.item.chapterIndex) return a.item.chapterIndex - b.item.chapterIndex
    const ap = a.item.pdfPages[0] ?? 9999
    const bp = b.item.pdfPages[0] ?? 9999
    if (ap !== bp) return ap - bp
    return a.item.title.localeCompare(b.item.title, 'zh')
  })
  return ranked
}
