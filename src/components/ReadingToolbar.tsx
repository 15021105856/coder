import { useApp } from '../state/store'
import type { ReadingScale } from '../types'

const SCALES: { id: ReadingScale; label: string }[] = [
  { id: 'compact', label: '紧凑' },
  { id: 'standard', label: '标准' },
  { id: 'recite', label: '诵读' },
]

export function ReadingToolbar() {
  const app = useApp()
  const { readingScale, focusReading } = app.state.settings
  return (
    <div className="reading-toolbar" role="toolbar" aria-label="阅读显示">
      <button
        type="button"
        className={focusReading ? 'btn primary' : 'btn'}
        onClick={() => app.updateSettings({ focusReading: !focusReading })}
      >
        {focusReading ? '诵读模式开' : '诵读模式'}
      </button>
      <div className="reading-toolbar-scales">
        <span className="muted">字号</span>
        {SCALES.map((scale) => (
          <button
            key={scale.id}
            type="button"
            className={readingScale === scale.id ? 'btn primary' : 'btn'}
            onClick={() => app.updateSettings({ readingScale: scale.id })}
          >
            {scale.label}
          </button>
        ))}
      </div>
    </div>
  )
}
