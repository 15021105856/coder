import { content, getItem } from '../content'
import { EvidenceBadge } from '../components/render'
import { buildDashboard } from '../engine/stats'
import { useApp } from '../state/store'

export function Archive() {
  const app = useApp()
  const dash = buildDashboard(content.items, app.state.attempts, app.now)
  const byChapter = new Map<string, { independent: number; minor_omission: number; cue_dependent: number; relearned: number }>()
  for (const attempt of app.state.attempts) {
    const item = getItem(attempt.itemId)
    const key = item?.chapter || '未知'
    const row = byChapter.get(key) || { independent: 0, minor_omission: 0, cue_dependent: 0, relearned: 0 }
    row[attempt.evidenceState] += 1
    byChapter.set(key, row)
  }
  return (
    <div className="stack">
      <h1>学习档案</h1>
      <section className="card">
        <h2>按天的证据</h2>
        {dash.byDay.length === 0 ? <p className="muted">还没有记录。</p> : (
          <ul className="bars">
            {dash.byDay.map((day) => (
              <li key={day.day}>
                <span>{day.day}</span>
                <i className="evidence-independent" style={{ flex: day.independent || 0.001 }} title={`独立 ${day.independent}`} />
                <i className="evidence-minor_omission" style={{ flex: day.minor_omission || 0.001 }} title={`基本 ${day.minor_omission}`} />
                <i className="evidence-cue_dependent" style={{ flex: day.cue_dependent || 0.001 }} title={`提示 ${day.cue_dependent}`} />
                <i className="evidence-relearned" style={{ flex: day.relearned || 0.001 }} title={`重学 ${day.relearned}`} />
                <small>{day.independent}/{day.minor_omission}/{day.cue_dependent}/{day.relearned}</small>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card">
        <h2>章节分布</h2>
        <ul className="plain">
          {[...byChapter.entries()].map(([chapter, row]) => (
            <li key={chapter}>{chapter} · 独立 {row.independent} · 基本 {row.minor_omission} · 提示 {row.cue_dependent} · 重学 {row.relearned}</li>
          ))}
        </ul>
      </section>
      <section className="card">
        <h2>草稿历史</h2>
        <ul className="drafts">
          {[...app.state.attempts].reverse().slice(0, 30).map((attempt) => {
            const item = getItem(attempt.itemId)
            return (
              <li key={attempt.id}>
                <header>
                  <strong>{item?.title || attempt.itemId}</strong>
                  <EvidenceBadge state={attempt.evidenceState} />
                  <small>{new Date(attempt.finishedAt).toLocaleString()}</small>
                </header>
                <pre>{attempt.preRevealDraft?.text || '（无揭晓前草稿）'}</pre>
                {attempt.restatementText ? <p>撤提示后：{attempt.restatementText}</p> : null}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
