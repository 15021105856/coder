import { describe, expect, it } from 'vitest'
import { content } from '../src/content'

const textOf = (idPart: string) => content.items.filter((item) => item.title.includes(idPart) || item.originalMarkdown.includes(idPart) || item.sections.some((s) => s.sourceText.includes(idPart)))

describe('parsed books', () => {
  it('counts the expected A and B items', () => {
    expect(content.items.filter((item) => item.coreA)).toHaveLength(26)
    expect(content.items.filter((item) => item.appendixFullAnswer)).toHaveLength(2)
    expect(content.items.filter((item) => item.fullTextForLookup && item.chapter.startsWith('第九章'))).toHaveLength(7)
    expect(content.items.filter((item) => item.fullTextForLookup && item.chapter.startsWith('第十章'))).toHaveLength(8)
    expect(content.meta.schemaVersion).toBe(1)
    expect(content.meta.contentVersion).toBeTruthy()
    expect(content.meta.sourceHashes.A).toHaveLength(64)
    expect(content.meta.sourceHashes.B).toHaveLength(64)
  })

  it('keeps every source page addressable', () => {
    for (let page = 1; page <= 50; page++) {
      expect(content.pages.some((p) => p.source === 'A' && p.page === page && p.anchor === `a-pdf-page-${page}`)).toBe(true)
    }
    for (let page = 1; page <= 42; page++) {
      expect(content.pages.some((p) => p.source === 'B' && p.page === page && p.anchor === `b-pdf-page-${page}`)).toBe(true)
    }
  })

  it('keeps required source phrases and does not merge textbook wordings', () => {
    const all = content.pages.map((p) => p.markdown).join('\n')
    expect(all).toContain('建立系统的目标体系')
    expect(all).toContain('确定标准')
    expect(all).toContain('负强化不是惩罚')
    expect(all).toContain('风险分担')
    expect(all).not.toContain('把风险承担当作标准答案')
    expect(all).toContain('损失减低管理')
    expect(all).toContain('人本原理、系统原理、效益原理、适度原理')
    expect(all).toContain('责任原理')
    expect(all).toContain('没有责任原理')
    expect(all).toContain('努力与绩效的关系')
    expect(all).toContain('勒温')
    expect(all).toContain('莫尔斯和洛什')
    expect(all).toContain('全26题')
    expect(all).toContain('A级（25道）')
    const principles = content.items.find((item) => item.title.includes('三本教材'))
    expect(principles?.kind).toBe('comparison')
    const table = principles?.tables[0]
    expect(table?.headers.length).toBeGreaterThan(1)
    expect(table?.rows.length).toBeGreaterThanOrEqual(3)
    expect(table?.rows.map((row) => row.join(' ')).join('\n')).toContain('责任原理')
  })

  it('does not treat B red emphasis as definition layer', () => {
    const topics = content.items.filter((item) => item.fullTextForLookup)
    expect(topics.length).toBe(15)
    for (const item of topics) {
      expect(item.sections.some((s) => s.layer === 'definition')).toBe(false)
      expect(item.kind).toBe('skeleton')
    }
    const emphasized = topics.filter((item) => item.sections.some((s) => s.emphasis === 'b-red-emphasis'))
    expect(emphasized.length).toBeGreaterThan(0)
  })

  it('keeps redlines as tables with separate columns', () => {
    const row = content.items.find((item) => item.kind === 'redline' && item.sections.some((s) => s.sourceText.includes('风险承担')))
    expect(row).toBeTruthy()
    expect(row?.sections.map((s) => s.title)).toEqual(['别写', '要写', '依据'])
    expect(row?.tables[0].headers).toContain('别写')
    expect(row?.tables[0].rows[0].length).toBeGreaterThanOrEqual(3)
  })

  it('leaves keyword hints unconfirmed and relations explicit', () => {
    expect(content.items.every((item) => item.reviewedKeywordHints.length === 0)).toBe(true)
    const confirmed = content.relations.filter((r) => r.status === 'confirmed-by-source')
    const candidates = content.relations.filter((r) => r.status === 'candidate')
    expect(confirmed.length).toBeGreaterThan(0)
    expect(candidates.length).toBeGreaterThan(0)
    for (const rel of content.relations) {
      expect(rel.reason.length).toBeGreaterThan(4)
      expect(rel.evidenceQuote.length).toBeGreaterThan(4)
      expect(rel.aItemId).not.toBe(rel.bItemId)
    }
    expect(confirmed.every((r) => r.role === 'redline')).toBe(true)
    expect(textOf('目标管理').some((item) => item.coreA)).toBe(true)
  })
})
