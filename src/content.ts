import raw from './data/generated/content.json'
import type { ContentBundle, StudyItem } from './types'

export const content = raw as ContentBundle

const byId = new Map(content.items.map((item) => [item.id, item]))

export function getItem(id: string): StudyItem | undefined {
  return byId.get(id)
}

export function chapterItems(chapterId: string): StudyItem[] {
  return content.items.filter((item) => item.chapterId === chapterId)
}

export const CORE_A_COUNT = content.items.filter((item) => item.coreA).length

export function itemPlainText(item: StudyItem): string {
  return [item.title, item.originalMarkdown, ...item.sections.map((s) => s.sourceText)].join('\n')
}
