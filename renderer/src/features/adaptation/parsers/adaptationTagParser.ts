/**
 * 自造标记解析器（PRD §4.5 反幻觉底座）
 * - 7 个标签（LEAD / STAGE / CARD / CHARACTER / RELATIONSHIP / TONE / BOOK_UNDERSTANDING）
 * - 行式 KEY: value 解析；EVIDENCE_REFS 必填校验
 * - 解析失败抛 ParseError 含行号，UI 可定位展示
 * - 不返回标准 JSON（保留抗模型抖动特性）
 */

import type {
  AdaptationCharacter,
  AdaptationEvidenceRef,
  AdaptationStage,
  BookUnderstanding,
  CharacterRelationship,
  LeadCandidate,
  PlotCard,
  ToneProfile
} from '@/types/app'

export type AdaptationTagName =
  | 'LEAD'
  | 'STAGE'
  | 'CARD'
  | 'CHARACTER'
  | 'RELATIONSHIP'
  | 'TONE'
  | 'BOOK_UNDERSTANDING'

/** 解析失败时抛出；UI 可基于行号定位错误。 */
export class ParseError extends Error {
  readonly tag: AdaptationTagName
  readonly lineNumber: number
  constructor(tag: AdaptationTagName, lineNumber: number, message: string) {
    super(`[${tag}] 第 ${lineNumber} 行：${message}`)
    this.tag = tag
    this.lineNumber = lineNumber
    this.name = 'ParseError'
  }
}

/** 通用解析上下文（lineNumber 为当前处理行） */
export interface ParseContext<T> {
  tag: AdaptationTagName
  records: T[]
  currentRecord: Partial<T> | null
  lineNumber: number
}

/** 安全字符串解析（null / undefined → ''） */
function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** 解析形如 "1-5" 或 "1-5,8-12" 的章节范围字符串 */
function parseRangeValue(raw: unknown): { start: number; end: number } | null {
  const text = asString(raw)
  const match = text.match(/^(\d+)\s*-\s*(\d+)$/)
  if (!match) return null
  const start = Number(match[1])
  const end = Number(match[2])
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return null
  return { start, end }
}

/**
 * 解析 "第 1 章至第 30 章" 中文范围字符串
 * 兼容 "1-5" / "1-5,8-12" / "第1章至第30章" / "第 1 章 - 第 30 章" 等变体
 */
function parseChineseChapterRange(raw: unknown): { start: number; end: number } | null {
  const text = asString(raw)
  // "第X章至第Y章"
  const cn = text.match(/第\s*(\d+)\s*章\s*至?\s*第?\s*(\d+)\s*章/)
  if (cn) {
    const start = Number(cn[1])
    const end = Number(cn[2])
    return { start, end }
  }
  // "1-30" / "1 - 30"
  return parseRangeValue(text)
}

/** 解析 evidenceRefs 列表（每行 "- 章节：原因"） */
function parseEvidenceLines(raw: string): AdaptationEvidenceRef[] {
  return raw
    .split('\n')
    .map((line) => line.replace(/^[-•]\s*/, '').trim())
    .filter(Boolean)
    .map((line) => {
      // 章节来源格式：第 X 章 / chapterId / chapterX
      const chapterMatch = line.match(/^第\s*(\d+)\s*章\s*[:：]\s*(.+)$/)
      if (chapterMatch) {
        return {
          chapterId: `chapter-${chapterMatch[1]}`,
          chapterNumber: Number(chapterMatch[1]),
          reason: chapterMatch[2].trim()
        }
      }
      const idMatch = line.match(/^([\w-]+)\s*[:：]\s*(.+)$/)
      if (idMatch) {
        return {
          chapterId: idMatch[1],
          chapterNumber: Number(idMatch[1].replace(/\D+/g, '')) || 0,
          reason: idMatch[2].trim()
        }
      }
      return { chapterId: line, chapterNumber: 0, reason: line }
    })
}

/** 从块文本提取 KEY: value；返回 value 文本（用于支持多行 / 列表） */
function readKeyValue(block: string, key: string): string | null {
  const lines = block.split('\n')
  let capturingKey: string | null = null
  const buffer: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*:\s*(.*)$/)
    if (match) {
      if (capturingKey === key) {
        return buffer.join('\n').trim()
      }
      capturingKey = match[1]
      buffer.length = 0
      if (capturingKey === key) {
        buffer.push(match[2])
      }
    } else if (capturingKey === key) {
      buffer.push(line)
    }
  }
  if (capturingKey === key) {
    return buffer.join('\n').trim()
  }
  return null
}

/** 提取所有标签块（返回 { tag, block, lineNumber } 列表） */
function extractBlocks(raw: string, tag: AdaptationTagName): Array<{ block: string; lineNumber: number }> {
  const openTag = `<${tag}>`
  const closeTag = `</${tag}>`
  const result: Array<{ block: string; lineNumber: number }> = []
  const lines = raw.split('\n')
  let capturing = false
  let blockStart = 0
  let buffer: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()
    if (!capturing && trimmed.startsWith(openTag)) {
      capturing = true
      blockStart = index + 1
      buffer = []
      continue
    }
    if (capturing && trimmed.startsWith(closeTag)) {
      result.push({ block: buffer.join('\n'), lineNumber: blockStart })
      capturing = false
      buffer = []
      continue
    }
    if (capturing) {
      buffer.push(line)
    }
  }
  return result
}

/** 通用工厂：解析指定标签的所有块，调用 factory 构建实体 */
export function parseTagBlocks<T>(
  raw: string,
  tag: AdaptationTagName,
  factory: (ctx: ParseContext<T>) => T
): T[] {
  const ctx: ParseContext<T> = {
    tag,
    records: [],
    currentRecord: null,
    lineNumber: 0
  }
  for (const { block, lineNumber } of extractBlocks(raw, tag)) {
    ctx.lineNumber = lineNumber
    ctx.currentRecord = {}
    try {
      const record = factory(ctx)
      ctx.records.push(record)
    } catch (error) {
      if (error instanceof ParseError && error.lineNumber === 0) {
        throw new ParseError(tag, lineNumber, error.message)
      }
      throw error
    }
  }
  return ctx.records
}

/* ---------- LEAD ---------- */
export function parseLeadBlocks(raw: string): LeadCandidate[] {
  return parseTagBlocks<LeadCandidate>(raw, 'LEAD', (ctx) => {
    const blocks = ctx as unknown as ParseContext<LeadCandidate>
    const rawBlock = extractBlocks(raw, 'LEAD')[ctx.records.length]?.block ?? ''
    const evidenceRaw = readKeyValue(rawBlock, 'EVIDENCE_REFS')
    if (!evidenceRaw) {
      throw new ParseError('LEAD', ctx.lineNumber, '缺少 EVIDENCE_REFS 必填字段')
    }
    const evidenceRefs = parseEvidenceLines(evidenceRaw)
    if (evidenceRefs.length === 0) {
      throw new ParseError('LEAD', ctx.lineNumber, 'EVIDENCE_REFS 必须包含至少一条证据')
    }
    const name = asString(readKeyValue(rawBlock, 'NAME'))
    if (!name) throw new ParseError('LEAD', ctx.lineNumber, '缺少 NAME 必填字段')
    const reason = asString(readKeyValue(rawBlock, 'REASON'))
    if (!reason) throw new ParseError('LEAD', ctx.lineNumber, '缺少 REASON 必填字段')
    const role = asString(readKeyValue(rawBlock, 'ROLE')) || 'supporting'
    const confidenceRaw = asString(readKeyValue(rawBlock, 'CONFIDENCE'))
    const confidence = Number(confidenceRaw)
    return {
      id: `lead-${ctx.records.length + 1}`,
      name,
      role,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
      reason,
      evidenceRefs
    }
  })
}

/* ---------- STAGE ---------- */
export function parseStageBlocks(raw: string): AdaptationStage[] {
  return parseTagBlocks<AdaptationStage>(raw, 'STAGE', (ctx) => {
    const block = extractBlocks(raw, 'STAGE')[ctx.records.length]?.block ?? ''
    const title = asString(readKeyValue(block, 'TITLE'))
    if (!title) throw new ParseError('STAGE', ctx.lineNumber, '缺少 TITLE 必填字段')
    const range = parseChineseChapterRange(readKeyValue(block, 'SOURCE_RANGE'))
    if (!range) throw new ParseError('STAGE', ctx.lineNumber, '缺少或非法的 SOURCE_RANGE 字段')
    const evidenceRaw = readKeyValue(block, 'EVIDENCE_REFS')
    if (!evidenceRaw) throw new ParseError('STAGE', ctx.lineNumber, '缺少 EVIDENCE_REFS 必填字段')
    const events = asString(readKeyValue(block, 'PROTAGONIST_EVENTS'))
      .split('\n')
      .map((line) => line.replace(/^[-•]\s*/, '').trim())
      .filter(Boolean)
    return {
      id: `stage-${ctx.records.length + 1}`,
      index: ctx.records.length,
      title,
      sourceChapterStart: range.start,
      sourceChapterEnd: range.end,
      targetEpisodeStart: 1,
      targetEpisodeEnd: 1,
      startState: asString(readKeyValue(block, 'START_STATE')),
      endState: asString(readKeyValue(block, 'END_STATE')),
      goal: asString(readKeyValue(block, 'GOAL')),
      obstacle: asString(readKeyValue(block, 'OBSTACLE')),
      personality: asString(readKeyValue(block, 'PERSONALITY')),
      emotionalNeed: asString(readKeyValue(block, 'EMOTIONAL_NEED')),
      turningPoint: asString(readKeyValue(block, 'TURNING_POINT')),
      stagePayoff: asString(readKeyValue(block, 'STAGE_PAYOFF')),
      transitionHook: asString(readKeyValue(block, 'TRANSITION_HOOK')),
      protagonistEvents: events,
      evidenceRefs: parseEvidenceLines(evidenceRaw)
    }
  })
}

/* ---------- CARD ---------- */
export function parseCardBlocks(raw: string): PlotCard[] {
  return parseTagBlocks<PlotCard>(raw, 'CARD', (ctx) => {
    const block = extractBlocks(raw, 'CARD')[ctx.records.length]?.block ?? ''
    const title = asString(readKeyValue(block, 'TITLE'))
    if (!title) throw new ParseError('CARD', ctx.lineNumber, '缺少 TITLE 必填字段')
    const synopsis = asString(readKeyValue(block, 'SYNOPSIS'))
    if (!synopsis) throw new ParseError('CARD', ctx.lineNumber, '缺少 SYNOPSIS 必填字段')
    const range = parseChineseChapterRange(readKeyValue(block, 'SOURCE_RANGE'))
    if (!range) throw new ParseError('CARD', ctx.lineNumber, '缺少或非法的 SOURCE_RANGE 字段')
    const evidenceRaw = readKeyValue(block, 'EVIDENCE_REFS')
    if (!evidenceRaw) throw new ParseError('CARD', ctx.lineNumber, '缺少 EVIDENCE_REFS 必填字段')
    const characters = asString(readKeyValue(block, 'CHARACTERS'))
      .split('\n')
      .map((line) => line.replace(/^[-•]\s*/, '').trim())
      .filter(Boolean)
    const beats = asString(readKeyValue(block, 'STORY_BEATS'))
      .split('\n')
      .map((line) => line.replace(/^[-•]\s*/, '').trim())
      .filter(Boolean)
    return {
      id: `card-${ctx.records.length + 1}`,
      stageId: asString(readKeyValue(block, 'STAGE_ID')),
      title,
      function: 'opening',
      protagonistRelation: 'direct-action',
      synopsis,
      storyBeats: beats,
      protagonistGoal: asString(readKeyValue(block, 'PROTAGONIST_GOAL')),
      protagonistAction: asString(readKeyValue(block, 'PROTAGONIST_ACTION')),
      protagonistObstacle: asString(readKeyValue(block, 'PROTAGONIST_OBSTACLE')),
      protagonistChoice: asString(readKeyValue(block, 'PROTAGONIST_CHOICE')),
      protagonistResult: asString(readKeyValue(block, 'PROTAGONIST_RESULT')),
      protagonistStateChange: asString(readKeyValue(block, 'PROTAGONIST_STATE_CHANGE')),
      nextHook: asString(readKeyValue(block, 'NEXT_HOOK')),
      conflict: asString(readKeyValue(block, 'CONFLICT')),
      result: asString(readKeyValue(block, 'RESULT')),
      emotionalEffect: asString(readKeyValue(block, 'EMOTIONAL_EFFECT')),
      sourceChapterStart: range.start,
      sourceChapterEnd: range.end,
      sourceRefs: parseEvidenceLines(evidenceRaw),
      participatingCharacterIds: characters,
      dependencies: [],
      status: 'active',
      reuseMode: 'keep',
      dialogueAnchors: []
    }
  })
}

/* ---------- CHARACTER ---------- */
export function parseCharacterBlocks(raw: string): AdaptationCharacter[] {
  return parseTagBlocks<AdaptationCharacter>(raw, 'CHARACTER', (ctx) => {
    const block = extractBlocks(raw, 'CHARACTER')[ctx.records.length]?.block ?? ''
    const name = asString(readKeyValue(block, 'NAME'))
    if (!name) throw new ParseError('CHARACTER', ctx.lineNumber, '缺少 NAME 必填字段')
    const evidenceRaw = readKeyValue(block, 'EVIDENCE_REFS')
    if (!evidenceRaw) throw new ParseError('CHARACTER', ctx.lineNumber, '缺少 EVIDENCE_REFS 必填字段')
    return {
      id: `character-${ctx.records.length + 1}`,
      name,
      aliases: [],
      identity: asString(readKeyValue(block, 'IDENTITY')),
      gender: asString(readKeyValue(block, 'GENDER')),
      age: asString(readKeyValue(block, 'AGE')),
      socialStatus: asString(readKeyValue(block, 'SOCIAL_STATUS')),
      background: asString(readKeyValue(block, 'BACKGROUND')),
      personality: asString(readKeyValue(block, 'PERSONALITY')),
      goal: asString(readKeyValue(block, 'GOAL')),
      fearOrWeakness: asString(readKeyValue(block, 'FEAR_OR_WEAKNESS')),
      firstAppearanceChapter: 1,
      lastAppearanceChapter: 1,
      stageIds: [],
      dramaticFunction: asString(readKeyValue(block, 'DRAMATIC_FUNCTION')),
      protagonistImpact: asString(readKeyValue(block, 'PROTAGONIST_IMPACT')),
      mergeCandidates: [],
      mergeReason: asString(readKeyValue(block, 'MERGE_REASON')),
      mergeConfidence: 0,
      participationCount: 0,
      mainlineCardCount: 0,
      evidenceRefs: parseEvidenceLines(evidenceRaw)
    }
  })
}

/* ---------- RELATIONSHIP ---------- */
export function parseRelationshipBlocks(raw: string): CharacterRelationship[] {
  return parseTagBlocks<CharacterRelationship>(raw, 'RELATIONSHIP', (ctx) => {
    const block = extractBlocks(raw, 'RELATIONSHIP')[ctx.records.length]?.block ?? ''
    const fromCharacterId = asString(readKeyValue(block, 'FROM'))
    const toCharacterId = asString(readKeyValue(block, 'TO'))
    if (!fromCharacterId || !toCharacterId) {
      throw new ParseError('RELATIONSHIP', ctx.lineNumber, '缺少 FROM / TO 必填字段')
    }
    return {
      id: `relationship-${ctx.records.length + 1}`,
      fromCharacterId,
      toCharacterId,
      type: asString(readKeyValue(block, 'TYPE')),
      description: asString(readKeyValue(block, 'DESCRIPTION')),
      intensity: Number(asString(readKeyValue(block, 'INTENSITY'))) || 50,
      participatingCardIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  })
}

/* ---------- TONE ---------- */
export function parseToneBlocks(raw: string): ToneProfile {
  const blocks = extractBlocks(raw, 'TONE')
  if (blocks.length === 0) {
    throw new ParseError('TONE', 0, '未找到 <TONE> 块')
  }
  const block = blocks[0].block
  const evidenceRaw = readKeyValue(block, 'EVIDENCE_REFS')
  if (!evidenceRaw) throw new ParseError('TONE', blocks[0].lineNumber, '缺少 EVIDENCE_REFS 必填字段')
  void evidenceRaw
  const parseScale = (raw: unknown): number => {
    const value = Number(asString(raw))
    if (!Number.isFinite(value)) return 50
    return Math.max(0, Math.min(100, value))
  }
  return {
    coreTone: asString(readKeyValue(block, 'CORE_TONE')),
    genrePromise: asString(readKeyValue(block, 'GENRE_PROMISE')),
    audiencePromise: asString(readKeyValue(block, 'AUDIENCE_PROMISE')),
    emotionalPalette: asString(readKeyValue(block, 'EMOTIONAL_PALETTE'))
      .split(/[；;\n]/)
      .map((line) => line.trim())
      .filter(Boolean),
    narrativeVoice: asString(readKeyValue(block, 'NARRATIVE_VOICE')),
    pacing: asString(readKeyValue(block, 'PACING')),
    conflictTemperature: asString(readKeyValue(block, 'CONFLICT_TEMPERATURE')),
    dialogueStyle: asString(readKeyValue(block, 'DIALOGUE_STYLE')),
    humorLevel: parseScale(readKeyValue(block, 'HUMOR_LEVEL')),
    romanceLevel: parseScale(readKeyValue(block, 'ROMANCE_LEVEL')),
    darknessLevel: parseScale(readKeyValue(block, 'DARKNESS_LEVEL')),
    mustKeepRules: asString(readKeyValue(block, 'MUST_KEEP_RULES'))
      .split('\n')
      .map((line) => line.replace(/^[-•]\s*/, '').trim())
      .filter(Boolean),
    avoidRules: asString(readKeyValue(block, 'AVOID_RULES'))
      .split('\n')
      .map((line) => line.replace(/^[-•]\s*/, '').trim())
      .filter(Boolean),
    deviationWarnings: asString(readKeyValue(block, 'DEVIATION_WARNINGS'))
      .split('\n')
      .map((line) => line.replace(/^[-•]\s*/, '').trim())
      .filter(Boolean),
    status: 'fresh',
    extractedAt: new Date().toISOString()
  }
}

/* ---------- BOOK_UNDERSTANDING ---------- */
export function parseBookUnderstandingBlocks(raw: string): BookUnderstanding {
  const blocks = extractBlocks(raw, 'BOOK_UNDERSTANDING')
  if (blocks.length === 0) {
    throw new ParseError('BOOK_UNDERSTANDING', 0, '未找到 <BOOK_UNDERSTANDING> 块')
  }
  const block = blocks[0].block
  const evidenceRaw = readKeyValue(block, 'EVIDENCE_REFS')
  if (!evidenceRaw) throw new ParseError('BOOK_UNDERSTANDING', blocks[0].lineNumber, '缺少 EVIDENCE_REFS 必填字段')
  return {
    wholeBookSummary: asString(readKeyValue(block, 'WHOLE_BOOK_SUMMARY')),
    majorStoryLines: asString(readKeyValue(block, 'MAJOR_STORY_LINES'))
      .split('\n')
      .map((line) => line.replace(/^[-•]\s*/, '').trim())
      .filter(Boolean),
    keyTurningPoints: asString(readKeyValue(block, 'KEY_TURNING_POINTS'))
      .split('\n')
      .map((line) => line.replace(/^[-•]\s*/, '').trim())
      .filter(Boolean),
    protagonistArc: asString(readKeyValue(block, 'PROTAGONIST_ARC')),
    coverageNote: asString(readKeyValue(block, 'COVERAGE_NOTE')),
    evidenceRefs: parseEvidenceLines(evidenceRaw)
  }
}
