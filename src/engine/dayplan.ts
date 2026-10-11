import type { Attempt, DayPlan, DaySettings, PlanBlock, Relation, RelationStatus, StudyItem } from '../types'
import { isHighSignal, rankItems, scheduleBOnlyItems } from './priority'

export const DEFAULT_DAY: DaySettings = {
  totalMinutes: 600,
  protectEvening: true,
  eveningMinutes: 40,
  bOnlyMaxMinutes: 90,
  prioritizeA26: true,
  includeAppendix2: true,
  restEvery: 50,
  restMinutes: 10,
  writingMinutes: 10,
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(list: T[], rnd: () => number): T[] {
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

function take(ids: string[], n: number): string[] {
  return ids.slice(0, n)
}

export function buildDayPlan(
  items: StudyItem[],
  attempts: Attempt[],
  settings: DaySettings,
  now: number,
  seed: number,
  relations: Relation[] = [],
  relationOverrides: Record<string, RelationStatus> = {},
): DayPlan {
  const rnd = mulberry32(seed)
  const notes: string[] = []
  const eveningMinutes = settings.protectEvening
    ? Math.min(settings.totalMinutes, Math.max(Math.min(15, settings.totalMinutes), Math.min(settings.eveningMinutes, settings.totalMinutes)))
    : 0
  let budget = Math.max(0, settings.totalMinutes - eveningMinutes)
  if (settings.protectEvening) notes.push(`晚间闭卷验收预留 ${eveningMinutes} 分钟。白天超时先减普通 B 项，不取消晚测。`)
  notes.push(`建议每 ${settings.restEvery} 分钟休息 ${settings.restMinutes} 分钟。页面不会发系统通知。`)
  if (settings.protectEvening && eveningMinutes < settings.eveningMinutes) notes.push('可用时间短于晚测设定时，晚测仍保留，其余阶段缩短。')

  const core = items.filter((item) => item.coreA)
  const appendix = settings.includeAppendix2 ? items.filter((item) => item.appendixFullAnswer) : []
  const bOnly = scheduleBOnlyItems(items, relations, relationOverrides)
  const highB = bOnly.filter((item) => isHighSignal(item) && !item.fullTextForLookup)
  const highLookup = bOnly.filter((item) => isHighSignal(item) && item.fullTextForLookup)
  const ordinaryB = bOnly.filter((item) => !isHighSignal(item))
  const redlines = items.filter((item) => item.kind === 'redline')
  const rankedHigh = [
    ...rankItems(highB, attempts, now, relations, relationOverrides),
    ...rankItems(highLookup, attempts, now, relations, relationOverrides),
  ].map((r) => r.item.id)

  const blocks: PlanBlock[] = []
  const phase1Minutes = Math.min(30, budget)
  const aSample = shuffle(core, rnd)
  const bSample = shuffle(rankedHigh.length ? items.filter((item) => rankedHigh.includes(item.id)) : ordinaryB, rnd)
  const phase1A = take(aSample.map((item) => item.id), budget >= 20 ? 6 : budget >= 10 ? 3 : budget > 0 ? 1 : 0)
  const phase1B = take(bSample.map((item) => item.id), budget >= 20 ? 4 : budget >= 10 ? 2 : 0)
  if (phase1A.length || phase1B.length) {
    blocks.push({
      id: 'phase-1',
      phase: 'I',
      title: '基线诊断',
      minutes: phase1Minutes,
      itemIds: [...phase1A, ...phase1B],
      protected: false,
      dynamic: false,
      note: '全部先无提示。用来看今天的恢复速度，不打总分。',
    })
    budget -= phase1Minutes
  }

  const remainingA = core.map((item) => item.id).filter((id) => !phase1A.includes(id))
  const aMinutes = settings.prioritizeA26 ? Math.min(budget, remainingA.length * 8) : Math.min(budget, 40)
  const aCount = Math.max(0, Math.floor(aMinutes / 8))
  if (aCount > 0 && remainingA.length) {
    blocks.push({
      id: 'phase-2',
      phase: 'II',
      title: 'A 核心题恢复',
      minutes: aCount * 8,
      itemIds: remainingA.slice(0, aCount),
      protected: false,
      dynamic: false,
      note: '按章节顺序。失败时只用已确认的 B 骨架，没有确认关系就用本题源文小标题。',
    })
    budget -= aCount * 8
  }

  const bBudget = Math.min(budget, settings.bOnlyMaxMinutes)
  const bIds = [...rankedHigh.filter((id) => !phase1B.includes(id)), ...ordinaryB.map((item) => item.id)]
  const bCount = Math.max(0, Math.floor(bBudget / 6))
  if (bCount > 0) {
    blocks.push({
      id: 'phase-3',
      phase: 'III',
      title: 'B 级补齐',
      minutes: Math.min(bBudget, bCount * 6),
      itemIds: bIds.slice(0, bCount),
      protected: false,
      dynamic: false,
      note: '先高信号，再普通骨架。第九、十章不因全文更长而排到前面。',
    })
    budget -= Math.min(bBudget, bCount * 6)
  }
  if (appendix.length && budget >= 12) {
    blocks.push({
      id: 'phase-3b',
      phase: 'III',
      title: '附录真题完整题',
      minutes: 12,
      itemIds: appendix.map((item) => item.id),
      protected: false,
      dynamic: false,
      note: 'A 册附一、附二，来源写明是真题。不计入 26 题覆盖。',
    })
    budget -= 12
  }

  const redCount = Math.max(0, Math.min(8, Math.floor(budget / 2)))
  if (redCount > 0) {
    blocks.push({
      id: 'phase-4',
      phase: 'IV',
      title: '红线快测',
      minutes: redCount * 2,
      itemIds: shuffle(redlines, rnd).slice(0, redCount).map((item) => item.id),
      protected: false,
      dynamic: false,
      note: '辨「别写 / 要写」。不按简答的时间计。',
    })
  }

  blocks.push({
    id: 'phase-5',
    phase: 'V',
    title: '晚间闭卷验收',
    minutes: eveningMinutes,
    itemIds: [],
    protected: settings.protectEvening,
    dynamic: true,
    note: '开始时再从今天做过的题里抽，并混入少量未做题。至少留 2 道 A 题做限时书面骨架。',
  })

  return { createdAt: now, totalMinutes: settings.totalMinutes, eveningMinutes, blocks, notes }
}

export function resolveEvening(items: StudyItem[], attempts: Attempt[], now: number, seed: number): string[] {
  const rnd = mulberry32(seed + 17)
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const todayIds = [...new Set(attempts.filter((a) => a.finishedAt >= start.getTime()).map((a) => a.itemId))]
  const todayItems = todayIds.map((id) => items.find((item) => item.id === id)).filter((item): item is StudyItem => Boolean(item))
  const untouched = items.filter((item) => (item.coreA || item.kind === 'skeleton') && !todayIds.includes(item.id))
  const aToday = todayItems.filter((item) => item.coreA).map((item) => item.id)
  const otherToday = todayItems.filter((item) => !item.coreA).map((item) => item.id)
  const extra = shuffle(untouched, rnd).slice(0, 3).map((item) => item.id)
  const aPool = aToday.length >= 2 ? aToday : [...aToday, ...shuffle(items.filter((item) => item.coreA && !aToday.includes(item.id)), rnd).map((item) => item.id)]
  return [...new Set([...shuffle(aPool, rnd).slice(0, 4), ...shuffle(otherToday, rnd).slice(0, 4), ...extra])]
}
