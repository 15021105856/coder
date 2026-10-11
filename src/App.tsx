import { useEffect } from 'react'
import { useApp } from './state/store'
import { Archive } from './views/Archive'
import { Exam } from './views/Exam'
import { Library } from './views/Library'
import { Mistakes } from './views/Mistakes'
import { Recall } from './views/Recall'
import { Settings } from './views/Settings'
import { Today } from './views/Today'
import type { ViewId } from './types'

const NAV: { id: ViewId; label: string }[] = [
  { id: 'today', label: '今日训练' },
  { id: 'recall', label: '主动提取' },
  { id: 'exam', label: '闭卷考试' },
  { id: 'library', label: '资料库' },
  { id: 'mistakes', label: '错漏复测' },
  { id: 'archive', label: '学习档案' },
  { id: 'settings', label: '设置数据' },
]

export function App() {
  const app = useApp()
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return
      if (!event.altKey) return
      const index = Number(event.key) - 1
      if (index >= 0 && index < NAV.length) {
        event.preventDefault()
        app.setView(NAV[index].id)
      }
      if (event.key.toLowerCase() === 'd') {
        event.preventDefault()
        app.updateSettings({ theme: app.state.settings.theme === 'dark' ? 'light' : 'dark' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [app])
  return (
    <div className="shell">
      <aside className="side">
        <p className="brand">346 管理学<br />主动提取</p>
        <nav>
          {NAV.map((item, index) => (
            <button key={item.id} type="button" className={app.state.view === item.id ? 'on' : ''} onClick={() => app.setView(item.id)}>
              <small>Alt+{index + 1}</small>
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <main>
        {app.warning ? (
          <div className="warnbox banner">
            <p>{app.warning}</p>
            <button type="button" className="btn" onClick={app.dismissWarning}>知道了</button>
          </div>
        ) : null}
        {app.state.view === 'today' ? <Today /> : null}
        {app.state.view === 'recall' ? <Recall /> : null}
        {app.state.view === 'exam' ? <Exam /> : null}
        {app.state.view === 'library' ? <Library /> : null}
        {app.state.view === 'mistakes' ? <Mistakes /> : null}
        {app.state.view === 'archive' ? <Archive /> : null}
        {app.state.view === 'settings' ? <Settings /> : null}
      </main>
    </div>
  )
}
