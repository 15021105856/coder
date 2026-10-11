import type { ViewId } from './types'

export const NAV: { id: ViewId; label: string }[] = [
  { id: 'today', label: '今日训练' },
  { id: 'method', label: '方法论' },
  { id: 'recall', label: '主动提取' },
  { id: 'exam', label: '闭卷考试' },
  { id: 'library', label: '资料库' },
  { id: 'mistakes', label: '错漏复测' },
  { id: 'archive', label: '学习档案' },
  { id: 'settings', label: '设置数据' },
]
