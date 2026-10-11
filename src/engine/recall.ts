import type { Attempt, HintContext, HintLevel, KeywordBucket, RecallState, Relation, RelationStatus, StudyItem } from '../types'
import { deriveEvidence, missingPointIds, sportsExampleMissing } from './evidence'
import { independentStreakBefore, nextDueAt } from './schedule'
import type { GapSettings } from '../types'

export function effectiveStatus(status: RelationStatus, override?: RelationStatus): RelationStatus {
  if (override === 'rejected' || override === 'confirmed' || override === 'candidate' || override === 'confirmed-by-source') {
    return override
  }
  return status
}

function isConfirmed(status: RelationStatus): boolean {
  return status === 'confirmed' || status === 'confirmed-by-source'
}

export function buildHintContext(
  item: StudyItem,
  relations: Relation[],
  keywords: KeywordBucket[],
  relationOverrides: Record<string, RelationStatus>,
  keywordOverrides: Record<string, RelationStatus>,
  customKeywords: { itemId: string; text: string }[],
): HintContext {
  const rels = relations.filter((r) => r.aItemId === item.id)
  const confirmed = rels.filter((r) => isConfirmed(effectiveStatus(r.status, relationOverrides[r.id])))
  const blob = `${item.title}\n${item.originalMarkdown}\n${item.sections.map((s) => s.sourceText).join('\n')}`
  const fromFile = (keywords.find((k) => k.itemId === item.id)?.hints || [])
    .filter((h) => isConfirmed(effectiveStatus(h.status, keywordOverrides[h.id])))
    .map((h) => h.text)
  const custom = customKeywords.filter((c) => c.itemId === item.id && c.text && blob.includes(c.text)).map((c) => c.text)
  const words = [...new Set([...item.reviewedKeywordHints, ...fromFile, ...custom])]
  return {
    confirmedSkeletonIds: confirmed.filter((r) => r.role === 'skeleton' || r.role === 'topic').map((r) => r.bItemId),
    confirmedRedlineIds: confirmed.filter((r) => r.role === 'redline').map((r) => r.bItemId),
    candidateRelationIds: rels.filter((r) => effectiveStatus(r.status, relationOverrides[r.id]) === 'candidate').map((r) => r.id),
    keywords: words,
    hasHeadings: item.reviewedHeadingHints.length > 0,
  }
}

function bump(state: RecallState, level: HintLevel): Pick<RecallState, 'hintSequence' | 'highestHintUsed'> {
  const rank: HintLevel[] = ['none', 'heading', 'keyword', 'full_answer']
  const hintSequence = state.hintSequence.includes(level) ? state.hintSequence : [...state.hintSequence, level]
  const highestHintUsed = rank.indexOf(level) > rank.indexOf(state.highestHintUsed) ? level : state.highestHintUsed
  return { hintSequence, highestHintUsed }
}

function freeze(state: RecallState, now: number): RecallState {
  if (state.frozenDraft) return state
  return { ...state, frozenDraft: { text: state.draft, createdAt: now } }
}

export function startRecall(itemId: string, now: number): RecallState {
  return {
    itemId,
    phase: 'draft',
    startedAt: now,
    draft: '',
    frozenDraft: null,
    hintSequence: [],
    highestHintUsed: 'none',
    keywordSkipped: false,
    checkedPointIds: [],
    termErrorDraft: '',
    redlineErrorIds: [],
    restatement: '',
    userNote: '',
  }
}

export function requestHint(state: RecallState, ctx: HintContext, now: number): RecallState {
  const base = freeze(state, now)
  if (base.phase === 'draft') {
    if (ctx.confirmedSkeletonIds.length) return { ...base, ...bump(base, 'heading'), phase: 'b_skeleton' }
    if (ctx.hasHeadings) return { ...base, ...bump(base, 'heading'), phase: 'headings' }
    if (ctx.keywords.length) return { ...base, ...bump(base, 'keyword'), phase: 'keywords' }
    return { ...base, ...bump(base, 'full_answer'), phase: 'compare', keywordSkipped: true }
  }
  if (base.phase === 'b_skeleton') {
    if (ctx.hasHeadings) return { ...base, ...bump(base, 'heading'), phase: 'headings' }
    if (ctx.keywords.length) return { ...base, ...bump(base, 'keyword'), phase: 'keywords' }
    return { ...base, ...bump(base, 'full_answer'), phase: 'compare', keywordSkipped: !ctx.keywords.length }
  }
  if (base.phase === 'headings') {
    if (ctx.keywords.length) return { ...base, ...bump(base, 'keyword'), phase: 'keywords' }
    return { ...base, ...bump(base, 'full_answer'), phase: 'compare', keywordSkipped: true }
  }
  if (base.phase === 'keywords') {
    return { ...base, ...bump(base, 'full_answer'), phase: 'compare' }
  }
  return base
}

export function submitDraft(state: RecallState, now: number): RecallState {
  return { ...freeze(state, now), phase: 'compare' }
}

export function goCompare(state: RecallState, now: number): RecallState {
  return { ...freeze(state, now), phase: 'compare' }
}

export function revealFull(state: RecallState, now: number): RecallState {
  const base = freeze(state, now)
  return { ...base, ...bump(base, 'full_answer'), phase: 'compare' }
}

export function toRestate(state: RecallState): RecallState {
  return { ...state, phase: 'restate' }
}

export function commitAttempt(
  state: RecallState,
  item: StudyItem,
  now: number,
  gaps: GapSettings,
  previous: Attempt[],
): Attempt {
  const checked = state.checkedPointIds
  const evidenceState = deriveEvidence({
    highestHintUsed: state.highestHintUsed,
    checkPoints: item.checkPoints,
    checkedPointIds: checked,
  })
  const prior = previous.filter((a) => a.itemId === item.id).map((a) => a.evidenceState)
  const dueAt = nextDueAt(evidenceState, evidenceState === 'independent' ? independentStreakBefore(prior) : 0, now, gaps)
  const termErrors = state.termErrorDraft
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  const redlineErrors = state.redlineErrorIds
  return {
    id: `att-${now.toString(36)}-${item.id.slice(-6)}`,
    itemId: item.id,
    startedAt: state.startedAt,
    finishedAt: now,
    durationSeconds: Math.max(0, Math.round((now - state.startedAt) / 1000)),
    highestHintUsed: state.highestHintUsed,
    hintSequence: state.hintSequence,
    preRevealDraft: state.frozenDraft ?? { text: state.draft, createdAt: state.startedAt },
    checkedPointIds: checked,
    missingPointIds: missingPointIds(item.checkPoints, checked),
    termErrors,
    redlineErrors,
    sportsExampleMissing: sportsExampleMissing(item.checkPoints, checked),
    postRevealNoHintPassed: state.postRevealNoHintPassed,
    restatementText: state.restatement,
    evidenceState,
    selfConfidence: state.selfConfidence ?? 3,
    userNote: state.userNote || undefined,
    dueAt,
    reviewKind: previous.some((a) => a.itemId === item.id && a.dueAt && a.dueAt <= state.startedAt) ? 'delay' : 'initial',
  }
}
