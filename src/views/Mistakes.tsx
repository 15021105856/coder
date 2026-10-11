import { getItem } from '../content'
import { EvidenceBadge } from '../components/render'
import { useApp } from '../state/store'

export function Mistakes() {
  const app = useApp()
  const latest = new Map<string, (typeof app.state.attempts)[number]>()
  for (const attempt of app.state.attempts) {
    const prev = latest.get(attempt.itemId)
    if (!prev || attempt.finishedAt >= prev.finishedAt) latest.set(attempt.itemId, attempt)
  }
  const cue = [...latest.values()].filter((attempt) => attempt.evidenceState === 'cue_dependent' || attempt.evidenceState === 'relearned')
  const due = [...latest.values()].filter((attempt) => attempt.dueAt && attempt.dueAt <= app.now)
  const terms = app.state.attempts.flatMap((attempt) => attempt.termErrors.map((text) => ({ text, attempt })))
  const reds = app.state.attempts.flatMap((attempt) => attempt.redlineErrors.map((text) => ({ text, attempt })))
  return (
    <div className="stack">
      <h1>错漏与复测</h1>
      <section className="card">
        <h2>到期队列 {due.length}</h2>
        <AttemptList rows={due} onOpen={app.startRecallItem} />
      </section>
      <section className="card">
        <h2>提示依赖或看答案后恢复 {cue.length}</h2>
        <AttemptList rows={cue} onOpen={app.startRecallItem} />
      </section>
      <section className="split">
        <article className="card">
          <h2>术语错误</h2>
          <ul className="plain">{terms.map((row, i) => <li key={i}>{row.text}</li>)}</ul>
        </article>
        <article className="card">
          <h2>红线错误</h2>
          <ul className="plain">{reds.map((row, i) => <li key={i}>{row.text}</li>)}</ul>
        </article>
      </section>
    </div>
  )
}

function AttemptList({ rows, onOpen }: { rows: { itemId: string; evidenceState: 'independent' | 'minor_omission' | 'cue_dependent' | 'relearned'; dueAt?: number }[]; onOpen: (id: string) => void }) {
  if (!rows.length) return <p className="muted">没有。</p>
  return (
    <ul className="plain">
      {rows.map((row) => {
        const item = getItem(row.itemId)
        return (
          <li key={row.itemId}>
            <button className="linkish" type="button" onClick={() => onOpen(row.itemId)}>{item?.title || row.itemId}</button>
            <EvidenceBadge state={row.evidenceState} />
            {row.dueAt ? <small>{new Date(row.dueAt).toLocaleString()}</small> : null}
          </li>
        )
      })}
    </ul>
  )
}
