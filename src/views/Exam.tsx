import { useMemo, useState } from 'react'
import { content, getItem } from '../content'
import { SectionList } from '../components/render'
import { mulberry32 } from '../engine/dayplan'
import { rankItems } from '../engine/priority'
import { useApp } from '../state/store'
import type { ExamState, StudyItem } from '../types'

export function Exam() {
  const app = useApp()
  const exam = app.state.exam
  if (!exam) return <ExamSetup />
  const item = getItem(exam.itemIds[exam.index])
  if (!item) return <p>题目缺失。</p>
  const answer = exam.answers[item.id] || { text: '', revealed: false }
  const remain = exam.limitSeconds ? exam.limitSeconds - Math.floor((app.now - exam.startedAt) / 1000) : null
  const update = (partial: Partial<ExamState>) => app.patchExam({ ...exam, ...partial })
  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <p className="kicker">{exam.title} · {exam.index + 1}/{exam.itemIds.length}</p>
          <h1>{answer.revealed ? item.title : '闭卷题'}</h1>
        </div>
        {remain !== null ? <strong className={remain < 0 ? 'timer late' : 'timer'}>{remain >= 0 ? format(remain) : `超时 ${format(-remain)}`}</strong> : null}
      </header>
      {!answer.revealed ? <p>章节顺序已打乱。下一题标题先不显示。</p> : null}
      <textarea
        rows={12}
        value={answer.text}
        onChange={(event) => update({ answers: { ...exam.answers, [item.id]: { ...answer, text: event.target.value } } })}
        placeholder="限时书面骨架。程序不按字符相似度打分。"
      />
      <div className="actions">
        {!answer.revealed ? (
          <button className="btn primary" type="button" onClick={() => update({ answers: { ...exam.answers, [item.id]: { ...answer, revealed: true } } })}>对照原文</button>
        ) : (
          <button className="btn" type="button" onClick={() => update({ index: Math.min(exam.itemIds.length - 1, exam.index + 1) })} disabled={exam.index >= exam.itemIds.length - 1}>下一题</button>
        )}
        <button className="btn ghost" type="button" onClick={() => downloadExam(exam)}>导出本次作答</button>
        <button className="btn ghost" type="button" onClick={() => app.patchExam(null)}>结束</button>
      </div>
      {answer.revealed ? (
        <div className="compare">
          <article className="card"><h2>我的作答</h2><pre>{answer.text || '（空）'}</pre></article>
          <article className="card"><h2>原资料</h2><SectionList sections={item.sections.length ? item.sections : [{ id: 't', title: item.title, sourceText: item.originalMarkdown, layer: 'normal' }]} /></article>
        </div>
      ) : null}
    </div>
  )
}

function ExamSetup() {
  const app = useApp()
  const [minutes, setMinutes] = useState(app.state.settings.day.writingMinutes)
  const pool = useMemo(() => content.items, [])
  const start = (title: string, items: StudyItem[], limit: number | null) => {
    const rnd = mulberry32(Date.now() % 100000)
    const shuffled = [...items]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1))
      const tmp = shuffled[i]
      shuffled[i] = shuffled[j]
      shuffled[j] = tmp
    }
    const picked = shuffled.slice(0, 8)
    const exam: ExamState = {
      id: `exam-${Date.now()}`,
      title,
      itemIds: picked.map((item) => item.id),
      index: 0,
      startedAt: Date.now(),
      limitSeconds: limit ? limit * 60 : null,
      answers: Object.fromEntries(picked.map((item) => [item.id, { text: '', revealed: false }])),
    }
    app.startExam(exam)
  }
  const due = rankItems(pool, app.state.attempts, app.now).filter((row) => row.tier === 1).map((row) => row.item)
  const wrong = pool.filter((item) => {
    const latest = app.state.attempts.filter((a) => a.itemId === item.id).sort((a, b) => b.finishedAt - a.finishedAt)[0]
    return latest && (latest.evidenceState === 'cue_dependent' || latest.evidenceState === 'relearned')
  })
  return (
    <div className="stack">
      <h1>闭卷考试</h1>
      <p>题目跨章节打乱。限时写作只保留原文对照，不生成分数。</p>
      <label className="field">每题分钟
        <input type="number" min={1} value={minutes} onChange={(event) => setMinutes(Number(event.target.value) || 10)} />
      </label>
      <div className="actions">
        <button className="btn primary" type="button" onClick={() => start('随机 A 题', pool.filter((item) => item.coreA), null)}>随机 A 题</button>
        <button className="btn" type="button" onClick={() => start('随机 B 骨架', pool.filter((item) => item.source === 'B' && item.kind === 'skeleton'), null)}>随机 B 骨架</button>
        <button className="btn" type="button" onClick={() => start('到期题', due, null)} disabled={!due.length}>到期题</button>
        <button className="btn" type="button" onClick={() => start('提示依赖与重学', wrong, null)} disabled={!wrong.length}>错题</button>
        <button className="btn" type="button" onClick={() => start('限时写作', pool.filter((item) => item.coreA), minutes)}>A 题限时写作</button>
      </div>
    </div>
  )
}

function downloadExam(exam: ExamState) {
  const lines = [exam.title, new Date(exam.startedAt).toISOString(), '']
  for (const id of exam.itemIds) {
    const item = getItem(id)
    const answer = exam.answers[id]
    lines.push(`# ${item?.title || id}`, answer?.text || '', '')
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'pku346-exam.txt'
  link.click()
  URL.revokeObjectURL(url)
}

function format(total: number): string {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
