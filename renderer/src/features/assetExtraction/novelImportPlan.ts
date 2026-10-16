/**
 * 小说导入计划（纯函数）。
 *
 * 供「导入小说」的追加 / 覆盖预览使用：解析章节标题里的序数（「第X章 / 第X话 / 第X回 / 第X节」，
 * 支持中文数字与阿拉伯数字），并按模式产出「本次新增 / 跳过（已存在）」清单与序数区间。
 *
 * 序数一律**取自小说标题**，不从 1 重排；识别不到序数时该章 ordinal 记 `null`。
 * 本模块不接 IPC、不依赖 store，便于单测。
 */
import type { NovelSourceInput } from './novelToChapters.ts'

/** 导入模式：追加（跳过已存在）/ 覆盖（整本替换） */
export type ImportMode = 'append' | 'overwrite'

/** 预览清单里的单章：ordinal 为解析出的序数（识别不到为 null），title 为 trim 后的标题 */
export interface ImportPlanChapter {
  ordinal: number | null
  title: string
}

/** 新增章节的序数区间（from/to 无有效序数时为 null，count 为章节数） */
export interface ImportPlanRange {
  from: number | null
  to: number | null
  count: number
}

/** 导入计划结果（供预览面板渲染） */
export interface ImportPlan {
  mode: ImportMode
  newChapters: ImportPlanChapter[]
  skipped: ImportPlanChapter[]
  range: ImportPlanRange
}

export interface BuildImportPlanOptions {
  novel: NovelSourceInput
  /** 当前项目既有章节标题（trim 后精确比较），append 模式命中即跳过 */
  existingChapterTitles?: Iterable<string>
  mode: ImportMode
}

/** 中文数字字符 → 值 */
const CHINESE_DIGITS: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9
}

/** 中文数量级字符 → 权值 */
const CHINESE_UNITS: Record<string, number> = {
  十: 10,
  百: 100,
  千: 1000
}

/** 「第X章 / 第X话 / 第X回 / 第X节」序数捕获（X 为阿拉伯或中文数字，允许空白） */
const CHAPTER_ORDINAL_RE = /第\s*(\d+|[零一二三四五六七八九十百千两]+)\s*[章话回节]/

/** 中文数字转阿拉伯（零一二三四五六七八九十百千两），无法解析返回 null */
function chineseToNumber(text: string): number | null {
  let total = 0
  let section = 0
  let current = 0
  let hasDigit = false

  for (const char of text) {
    if (char in CHINESE_DIGITS) {
      current = CHINESE_DIGITS[char]
      hasDigit = true
      continue
    }
    const unit = CHINESE_UNITS[char]
    if (unit === undefined) return null
    // 「十」开头的简写（如「十一」）视为「一十」
    if (current === 0 && char === '十') current = 1
    section += current * unit
    current = 0
    hasDigit = true
  }

  if (!hasDigit) return null
  return section + current
}

/**
 * 从章节标题提取序数：支持「第X章 / 第X话 / 第X回 / 第X节」，
 * X 可为阿拉伯数字或中文数字（零一二三四五六七八九十百千两）；识别不到返回 `null`。
 */
export function parseChapterOrdinal(title: string): number | null {
  const source = String(title ?? '')
  const match = source.match(CHAPTER_ORDINAL_RE)
  if (!match) return null

  const token = match[1]
  if (/^\d+$/.test(token)) {
    const value = Number(token)
    return Number.isFinite(value) ? value : null
  }
  return chineseToNumber(token)
}

function computeRange(list: ImportPlanChapter[]): ImportPlanRange {
  const ordinals: number[] = []
  for (const chapter of list) {
    if (typeof chapter.ordinal === 'number') ordinals.push(chapter.ordinal)
  }
  if (!ordinals.length) return { from: null, to: null, count: list.length }
  return { from: Math.min(...ordinals), to: Math.max(...ordinals), count: list.length }
}

/**
 * 构建导入计划。
 * - `append`：跳过（trim 后）已存在的章，其余为 newChapters（序数沿用标题解析结果，不重排）。
 * - `overwrite`：newChapters 为全部章，skipped 恒为空。
 * - `range`：由 newChapters 的序数 min/max 计算，无有效序数时 from/to 记 `null`。
 */
export function buildImportPlan(options: BuildImportPlanOptions): ImportPlan {
  const mode: ImportMode = options?.mode === 'overwrite' ? 'overwrite' : 'append'
  const chapters = Array.isArray(options?.novel?.chapters) ? options.novel.chapters : []

  const seenTitles = new Set<string>()
  // 仅 append 需要以既有章节标题做跳过判定；overwrite 为整本替换，不参考既有标题。
  if (mode === 'append') {
    for (const title of options?.existingChapterTitles ?? []) {
      const key = String(title ?? '').trim()
      if (key) seenTitles.add(key)
    }
  }

  const newChapters: ImportPlanChapter[] = []
  const skipped: ImportPlanChapter[] = []
  for (const chapter of chapters) {
    const title = String(chapter?.title ?? '').trim()
    if (!title) continue
    // 与 buildNovelChapters 保持一致：既有标题 + 本次已收标题命中的都跳过（防重复导入）
    if (seenTitles.has(title)) {
      skipped.push({ ordinal: parseChapterOrdinal(title), title })
      continue
    }
    seenTitles.add(title)
    newChapters.push({ ordinal: parseChapterOrdinal(title), title })
  }

  return {
    mode,
    newChapters,
    skipped: mode === 'overwrite' ? [] : skipped,
    range: computeRange(newChapters)
  }
}
