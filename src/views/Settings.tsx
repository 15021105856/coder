import { useState } from 'react'
import { content, getItem } from '../content'
import { useApp } from '../state/store'
import type { RelationStatus } from '../types'

export function Settings() {
  const app = useApp()
  const settings = app.state.settings
  const [keywordQuery, setKeywordQuery] = useState('')
  const [customItem, setCustomItem] = useState(content.items.find((item) => item.coreA)?.id || '')
  const [customText, setCustomText] = useState('')
  const [customError, setCustomError] = useState<string | null>(null)
  const keywords = content.keywords.flatMap((bucket) => bucket.hints.map((hint) => ({ ...hint, itemId: bucket.itemId })))
    .filter((hint) => !keywordQuery.trim() || hint.text.includes(keywordQuery.trim()) || (getItem(hint.itemId)?.title || '').includes(keywordQuery.trim()))
    .slice(0, 40)
  return (
    <div className="stack">
      <h1>设置与数据</h1>
      <section className="card">
        <h2>版本</h2>
        <p>schemaVersion {content.meta.schemaVersion}</p>
        <p>contentVersion {content.meta.contentVersion}</p>
        <p className="mono">A {content.meta.sourceHashes.A}</p>
        <p className="mono">B {content.meta.sourceHashes.B}</p>
        <p className="muted">构建于 {content.meta.builtAt}。hash 变化表示源 Markdown 变了，旧记录按 itemId 迁移，对不上的进待查。</p>
      </section>
      <section className="card">
        <h2>导入导出</h2>
        <div className="actions">
          <button className="btn primary" type="button" onClick={app.exportJson}>导出 JSON</button>
          <button className="btn" type="button" onClick={app.rollback}>恢复到导入前备份</button>
        </div>
        <label className="field">选择 JSON
          <input type="file" accept="application/json" onChange={async (event) => {
            const file = event.target.files?.[0]
            if (!file) return
            app.stageImport(await file.text())
          }} />
        </label>
        {app.importPlan ? (
          <div className="warnbox">
            <p>{app.importPlan.summary.message}</p>
            <p>新增 {app.importPlan.summary.added}，覆盖 {app.importPlan.summary.replaced}，对不上 {app.importPlan.summary.unmatched}。</p>
            <p>文件 schema {app.importPlan.summary.schemaVersion}，内容版本 {app.importPlan.summary.contentVersion}。{app.importPlan.summary.crossSchema ? '结构版本较旧，已按当前程序读取。' : ''}</p>
            <div className="actions">
              <button className="btn primary" type="button" onClick={app.confirmImport}>确认写入</button>
              <button className="btn ghost" type="button" onClick={app.cancelImport}>取消</button>
            </div>
          </div>
        ) : <p className="muted">坏文件会停在预览之前。确认后才写入，写入前自动备份。</p>}
      </section>
      <section className="card">
        <h2>迁移待查 {app.state.migrationReview.length}</h2>
        <ul className="plain">
          {app.state.migrationReview.map((row) => <li key={row.attemptId}>{row.itemId} · {row.note}</li>)}
        </ul>
      </section>
      <section className="card">
        <h2>显示</h2>
        <div className="actions">
          <button className="btn" type="button" onClick={() => app.updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}>{settings.theme === 'dark' ? '切到浅色' : '切到深色'}</button>
          {[15, 17, 19, 21].map((size) => (
            <button key={size} className={settings.fontSize === size ? 'btn primary' : 'btn'} type="button" onClick={() => app.updateSettings({ fontSize: size })}>{size}px</button>
          ))}
        </div>
        <p className="muted">快捷键：Alt+1 到 Alt+7 切换页面，Alt+D 切换深浅色。输入框里不拦截。</p>
      </section>
      <section className="card">
        <h2>一日时长</h2>
        <div className="form-grid">
          <NumberField label="总分钟" value={settings.day.totalMinutes} onChange={(totalMinutes) => app.updateSettings({ day: { ...settings.day, totalMinutes } })} />
          <NumberField label="晚测分钟" value={settings.day.eveningMinutes} onChange={(eveningMinutes) => app.updateSettings({ day: { ...settings.day, eveningMinutes } })} />
          <NumberField label="B 级最多分钟" value={settings.day.bOnlyMaxMinutes} onChange={(bOnlyMaxMinutes) => app.updateSettings({ day: { ...settings.day, bOnlyMaxMinutes } })} />
          <NumberField label="写作分钟" value={settings.day.writingMinutes} onChange={(writingMinutes) => app.updateSettings({ day: { ...settings.day, writingMinutes } })} />
          <NumberField label="休息间隔" value={settings.day.restEvery} onChange={(restEvery) => app.updateSettings({ day: { ...settings.day, restEvery } })} />
          <NumberField label="休息分钟" value={settings.day.restMinutes} onChange={(restMinutes) => app.updateSettings({ day: { ...settings.day, restMinutes } })} />
        </div>
        <label className="check"><input type="checkbox" checked={settings.day.protectEvening} onChange={(event) => app.updateSettings({ day: { ...settings.day, protectEvening: event.target.checked } })} />保留晚间闭卷</label>
        <label className="check"><input type="checkbox" checked={settings.day.prioritizeA26} onChange={(event) => app.updateSettings({ day: { ...settings.day, prioritizeA26: event.target.checked } })} />优先排 A 册 26 题</label>
        <label className="check"><input type="checkbox" checked={settings.day.includeAppendix2} onChange={(event) => app.updateSettings({ day: { ...settings.day, includeAppendix2: event.target.checked } })} />包含附录两道完整题</label>
        <label className="check"><input type="checkbox" checked={settings.showTimer} onChange={(event) => app.updateSettings({ showTimer: event.target.checked })} />显示计时</label>
      </section>
      <section className="card">
        <h2>间隔（分钟 / 小时 / 天）</h2>
        <div className="form-grid">
          <NumberField label="重学分钟" value={settings.gaps.relearnedMin} onChange={(relearnedMin) => app.updateSettings({ gaps: { ...settings.gaps, relearnedMin } })} />
          <NumberField label="提示依赖分钟" value={settings.gaps.cueMin} onChange={(cueMin) => app.updateSettings({ gaps: { ...settings.gaps, cueMin } })} />
          <NumberField label="少量遗漏小时" value={settings.gaps.minorHours} onChange={(minorHours) => app.updateSettings({ gaps: { ...settings.gaps, minorHours } })} />
          <NumberField label="独立后天数" value={settings.gaps.independentDays} onChange={(independentDays) => app.updateSettings({ gaps: { ...settings.gaps, independentDays } })} />
          <NumberField label="再次独立后天数" value={settings.gaps.independentAgainDays} onChange={(independentAgainDays) => app.updateSettings({ gaps: { ...settings.gaps, independentAgainDays } })} />
        </div>
      </section>
      <section className="card">
        <h2>A/B 关系审核</h2>
        <p className="muted">候选不会进入提示链。确认只存在这份学习记录里，不改原文。</p>
        <ul className="review">
          {content.relations.map((rel) => {
            const status = app.state.relationOverrides[rel.id] || rel.status
            const a = getItem(rel.aItemId)
            const b = getItem(rel.bItemId)
            return (
              <li key={rel.id}>
                <p><b>{status}</b> · {rel.role}</p>
                <p>{a?.title}</p>
                <p>{b?.title}</p>
                <p className="muted">{rel.reason}</p>
                <StatusButtons current={status} onChange={(next) => app.setRelation(rel.id, next)} />
              </li>
            )
          })}
        </ul>
      </section>
      <section className="card">
        <h2>关键词审核</h2>
        <input value={keywordQuery} placeholder="筛原词或题干" onChange={(event) => setKeywordQuery(event.target.value)} />
        <ul className="review">
          {keywords.map((hint) => {
            const status = app.state.keywordOverrides[hint.id] || hint.status
            return (
              <li key={hint.id}>
                <p>「{hint.text}」 · {status}</p>
                <p className="muted">{getItem(hint.itemId)?.title} · {hint.evidence}</p>
                <StatusButtons current={status} onChange={(next) => app.setKeyword(hint.id, next)} />
              </li>
            )
          })}
        </ul>
        <div className="form-grid">
          <label className="field">题目
            <select value={customItem} onChange={(event) => setCustomItem(event.target.value)}>
              {content.items.filter((item) => item.coreA || item.kind === 'skeleton').slice(0, 80).map((item) => <option key={item.id} value={item.id}>{item.title.slice(0, 28)}</option>)}
            </select>
          </label>
          <label className="field">必须是原文里的连续片段
            <input value={customText} onChange={(event) => setCustomText(event.target.value)} />
          </label>
        </div>
        <button className="btn" type="button" onClick={() => setCustomError(app.addCustomKeyword(customItem, customText))}>加入自定义关键词</button>
        {customError ? <p>{customError}</p> : null}
      </section>
    </div>
  )
}

function StatusButtons({ current, onChange }: { current: RelationStatus; onChange: (status: RelationStatus) => void }) {
  return (
    <div className="actions">
      <button type="button" className={current === 'confirmed' || current === 'confirmed-by-source' ? 'btn primary' : 'btn'} onClick={() => onChange('confirmed')}>确认</button>
      <button type="button" className={current === 'candidate' ? 'btn primary' : 'btn'} onClick={() => onChange('candidate')}>候选</button>
      <button type="button" className={current === 'rejected' ? 'btn primary' : 'btn'} onClick={() => onChange('rejected')}>不用</button>
    </div>
  )
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="field">{label}
      <input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  )
}
