import type { EvidenceState, HintLevel } from '../types'

export const EVIDENCE_LABEL: Record<EvidenceState, string> = {
  independent: 'A·独立提取',
  minor_omission: 'B·基本提取',
  cue_dependent: 'C·提示依赖',
  relearned: 'D·看答案后恢复',
}

export const HINT_LABEL: Record<HintLevel, string> = {
  none: '无提示',
  heading: '小标题',
  keyword: '关键词',
  full_answer: '完整原文',
}

export const SCHEDULE_COPY = [
  '重学：约 20 分钟后再测',
  '提示依赖：约 45 分钟后再测',
  '少量遗漏：约 1 天后再测',
  '独立提取：约 3 天；若再次独立则约 7 天',
  '复测失败会把间隔缩短到重学档',
  '这是打开页面时可见的间隔规则，不是医学遗忘模型，也没有推送通知',
]
