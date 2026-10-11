import { useMemo, useState } from 'react'
import { content, getItem } from '../content'
import { DataTable, escapeHtml, RedlineCard, RichText, SectionList, Signals } from '../components/render'
import { useApp } from '../state/store'
import type { ReaderMode, Section, StudyItem } from '../types'

export function Library() {
  const app = useApp()
  const lib = app.state.library
  const chapters = content.chapters.filter((chapter) => lib.source === 'all' || chapter.source === lib.source)
  const chapter = chapters.find((row) => row.id === lib.chapterId) || chapters[0]
  const hits = useMemo(() => search(lib.query), [lib.query])
  const item = lib.itemId ? getItem(lib.itemId) : undefined
  const page = content.pages.find((row) => row.anchor === lib.pageAnchor)
  const note = app.state.notes.find((row) => row.itemId === item?.id)?.text || ''
  return (
    <div className="library">
      <aside>
        <div className="actions">
          {(['A', 'B', 'all'] as const).map((source) => (
            <button key={source} type="button" className={lib.source === source ? 'btn primary' : 'btn'} onClick={() => app.setLibrary({ source, chapterId: '', itemId: '', pageAnchor: '' })}>{source === 'all' ? '全部' : `${source}册`}</button>
          ))}
        </div>
        <input value={lib.query} placeholder="搜索原文" onChange={(event) => app.setLibrary({ query: event.target.value, itemId: '', pageAnchor: '' })} />
        <ul className="toc">
          {chapters.map((row) => (
            <li key={row.id}>
              <button type="button" className={chapter?.id === row.id ? 'on' : ''} onClick={() => app.setLibrary({ chapterId: row.id, itemId: '', pageAnchor: '' })}>{row.title}</button>
            </li>
          ))}
        </ul>
      </aside>
      <div className="stack">
        {lib.query.trim() ? (
          <section className="card">
            <h2>搜索 {hits.length} 条</h2>
            <ul className="plain">
              {hits.slice(0, 40).map((hit) => (
                <li key={hit.anchor + hit.title}>
                  <button type="button" className="linkish" onClick={() => app.setLibrary({ pageAnchor: hit.anchor, source: hit.source, chapterId: '', itemId: '' })}>{hit.source} 第 {hit.page} 页 · {hit.title}</button>
                  <small dangerouslySetInnerHTML={{ __html: hit.snippet }} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {page ? <PageView anchor={page.anchor} markdown={page.markdown} page={page.page} source={page.source} /> : null}
        {!page && item ? <ItemView key={item.id} item={item} mode={lib.mode} note={note} /> : null}
        {!page && !item && chapter ? <ChapterView chapterId={chapter.id} /> : null}
      </div>
    </div>
  )
}

function ChapterView({ chapterId }: { chapterId: string }) {
  const app = useApp()
  const chapter = content.chapters.find((row) => row.id === chapterId)
  if (!chapter) return null
  const items = content.items.filter((item) => item.chapterId === chapter.id)
  const index = content.chapters.filter((row) => row.source === chapter.source).findIndex((row) => row.id === chapter.id)
  const siblings = content.chapters.filter((row) => row.source === chapter.source)
  return (
    <article className="stack">
      <header className="page-head">
        <div>
          <p className="kicker">{chapter.source}册</p>
          <h1>{chapter.title}</h1>
        </div>
        <div className="actions">
          <button className="btn" type="button" disabled={index <= 0} onClick={() => app.setLibrary({ chapterId: siblings[index - 1].id })}>上一章</button>
          <button className="btn" type="button" disabled={index >= siblings.length - 1} onClick={() => app.setLibrary({ chapterId: siblings[index + 1].id })}>下一章</button>
        </div>
      </header>
      {chapter.title.includes('文件说明') || chapter.title.includes('目录') || chapter.title.includes('封面') ? <Conflict /> : null}
      {chapter.intro ? <RichText text={chapter.intro} /> : null}
      {chapter.flow.map((block, i) => {
        if (block.type === 'prose') return <RichText key={i} text={block.text || ''} />
        if (block.type === 'table') {
          return (
            <div key={i}>
              <DataTable table={{ headers: block.headers || [], rows: block.rows || [], role: block.role }} />
              {block.role === 'redline' ? <p className="muted">红线表保持「别写 / 要写 / 依据」三列。</p> : null}
            </div>
          )
        }
        const row = block.itemId ? getItem(block.itemId) : undefined
        if (!row) return null
        return (
          <button key={row.id} className="linkish block-link" type="button" onClick={() => app.setLibrary({ itemId: row.id })}>
            {row.kind === 'full_answer' ? '完整题' : row.kind === 'redline' ? '红线' : row.fullTextForLookup ? 'B级专题' : row.kind} · {row.title}
          </button>
        )
      })}
      {items.length && chapter.flow.every((block) => block.type !== 'item') ? (
        <ul className="plain">
          {items.map((row) => <li key={row.id}><button className="linkish" type="button" onClick={() => app.setLibrary({ itemId: row.id })}>{row.title}</button></li>)}
        </ul>
      ) : null}
    </article>
  )
}

function ItemView({ item, mode, note }: { item: StudyItem; mode: ReaderMode; note: string }) {
  const app = useApp()
  const [draft, setDraft] = useState(note)
  const ids = content.items.filter((row) => row.chapterId === item.chapterId && row.kind === item.kind)
  const index = ids.findIndex((row) => row.id === item.id)
  const sections = filterSections(item, mode)
  return (
    <article className="stack">
      <header className="page-head">
        <div>
          <p className="kicker">{item.chapter} · PDF {item.pdfPages.join(', ') || '—'}</p>
          <h1>{item.title}</h1>
          {item.fullTextForLookup ? <p className="badge">B级骨架 · 全文供查阅 · 不因篇幅提高优先级</p> : null}
          <Signals item={item} />
        </div>
        <div className="actions">
          <button className="btn" type="button" onClick={() => app.toggleBookmark(item.id)}>{app.state.bookmarks.includes(item.id) ? '已加书签' : '加书签'}</button>
          <button className="btn primary" type="button" onClick={() => app.startRecallItem(item.id)}>提取这题</button>
        </div>
      </header>
      {item.source === 'A' && item.kind === 'full_answer' ? (
        <div className="actions">
          {([['skeleton', '只看骨架'], ['no-expansion', '隐藏扩展'], ['short', '简答主体'], ['all', '全部显示']] as const).map(([key, label]) => (
            <button key={key} type="button" className={mode === key ? 'btn primary' : 'btn'} onClick={() => app.setLibrary({ mode: key })}>{label}</button>
          ))}
        </div>
      ) : null}
      <div className="actions">
        {item.pdfPages.map((page) => (
          <button key={page} className="btn ghost" type="button" onClick={() => app.setLibrary({ pageAnchor: `${item.source.toLowerCase()}-pdf-page-${page}`, itemId: '' })}>PDF 第 {page} 页</button>
        ))}
      </div>
      {item.kind === 'redline' ? <RedlineCard item={item} /> : null}
      {item.kind === 'comparison' ? item.tables.map((table, i) => <DataTable key={i} table={table} />) : null}
      {item.fullTextForLookup ? (
        <>
          <ol>{item.reviewedHeadingHints.map((hint) => <li key={hint}>{hint}</li>)}</ol>
          <details>
            <summary>全文供查阅，默认折叠</summary>
            <SectionList sections={item.sections} />
          </details>
        </>
      ) : item.kind !== 'redline' ? <SectionList sections={sections} /> : null}
      {item.kind !== 'comparison' && item.kind !== 'redline' ? item.tables.map((table, i) => <DataTable key={`t-${i}`} table={table} />) : null}
      <div className="actions">
        <button className="btn" type="button" disabled={index <= 0} onClick={() => app.setLibrary({ itemId: ids[index - 1].id })}>上一题</button>
        <button className="btn" type="button" disabled={index >= ids.length - 1} onClick={() => app.setLibrary({ itemId: ids[index + 1].id })}>下一题</button>
      </div>
      <label className="field">我的批注（不写回原文）
        <textarea rows={4} value={draft} onChange={(event) => setDraft(event.target.value)} />
      </label>
      <button className="btn" type="button" onClick={() => app.saveNote(item.id, draft)}>保存批注</button>
    </article>
  )
}

function PageView({ anchor, markdown, page, source }: { anchor: string; markdown: string; page: number; source: string }) {
  const app = useApp()
  return (
    <article className="card stack">
      <header className="page-head">
        <h1>{source}册 PDF 第 {page} 页</h1>
        <button className="btn" type="button" onClick={() => app.toggleBookmark(anchor)}>{app.state.bookmarks.includes(anchor) ? '已加书签' : '给这页加书签'}</button>
      </header>
      <RichText text={markdown} query={app.state.library.query} />
      <button className="btn ghost" type="button" onClick={() => app.setLibrary({ pageAnchor: '' })}>返回目录</button>
    </article>
  )
}

function Conflict() {
  return (
    <aside className="card warnbox">
      <h2>资料说明 / 版本差异</h2>
      <p>A册封面：{content.versionConflict.aStatement}</p>
      <p>B册目录页：{content.versionConflict.bStatement}</p>
      <p>{content.versionConflict.resolution}</p>
      <p className="muted">三色：朱红是名解，墨黑是简答，青绿是扩展。B册表格里的朱红强调不是名解层。</p>
    </aside>
  )
}

function filterSections(item: StudyItem, mode: ReaderMode): Section[] {
  if (mode === 'skeleton') {
    return item.reviewedHeadingHints.map((title, index) => ({ id: `${item.id}-sk-${index}`, title, sourceText: '', layer: 'normal' as const }))
  }
  if (mode === 'no-expansion') return item.sections.filter((section) => section.layer !== 'expansion')
  if (mode === 'short') return item.sections.filter((section) => section.layer === 'definition' || section.layer === 'short_answer')
  return item.sections
}

function search(query: string) {
  const q = query.trim()
  if (!q) return []
  const hits = []
  for (const page of content.pages) {
    const at = page.markdown.indexOf(q)
    if (at < 0) continue
    const slice = page.markdown.slice(Math.max(0, at - 24), at + q.length + 36).replace(/\s+/g, ' ')
    hits.push({
      source: page.source,
      page: page.page,
      anchor: page.anchor,
      title: slice,
      snippet: escapeHtml(slice).split(escapeHtml(q)).join(`<mark>${escapeHtml(q)}</mark>`),
    })
  }
  return hits
}
