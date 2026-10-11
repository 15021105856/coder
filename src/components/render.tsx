import type { ContentTable, EvidenceState, Section, StudyItem } from '../types'
import { EVIDENCE_LABEL } from '../engine/labels'

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function highlight(text: string, query: string): string {
  const safe = escapeHtml(text)
  const q = query.trim()
  if (!q) return safe
  const pattern = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return safe.replace(new RegExp(pattern, 'gi'), (match) => `<mark>${match}</mark>`)
}

export function RichText({ text, query = '' }: { text: string; query?: string }) {
  const html = highlight(text, query).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>')
  return <div className="rich" dangerouslySetInnerHTML={{ __html: html }} />
}

export function DataTable({ table }: { table: ContentTable }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {table.headers.map((cell, index) => (
              <th key={index}>{cell || ' '}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r}>
              {table.headers.map((_, c) => (
                <td key={c}>{row[c] || ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function RedlineCard({ item }: { item: StudyItem }) {
  const bad = item.sections.find((s) => s.title === '别写')?.sourceText || ''
  const good = item.sections.find((s) => s.title === '要写')?.sourceText || ''
  const evidence = item.sections.find((s) => s.title === '依据')?.sourceText || ''
  return (
    <div className="redline-block">
      <p className="redline-kicker">⚠ 答题红线</p>
      <div className="redline">
        <div className="redline-bad">
          <span>别写</span>
          <RichText text={bad} />
        </div>
        <div className="redline-good">
          <span>要写</span>
          <RichText text={good} />
        </div>
        <div className="redline-evidence">
          <span>依据</span>
          <RichText text={evidence} />
        </div>
      </div>
    </div>
  )
}

const LAYER_LABEL: Record<Section['layer'], string> = {
  definition: '名解 · 必默',
  short_answer: '简答 · 核心',
  expansion: '扩展 · 余量',
  normal: '原文',
}

function isSportsSectionTitle(title: string | undefined): boolean {
  return /体育转写|体育例证|体育应用/.test(title || '')
}

export function SectionList({ sections, query = '' }: { sections: Section[]; query?: string }) {
  let last = ''
  return (
    <div className="sections">
      {sections.map((section) => {
        const showTitle = section.title && section.title !== last
        if (section.title) last = section.title
        const sports = isSportsSectionTitle(section.title)
        return (
          <article
            key={section.id}
            className={`layer layer-${section.layer}${sports ? ' sports-section' : ''}`}
          >
            {showTitle ? <h4>{section.title}</h4> : null}
            <div className="layer-label">
              {sports ? <span className="sports-tag">🏃 体育转写</span> : null}
              <span className={`layer-pill layer-pill-${section.emphasis ? 'normal' : section.layer}`}>
                {section.emphasis ? '原文强调' : LAYER_LABEL[section.layer]}
              </span>
              {section.emphasis ? <small>不是名解层</small> : null}
            </div>
            {section.sourceText ? <RichText text={section.sourceText} query={query} /> : null}
          </article>
        )
      })}
    </div>
  )
}

export function EvidenceBadge({ state }: { state: EvidenceState }) {
  return <span className={`badge evidence-${state}`}>{EVIDENCE_LABEL[state]}</span>
}

export function Signals({ item }: { item: StudyItem }) {
  if (!item.sourceSignals.length) return null
  return (
    <ul className="signals">
      {item.sourceSignals.map((signal) => (
        <li key={signal.label}>{signal.label}</li>
      ))}
    </ul>
  )
}
