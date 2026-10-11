import type { ReactNode } from 'react'
import { content, getItem } from '../content'
import { EvidenceBadge, RedlineCard, SectionList, Signals } from '../components/render'
import { HINT_LABEL } from '../engine/labels'
import { useApp } from '../state/store'
import type { StudyItem } from '../types'

export function Recall() {
  const app = useApp()
  const recall = app.state.recall
  if (!recall) {
    const queue = content.items.filter((item) => item.coreA || (item.kind === 'skeleton' && !item.fullTextForLookup)).slice(0, 12)
    return (
      <div className="stack">
        <h1>主动提取</h1>
        <p>先写揭晓前的骨架。提示只来自已确认的 B 册关系，或这道题自己的源文小标题。</p>
        <ul className="plain">
          {queue.map((item) => (
            <li key={item.id}>
              <button className="linkish" type="button" onClick={() => app.startRecallItem(item.id)}>{item.chapter} · {item.title}</button>
            </li>
          ))}
        </ul>
      </div>
    )
  }
  const item = getItem(recall.itemId)
  if (!item) return <p>题目不在当前资料里。</p>
  const ctx = app.hintFor(item.id)
  const related = ctx.confirmedSkeletonIds.map((id) => getItem(id)).filter((row): row is StudyItem => Boolean(row))
  const redlines = ctx.confirmedRedlineIds.map((id) => getItem(id)).filter((row): row is StudyItem => Boolean(row))
  const elapsed = Math.max(0, Math.round((app.now - recall.startedAt) / 1000))
  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <p className="kicker">{item.source === 'A' ? (item.coreA ? 'A册完整题' : 'A册附录完整题') : item.fullTextForLookup ? 'B册骨架题 · 全文供查阅' : item.kind === 'redline' ? '答题红线' : 'B册骨架题'}</p>
          <h1>{item.title}</h1>
          <Signals item={item} />
        </div>
        {app.state.settings.showTimer ? <strong className="timer">{formatClock(elapsed)}</strong> : null}
      </header>
      <ol className="steps">
        {['无提示', '已确认B骨架', '源文小标题', ctx.keywords.length ? '已审核关键词' : '关键词（跳过）', '对照原文', '撤提示复述'].map((label) => <li key={label}>{label}</li>)}
      </ol>
      {recall.phase === 'draft' ? (
        <section className="card">
          <h2>闭卷草稿</h2>
          <p className="muted">现在只留题目。先把能想起的骨架写下来，揭晓后不能回改这一稿。</p>
          <textarea value={recall.draft} onChange={(event) => app.patchRecall({ draft: event.target.value })} rows={10} placeholder={'1. 定义\n2. 特点\n3. 过程\n4. 体育例证'} />
          <div className="actions">
            <button className="btn primary" type="button" onClick={app.recallSubmit}>无提示交卷，去核对</button>
            <button className="btn" type="button" onClick={app.recallHint}>需要提示</button>
            <button className="btn ghost" type="button" onClick={app.recallReveal}>直接看完整原文</button>
          </div>
        </section>
      ) : null}
      {recall.phase === 'b_skeleton' ? (
        <HintPane title="已确认的 B 册骨架（源文）" onMore={app.recallHint} onReady={app.recallCompare} onFull={app.recallReveal}>
          {related.map((row) => (
            <article key={row.id}>
              <h3>{row.title}</h3>
              <ul>{row.reviewedHeadingHints.map((hint) => <li key={hint}>{hint}</li>)}</ul>
            </article>
          ))}
        </HintPane>
      ) : null}
      {recall.phase === 'headings' ? (
        <HintPane title="小标题提示（源文）" onMore={app.recallHint} onReady={app.recallCompare} onFull={app.recallReveal}>
          <ol>{item.reviewedHeadingHints.map((hint) => <li key={hint}>{hint}</li>)}</ol>
          {!ctx.keywords.length ? <p className="muted">这道题没有已审核关键词，下一级就是完整原文。</p> : null}
        </HintPane>
      ) : null}
      {recall.phase === 'keywords' ? (
        <HintPane title="关键词提示（已审核源文）" onMore={app.recallHint} onReady={app.recallCompare} onFull={app.recallReveal}>
          <ul>{ctx.keywords.map((word) => <li key={word}>{word}</li>)}</ul>
        </HintPane>
      ) : null}
      {recall.phase === 'compare' ? (
        <section className="stack">
          <div className="compare">
            <article className="card">
              <h2>揭晓前草稿</h2>
              <pre>{recall.frozenDraft?.text || '（空）'}</pre>
            </article>
            <article className="card">
              <h2>原资料</h2>
              {item.kind === 'redline' ? <RedlineCard item={item} /> : <SectionList sections={item.sections} />}
              {item.tables.map((table, index) => (
                <div key={index} className="table-wrap">
                  <table>
                    <tbody>
                      {table.rows.map((row, r) => (
                        <tr key={r}>{row.map((cell, c) => <td key={c}>{cell}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </article>
          </div>
          <article className="card">
            <h2>逐点核对</h2>
            <p className="muted">勾的是揭晓前草稿里已经有的，不是看完答案后的感觉。</p>
            <button className="btn ghost" type="button" onClick={() => app.patchRecall({ checkedPointIds: item.checkPoints.filter((p) => p.level === 1 && p.role !== 'sports' && p.role !== 'expansion').map((p) => p.id) })}>主体小标题都写到了</button>
            {groups(item).map(([group, points]) => (
              <fieldset key={group}>
                <legend>{group}</legend>
                {points.map((point) => (
                  <label key={point.id} className="check">
                    <input
                      type="checkbox"
                      checked={recall.checkedPointIds.includes(point.id)}
                      onChange={(event) => {
                        const set = new Set(recall.checkedPointIds)
                        if (event.target.checked) set.add(point.id)
                        else set.delete(point.id)
                        app.patchRecall({ checkedPointIds: [...set] })
                      }}
                    />
                    <span>{point.role === 'expansion' ? '扩展 · ' : point.role === 'sports' ? '体育例证 · ' : ''}{point.label}</span>
                  </label>
                ))}
              </fieldset>
            ))}
            <label className="field">术语写错（一行一条，写你写成的词）
              <textarea rows={3} value={recall.termErrorDraft} onChange={(event) => app.patchRecall({ termErrorDraft: event.target.value })} />
            </label>
            {redlines.length ? (
              <fieldset>
                <legend>已确认的相关红线</legend>
                {redlines.map((row) => (
                  <label key={row.id} className="check">
                    <input
                      type="checkbox"
                      checked={recall.redlineErrorIds.includes(row.title)}
                      onChange={(event) => {
                        const set = new Set(recall.redlineErrorIds)
                        if (event.target.checked) set.add(row.title)
                        else set.delete(row.title)
                        app.patchRecall({ redlineErrorIds: [...set] })
                      }}
                    />
                    <span>我踩了：{row.title}</span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            <div className="actions">
              <button className="btn primary" type="button" onClick={app.recallRestate}>进入撤提示复述</button>
            </div>
          </article>
        </section>
      ) : null}
      {recall.phase === 'restate' ? (
        <section className="card">
          <h2>撤掉提示后再写一遍</h2>
          <p>只留题目。这里通过，也只说明刚看完能重现，不会把本轮改成首次无提示独立提取。</p>
          <h3>{item.title}</h3>
          <textarea rows={8} value={recall.restatement} onChange={(event) => app.patchRecall({ restatement: event.target.value })} />
          <div className="choice">
            <span>主观信心</span>
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <button key={n} type="button" className={recall.selfConfidence === n ? 'btn primary' : 'btn'} onClick={() => app.patchRecall({ selfConfidence: n })}>{n}</button>
            ))}
          </div>
          <div className="choice">
            <button type="button" className={recall.postRevealNoHintPassed === true ? 'btn primary' : 'btn'} onClick={() => app.patchRecall({ postRevealNoHintPassed: true })}>复述通过</button>
            <button type="button" className={recall.postRevealNoHintPassed === false ? 'btn primary' : 'btn'} onClick={() => app.patchRecall({ postRevealNoHintPassed: false })}>复述没通过</button>
          </div>
          <label className="field">备注
            <input value={recall.userNote} onChange={(event) => app.patchRecall({ userNote: event.target.value })} />
          </label>
          <button className="btn primary" type="button" onClick={app.recallCommit} disabled={recall.postRevealNoHintPassed === undefined}>记下这一轮</button>
        </section>
      ) : null}
      {recall.phase === 'done' && recall.result ? (
        <section className="card">
          <h2>本轮记录</h2>
          <EvidenceBadge state={recall.result.evidenceState} />
          <p>最高提示：{HINT_LABEL[recall.result.highestHintUsed]}。撤提示复述：{recall.result.postRevealNoHintPassed ? '通过' : '未通过或未记'}。信心 {recall.result.selfConfidence}。这三项分开保存。</p>
          <p className="muted">主观信心不能把本轮改成独立提取。</p>
          <div className="actions">
            <button className="btn primary" type="button" onClick={app.recallNext}>{app.state.recallQueue.length > 1 ? '下一题' : '回到今日'}</button>
          </div>
        </section>
      ) : null}
      {recall.phase !== 'draft' && recall.frozenDraft ? <p className="muted">揭晓前草稿已冻结。</p> : null}
      <p className="muted">队列还剩 {app.state.recallQueue.length} 题。候选关系 {ctx.candidateRelationIds.length} 条不在上面。</p>
    </div>
  )
}

function HintPane({ title, children, onMore, onReady, onFull }: { title: string; children: ReactNode; onMore: () => void; onReady: () => void; onFull: () => void }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {children}
      <div className="actions">
        <button className="btn primary" type="button" onClick={onReady}>想起来了，去核对</button>
        <button className="btn" type="button" onClick={onMore}>还需要下一级</button>
        <button className="btn ghost" type="button" onClick={onFull}>看完整原文</button>
      </div>
    </section>
  )
}

function groups(item: StudyItem) {
  const map = new Map<string, StudyItem['checkPoints']>()
  for (const point of item.checkPoints) {
    const list = map.get(point.group) || []
    list.push(point)
    map.set(point.group, list)
  }
  return [...map.entries()]
}

function formatClock(total: number): string {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
