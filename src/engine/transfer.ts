import type { AppMeta, Attempt, HintLevel, MigrationEntry, Persisted, EvidenceState } from '../types'
import { BACKUP_KEY, DATA_KEY, type Kv, safeSet } from './storage'

const HINTS: HintLevel[] = ['none', 'heading', 'keyword', 'full_answer']
const EVIDENCE: EvidenceState[] = ['independent', 'minor_omission', 'cue_dependent', 'relearned']

export interface ImportSummary {
  added: number
  replaced: number
  unmatched: number
  crossVersion: boolean
  crossSchema: boolean
  schemaVersion: number
  contentVersion: string
  message: string
}

export interface ImportPlan {
  ok: true
  summary: ImportSummary
  next: Persisted
  unmatched: Attempt[]
}

export interface ImportError {
  ok: false
  error: string
}

export function inspectImport(raw: string, current: Persisted, meta: AppMeta, knownIds: Set<string>): ImportPlan | ImportError {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: '这不是合法的 JSON。当前记录没有改动。' }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: '文件结构不对。当前记录没有改动。' }
  }
  const data = parsed as Partial<Persisted> & { schemaVersion?: unknown; attempts?: unknown }
  if (typeof data.schemaVersion !== 'number') {
    return { ok: false, error: '缺少 schemaVersion。当前记录没有改动。' }
  }
  if (data.schemaVersion > meta.schemaVersion) {
    return { ok: false, error: `文件的 schemaVersion ${data.schemaVersion} 比程序的 ${meta.schemaVersion} 新。请先更新程序。当前记录没有改动。` }
  }
  if (!Array.isArray(data.attempts)) {
    return { ok: false, error: '缺少 attempts 数组。当前记录没有改动。' }
  }
  for (const attempt of data.attempts) {
    if (!attempt || typeof attempt !== 'object') return { ok: false, error: '有一条记录不是对象。当前记录没有改动。' }
    const row = attempt as Attempt
    if (typeof row.itemId !== 'string' || typeof row.id !== 'string') {
      return { ok: false, error: '有记录缺少 itemId 或 id。当前记录没有改动。' }
    }
    if (!EVIDENCE.includes(row.evidenceState) || !HINTS.includes(row.highestHintUsed)) {
      return { ok: false, error: `记录 ${row.id} 的 evidenceState 或 highestHintUsed 不合法。当前记录没有改动。` }
    }
  }
  const incoming = data.attempts as Attempt[]
  const matched: Attempt[] = []
  const unmatched: Attempt[] = []
  for (const attempt of incoming) {
    if (knownIds.has(attempt.itemId)) matched.push(attempt)
    else unmatched.push(attempt)
  }
  const currentIds = new Set(current.attempts.map((a) => a.id))
  const added = matched.filter((a) => !currentIds.has(a.id)).length
  const replaced = matched.filter((a) => currentIds.has(a.id)).length
  const hashes = data.sourceHashes
  const crossVersion = data.contentVersion !== meta.contentVersion || !hashes || hashes.A !== meta.sourceHashes.A || hashes.B !== meta.sourceHashes.B
  const crossSchema = data.schemaVersion < meta.schemaVersion
  const migrationReview: MigrationEntry[] = [
    ...current.migrationReview,
    ...unmatched.map((attempt) => ({
      itemId: attempt.itemId,
      attemptId: attempt.id,
      contentVersion: String(data.contentVersion || ''),
      note: '导入时 itemId 对不上当前资料，原记录留在迁移待查，没有并进训练队列。',
    })),
  ]
  const keptOld = current.attempts.filter((a) => !matched.some((m) => m.id === a.id))
  const next: Persisted = {
    ...current,
    schemaVersion: meta.schemaVersion,
    contentVersion: meta.contentVersion,
    sourceHashes: meta.sourceHashes,
    savedAt: Date.now(),
    attempts: [...keptOld, ...matched],
    notes: Array.isArray(data.notes) ? data.notes : current.notes,
    bookmarks: Array.isArray(data.bookmarks) ? data.bookmarks : current.bookmarks,
    settings: data.settings && typeof data.settings === 'object' ? { ...current.settings, ...data.settings } : current.settings,
    relationOverrides: data.relationOverrides && typeof data.relationOverrides === 'object' ? data.relationOverrides : current.relationOverrides,
    keywordOverrides: data.keywordOverrides && typeof data.keywordOverrides === 'object' ? data.keywordOverrides : current.keywordOverrides,
    customKeywords: Array.isArray(data.customKeywords) ? data.customKeywords : current.customKeywords,
    migrationReview,
    recall: null,
    exam: null,
  }
  const summary: ImportSummary = {
    added,
    replaced,
    unmatched: unmatched.length,
    crossVersion,
    crossSchema,
    schemaVersion: data.schemaVersion,
    contentVersion: String(data.contentVersion || '未知'),
    message: crossVersion ? '资料版本或源文件 hash 与当前程序不一致。能对上的 itemId 会合并，对不上的进入迁移待查。' : '版本一致。确认后才会写入。',
  }
  return { ok: true, summary, next, unmatched }
}

export function commitImport(kv: Kv, currentRaw: string, nextRaw: string): { ok: boolean; warning?: string } {
  const backup = safeSet(kv, BACKUP_KEY, currentRaw)
  if (!backup.ok) return { ok: false, warning: `导入前备份失败，已停止。${backup.warning || ''}` }
  const write = safeSet(kv, DATA_KEY, nextRaw)
  if (!write.ok) {
    safeSet(kv, DATA_KEY, currentRaw)
    return { ok: false, warning: `写入失败，已回滚到导入前。${write.warning || ''}` }
  }
  return { ok: true }
}

export function readBackup(kv: Kv): string | null {
  try {
    return kv.getItem(BACKUP_KEY)
  } catch {
    return null
  }
}
