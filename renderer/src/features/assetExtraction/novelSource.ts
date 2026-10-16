/**
 * 项目小说原文的「读 / 追加合并」纯函数。
 *
 * 数据模型：一个项目 = 一本小说，承载为 1 条 `source_type = 'novel-source'` 的知识文档。
 * 再次导入视为对同一本的补充（追加合并），这里提供确定性的拼接/定位/构建逻辑，便于单测。
 *
 * 本模块只操作字符串与结构化对象，不接 IPC / 不依赖 store。
 */

/** 项目小说来源类型标识。 */
export const NOVEL_SOURCE_TYPE = 'novel-source' as const

/** 项目小说固定的来源标题，供按来源替换（1 项目 1 本）使用。 */
export const NOVEL_SOURCE_TITLE = '小说原文'

/** 追加导入时的分隔标记。 */
export const NOVEL_APPEND_MARKER = '\n\n【补充导入】\n\n'

/** 累积原文的字符上限（超限做头截断保护）。 */
export const NOVEL_CONTENT_MAX_CHARS = 2_000_000

/** 可被定位的最小文档结构（KnowledgeDocument 天然满足）。 */
export interface ScopedNovelDocument {
  id: string
  projectId?: string
  sourceType: string
  content?: string
  metadata?: Record<string, unknown>
}

/** 构建出的项目小说文档结构。 */
export interface NovelDocument {
  id: string
  projectId: string
  title: string
  sourceType: typeof NOVEL_SOURCE_TYPE
  sourceLabel: string
  content: string
  summary: string
  keywords: string[]
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

/** 统一换行并去首尾空白，保留段内换行。 */
export function normalizeNovelText(value: unknown): string {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .trim()
}

/** 用于重复检测的归一文本：去所有空白并小写。 */
function normalizeForCompare(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase()
}

function applyCap(text: string, maxChars: number): string {
  if (maxChars <= 0 || text.length <= maxChars) return text
  return text.slice(0, maxChars)
}

/**
 * 追加合并原文：
 * - 空输入 → 原样返回（幂等）；
 * - 追加内容已整体存在于既有文本 → 返回既有（幂等，防重复导入同一段）；
 * - 按段落过滤已存在的段落，只追加真正新增的段落，并加章节分隔标记；
 * - 超出字符上限时做头截断保护。
 */
export function appendNovelText(
  existing: unknown,
  incoming: unknown,
  options: { marker?: string; maxChars?: number } = {}
): string {
  const marker = options.marker ?? NOVEL_APPEND_MARKER
  const maxChars = options.maxChars ?? NOVEL_CONTENT_MAX_CHARS

  const base = normalizeNovelText(existing)
  const addition = normalizeNovelText(incoming)
  if (!addition) return base
  if (!base) return applyCap(addition, maxChars)

  const baseCompare = normalizeForCompare(base)
  const additionCompare = normalizeForCompare(addition)
  if (additionCompare && baseCompare.includes(additionCompare)) return base

  const freshParagraphs = addition
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .filter((paragraph) => !baseCompare.includes(normalizeForCompare(paragraph)))

  if (!freshParagraphs.length) return base

  const merged = `${base}\n${marker}${freshParagraphs.join('\n\n')}`
  return applyCap(merged, maxChars)
}

/** 判断文档是否为项目小说原文。 */
export function isNovelDocument(document: { sourceType: string } | null | undefined): boolean {
  return Boolean(document) && document!.sourceType === NOVEL_SOURCE_TYPE
}

/**
 * 在文档集合中定位当前项目的唯一小说文档；无归属或未找到时返回 null。
 */
export function locateProjectNovel<T extends ScopedNovelDocument>(
  documents: readonly T[] | null | undefined,
  projectId: string
): T | null {
  const normalizedProjectId = String(projectId ?? '').trim()
  if (!normalizedProjectId || !Array.isArray(documents)) return null

  return documents.find((document) => (
    isNovelDocument(document)
    && String(document.projectId ?? '').trim() === normalizedProjectId
  )) ?? null
}

/** 读取当前项目的累积小说原文；无小说文档时返回空串（旧项目兼容，不报错）。 */
export function readProjectNovelContent<T extends ScopedNovelDocument>(
  documents: readonly T[] | null | undefined,
  projectId: string
): string {
  const document = locateProjectNovel(documents, projectId)
  return typeof document?.content === 'string' ? document.content : ''
}

/** 构建项目小说文档的元数据（固定来源标题，便于按来源替换）。 */
export function buildNovelDocumentMetadata(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { sourceTitle: NOVEL_SOURCE_TITLE, ...extra }
}

export interface BuildNovelDocumentInput {
  projectId: string
  content: string
  /** 已有文档 id；缺省时生成确定性的项目级 id */
  id?: string
  title?: string
  now: string
  metadata?: Record<string, unknown>
}

/** 构建一条项目小说文档（纯函数，时间与 id 由调用方注入，保证可测）。 */
export function buildNovelDocument(input: BuildNovelDocumentInput): NovelDocument {
  const projectId = String(input.projectId ?? '').trim()
  const content = normalizeNovelText(input.content)
  const now = String(input.now ?? '').trim() || new Date().toISOString()

  return {
    id: String(input.id ?? '').trim() || `${NOVEL_SOURCE_TYPE}-${projectId}`,
    projectId,
    title: String(input.title ?? '').trim() || NOVEL_SOURCE_TITLE,
    sourceType: NOVEL_SOURCE_TYPE,
    sourceLabel: NOVEL_SOURCE_TITLE,
    content,
    summary: content.slice(0, 180),
    keywords: [],
    metadata: buildNovelDocumentMetadata(input.metadata),
    createdAt: now,
    updatedAt: now
  }
}
