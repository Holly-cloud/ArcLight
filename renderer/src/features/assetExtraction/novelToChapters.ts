/**
 * 小说解析结果 → 项目「章节创作」落库载荷（纯函数）。
 *
 * 输入：`@shared/continuation-import` 的解析结果（含卷 / 第X章·第X话划分与字数），
 * 以及当前项目既有章节标题集合；输出可直接追加进工作区的
 * `outlineVolumes` / `outlineItems` / `chapters`。
 *
 * 约定（与「续写导入」页的构建方式一致）：
 * - 按 `volumeTitle` 分组生成分卷，字数取该卷合计；
 * - 每章生成 1 个大纲节点 + 1 个章节草稿，正文 HTML 由 `plainNovelTextToHtml` 生成；
 * - 章节标题（trim 后）命中既有章节标题 → 跳过该章（防重复导入，只追加不删除）；
 * - id 与时间戳由调用方注入，便于单测。
 */
import type { ChapterDraft, OutlineItem, OutlineVolume, WorkflowDocument } from '@/types/app'
import { createDefaultWorkflowDocuments } from '../novelWorkflow/documents.ts'
import { plainNovelTextToHtml } from '../../../../electron/shared/continuation-import.ts'

/** 解析后的单章（`ContinuationImportChapter` 的最小可用子集）。 */
export interface NovelChapterInput {
  title: string
  volumeTitle: string
  content: string
  characterCount: number
}

/** 解析后的小说（`ContinuationImportDocument` 的最小可用子集）。 */
export interface NovelSourceInput {
  title?: string
  chapters: NovelChapterInput[]
}

export interface NovelToChaptersOptions {
  novel: NovelSourceInput
  /** 当前项目既有章节标题（trim 后精确比较），命中即跳过该章 */
  existingChapterTitles?: Iterable<string>
  /** id 生成器，注入以便测试 */
  createId: (prefix: string) => string
  /** 分卷创作记忆的时间戳；缺省沿用默认文档自带时间 */
  now?: string
}

export interface NovelToChaptersResult {
  volumes: OutlineVolume[]
  outlineItems: OutlineItem[]
  chapters: ChapterDraft[]
}

/** 分卷摘要占位文案 */
export const NOVEL_VOLUME_SUMMARY_FALLBACK = '原文导入分卷，待补充分卷摘要。'
/** 章节摘要占位文案 */
export const NOVEL_CHAPTER_SUMMARY_FALLBACK = '原文导入章节，待补充章节摘要。'
/** 章节大纲节点的冲突占位文案 */
export const NOVEL_CHAPTER_CONFLICT_FALLBACK = '原文既有剧情'
/** 无卷标题时的兜底卷名 */
const DEFAULT_VOLUME_TITLE = '正文'

function resolveVolumeTitle(value: unknown): string {
  return String(value ?? '').trim() || DEFAULT_VOLUME_TITLE
}

function normalizeCharacterCount(value: unknown): number {
  const count = Number(value)
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
}

function buildDefaultWorkflowDocuments(now?: string): WorkflowDocument[] {
  const documents = createDefaultWorkflowDocuments()
  return now ? documents.map((document) => ({ ...document, updatedAt: now })) : documents
}

/**
 * 构建追加进当前项目「章节创作」的载荷：分卷 / 大纲节点 / 章节草稿。
 * 同名（trim 后）章节会被跳过；只追加，不删除 / 不覆盖。
 */
export function buildNovelChapters(options: NovelToChaptersOptions): NovelToChaptersResult {
  const inputChapters = Array.isArray(options?.novel?.chapters) ? options.novel.chapters : []
  const createId = options.createId

  const seenTitles = new Set<string>()
  for (const title of options.existingChapterTitles ?? []) {
    const key = String(title ?? '').trim()
    if (key) seenTitles.add(key)
  }

  const accepted: NovelChapterInput[] = []
  for (const chapter of inputChapters) {
    const title = String(chapter?.title ?? '').trim()
    if (!title || seenTitles.has(title)) continue
    seenTitles.add(title)
    accepted.push(chapter)
  }

  const volumeOrder: string[] = []
  const volumeIdByTitle = new Map<string, string>()
  const volumeWordByTitle = new Map<string, number>()
  for (const chapter of accepted) {
    const volumeTitle = resolveVolumeTitle(chapter.volumeTitle)
    if (!volumeIdByTitle.has(volumeTitle)) {
      volumeOrder.push(volumeTitle)
      volumeIdByTitle.set(volumeTitle, createId('volume'))
      volumeWordByTitle.set(volumeTitle, 0)
    }
    volumeWordByTitle.set(
      volumeTitle,
      (volumeWordByTitle.get(volumeTitle) ?? 0) + normalizeCharacterCount(chapter.characterCount)
    )
  }

  const workflowDocuments = buildDefaultWorkflowDocuments(options.now)
  const volumes: OutlineVolume[] = volumeOrder.map((title) => ({
    id: volumeIdByTitle.get(title) ?? '',
    title,
    wordTarget: String(volumeWordByTitle.get(title) ?? 0),
    summary: NOVEL_VOLUME_SUMMARY_FALLBACK,
    workflowDocuments: workflowDocuments.map((document) => ({ ...document }))
  }))

  const outlineItems: OutlineItem[] = []
  const drafts: ChapterDraft[] = []
  accepted.forEach((chapter, index) => {
    const volumeId = volumeIdByTitle.get(resolveVolumeTitle(chapter.volumeTitle)) ?? ''
    const outlineId = createId('outline')
    const chapterId = createId('chapter')
    const title = String(chapter.title).trim()
    const wordTarget = String(Math.max(1, normalizeCharacterCount(chapter.characterCount)))

    outlineItems.push({
      id: outlineId,
      volumeId,
      title,
      wordTarget,
      conflict: NOVEL_CHAPTER_CONFLICT_FALLBACK,
      summary: NOVEL_CHAPTER_SUMMARY_FALLBACK,
      status: 'done',
      sortOrder: index
    })
    drafts.push({
      id: chapterId,
      outlineItemId: outlineId,
      volumeId,
      title,
      summary: NOVEL_CHAPTER_SUMMARY_FALLBACK,
      status: 'final',
      wordTarget,
      content: plainNovelTextToHtml(String(chapter.content ?? ''))
    })
  })

  return { volumes, outlineItems, chapters: drafts }
}
