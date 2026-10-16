export type ContinuationImportConfidence = 'high' | 'medium' | 'low'

export type ContinuationImportChapter = {
  id: string
  title: string
  volumeTitle: string
  content: string
  characterCount: number
  confidence: ContinuationImportConfidence
}

export type ContinuationImportDocument = {
  title: string
  characterCount: number
  chapterCount: number
  volumeCount: number
  chapters: ContinuationImportChapter[]
  warnings: string[]
}

export type ContinuationNovelFilePreview = ContinuationImportDocument & {
  filePath: string
  fileName: string
  fileSize: number
  encoding: string
  /** 归一化后的原文（保留原始行），供渲染层用「原文」重切而非从 chapters 反拼。 */
  rawText: string
}

/** 候选切点行：index=原始行号；text=该行 trim 后预览（截断 ≤40 字，仅用于喂 LLM）。 */
export type SplitCandidate = { index: number; text: string }

/** LLM（或脚本）给出的切点计划：chapters/volumes 均为原始行号。 */
export type SplitPlan = { chapters: number[]; volumes: number[] }

const CHINESE_NUMBER = '零〇一二三四五六七八九十百千万两'
const CHAPTER_HEADING_RE = new RegExp(
  `^(?:第\\s*[0-9${CHINESE_NUMBER}]+\\s*[章节回话]|chapter\\s*[0-9]+|序章|楔子|引子|前言|后记|尾声|终章|大结局|番外(?:\\s*[0-9${CHINESE_NUMBER}]+)?)(?:[：:、.．\\-—\\s]*[^。！？!?；;]{0,48})?$`,
  'iu'
)
const VOLUME_HEADING_RE = new RegExp(
  `^(?:第\\s*[0-9${CHINESE_NUMBER}]+\\s*[卷部集]|[卷部集]\\s*[0-9${CHINESE_NUMBER}]+)(?:[：:、.．\\-—\\s]+.{0,48})?$`,
  'u'
)
/** 候选行宽松规则（行首锚定、高召回）：章节/集/话级 + 卷/部级 + 编号型标题的常见写法。 */
const SPLIT_CANDIDATE_RE = new RegExp(
  `^(?:第\\s*[0-9${CHINESE_NUMBER}]{1,8}\\s*[章节回话集卷部篇幕]`
  + `|chapter\\s*[0-9]+`
  + `|序章|楔子|引子|前言|后记|尾声|终章|大结局|番外[0-9…]{0,4}`
  + `|\\d{1,4}\\s*[.、．:：)）]`
  + `|[（(]\\s*[0-9${CHINESE_NUMBER}]{1,4}\\s*[)）]`
  + `|[一二三四五六七八九十百千]{1,4}\\s*[、.．]`
  // 纯数字行须整行匹配（`$`），否则「1999年…」这类数字开头的正文会被误纳为候选、抬高 token。
  + `|\\d{1,4}$)`,
  'iu'
)
/** 候选行喂给 LLM 的预览截断长度（字）。 */
const SPLIT_CANDIDATE_PREVIEW_LENGTH = 40

function countCharacters(text: string): number {
  return text.replace(/\s+/g, '').length
}

function trimBlankBoundaryLines(text: string): string {
  const lines = text.split('\n')
  let start = 0
  let end = lines.length

  while (start < end && lines[start].trim() === '') start += 1
  while (end > start && lines[end - 1].trim() === '') end -= 1

  return lines.slice(start, end).join('\n')
}

export function normalizeContinuationNovelText(rawText: string): string {
  const normalized = rawText
    .replace(/^\uFEFF/, '')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')

  return trimBlankBoundaryLines(normalized)
}

function isLikelyHeading(line: string, pattern: RegExp): boolean {
  const trimmed = line.trim()
  // 行尾句末标点与对话行易混，脚本保守不放开（交由 LLM 精度过滤）。
  if (!trimmed || /[。！？!?；;]$/.test(trimmed)) {
    return false
  }
  // 行首装饰可宽剥（P/S 均可）；行尾只剥**括号 / 引号类**（Ps/Pe/Pi/Pf），
  // 不剥句末标点（。！？；，均为 Po），否则会把 “第1章，他走了。” 这类对白误判为标题。
  const stripped = trimmed
    .replace(/^[\s\p{P}\p{S}]+/u, '')
    .replace(/[\p{Ps}\p{Pe}\p{Pi}\p{Pf}\s]+$/u, '')
  if (!stripped || stripped.length > 72 || /[。！？!?；;]$/.test(stripped)) {
    return false
  }
  return pattern.test(stripped)
}

function createChapter(
  index: number,
  title: string,
  volumeTitle: string,
  content: string,
  confidence: ContinuationImportConfidence
): ContinuationImportChapter {
  const normalizedContent = trimBlankBoundaryLines(content)
  return {
    id: `import-chapter-${index + 1}`,
    title: title.trim() || `第${index + 1}章`,
    volumeTitle: volumeTitle.trim() || '正文',
    content: normalizedContent,
    characterCount: countCharacters(normalizedContent),
    confidence
  }
}

/**
 * 收尾生成导入文档：补齐空章节计数、重复标题两类 warning，并算出 chapterCount / volumeCount。
 * 由 `parseContinuationNovelText` 与 `applySplitPlan` 共用，避免两套切分逻辑分叉。
 */
function finalizeNovelDocument(
  fallbackTitle: string,
  text: string,
  chapters: ContinuationImportChapter[],
  warnings: string[]
): ContinuationImportDocument {
  const emptyChapterCount = chapters.filter((chapter) => chapter.characterCount === 0).length
  if (emptyChapterCount > 0) {
    warnings.push(`有 ${emptyChapterCount} 个章节没有正文，请在导入前检查。`)
  }

  const duplicateTitles = new Set<string>()
  const seenTitles = new Set<string>()
  for (const chapter of chapters) {
    if (seenTitles.has(chapter.title)) duplicateTitles.add(chapter.title)
    seenTitles.add(chapter.title)
  }
  if (duplicateTitles.size > 0) {
    warnings.push(`检测到 ${duplicateTitles.size} 个重复章节标题。`)
  }

  return {
    title: fallbackTitle.trim() || '未命名作品',
    characterCount: countCharacters(text),
    chapterCount: chapters.length,
    volumeCount: new Set(chapters.map((chapter) => chapter.volumeTitle)).size,
    chapters,
    warnings
  }
}

export function parseContinuationNovelText(rawText: string, fallbackTitle = '未命名作品'): ContinuationImportDocument {
  const text = normalizeContinuationNovelText(rawText)
  if (!text) {
    throw new Error('导入的 TXT 文件没有可用正文。')
  }

  const lines = text.split('\n')
  const headingIndexes: number[] = []
  for (let index = 0; index < lines.length; index += 1) {
    if (isLikelyHeading(lines[index], CHAPTER_HEADING_RE)) {
      headingIndexes.push(index)
    }
  }

  const warnings: string[] = []
  if (headingIndexes.length < 2) {
    warnings.push('未识别到稳定的章节标题，已将全文保留为一个章节，请在校对页手动拆分。')
    const chapter = createChapter(0, '全文', '正文', text, 'low')
    return {
      title: fallbackTitle.trim() || '未命名作品',
      characterCount: countCharacters(text),
      chapterCount: 1,
      volumeCount: 1,
      chapters: [chapter],
      warnings
    }
  }

  const chapters: ContinuationImportChapter[] = []
  const volumeByLine: string[] = []
  let currentVolume = '正文'
  for (let index = 0; index < lines.length; index += 1) {
    if (isLikelyHeading(lines[index], VOLUME_HEADING_RE)) {
      currentVolume = lines[index].trim()
    }
    volumeByLine[index] = currentVolume
  }

  for (let chapterIndex = 0; chapterIndex < headingIndexes.length; chapterIndex += 1) {
    const headingIndex = headingIndexes[chapterIndex]
    currentVolume = volumeByLine[headingIndex] || '正文'
    if (chapters.length === 0) {
      const prefaceLines = lines.slice(0, headingIndex).filter((line) => !isLikelyHeading(line, VOLUME_HEADING_RE))
      const preface = trimBlankBoundaryLines(prefaceLines.join('\n'))
      if (countCharacters(preface) >= 8) {
        chapters.push(createChapter(chapters.length, '正文前内容', currentVolume, preface, 'medium'))
        warnings.push('检测到第一章之前存在正文内容，请确认是否需要保留。')
      }
    }

    const nextHeadingIndex = headingIndexes[chapterIndex + 1] ?? lines.length
    const title = lines[headingIndex].trim()
    const bodyLines = lines
      .slice(headingIndex + 1, nextHeadingIndex)
      .filter((line) => !isLikelyHeading(line, VOLUME_HEADING_RE))
    const body = trimBlankBoundaryLines(bodyLines.join('\n'))
    const confidence: ContinuationImportConfidence = body ? 'high' : 'low'
    chapters.push(createChapter(chapters.length, title, currentVolume, body, confidence))
  }

  return finalizeNovelDocument(fallbackTitle, text, chapters, warnings)
}

/**
 * 脚本高召回候选行扫描：剥离行首装饰后行首锚定「宽松规则」；空行跳过；候选只增不减。
 * 宽松规则宁可多切（高召回），误报交由 LLM 精度过滤；`index` 为原始行号，`text` 截断 ≤40 字。
 */
export function collectSplitCandidates(rawText: string): { lineCount: number; candidates: SplitCandidate[] } {
  const text = normalizeContinuationNovelText(rawText)
  const lines = text ? text.split('\n') : []
  const candidates: SplitCandidate[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim()
    if (!trimmed) continue
    // 先剥行首装饰（【 ] 《 " 等），再行首锚定匹配；同时保留对原行的匹配以覆盖 （一） 这类括号标记。
    const stripped = trimmed.replace(/^[\s\p{P}\p{S}]+/u, '')
    if (!SPLIT_CANDIDATE_RE.test(stripped) && !SPLIT_CANDIDATE_RE.test(trimmed)) continue
    candidates.push({ index, text: trimmed.slice(0, SPLIT_CANDIDATE_PREVIEW_LENGTH) })
  }

  return { lineCount: lines.length, candidates }
}

/** 按切点计划切分原文；chapters 为空时回退 `parseContinuationNovelText`，保证永不空手。 */
export function applySplitPlan(rawText: string, plan: SplitPlan, fallbackTitle = '未命名作品'): ContinuationImportDocument {
  const text = normalizeContinuationNovelText(rawText)
  if (!text) {
    throw new Error('导入的 TXT 文件没有可用正文。')
  }

  const lines = text.split('\n')
  const chapterIndexes = normalizeSplitIndexes(plan?.chapters, lines.length)
  if (chapterIndexes.length === 0) {
    return parseContinuationNovelText(rawText, fallbackTitle)
  }

  const volumeSet = new Set(normalizeSplitIndexes(plan?.volumes, lines.length))
  const warnings: string[] = []

  const volumeByLine: string[] = []
  let currentVolume = '正文'
  for (let index = 0; index < lines.length; index += 1) {
    if (volumeSet.has(index)) currentVolume = lines[index].trim()
    volumeByLine[index] = currentVolume
  }

  const chapters: ContinuationImportChapter[] = []
  const firstChapterIndex = chapterIndexes[0]

  const prefaceLines: string[] = []
  for (let index = 0; index < firstChapterIndex; index += 1) {
    if (volumeSet.has(index)) continue
    prefaceLines.push(lines[index])
  }
  const preface = trimBlankBoundaryLines(prefaceLines.join('\n'))
  if (countCharacters(preface) >= 8) {
    chapters.push(createChapter(chapters.length, '正文前内容', volumeByLine[firstChapterIndex] || '正文', preface, 'medium'))
    warnings.push('检测到第一章之前存在正文内容，请确认是否需要保留。')
  }

  for (let chapterCursor = 0; chapterCursor < chapterIndexes.length; chapterCursor += 1) {
    const headingIndex = chapterIndexes[chapterCursor]
    const nextHeadingIndex = chapterIndexes[chapterCursor + 1] ?? lines.length
    const bodyLines: string[] = []
    for (let index = headingIndex + 1; index < nextHeadingIndex; index += 1) {
      if (volumeSet.has(index)) continue
      bodyLines.push(lines[index])
    }
    const body = trimBlankBoundaryLines(bodyLines.join('\n'))
    const confidence: ContinuationImportConfidence = body ? 'high' : 'low'
    chapters.push(createChapter(chapters.length, lines[headingIndex].trim(), volumeByLine[headingIndex] || '正文', body, confidence))
  }

  return finalizeNovelDocument(fallbackTitle, text, chapters, warnings)
}

/** 清洗计划里的行号：仅保留落在 [0, lineCount) 内的整数，去重升序。 */
function normalizeSplitIndexes(values: unknown, lineCount: number): number[] {
  if (!Array.isArray(values)) return []
  const set = new Set<number>()
  for (const value of values) {
    if (typeof value !== 'number' || !Number.isInteger(value)) continue
    if (value < 0 || value >= lineCount) continue
    set.add(value)
  }
  return [...set].sort((a, b) => a - b)
}

export function plainNovelTextToHtml(text: string): string {
  const escapeHtml = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

  return normalizeContinuationNovelText(text)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

export function buildContinuationChapterTitle(chapterCount: number): string {
  return `第${Math.max(1, chapterCount + 1)}章：续写`
}

function parseChineseChapterNumber(value: string): number | null {
  if (/^\d+$/.test(value)) return Number.parseInt(value, 10)
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
  const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 万: 10_000 }
  let total = 0
  let section = 0
  let number = 0
  for (const char of value) {
    if (char in digits) {
      number = digits[char]
      continue
    }
    const unit = units[char]
    if (!unit) return null
    if (unit === 10_000) {
      section = (section + number) * unit
      total += section
      section = 0
      number = 0
      continue
    }
    section += (number || 1) * unit
    number = 0
  }
  const parsed = total + section + number
  return parsed > 0 ? parsed : null
}

export function inferNextContinuationChapterTitle(chapters: Array<Pick<ContinuationImportChapter, 'title'>>): string {
  for (let index = chapters.length - 1; index >= 0; index -= 1) {
    const match = chapters[index].title.match(new RegExp(`第\\s*([0-9${CHINESE_NUMBER}]+)\\s*章`, 'u'))
    if (!match) continue
    const current = parseChineseChapterNumber(match[1])
    if (current !== null) return `第${current + 1}章：续写`
  }
  return buildContinuationChapterTitle(chapters.length)
}
