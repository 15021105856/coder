import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { content, getItem } from '../content'
import { buildDayPlan, resolveEvening } from '../engine/dayplan'
import { commitAttempt, requestHint, revealFull, startRecall, submitDraft, goCompare, toRestate, buildHintContext } from '../engine/recall'
import { BACKUP_KEY, DATA_KEY, safeGet, safeSet } from '../engine/storage'
import { commitImport, inspectImport, type ImportPlan } from '../engine/transfer'
import { defaultPersisted, defaultSettings } from './defaults'
import { DEFAULT_DAY } from '../engine/dayplan'
import { DEFAULT_GAPS } from '../engine/schedule'
import type { ExamState, Persisted, RecallState, RelationStatus, ViewId } from '../types'

interface AppApi {
  state: Persisted
  warning: string | null
  importPlan: ImportPlan | null
  now: number
  hintFor: (itemId: string) => ReturnType<typeof buildHintContext>
  setView: (view: ViewId) => void
  patchRecall: (partial: Partial<RecallState>) => void
  startRecallItem: (itemId: string) => void
  startQueue: (ids: string[]) => void
  recallHint: () => void
  recallSubmit: () => void
  recallCompare: () => void
  recallReveal: () => void
  recallRestate: () => void
  recallCommit: () => void
  recallNext: () => void
  setLibrary: (partial: Partial<Persisted['library']>) => void
  toggleBookmark: (id: string) => void
  saveNote: (itemId: string, text: string) => void
  updateSettings: (partial: Partial<Persisted['settings']>) => void
  setRelation: (id: string, status: RelationStatus) => void
  setKeyword: (id: string, status: RelationStatus) => void
  addCustomKeyword: (itemId: string, text: string) => string | null
  makeDayPlan: () => void
  startEvening: () => void
  startExam: (exam: ExamState) => void
  patchExam: (exam: ExamState | null) => void
  stageImport: (raw: string) => void
  confirmImport: () => void
  cancelImport: () => void
  rollback: () => void
  exportJson: () => void
  dismissWarning: () => void
}

const Ctx = createContext<AppApi | null>(null)

function browserKv() {
  return localStorage
}

function loadInitial(): { state: Persisted; warning: string | null; hold: boolean } {
  const got = safeGet(browserKv(), DATA_KEY)
  if (got.warning) return { state: defaultPersisted(), warning: `本地存储不可用：${got.warning}。请马上导出 JSON。`, hold: true }
  if (!got.value) return { state: defaultPersisted(), warning: null, hold: false }
  try {
    const parsed = JSON.parse(got.value) as Persisted
    if (!parsed || typeof parsed !== 'object' || typeof parsed.schemaVersion !== 'number') {
      return { state: defaultPersisted(), warning: '本地记录无法识别。程序没有覆盖它。', hold: true }
    }
    if (parsed.schemaVersion > content.meta.schemaVersion) {
      return { state: defaultPersisted(), warning: '本地记录的结构版本比程序新。程序没有覆盖它。', hold: true }
    }
    const settings = {
      ...defaultSettings(),
      ...parsed.settings,
      gaps: { ...DEFAULT_GAPS, ...parsed.settings?.gaps },
      day: { ...DEFAULT_DAY, ...parsed.settings?.day },
    }
    const state: Persisted = {
      ...defaultPersisted(),
      ...parsed,
      settings,
      library: { ...defaultPersisted().library, ...parsed.library },
    }
    let warning: string | null = null
    const hashChanged = state.sourceHashes?.A !== content.meta.sourceHashes.A || state.sourceHashes?.B !== content.meta.sourceHashes.B || state.contentVersion !== content.meta.contentVersion
    if (hashChanged) {
      const known = new Set(content.items.map((item) => item.id))
      const unmatched = state.attempts.filter((attempt) => !known.has(attempt.itemId))
      state.attempts = state.attempts.filter((attempt) => known.has(attempt.itemId))
      state.migrationReview = [
        ...state.migrationReview,
        ...unmatched.map((attempt) => ({
          itemId: attempt.itemId,
          attemptId: attempt.id,
          contentVersion: parsed.contentVersion,
          note: '资料 hash 或内容版本变了，这条记录的 itemId 对不上，留在迁移待查。',
        })),
      ]
      state.contentVersion = content.meta.contentVersion
      state.sourceHashes = { ...content.meta.sourceHashes }
      warning = unmatched.length ? `资料版本有变化。${unmatched.length} 条旧记录对不上，已放进迁移待查，没有删除。` : '资料版本有变化。已按稳定 itemId 接上现有记录。'
    }
    return { state, warning, hold: false }
  } catch {
    return { state: defaultPersisted(), warning: '本地记录损坏。程序没有覆盖原内容。', hold: true }
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(loadInitial, [])
  const [state, setState] = useState(initial.state)
  const [warning, setWarning] = useState<string | null>(initial.warning)
  const [hold, setHold] = useState(initial.hold)
  const [importPlan, setImportPlan] = useState<ImportPlan | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme
    document.documentElement.style.fontSize = `${state.settings.fontSize}px`
  }, [state.settings.theme, state.settings.fontSize])

  useEffect(() => {
    if (hold) return
    const result = safeSet(browserKv(), DATA_KEY, JSON.stringify(state))
    if (!result.ok) setWarning(`自动保存失败：${result.warning}。请立即导出 JSON，程序没有静默丢弃这次操作。`)
  }, [state, hold])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  const api = useMemo<AppApi>(() => {
    const hintFor = (itemId: string) => {
      const item = getItem(itemId)
      if (!item) return buildHintContext(content.items[0], content.relations, content.keywords, state.relationOverrides, state.keywordOverrides, state.customKeywords)
      return buildHintContext(item, content.relations, content.keywords, state.relationOverrides, state.keywordOverrides, state.customKeywords)
    }
    return {
      state,
      warning,
      importPlan,
      now,
      hintFor,
      setView: (view) => setState((prev) => ({ ...prev, view })),
      patchRecall: (partial) => setState((prev) => ({ ...prev, recall: prev.recall ? { ...prev.recall, ...partial } : prev.recall })),
      startRecallItem: (itemId) => setState((prev) => ({ ...prev, view: 'recall', recall: startRecall(itemId, Date.now()), recallQueue: [itemId] })),
      startQueue: (ids) => {
        const clean = ids.filter((id) => getItem(id))
        if (!clean.length) return
        setState((prev) => ({ ...prev, view: 'recall', recall: startRecall(clean[0], Date.now()), recallQueue: clean }))
      },
      recallHint: () => setState((prev) => {
        if (!prev.recall) return prev
        const item = getItem(prev.recall.itemId)
        if (!item) return prev
        const ctx = buildHintContext(item, content.relations, content.keywords, prev.relationOverrides, prev.keywordOverrides, prev.customKeywords)
        return { ...prev, recall: requestHint(prev.recall, ctx, Date.now()) }
      }),
      recallSubmit: () => setState((prev) => prev.recall ? { ...prev, recall: submitDraft(prev.recall, Date.now()) } : prev),
      recallCompare: () => setState((prev) => prev.recall ? { ...prev, recall: goCompare(prev.recall, Date.now()) } : prev),
      recallReveal: () => setState((prev) => prev.recall ? { ...prev, recall: revealFull(prev.recall, Date.now()) } : prev),
      recallRestate: () => setState((prev) => prev.recall ? { ...prev, recall: toRestate(prev.recall) } : prev),
      recallCommit: () => setState((prev) => {
        if (!prev.recall) return prev
        const item = getItem(prev.recall.itemId)
        if (!item) return prev
        const attempt = commitAttempt(prev.recall, item, Date.now(), prev.settings.gaps, prev.attempts)
        return { ...prev, attempts: [...prev.attempts, attempt], recall: { ...prev.recall, phase: 'done', result: attempt } }
      }),
      recallNext: () => setState((prev) => {
        const rest = prev.recallQueue.filter((id) => id !== prev.recall?.itemId)
        if (!rest.length) return { ...prev, recall: null, recallQueue: [], view: 'today' }
        return { ...prev, recallQueue: rest, recall: startRecall(rest[0], Date.now()) }
      }),
      setLibrary: (partial) => setState((prev) => ({ ...prev, view: 'library', library: { ...prev.library, ...partial } })),
      toggleBookmark: (id) => setState((prev) => ({
        ...prev,
        bookmarks: prev.bookmarks.includes(id) ? prev.bookmarks.filter((item) => item !== id) : [...prev.bookmarks, id],
      })),
      saveNote: (itemId, text) => setState((prev) => {
        const notes = prev.notes.filter((note) => note.itemId !== itemId)
        return { ...prev, notes: text.trim() ? [...notes, { itemId, text, updatedAt: Date.now() }] : notes }
      }),
      updateSettings: (partial) => setState((prev) => ({ ...prev, settings: { ...prev.settings, ...partial, gaps: { ...prev.settings.gaps, ...partial.gaps }, day: { ...prev.settings.day, ...partial.day } } })),
      setRelation: (id, status) => setState((prev) => ({ ...prev, relationOverrides: { ...prev.relationOverrides, [id]: status } })),
      setKeyword: (id, status) => setState((prev) => ({ ...prev, keywordOverrides: { ...prev.keywordOverrides, [id]: status } })),
      addCustomKeyword: (itemId, text) => {
        const item = getItem(itemId)
        const blob = item ? `${item.originalMarkdown}\n${item.sections.map((s) => s.sourceText).join('\n')}` : ''
        if (!text.trim() || !blob.includes(text.trim())) return '这句话不在该题原文里，不能当成关键词。'
        setState((prev) => ({ ...prev, customKeywords: [...prev.customKeywords, { itemId, text: text.trim() }] }))
        return null
      },
      makeDayPlan: () => setState((prev) => ({ ...prev, dayPlan: buildDayPlan(content.items, prev.attempts, prev.settings.day, Date.now(), Number(new Date().toISOString().slice(0, 10).replace(/-/g, ''))) })),
      startEvening: () => setState((prev) => {
        const ids = resolveEvening(content.items, prev.attempts, Date.now(), 11)
        if (!ids.length) return prev
        return { ...prev, view: 'recall', recall: startRecall(ids[0], Date.now()), recallQueue: ids }
      }),
      startExam: (exam) => setState((prev) => ({ ...prev, view: 'exam', exam })),
      patchExam: (exam) => setState((prev) => ({ ...prev, exam })),
      stageImport: (raw) => {
        const plan = inspectImport(raw, state, content.meta, new Set(content.items.map((item) => item.id)))
        if (!plan.ok) {
          setWarning(plan.error)
          setImportPlan(null)
          return
        }
        setImportPlan(plan)
      },
      confirmImport: () => {
        if (!importPlan) return
        const currentRaw = JSON.stringify(state)
        const nextRaw = JSON.stringify(importPlan.next)
        const wrote = commitImport(browserKv(), currentRaw, nextRaw)
        if (!wrote.ok) {
          setWarning(wrote.warning || '导入没有写入。')
          return
        }
        setHold(false)
        setState(importPlan.next)
        setImportPlan(null)
        setWarning('导入完成。导入前的记录已留在本地备份，可以回滚。')
      },
      cancelImport: () => setImportPlan(null),
      rollback: () => {
        const raw = safeGet(browserKv(), BACKUP_KEY)
        if (!raw.value) {
          setWarning('没有找到导入前备份。')
          return
        }
        try {
          const parsed = JSON.parse(raw.value) as Persisted
          const wrote = safeSet(browserKv(), DATA_KEY, raw.value)
          if (!wrote.ok) {
            setWarning(wrote.warning || '回滚写入失败。')
            return
          }
          setState({ ...defaultPersisted(), ...parsed, settings: { ...defaultSettings(), ...parsed.settings } })
          setWarning('已恢复到导入前备份。')
        } catch {
          setWarning('备份内容无法读取，当前记录未改。')
        }
      },
      exportJson: () => {
        const blob = new Blob([JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `pku346-recall-${new Date().toISOString().slice(0, 10)}.json`
        link.click()
        URL.revokeObjectURL(url)
      },
      dismissWarning: () => setWarning(null),
    }
  }, [state, warning, importPlan, now])

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useApp(): AppApi {
  const value = useContext(Ctx)
  if (!value) throw new Error('AppProvider missing')
  return value
}
