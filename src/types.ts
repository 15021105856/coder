export type SourceId = 'A' | 'B'
export type ItemKind = 'full_answer' | 'skeleton' | 'redline' | 'comparison' | 'appendix' | 'reference'
export type SourceLayer = 'definition' | 'short_answer' | 'expansion' | 'normal'
export type HintLevel = 'none' | 'heading' | 'keyword' | 'full_answer'
export type EvidenceState = 'independent' | 'minor_omission' | 'cue_dependent' | 'relearned'
export type SelfConfidence = 1 | 2 | 3 | 4 | 5
export type SignalType = 'actual_exam' | 'teacher_must' | 'aggregation' | 'mock' | 'material_note'
export type RelationStatus = 'candidate' | 'confirmed' | 'confirmed-by-source' | 'rejected'
export type ViewId = 'today' | 'method' | 'recall' | 'exam' | 'library' | 'mistakes' | 'archive' | 'settings'

export interface SourceSignal {
  type: SignalType
  label: string
  value?: number
}

export interface Section {
  id: string
  title?: string
  sourceText: string
  layer: SourceLayer
  emphasis?: 'b-red-emphasis'
}

export interface CheckPoint {
  id: string
  level: 1 | 2
  label: string
  sourceText: string
  group: string
  role: 'heading' | 'point' | 'sports' | 'expansion'
}

export interface ContentTable {
  headers: string[]
  rows: string[][]
  role?: string
  page?: number
  pages?: number[]
  rowItemIds?: string[]
}

export interface StudyItem {
  id: string
  source: SourceId
  kind: ItemKind
  chapterId: string
  chapter: string
  chapterIndex: number
  title: string
  pdfPages: number[]
  anchor: string
  originalMarkdown: string
  sections: Section[]
  tables: ContentTable[]
  reviewedHeadingHints: string[]
  reviewedKeywordHints: string[]
  redlineIds: string[]
  confirmedRelatedIds: string[]
  candidateRelatedIds: string[]
  sourceSignals: SourceSignal[]
  checkPoints: CheckPoint[]
  coreA: boolean
  appendixFullAnswer: boolean
  fullTextForLookup: boolean
}

export interface FlowBlock {
  type: 'prose' | 'table' | 'item'
  text?: string
  page?: number
  itemId?: string
  headers?: string[]
  rows?: string[][]
  role?: string
  pages?: number[]
  rowItemIds?: string[]
}

export interface Chapter {
  id: string
  source: SourceId
  title: string
  index: number
  isAppendix: boolean
  isChapter: boolean
  isGuide: boolean
  intro: string
  flow: FlowBlock[]
}

export interface PageDoc {
  source: SourceId
  page: number
  anchor: string
  markdown: string
}

export interface Relation {
  id: string
  aItemId: string
  bItemId: string
  reason: string
  status: RelationStatus
  role: string
  evidenceQuote: string
  humanTouched?: boolean
}

export interface KeywordHint {
  id: string
  text: string
  status: RelationStatus | 'confirmed'
  evidence: string
  humanTouched?: boolean
}

export interface KeywordBucket {
  itemId: string
  hints: KeywordHint[]
}

export interface AppMeta {
  schemaVersion: number
  contentVersion: string
  sourceHashes: { A: string; B: string }
  builtAt: string
}

export interface ContentBundle {
  meta: AppMeta
  versionConflict: { aStatement: string; bStatement: string; resolution: string }
  pages: PageDoc[]
  chapters: Chapter[]
  items: StudyItem[]
  relations: Relation[]
  keywords: KeywordBucket[]
}

export interface RecallDraft {
  text: string
  createdAt: number
}

export interface Attempt {
  id: string
  itemId: string
  startedAt: number
  finishedAt: number
  durationSeconds: number
  highestHintUsed: HintLevel
  hintSequence: HintLevel[]
  preRevealDraft?: RecallDraft
  checkedPointIds: string[]
  missingPointIds: string[]
  termErrors: string[]
  redlineErrors: string[]
  sportsExampleMissing: boolean
  postRevealNoHintPassed?: boolean
  restatementText?: string
  evidenceState: EvidenceState
  selfConfidence: SelfConfidence
  userNote?: string
  dueAt?: number
  reviewKind: 'initial' | 'delay'
}

export interface Note {
  itemId: string
  text: string
  updatedAt: number
}

export interface GapSettings {
  relearnedMin: number
  cueMin: number
  minorHours: number
  independentDays: number
  independentAgainDays: number
}

export interface DaySettings {
  totalMinutes: number
  protectEvening: boolean
  eveningMinutes: number
  bOnlyMaxMinutes: number
  prioritizeA26: boolean
  includeAppendix2: boolean
  restEvery: number
  restMinutes: number
  writingMinutes: number
}

export type ReadingScale = 'compact' | 'standard' | 'recite'

export interface Settings {
  theme: 'light' | 'dark'
  /** @deprecated UI 使用 readingScale；保留字段以兼容旧 JSON */
  fontSize: number
  readingScale: ReadingScale
  focusReading: boolean
  gaps: GapSettings
  day: DaySettings
  showTimer: boolean
}

export interface MigrationEntry {
  itemId: string
  attemptId: string
  contentVersion: string
  note: string
}

export interface RecallState {
  itemId: string
  phase: 'draft' | 'b_skeleton' | 'headings' | 'keywords' | 'compare' | 'restate' | 'done'
  startedAt: number
  draft: string
  frozenDraft: RecallDraft | null
  hintSequence: HintLevel[]
  highestHintUsed: HintLevel
  keywordSkipped: boolean
  checkedPointIds: string[]
  termErrorDraft: string
  redlineErrorIds: string[]
  postRevealNoHintPassed?: boolean
  restatement: string
  selfConfidence?: SelfConfidence
  userNote: string
  result?: Attempt
}

export interface ExamAnswer {
  text: string
  revealed: boolean
  durationSeconds?: number
}

export interface ExamState {
  id: string
  title: string
  itemIds: string[]
  index: number
  startedAt: number
  /** 当前题开始时间；限时按题重置 */
  questionStartedAt?: number
  limitSeconds: number | null
  answers: Record<string, ExamAnswer>
}

export interface PlanBlock {
  id: string
  phase: 'I' | 'II' | 'III' | 'IV' | 'V'
  title: string
  minutes: number
  itemIds: string[]
  protected: boolean
  dynamic: boolean
  note: string
}

export interface DayPlan {
  createdAt: number
  totalMinutes: number
  eveningMinutes: number
  blocks: PlanBlock[]
  notes: string[]
}

export interface Persisted {
  schemaVersion: number
  contentVersion: string
  sourceHashes: { A: string; B: string }
  savedAt: number
  attempts: Attempt[]
  notes: Note[]
  bookmarks: string[]
  settings: Settings
  relationOverrides: Record<string, RelationStatus>
  keywordOverrides: Record<string, RelationStatus>
  customKeywords: { itemId: string; text: string }[]
  migrationReview: MigrationEntry[]
  recall: RecallState | null
  recallQueue: string[]
  exam: ExamState | null
  dayPlan: DayPlan | null
  view: ViewId
  library: { source: SourceId | 'all'; chapterId: string; itemId: string; query: string; mode: ReaderMode; pageAnchor: string }
}

export type ReaderMode = 'all' | 'skeleton' | 'short' | 'no-expansion'

export interface HintContext {
  confirmedSkeletonIds: string[]
  confirmedRedlineIds: string[]
  candidateRelationIds: string[]
  keywords: string[]
  hasHeadings: boolean
}
