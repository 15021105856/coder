import { content } from '../content'
import { EVIDENCE_LABEL } from '../engine/labels'
import { SCHEDULE_COPY } from '../engine/labels'
import { rankItems } from '../engine/priority'
import { buildDashboard } from '../engine/stats'
import { useApp } from '../state/store'

export function Today() {
  const app = useApp()
  const dash = buildDashboard(content.items, app.state.attempts, app.now)
  const ranked = rankItems(content.items, app.state.attempts, app.now, content.relations, app.state.relationOverrides)
  const due = ranked.filter((row) => row.tier === 1).slice(0, 8)
  const next = ranked.find((row) => row.item.kind !== 'reference')
  const plan = app.state.dayPlan
  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>今日训练</h1>
          <p>记录的是无提示能不能提取、用了哪一层提示、揭晓前写了什么。覆盖不是掌握。</p>
        </div>
        <button className="btn primary" type="button" onClick={app.makeDayPlan}>排列今日</button>
      </header>
      <section className="stats">
        <Stat label="今日已接触" value={String(dash.touchedToday)} />
        <Stat label="A册无提示首测覆盖" value={`${dash.aCoverage}/${dash.aTotal}`} />
        <Stat label="最近一轮独立提取" value={String(dash.latestIndependent)} />
        <Stat label="最近一轮基本提取" value={String(dash.latestMinor)} />
        <Stat label="最近一轮提示依赖" value={String(dash.latestCue)} />
        <Stat label="最近一轮看答案后恢复" value={String(dash.latestRelearned)} />
        <Stat label="撤提示复述通过" value={`${dash.restatementPassed}/${dash.restatementRecorded}`} />
        <Stat label="20–60分钟复测通过" value={`${dash.delayWindowPassed}/${dash.delayWindowTotal}`} />
        <Stat label="次日待复测" value={String(dash.dueTomorrow)} />
        <Stat label="现在到期" value={String(dash.dueNow)} />
      </section>
      <section className="split">
        <article className="card">
          <h2>到期复测</h2>
          {due.length === 0 ? <p className="muted">现在没有到期项。</p> : (
            <ul className="plain">
              {due.map((row) => (
                <li key={row.item.id}>
                  <button type="button" className="linkish" onClick={() => app.startRecallItem(row.item.id)}>{row.item.title}</button>
                  <small>{row.reasons[0]}</small>
                </li>
              ))}
            </ul>
          )}
          {next ? (
            <button className="btn" type="button" onClick={() => app.startRecallItem(next.item.id)}>
              下一题：{next.item.title}
            </button>
          ) : null}
        </article>
        <article className="card">
          <h2>晚间闭卷</h2>
          <p>默认留出晚测。白天排不下时，先减少普通 B 项。</p>
          <button className="btn primary" type="button" onClick={app.startEvening}>开始晚间验收</button>
          <ul className="muted schedule">
            {SCHEDULE_COPY.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </article>
      </section>
      {plan ? (
        <section className="card">
          <h2>今日安排</h2>
          <ul className="muted">
            {plan.notes.map((note) => <li key={note}>{note}</li>)}
          </ul>
          <div className="blocks">
            {plan.blocks.map((block) => (
              <article key={block.id}>
                <header>
                  <strong>阶段 {block.phase}</strong>
                  <span>{block.title}</span>
                  {block.protected ? <em>受保护</em> : null}
                </header>
                <p>{block.minutes} 分钟。{block.note}</p>
                <p className="muted">{block.dynamic ? '题目在开始时按今天的记录现抽。' : `${block.itemIds.length} 项`}</p>
                <button
                  className="btn"
                  type="button"
                  onClick={() => (block.dynamic ? app.startEvening() : app.startQueue(block.itemIds))}
                >
                  开始这一段
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <section className="split">
        <TopList title="术语错误" rows={dash.termTop} />
        <TopList title="红线错误" rows={dash.redlineTop} />
      </section>
      <p className="muted">最近一轮分布只描述证据，不合成百分比。{Object.values(EVIDENCE_LABEL).join(' / ')}</p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <article className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function TopList({ title, rows }: { title: string; rows: { text: string; count: number }[] }) {
  return (
    <article className="card">
      <h2>{title}</h2>
      {rows.length === 0 ? <p className="muted">还没有记录。</p> : (
        <ul className="plain">
          {rows.map((row) => <li key={row.text}><span>{row.text}</span><b>{row.count}</b></li>)}
        </ul>
      )}
    </article>
  )
}
