/**
 * 解析 A/B 两册 Markdown，生成只读内容、解析报告、关系候选与关键词候选。
 * 不改写原文，不把候选关系写成已确认事实。
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONTENT_VERSION = '2026-10-11-v1'
const SCHEMA_VERSION = 1

const GENERIC_KEYS = new Set([
  '管理', '组织', '决策', '控制', '计划', '创新', '沟通', '领导', '激励',
  '文化', '理论', '过程', '内容', '方法', '体育', '功能', '结构', '环境',
  '目标', '风险', '原则', '特点', '关系', '系统', '活动', '基本', '主要',
  '工作', '组织管理', '管理活动', '管理人员', '体育管理',
])

function sha256(text) {
  return createHash('sha256').update(text).digest('hex')
}

function hid(parts) {
  return createHash('sha256').update(parts.join('\u001f')).digest('hex').slice(0, 12)
}

function norm(s) {
  return s.replace(/\s+/g, '').replace(/[，。、？?！!：:；;“”"‘’'（）()［］\[\]【】《》<>…—\-－·]/g, '')
}

const CN_NUM = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }

function cnToInt(raw) {
  const s = raw.replace(/章|题/g, '')
  if (!s) return NaN
  if (s === '十') return 10
  if (s.startsWith('十')) return 10 + (CN_NUM[s[1]] ?? 0)
  const idx = s.indexOf('十')
  if (idx > 0) {
    const hi = CN_NUM[s[0]] ?? 1
    const lo = s[idx + 1] ? (CN_NUM[s[idx + 1]] ?? 0) : 0
    return hi * 10 + lo
  }
  return CN_NUM[s] ?? NaN
}

function chapterIndex(title) {
  const m = title.match(/第([一二三四五六七八九十]+)章/)
  if (m) return cnToInt(m[1])
  if (title.startsWith('绪论')) return 0
  if (title.startsWith('附录')) return 90
  return 80
}

function isFurniture(line) {
  return (
    /^<!-- SOURCE_PAGE:/.test(line) ||
    /^<!-- TABLE:/.test(line) ||
    /^<a id=/.test(line) ||
    /^\*\*PDF 第\s*\d+\s*页\*\*/.test(line) ||
    line.trim() === '---'
  )
}

function splitPages(text, source) {
  const lines = text.split('\n')
  const pages = []
  let current = null
  const push = () => {
    if (!current) return
    pages.push({
      source,
      page: current.page,
      anchor: `${source.toLowerCase()}-pdf-page-${current.page}`,
      markdown: current.lines.join('\n').trim(),
    })
  }
  for (const line of lines) {
    const m = line.match(/^<!-- SOURCE_PAGE: [AB]:(\d+) -->/)
    if (m) {
      push()
      current = { page: Number(m[1]), lines: [] }
      continue
    }
    if (!current) {
      current = { page: 0, lines: [] }
    }
    current.lines.push(line)
  }
  push()
  return pages.filter((p) => p.page > 0)
}

function parseMdTable(tableLines) {
  const rows = []
  for (const line of tableLines) {
    if (!line.trim().startsWith('|')) continue
    const body = line.trim().replace(/^\|/, '').replace(/\|$/, '')
    const cells = body.split('|').map((c) => c.trim())
    if (cells.every((c) => /^:?-{3,}:?$/.test(c))) continue
    rows.push(cells)
  }
  if (rows.length < 2) return null
  return { headers: rows[0], rows: rows.slice(1) }
}

function tableRole(headers) {
  const h = headers.join(' ')
  if (h.includes('别写') && h.includes('要写')) return 'redline'
  if (h.includes('考点') && h.includes('小标题')) return 'skeleton'
  if (h.includes('教材') && (h.includes('清单') || h.includes('条数'))) return 'comparison'
  if (headers.some((x) => /张瑞林|高雪峰|马工程/.test(x))) return 'comparison'
  return 'generic'
}

function headerIndex(headers, name) {
  return headers.findIndex((h) => h.replace(/\s/g, '').includes(name))
}

function parseBlocks(lines, pageRef) {
  const blocks = []
  let buf = []
  let table = []
  let lastTable = null
  const flushProse = () => {
    const text = buf.join('\n').trim()
    buf = []
    if (!text) return
    blocks.push({ type: 'prose', text, page: pageRef.page })
    if (lastTable) lastTable.mergeOpen = false
  }
  const flushTable = () => {
    if (!table.length) return
    const parsed = parseMdTable(table)
    table = []
    if (!parsed) return
    if (lastTable?.mergeOpen && lastTable.headers.join('|') === parsed.headers.join('|')) {
      lastTable.rows.push(...parsed.rows)
      lastTable.endPage = pageRef.page
      if (!lastTable.pages.includes(pageRef.page)) lastTable.pages.push(pageRef.page)
      return
    }
    const block = {
      type: 'table',
      headers: parsed.headers,
      rows: parsed.rows,
      page: pageRef.page,
      endPage: pageRef.page,
      pages: [pageRef.page],
      role: tableRole(parsed.headers),
      mergeOpen: true,
    }
    blocks.push(block)
    lastTable = block
  }
  for (const line of lines) {
    const pm = line.match(/^<!-- SOURCE_PAGE: [AB]:(\d+) -->/)
    if (pm) {
      pageRef.page = Number(pm[1])
      continue
    }
    if (/^<a id=/.test(line) || /^\*\*PDF 第/.test(line) || /^<!-- TABLE:/.test(line) || line.trim() === '---') {
      continue
    }
    if (line.trim().startsWith('|')) {
      flushProse()
      table.push(line)
      continue
    }
    if (table.length && line.trim() === '') {
      flushTable()
      continue
    }
    if (table.length) flushTable()
    buf.push(line)
  }
  if (table.length) flushTable()
  flushProse()
  return blocks
}

function layerOf(line) {
  if (line.includes('〔朱红·名解〕')) return 'definition'
  if (line.includes('〔墨黑·简答〕')) return 'short_answer'
  if (line.includes('〔青绿·扩展〕')) return 'expansion'
  if (line.includes('〔原PDF本段含朱红强调〕')) return 'normal'
  return null
}

function stripMarker(line) {
  return line
    .replace(/\*\*〔朱红·名解〕\*\*/g, '')
    .replace(/\*\*〔墨黑·简答〕\*\*/g, '')
    .replace(/\*\*〔青绿·扩展〕\*\*/g, '')
    .replace(/\*\*〔原PDF本段含朱红强调〕\*\*/g, '')
    .replace(/〔朱红·名解〕/g, '')
    .replace(/〔墨黑·简答〕/g, '')
    .replace(/〔青绿·扩展〕/g, '')
    .replace(/〔原PDF本段含朱红强调〕/g, '')
    .replace(/^>\s*/, '')
    .trim()
}

function parseSections(lines, idPrefix, bEmphasis) {
  const sections = []
  let title = undefined
  let bucket = []
  let bucketLayer = 'normal'
  let sawEmphasis = false
  const flush = () => {
    const sourceText = bucket
      .map((l) => (bucketLayer === 'normal' && !layerOf(l) ? l : stripMarker(l)))
      .join('\n')
      .trim()
    bucket = []
    if (!sourceText) return
    sections.push({
      id: `${idPrefix}-s${sections.length + 1}`,
      title,
      sourceText,
      layer: bucketLayer,
      emphasis: sawEmphasis ? 'b-red-emphasis' : undefined,
    })
    sawEmphasis = false
  }
  const ensure = (layer, emphasis) => {
    if (bucket.length && (layer !== bucketLayer || emphasis !== sawEmphasis)) flush()
    bucketLayer = layer
    if (emphasis) sawEmphasis = true
  }
  for (const line of lines) {
    if (isFurniture(line)) continue
    const hm = line.match(/^####\s+(.+?)\s*$/)
    if (hm) {
      flush()
      title = hm[1].trim()
      bucketLayer = 'normal'
      continue
    }
    if (!line.trim()) {
      if (bucket.length) bucket.push('')
      continue
    }
    const layer = layerOf(line)
    const emphasis = line.includes('〔原PDF本段含朱红强调〕')
    if (layer) ensure(layer, emphasis)
    else ensure(bucket.length ? bucketLayer : 'normal', emphasis && bEmphasis)
    bucket.push(line)
  }
  flush()
  return sections
}

function headingHintsFromSections(sections) {
  const out = []
  for (const s of sections) {
    if (s.title && !out.includes(s.title)) out.push(s.title)
  }
  return out
}

function splitSkeletonHints(cell) {
  const text = cell.trim()
  if (!text) return []
  const parts = text.split(/[；;]/).map((s) => s.trim()).filter(Boolean)
  if (parts.length >= 2 && parts.every((p) => p.length >= 6 && text.includes(p))) {
    return parts.slice(0, 12)
  }
  return [text]
}

function checkPointsFromSections(itemId, sections) {
  const points = []
  const titles = []
  for (const s of sections) {
    if (s.title && !titles.includes(s.title)) {
      const sports = /体育转写|体育例证/.test(s.title)
      titles.push(s.title)
      points.push({
        id: `${itemId}:h:${titles.length}`,
        level: 1,
        label: s.title,
        sourceText: s.title,
        group: s.title,
        role: sports ? 'sports' : 'heading',
      })
    }
    if (s.layer === 'expansion') {
      const group = s.title || '扩展'
      points.push({
        id: `${itemId}:e:${points.length + 1}`,
        level: 2,
        label: clip(s.sourceText, 80),
        sourceText: s.sourceText,
        group,
        role: 'expansion',
      })
      continue
    }
    if (s.layer === 'normal' && s.title && s.sourceText === s.title) continue
    const lines = s.sourceText.split('\n').map((l) => l.trim()).filter(Boolean)
    for (const line of lines) {
      if (line === s.title) continue
      const sports = /体育转写|体育例证/.test(s.title || '') || /体育/.test(line) && (s.title || '').includes('体育')
      points.push({
        id: `${itemId}:p:${points.length + 1}`,
        level: 2,
        label: clip(line, 80),
        sourceText: line,
        group: s.title || '正文',
        role: sports ? 'sports' : 'point',
      })
    }
  }
  return points
}

function clip(s, n) {
  const t = s.replace(/\s+/g, ' ')
  return t.length > n ? `${t.slice(0, n)}…` : t
}

function signalFrom(text) {
  const t = text.replace(/\*\*/g, '').replace(/^>\s*/gm, '').replace(/\s+/g, '')
  const signals = []
  const push = (type, label, value) => {
    const key = `${type}:${label}`
    if (signals.some((s) => `${s.type}:${s.label}` === key)) return
    signals.push(value === undefined ? { type, label } : { type, label, value })
  }
  for (const m of t.matchAll(/题册(\d+)次/g)) {
    push('aggregation', `原资料标注：题册聚合 ${m[1]} 次`, Number(m[1]))
  }
  if (t.includes('【必考】')) push('teacher_must', '原资料标注：老师【必考】')
  if (t.includes('真题')) push('actual_exam', '原资料标注：真题')
  if (t.includes('模拟卷')) push('mock', '原资料标注：模拟卷')
  if (t.includes('思考题')) push('material_note', '原资料标注：教材思考题')
  if (t.includes('聚合冠军')) push('material_note', '原资料标注：聚合冠军')
  return signals
}

function promptOf(lines) {
  const chunks = []
  for (const line of lines) {
    if (line.includes('原资料提示')) chunks.push(line)
  }
  return chunks.join('\n')
}

function keysFromTitle(title) {
  let t = title.replace(/^[一二三四五六七八九十百]+\s+/, '')
  t = t.replace(/[？?。！!，,、；;：:""“”''‘’（）()[\]【】《》]/g, ' ')
  const strip = /简述|简要说明|简要分析|什么是|有哪些|它们的作用是什么|并说明|如何选择|如何|为什么|为何提出|为何|有何区别|有何|分别规范组织中的什么关系|分别|评述|定义|特点|过程及评价|注意事项|影响因素|核心内容|主要思想|基本思想|基本过程|基本方法与工具|作用是什么|含义及优缺点|优缺点|含义|以及|一个|其主要|是什么|关系/g
  const keys = []
  for (const part of t.split(/\s+/)) {
    if (!part) continue
    let s = part.replace(strip, '')
    s = s.replace(/的/g, '')
    if (s.length >= 4 && !GENERIC_KEYS.has(s)) keys.push(s)
  }
  const whole = t.replace(/\s+/g, '').replace(strip, '').replace(/的/g, '')
  if (whole.length >= 4 && whole.length <= 18 && !GENERIC_KEYS.has(whole)) keys.push(whole)
  return [...new Set(keys)]
}

function quotePhrases(text) {
  const found = []
  const re = /[「“]([^」”]{2,16})[」”]/g
  for (const m of text.matchAll(re)) {
    const phrase = m[1].trim()
    if (phrase && text.includes(phrase) && !found.includes(phrase)) found.push(phrase)
  }
  return found.slice(0, 8)
}

function itemBase(source, kind, chapter, title, pages) {
  const id = `${source.toLowerCase()}-${kind.slice(0, 4)}-${hid([source, kind, chapter.title, title])}`
  return {
    id,
    source,
    kind,
    chapterId: chapter.id,
    chapter: chapter.title,
    chapterIndex: chapter.index,
    title: title.trim(),
    pdfPages: [...new Set(pages)].filter((n) => n > 0).sort((a, b) => a - b),
    anchor: id,
    originalMarkdown: '',
    sections: [],
    tables: [],
    reviewedHeadingHints: [],
    reviewedKeywordHints: [],
    redlineIds: [],
    confirmedRelatedIds: [],
    candidateRelatedIds: [],
    sourceSignals: [],
    checkPoints: [],
    coreA: false,
    appendixFullAnswer: false,
    fullTextForLookup: false,
  }
}

function parseBook(text, source) {
  const pages = splitPages(text, source)
  const lines = text.split('\n')
  const chapters = []
  const items = []
  const failures = []
  let chapter = null
  let sectionLines = []
  let sectionHeading = null
  let sectionKind = 'intro'
  let sectionStartPage = 0
  const pageRef = { page: 0 }

  const chapterId = (title) => `${source.toLowerCase()}-ch-${hid([source, title])}`

  const closeSection = () => {
    if (!chapter) {
      sectionLines = []
      return
    }
    const blocks = parseBlocks(sectionLines, { page: sectionStartPage || chapter.pageAtStart || 1 })
    if (sectionKind === 'a-question' || sectionKind === 'appendix-full' || sectionKind === 'b-topic') {
      const item = itemBase(source, sectionKind === 'b-topic' ? 'skeleton' : 'full_answer', chapter, sectionHeading, [])
      item.originalMarkdown = sectionLines.filter((l) => !isFurniture(l)).join('\n').trim()
      item.sections = parseSections(sectionLines, item.id, source === 'B')
      item.reviewedHeadingHints = headingHintsFromSections(item.sections)
      item.checkPoints = checkPointsFromSections(item.id, item.sections)
      item.tables = blocks.filter((b) => b.type === 'table').map(slimTable)
      item.pdfPages = pagesOf(sectionLines, sectionStartPage || chapter.pageAtStart)
      item.sourceSignals = signalFrom(promptOf(sectionLines))
      if (sectionKind === 'a-question') item.coreA = true
      if (sectionKind === 'appendix-full') {
        item.appendixFullAnswer = true
        item.kind = 'full_answer'
      }
      if (sectionKind === 'b-topic') {
        item.fullTextForLookup = true
        item.kind = 'skeleton'
        item.sourceSignals = signalFrom(promptOf(sectionLines) || item.originalMarkdown.slice(0, 180))
      }
      items.push(item)
      chapter.flow.push({ type: 'item', itemId: item.id })
    } else if (sectionKind === 'generic' && chapter.isGuide) {
      for (const b of blocks) {
        if (b.type === 'prose') chapter.flow.push({ type: 'prose', text: b.text, page: b.page })
        if (b.type === 'table') chapter.flow.push(flowTable(b))
      }
    } else if (sectionKind === 'appendix-piece' || sectionKind === 'reference-piece' || sectionKind === 'generic') {
      const kind = sectionKind === 'reference-piece' ? 'reference' : sectionKind === 'appendix-piece' ? 'appendix' : 'reference'
      const item = itemBase(source, kind === 'appendix' ? 'appendix' : 'reference', chapter, sectionHeading || chapter.title, [])
      if (blocks.some((b) => b.type === 'table' && b.role === 'comparison')) item.kind = 'comparison'
      item.originalMarkdown = sectionLines.filter((l) => !isFurniture(l)).join('\n').trim()
      item.sections = parseSections(sectionLines, item.id, source === 'B')
      item.reviewedHeadingHints = headingHintsFromSections(item.sections)
      item.tables = blocks.filter((b) => b.type === 'table').map(slimTable)
      item.pdfPages = pagesOf(sectionLines, sectionStartPage || chapter.pageAtStart)
      item.sourceSignals = signalFrom(`${promptOf(sectionLines)}\n${item.title}`)
      if (item.kind === 'comparison') {
        item.checkPoints = comparisonPoints(item)
      } else {
        item.checkPoints = checkPointsFromSections(item.id, item.sections).slice(0, 24)
      }
      items.push(item)
      for (const b of blocks) {
        if (b.type === 'prose') chapter.flow.push({ type: 'prose', text: b.text, page: b.page })
        if (b.type === 'table') chapter.flow.push(flowTable(b, null))
      }
      chapter.flow.push({ type: 'item', itemId: item.id })
    } else {
      // intro, skeleton section, redline section
      if (sectionHeading && (sectionKind === 'skeleton-section' || sectionKind === 'redline-section')) {
        chapter.flow.push({ type: 'prose', text: `### ${sectionHeading}`, page: chapter.pageAtStart })
      }
      for (const b of blocks) {
        if (b.type === 'prose') {
          chapter.flow.push({ type: 'prose', text: b.text, page: b.page })
          if (sectionKind === 'intro') chapter.intro = `${chapter.intro ? `${chapter.intro}\n\n` : ''}${b.text}`
        }
        if (b.type === 'table') {
          const rowItemIds = []
          if (!chapter.isAppendix && b.role === 'skeleton') {
            const iK = headerIndex(b.headers, '考点')
            const iH = headerIndex(b.headers, '小标题')
            const iS = headerIndex(b.headers, '出处')
            for (const row of b.rows) {
              const title = row[iK] || row[0] || '未命名考点'
              const hintsCell = row[iH] || ''
              const srcCell = row[iS] || ''
              const item = itemBase(source, 'skeleton', chapter, title, b.pages)
              item.originalMarkdown = `| ${b.headers.join(' | ')} |\n| ${row.join(' | ')} |`
              item.sections = [
                { id: `${item.id}-s1`, title: '小标题', sourceText: hintsCell, layer: 'normal' },
                { id: `${item.id}-s2`, title: '出处', sourceText: srcCell, layer: 'normal' },
              ]
              item.reviewedHeadingHints = splitSkeletonHints(hintsCell)
              item.pdfPages = [...b.pages]
              item.tables = [slimTable({ ...b, rows: [row] })]
              item.sourceSignals = signalFrom(`${srcCell}\n${title}`)
              item.checkPoints = item.reviewedHeadingHints.map((h, idx) => ({
                id: `${item.id}:h:${idx + 1}`,
                level: 1,
                label: clip(h, 80),
                sourceText: h,
                group: '小标题',
                role: 'heading',
              }))
              items.push(item)
              rowItemIds.push(item.id)
            }
          } else if (!chapter.isAppendix && b.role === 'redline') {
            const iB = headerIndex(b.headers, '别写')
            const iW = headerIndex(b.headers, '要写')
            const iE = headerIndex(b.headers, '依据')
            for (const row of b.rows) {
              const bad = row[iB] || ''
              const good = row[iW] || ''
              const evidence = row[iE] || ''
              const title = `别写「${clip(bad, 28)}」→ 要写「${clip(good, 28)}」`
              const item = itemBase(source, 'redline', chapter, title, b.pages)
              item.originalMarkdown = `| ${b.headers.join(' | ')} |\n| ${row.join(' | ')} |`
              item.sections = [
                { id: `${item.id}-s1`, title: '别写', sourceText: bad, layer: 'normal' },
                { id: `${item.id}-s2`, title: '要写', sourceText: good, layer: 'normal' },
                { id: `${item.id}-s3`, title: '依据', sourceText: evidence, layer: 'normal' },
              ]
              item.reviewedHeadingHints = [good].filter(Boolean)
              item.pdfPages = [...b.pages]
              item.tables = [slimTable({ ...b, rows: [row] })]
              item.sourceSignals = signalFrom(`${evidence}\n${good}`)
              item.checkPoints = [
                { id: `${item.id}:h:1`, level: 1, label: clip(good, 80), sourceText: good, group: '要写', role: 'heading' },
              ]
              items.push(item)
              rowItemIds.push(item.id)
            }
          }
          chapter.flow.push(flowTable(b, rowItemIds.length ? rowItemIds : undefined))
        }
      }
    }
    sectionLines = []
  }

  for (const line of lines) {
    const pm = line.match(/^<!-- SOURCE_PAGE: [AB]:(\d+) -->/)
    if (pm) pageRef.page = Number(pm[1])
    if (line.startsWith('## ')) {
      closeSection()
      const title = line.replace(/^##\s+/, '').trim()
      const isAppendix = title.startsWith('附录')
      const isChapter = /^第[一二三四五六七八九十]+章/.test(title) || title.startsWith('绪论')
      chapter = {
        id: chapterId(title),
        source,
        title,
        index: chapterIndex(title),
        isAppendix,
        isChapter,
        isGuide: !isAppendix && !isChapter,
        pageAtStart: pageRef.page || 1,
        intro: '',
        flow: [],
      }
      chapters.push(chapter)
      sectionHeading = null
      sectionKind = 'intro'
      sectionLines = []
      sectionStartPage = pageRef.page || 1
      continue
    }
    if (line.startsWith('### ') && chapter) {
      closeSection()
      sectionHeading = line.replace(/^###\s+/, '').trim()
      sectionKind = classifyH3(sectionHeading, chapter, source)
      sectionLines = []
      sectionStartPage = pageRef.page || sectionStartPage
      continue
    }
    if (!chapter && line.trim() && !isFurniture(line)) {
      // 文件头，归入即将出现的首章之前的暂存。先挂到一个引导章。
      if (!chapters.length) {
        chapter = {
          id: `${source.toLowerCase()}-ch-${hid([source, '文件说明'])}`,
          source,
          title: '文件说明',
          index: -1,
          isAppendix: false,
          isChapter: false,
          isGuide: true,
          pageAtStart: 0,
          intro: '',
          flow: [],
        }
        chapters.unshift(chapter)
        sectionKind = 'intro'
      }
    }
    sectionLines.push(line)
  }
  closeSection()

  // 文件说明若在第一页之前插入，保证顺序
  return { pages, chapters, items, failures }
}

function classifyH3(title, chapter, source) {
  if (/B\s*级骨架/.test(title)) return 'skeleton-section'
  if (/答题红线/.test(title)) return 'redline-section'
  if (chapter.isAppendix) {
    if (source === 'A' && /^附[一二](\s|$)/.test(title)) return 'appendix-full'
    if (source === 'A' && /^附三/.test(title)) return 'appendix-piece'
    if (source === 'A' && /^附四/.test(title)) return 'reference-piece'
    if (source === 'B' && /^附一/.test(title)) return 'appendix-piece'
    if (source === 'B' && /^附[二三]/.test(title)) return 'appendix-piece'
    if (source === 'B' && /^附四/.test(title)) return 'reference-piece'
    return 'appendix-piece'
  }
  if (/^[一二三四五六七八九十]+\s+\S/.test(title)) {
    if (source === 'A' && chapter.isChapter) return 'a-question'
    if (source === 'B' && chapter.isChapter) return 'b-topic'
  }
  return 'generic'
}

function pagesOf(lines, start) {
  const set = new Set()
  let page = start || 0
  let any = false
  for (const line of lines) {
    const m = line.match(/^<!-- SOURCE_PAGE: [AB]:(\d+) -->/)
    if (m) {
      page = Number(m[1])
      continue
    }
    if (!isFurniture(line) && line.trim()) {
      if (page > 0) set.add(page)
      any = true
    }
  }
  if (!any && start > 0) set.add(start)
  return [...set].sort((a, b) => a - b)
}

function slimTable(b) {
  return { headers: b.headers, rows: b.rows, role: b.role, page: b.page }
}

function flowTable(b, rowItemIds) {
  return {
    type: 'table',
    headers: b.headers,
    rows: b.rows,
    role: b.role,
    page: b.page,
    pages: b.pages,
    rowItemIds: rowItemIds || [],
  }
}

function comparisonPoints(item) {
  const table = item.tables[0]
  if (!table) return []
  return table.rows.slice(0, 12).map((row, idx) => ({
    id: `${item.id}:c:${idx + 1}`,
    level: 1,
    label: clip(row.filter(Boolean).join(' / '), 80),
    sourceText: row.join(' | '),
    group: item.title,
    role: 'heading',
  }))
}

const GENERIC_LCS = new Set([
  '管理', '组织', '决策', '控制', '计划', '创新', '沟通', '领导', '激励', '文化', '理论', '过程', '内容',
  '方法', '体育', '功能', '结构', '环境', '目标', '原则', '特点', '关系', '系统', '活动', '基本', '主要',
  '工作', '定义', '评价', '含义', '因素', '影响', '实施', '类型', '形式', '思想', '工具', '调整', '设计',
  '简述', '简要', '什么', '如何', '哪些', '以及', '分别', '注意', '事项', '核心', '层次', '策略', '不同',
  '组织文化', '组织结构', '管理活动', '决策过程', '人员配备', '历史演变', '组织设计', '组织创新',
  '创新原理', '管理理论', '控制类型',
])

const DISTINCTIVE_2 = new Set(['泰勒', '西蒙', '危机', '风险', '幅度', '冲突', '选聘', '原理', '标准', '预算', '勒温', '整合'])

function cleanTitle(title) {
  return title
    .replace(/^[一二三四五六七八九十]+\s+/, '')
    .replace(/简述|简要说明|简要分析|什么是|有哪些|并说明|如何选择|它们的作用是什么|作用是什么|为什么|为何提出|为何|有何区别|有何|评述|是什么|各举一个体育管理实例/g, '')
    .replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, '')
}

function bestShared(a, b) {
  if (!a || !b) return ''
  const chars = [...a]
  for (let len = Math.min(chars.length, 16); len >= 2; len--) {
    for (let i = 0; i + len <= chars.length; i++) {
      const sub = chars.slice(i, i + len).join('')
      if (GENERIC_LCS.has(sub) || sub.includes('的')) continue
      if (len < 4 && !DISTINCTIVE_2.has(sub)) continue
      if (b.includes(sub)) return sub
    }
  }
  return ''
}

function relationRole(b) {
  if (b.kind === 'redline') return 'redline'
  if (b.fullTextForLookup) return 'topic'
  if (b.kind === 'comparison') return 'comparison'
  if (b.kind === 'skeleton') return 'skeleton'
  return b.kind
}

function buildRelations(items) {
  const aItems = items.filter((it) => it.source === 'A' && (it.coreA || it.appendixFullAnswer))
  const bItems = items.filter((it) => it.source === 'B')
  const relations = []
  const seen = new Set()
  const add = (a, b, status, reason, quote) => {
    const role = relationRole(b)
    const key = `${a.id}|${b.id}|${role}`
    if (seen.has(key)) return
    seen.add(key)
    relations.push({
      id: `rel-${hid([a.id, b.id, role])}`,
      aItemId: a.id,
      bItemId: b.id,
      reason,
      status,
      role,
      evidenceQuote: quote,
      humanTouched: false,
    })
  }
  for (const b of bItems) {
    const text = b.originalMarkdown || ''
    const cited = text.match(/见第([一二三四五六七八九十]+)章第([一二三四五六七八九十]+)题/)
    if (cited) {
      const ch = cnToInt(cited[1])
      const qn = cnToInt(cited[2])
      const group = aItems.filter((a) => a.coreA && a.chapterIndex === ch)
      const target = group[qn - 1]
      if (target) {
        add(
          target,
          b,
          'candidate',
          `B册原句「${cited[0]}」。按章内第 ${qn} 题暂对到「${target.title}」，但是否就是A册题序不能确定`,
          text.split('\n').find((line) => line.includes(cited[0]))?.trim() || cited[0],
        )
      }
    }
    const local = text.match(/见本章第([一二三四五六七八九十]+)题/)
    if (local) {
      const qn = cnToInt(local[1])
      const group = aItems.filter((a) => a.coreA && a.chapterIndex === b.chapterIndex)
      const target = group[qn - 1]
      if (target) {
        add(
          target,
          b,
          'candidate',
          `B册原句「${local[0]}」。暂对到本章 A 题第 ${qn} 题，编号体系未必是 A 册`,
          text.split('\n').find((line) => line.includes(local[0]))?.trim() || local[0],
        )
      }
    }
  }
  for (const a of aItems) {
    const cleaned = cleanTitle(a.title)
    const scored = []
    for (const b of bItems) {
      const sameChapter = a.chapterIndex === b.chapterIndex && a.chapterIndex > 0 && a.chapterIndex < 90
      const bad = b.sections.find((s) => s.title === '别写')?.sourceText || ''
      const good = b.sections.find((s) => s.title === '要写')?.sourceText || ''
      const hint = b.sections.find((s) => s.title === '小标题')?.sourceText || ''
      const titleHay = b.kind === 'redline' ? bad : b.title
      const nearHay = b.kind === 'redline' ? `${bad}\n${good}` : `${b.title}\n${hint}`
      const sharedTitle = bestShared(cleaned, titleHay)
      const sharedNear = bestShared(cleaned, nearHay)
      const shared = sharedTitle || (sameChapter ? sharedNear : '')
      if (!shared || !sameChapter) continue
      const titleLen = (b.title || '').replace(/\s/g, '').length || 1
      const confirm =
        sharedTitle.length >= 4 &&
        (b.kind === 'redline' ||
          (b.kind === 'skeleton' && !b.fullTextForLookup && sharedTitle.length / titleLen >= 0.5 && b.title.includes(sharedTitle)))
      scored.push({ b, shared: sharedTitle || sharedNear, confirm, sameChapter, via: sharedTitle ? 'title' : 'near' })
    }
    scored.sort((p, q) => Number(q.confirm) - Number(p.confirm) || q.shared.length - p.shared.length)
    for (const s of scored.slice(0, 8)) {
      const status = s.confirm ? 'confirmed-by-source' : 'candidate'
      const reason = s.confirm
        ? `同章且${s.b.kind === 'redline' ? '红线「别写」' : '条目标题'}包含源文片段「${s.shared}」`
        : s.sameChapter
          ? `同章且${s.via === 'title' ? '标题或别写' : '邻近原文'}包含「${s.shared}」，尚未当作训练提示`
          : `跨章标题附近包含「${s.shared}」，仅作候选`
      add(
        a,
        s.b,
        status,
        reason,
        `A题「${a.title}」；B条目「${s.b.title}」；共有原文片段「${s.shared}」。`,
      )
    }
  }
  return relations
}

function applyRelations(items, relations) {
  const byA = new Map()
  for (const r of relations) {
    if (!byA.has(r.aItemId)) byA.set(r.aItemId, [])
    byA.get(r.aItemId).push(r)
  }
  for (const item of items) {
    const rels = byA.get(item.id) || []
    item.confirmedRelatedIds = rels.filter((r) => r.status === 'confirmed-by-source').map((r) => r.bItemId)
    item.candidateRelatedIds = rels.filter((r) => r.status === 'candidate').map((r) => r.bItemId)
    if (item.kind === 'full_answer') {
      item.redlineIds = rels.filter((r) => r.role === 'redline' && r.status === 'confirmed-by-source').map((r) => r.bItemId)
    }
  }
}

function buildKeywords(items) {
  const pack = []
  for (const item of items) {
    if (item.kind === 'reference') continue
    const blob = `${item.title}\n${item.sections.map((s) => s.sourceText).join('\n')}`
    const phrases = quotePhrases(blob).filter((p) => p !== item.title && blob.includes(p))
    if (!phrases.length) continue
    pack.push({
      itemId: item.id,
      hints: phrases.map((text) => ({
        id: `kw-${hid([item.id, text])}`,
        text,
        status: 'candidate',
        evidence: `源文原样包含「${text}」`,
        humanTouched: false,
      })),
    })
  }
  return pack
}

function preserveHuman(nextList, prevList, idKey = 'id') {
  if (!prevList) return nextList
  const prev = new Map(prevList.map((x) => [x[idKey], x]))
  return nextList.map((item) => {
    const old = prev.get(item[idKey])
    if (old?.humanTouched) return { ...item, status: old.status, humanTouched: true }
    return item
  })
}

function readJson(path) {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function countMarker(text, marker) {
  return text.split(marker).length - 1
}

function writeReport(ctx) {
  const { a, b, items, relations, keywords, hashA, hashB, failures } = ctx
  const aCore = items.filter((i) => i.coreA)
  const aApp = items.filter((i) => i.appendixFullAnswer)
  const b9 = items.filter((i) => i.source === 'B' && i.chapter.startsWith('第九章') && i.fullTextForLookup)
  const b10 = items.filter((i) => i.source === 'B' && i.chapter.startsWith('第十章') && i.fullTextForLookup)
  const skel = items.filter((i) => i.source === 'B' && i.kind === 'skeleton' && !i.fullTextForLookup)
  const red = items.filter((i) => i.kind === 'redline')
  const confirmed = relations.filter((r) => r.status === 'confirmed-by-source')
  const candidates = relations.filter((r) => r.status === 'candidate')
  const aPages = new Set(a.pages.map((p) => p.page))
  const bPages = new Set(b.pages.map((p) => p.page))
  const missingA = []
  const missingB = []
  for (let i = 1; i <= 50; i++) if (!aPages.has(i)) missingA.push(i)
  for (let i = 1; i <= 42; i++) if (!bPages.has(i)) missingB.push(i)
  const phraseChecks = [
    ['目标管理第四个特点', '建立系统的目标体系'],
    ['控制第一步确定标准', '确定标准'],
    ['负强化不是惩罚', '负强化不是惩罚'],
    ['风险分担', '风险分担'],
    ['损失减低管理', '损失减低管理'],
    ['马工程管理原理', '人本原理、系统原理、效益原理、适度原理'],
    ['张瑞林管理原理', '责任原理'],
    ['高雪峰管理原理', '没有责任原理'],
    ['弗鲁姆三方面关系', '努力与绩效的关系'],
    ['勒温', '勒温'],
    ['莫尔斯和洛什', '莫尔斯和洛什'],
  ]
  const allText = `${a.raw}\n${b.raw}`
  const lines = []
  lines.push('# 内容解析报告')
  lines.push('')
  lines.push(`- 资料版本：\`${CONTENT_VERSION}\``)
  lines.push(`- 记录结构：schemaVersion ${SCHEMA_VERSION}`)
  lines.push(`- 生成时间：${ctx.builtAt}`)
  lines.push(`- A册 sha256：\`${hashA}\``)
  lines.push(`- B册 sha256：\`${hashB}\``)
  lines.push('')
  lines.push('## 版本冲突（原文保留，未静默修改）')
  lines.push('')
  lines.push('- A册封面原文：「硬性背诵 · 全26题」。')
  lines.push('- B册目录页原文：「A级（25道）：完整答案，必须能默写，见A级册。」')
  lines.push(`- 程序采用的核心 A 题清单：A册正文解析到的 **${aCore.length}** 题。B册「25道」原文不改。`)
  lines.push('- B册第一章写道：方法与工具按 B 级准备。A册正文仍有完整题「管理的基本方法与工具有哪些？」。该题保持 A 册完整题，不降级。')
  lines.push('- B册第二章骨架有一句「见第一章第三题（四）」。A册第一章第三题标题是当代社会特征，与「理论与工具是科学的」不完全同题。此条只进候选，不自动确认。')
  lines.push('')
  lines.push('## A册')
  lines.push('')
  lines.push(`- 核心题：${aCore.length}（预期 26）`)
  lines.push(`- 附录完整答案：${aApp.length}（预期 2，附一、附二）`)
  lines.push(`- 源页：${a.pages.length} 页；缺失页：${missingA.length ? missingA.join(', ') : '无'}`)
  lines.push(`- 朱红名解标记：${countMarker(a.raw, '〔朱红·名解〕')}`)
  lines.push(`- 墨黑简答标记：${countMarker(a.raw, '〔墨黑·简答〕')}`)
  lines.push(`- 青绿扩展标记：${countMarker(a.raw, '〔青绿·扩展〕')}`)
  lines.push(`- 含扩展层的核心题：${aCore.filter((i) => i.sections.some((s) => s.layer === 'expansion')).length}`)
  lines.push(`- 含名解层的核心题：${aCore.filter((i) => i.sections.some((s) => s.layer === 'definition')).length}`)
  lines.push(`- 含简答层的核心题：${aCore.filter((i) => i.sections.some((s) => s.layer === 'short_answer')).length}`)
  lines.push('- 跨页题目：按题干聚合，页码写入 pdfPages，不按页拆题。')
  lines.push('')
  lines.push('### 核心题清单')
  lines.push('')
  for (const it of aCore) {
    lines.push(`- ${it.chapter}｜${it.title}｜页 ${it.pdfPages.join(',')}｜小标题 ${it.reviewedHeadingHints.length}｜采分点 ${it.checkPoints.length}`)
  }
  lines.push('')
  lines.push('### 附录')
  lines.push('')
  for (const it of items.filter((i) => i.source === 'A' && !i.coreA && i.chapter.startsWith('附录'))) {
    lines.push(`- [${it.kind}] ${it.title}`)
  }
  lines.push('')
  lines.push('## B册')
  lines.push('')
  lines.push(`- 骨架表行（不含第九、十章全文专题）：${skel.length}`)
  lines.push(`- 答题红线行：${red.length}`)
  lines.push(`- 第九章全文专题：${b9.length}（预期 7）`)
  lines.push(`- 第十章全文专题：${b10.length}（预期 8）`)
  lines.push(`- 源页：${b.pages.length} 页；缺失页：${missingB.length ? missingB.join(', ') : '无'}`)
  lines.push('- 第九、十章条目 kind=skeleton，fullTextForLookup=true。优先级不因全文长度提高。')
  lines.push('- B册「〔原PDF本段含朱红强调〕」记为 emphasis，layer 仍是 normal，不当作 A 册名解层。')
  lines.push('- 跨页表格：相同表头且中间只有换页标记时合并行，不拆成残表。')
  lines.push('')
  lines.push('### 第九章专题')
  lines.push('')
  for (const it of b9) lines.push(`- ${it.title}｜页 ${it.pdfPages.join(',')}`)
  lines.push('')
  lines.push('### 第十章专题')
  lines.push('')
  for (const it of b10) lines.push(`- ${it.title}｜页 ${it.pdfPages.join(',')}`)
  lines.push('')
  lines.push('### 各章骨架行数')
  lines.push('')
  const byCh = new Map()
  for (const it of skel) byCh.set(it.chapter, (byCh.get(it.chapter) || 0) + 1)
  for (const [ch, n] of byCh) lines.push(`- ${ch}：${n}`)
  lines.push('')
  lines.push('### 红线')
  lines.push('')
  lines.push(`共 ${red.length} 条。合用红线（第九至十一章、第十五十六章）保留在资料原章节下，不复制到另一章。`)
  lines.push('')
  lines.push('## 原词抽查')
  lines.push('')
  for (const [name, phrase] of phraseChecks) {
    lines.push(`- ${name}：「${phrase}」${allText.includes(phrase) ? '在源文中' : '未找到'}`)
  }
  lines.push('')
  lines.push('## 关系')
  lines.push('')
  lines.push(`- 已由源文结构确认：${confirmed.length}（其中骨架/专题 ${confirmed.filter((r) => r.role === 'skeleton' || r.role === 'topic').length}，红线 ${confirmed.filter((r) => r.role === 'redline').length}）`)
  lines.push(`- 待人工审核候选：${candidates.length}`)
  lines.push('- 确认规则：同章，且红线「别写」或骨架条目标题包含题干里的连续原文片段（至少 4 字，且不是「管理、组织、决策、组织文化」这类泛词）。只在正文或「要写」里碰到的词，以及「见第X章第Y题」这类编号，一律保持候选。')
  lines.push('- 候选不会进入正式提示链。')
  lines.push('')
  lines.push('### 已确认')
  lines.push('')
  if (!confirmed.length) lines.push('- （无）')
  for (const r of confirmed) {
    const aItem = items.find((i) => i.id === r.aItemId)
    const bItem = items.find((i) => i.id === r.bItemId)
    lines.push(`- [${r.role}] ${aItem?.title || r.aItemId} ↔ ${bItem?.title || r.bItemId}。${r.reason}`)
  }
  lines.push('')
  lines.push('## 关键词')
  lines.push('')
  const kwCount = keywords.reduce((n, k) => n + k.hints.length, 0)
  const kwConfirmed = keywords.reduce((n, k) => n + k.hints.filter((h) => h.status === 'confirmed' || h.status === 'confirmed-by-source').length, 0)
  lines.push(`- 候选短语：${kwCount}，分布在 ${keywords.length} 个条目。`)
  lines.push(`- 已审核并启用：${kwConfirmed}。`)
  lines.push('- 候选全部是源文引号内的原词。未审核的不进入关键词提示层；该题会从小标题直接进入完整原文核对。')
  lines.push('')
  lines.push('## 解析失败与未决')
  lines.push('')
  if (aCore.length !== 26) failures.push(`A册核心题 ${aCore.length}，与预期 26 不一致`)
  if (aApp.length !== 2) failures.push(`A册附录完整题 ${aApp.length}，与预期 2 不一致`)
  if (b9.length !== 7) failures.push(`第九章专题 ${b9.length}，与预期 7 不一致`)
  if (b10.length !== 8) failures.push(`第十章专题 ${b10.length}，与预期 8 不一致`)
  if (missingA.length) failures.push(`A册缺页 ${missingA.join(',')}`)
  if (missingB.length) failures.push(`B册缺页 ${missingB.join(',')}`)
  for (const phrase of phraseChecks) if (!allText.includes(phrase[1])) failures.push(`抽查未找到：${phrase[1]}`)
  if (!failures.length) lines.push('- 预期数量与抽查原词均对上。没有为了凑数补造条目。')
  else for (const f of failures) lines.push(`- ${f}`)
  lines.push('')
  lines.push('## 条目合计')
  lines.push('')
  const kinds = {}
  for (const it of items) kinds[`${it.source}:${it.kind}`] = (kinds[`${it.source}:${it.kind}`] || 0) + 1
  for (const [k, n] of Object.entries(kinds)) lines.push(`- ${k}：${n}`)
  lines.push(`- 总计：${items.length}`)
  lines.push('')
  return { markdown: lines.join('\n'), failures, aCore: aCore.length, aApp: aApp.length, b9: b9.length, b10: b10.length }
}

function loadPrevRelations() {
  const data = readJson(join(root, 'manual-review/relations.json'))
  return data?.relations || null
}

function loadPrevKeywords() {
  const data = readJson(join(root, 'manual-review/keyword-hints.json'))
  if (!data?.items) return null
  const hints = []
  for (const item of data.items) {
    for (const h of item.hints || []) hints.push(h)
  }
  return hints
}

function main() {
  const pathA = join(root, 'sources/管理学A册_完整转换.md')
  const pathB = join(root, 'sources/管理学B册_完整转换.md')
  const rawA = readFileSync(pathA, 'utf8')
  const rawB = readFileSync(pathB, 'utf8')
  const hashA = sha256(rawA)
  const hashB = sha256(rawB)
  const a = parseBook(rawA, 'A')
  const b = parseBook(rawB, 'B')
  a.raw = rawA
  b.raw = rawB
  const items = [...a.items, ...b.items]
  let relations = buildRelations(items)
  const prevRel = loadPrevRelations()
  if (prevRel) relations = preserveHuman(relations, prevRel)
  applyRelations(items, relations)
  let keywordItems = buildKeywords(items)
  const prevKw = loadPrevKeywords()
  if (prevKw) {
    keywordItems = keywordItems.map((bucket) => ({
      ...bucket,
      hints: preserveHuman(bucket.hints, prevKw),
    }))
  }
  for (const item of items) {
    const bucket = keywordItems.find((k) => k.itemId === item.id)
    item.reviewedKeywordHints = (bucket?.hints || [])
      .filter((h) => h.status === 'confirmed' || h.status === 'confirmed-by-source')
      .map((h) => h.text)
  }
  const builtAt = new Date().toISOString()
  const failures = []
  const report = writeReport({ a, b, items, relations, keywords: keywordItems, hashA, hashB, failures, builtAt })
  const content = {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      contentVersion: CONTENT_VERSION,
      sourceHashes: { A: hashA, B: hashB },
      builtAt,
    },
    versionConflict: {
      aStatement: '硬性背诵 · 全26题',
      bStatement: 'A级（25道）：完整答案，必须能默写，见A级册。',
      resolution: '核心 A 题以 A 册正文解析结果为准。B 册「25道」保持原文，不静默改写。',
    },
    pages: [...a.pages, ...b.pages],
    chapters: [...a.chapters, ...b.chapters].map((ch) => ({
      id: ch.id,
      source: ch.source,
      title: ch.title,
      index: ch.index,
      isAppendix: ch.isAppendix,
      isChapter: ch.isChapter,
      isGuide: ch.isGuide,
      intro: ch.intro || '',
      flow: ch.flow,
    })),
    items,
    relations,
    keywords: keywordItems,
  }
  mkdirSync(join(root, 'src/data/generated'), { recursive: true })
  mkdirSync(join(root, 'reports'), { recursive: true })
  mkdirSync(join(root, 'manual-review'), { recursive: true })
  writeFileSync(join(root, 'src/data/generated/content.json'), JSON.stringify(content))
  writeFileSync(join(root, 'reports/content-parse-report.md'), report.markdown)
  writeFileSync(
    join(root, 'manual-review/relations.json'),
    JSON.stringify(
      {
        note: 'status 为 candidate 的关系不会进入正式提示链。把 humanTouched 设为 true 后，重新解析会保留你改过的 status。',
        relations,
      },
      null,
      2,
    ),
  )
  writeFileSync(
    join(root, 'manual-review/keyword-hints.json'),
    JSON.stringify(
      {
        note: '候选短语都是源文里真实出现的引号原词。status 保持 candidate 时，训练会跳过关键词层。确认后把 status 改为 confirmed，并把 humanTouched 设为 true。',
        items: keywordItems,
      },
      null,
      2,
    ),
  )
  console.log(
    JSON.stringify(
      {
        items: items.length,
        aCore: report.aCore,
        aApp: report.aApp,
        b9: report.b9,
        b10: report.b10,
        relations: relations.length,
        confirmed: relations.filter((r) => r.status === 'confirmed-by-source').length,
        failures: report.failures,
      },
      null,
      2,
    ),
  )
  if (report.failures.length) process.exitCode = 1
}

main()
