/**
 * 小说资产提取：把 AI 返回结构解析为规范化候选（纯函数）。
 *
 * 本模块不接 IPC、不依赖 store，便于单测。设计目标为「容错」：
 * AI 输出可能字段缺失、类型错乱、混入占位文本（"原文未明确"）或 "[object Object]"，
 * 这里统一兜底/过滤/截断，产出可供合并与预览采纳使用的候选结构。
 */

/** 角色候选 */
export interface CharacterCandidate {
  name: string
  role: string
  description: string
  tags: string[]
}

/** 场景候选 */
export interface SceneCandidate {
  name: string
  type: string
  description: string
  tags: string[]
}

/** 道具候选 */
export interface PropCandidate {
  name: string
  type: string
  description: string
  tags: string[]
}

/** 一次提取结果的三类候选集合 */
export interface ExtractionCandidates {
  characters: CharacterCandidate[]
  scenes: SceneCandidate[]
  props: PropCandidate[]
}

/** 提取结果各字段的长度与数量上限，避免异常输出撑爆 UI。 */
export const EXTRACTION_LIMITS = {
  /** 每类最多保留的候选数量 */
  maxPerKind: 60,
  /** 名称字段最大长度 */
  maxNameLength: 40,
  /** 描述/角色文本字段最大长度 */
  maxFieldLength: 400,
  /** 每条候选最多标签数 */
  maxTags: 6,
  /** 单个标签最大长度 */
  maxTagLength: 12
} as const

/** 视为「未提供」的占位文本，统一归一为空串，避免把占位词当成真实字段。 */
const PLACEHOLDER_VALUES = new Set([
  '原文未明确',
  '未明确',
  '未知',
  '不详',
  '暂无',
  '无',
  '空',
  'null',
  'undefined',
  'n/a',
  'na',
  '[object object]'
])

const CHARACTER_NAME_KEYS = ['name', 'title', '角色名', '姓名', '名称'] as const
const SCENE_NAME_KEYS = ['name', 'title', '场景名', '地点名', '名称'] as const
const PROP_NAME_KEYS = ['name', 'title', '道具名', '物品名', '名称'] as const
const DESCRIPTION_KEYS = ['description', 'desc', '描述', '简介', '说明'] as const
const TAG_KEYS = ['tags', 'labels', '标签'] as const
const TYPE_KEYS = ['type', '类型', '类别', '场景类型', '道具类型'] as const

/** 把 AI 返回的原始值收敛为普通对象；字符串时尝试 JSON.parse。 */
function coerceRawRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return {}
    try {
      return coerceRawRecord(JSON.parse(trimmed) as unknown)
    } catch {
      return {}
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

/** 取第一个「有值」的字段；跳过 null/undefined/空串。 */
function firstDefined(entry: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = entry[key]
    if (value != null && value !== '') return value
  }
  return undefined
}

/**
 * 把任意字段值收敛为受长度限制的文本；占位文本归一为空串。
 * 兼容对象式标签（取 label/name/text 字段）。
 */
export function coerceExtractionText(value: unknown, maxLength: number = EXTRACTION_LIMITS.maxFieldLength): string {
  let text = ''
  if (typeof value === 'string') {
    text = value
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    text = String(value)
  } else if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    text = String(record.label ?? record.name ?? record.text ?? '')
  }

  const trimmed = text.trim()
  if (!trimmed) return ''
  if (PLACEHOLDER_VALUES.has(trimmed.toLowerCase())) return ''
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed
}

/**
 * 规范化标签数组：兼容字符串/对象项，过滤占位与 "[object Object]"，去重并截断。
 * 字符串会按逗号/顿号/空格拆分。
 */
export function normalizeExtractionTags(
  value: unknown,
  maxTags: number = EXTRACTION_LIMITS.maxTags,
  maxTagLength: number = EXTRACTION_LIMITS.maxTagLength
): string[] {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    return normalizeExtractionTags(trimmed.split(/[,，、\s]+/), maxTags, maxTagLength)
  }
  if (!Array.isArray(value)) return []

  const result: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    const tag = coerceExtractionText(item, maxTagLength)
    if (!tag || tag === '[object Object]') continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(tag)
    if (result.length >= maxTags) break
  }
  return result
}

/** 规范化候选名称（受名称长度上限约束）。 */
export function normalizeCandidateName(value: unknown): string {
  return coerceExtractionText(value, EXTRACTION_LIMITS.maxNameLength)
}

function parseNameEntries<T extends { name: string }>(
  raw: unknown,
  nameKeys: readonly string[],
  build: (entry: Record<string, unknown>, name: string) => T
): T[] {
  if (!Array.isArray(raw)) return []

  const result: T[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const entry = item as Record<string, unknown>
    const name = normalizeCandidateName(firstDefined(entry, nameKeys))
    if (!name) continue
    result.push(build(entry, name))
    if (result.length >= EXTRACTION_LIMITS.maxPerKind) break
  }
  return result
}

function parseCharacterEntries(raw: unknown): CharacterCandidate[] {
  return parseNameEntries<CharacterCandidate>(raw, CHARACTER_NAME_KEYS, (entry, name) => ({
    name,
    role: coerceExtractionText(firstDefined(entry, ['role', '定位', '身份']), 40),
    description: coerceExtractionText(firstDefined(entry, DESCRIPTION_KEYS)),
    tags: normalizeExtractionTags(firstDefined(entry, TAG_KEYS))
  }))
}

function parseSceneEntries(raw: unknown): SceneCandidate[] {
  return parseNameEntries<SceneCandidate>(raw, SCENE_NAME_KEYS, (entry, name) => ({
    name,
    type: coerceExtractionText(firstDefined(entry, TYPE_KEYS), 40),
    description: coerceExtractionText(firstDefined(entry, DESCRIPTION_KEYS)),
    tags: normalizeExtractionTags(firstDefined(entry, TAG_KEYS))
  }))
}

function parsePropEntries(raw: unknown): PropCandidate[] {
  return parseNameEntries<PropCandidate>(raw, PROP_NAME_KEYS, (entry, name) => ({
    name,
    type: coerceExtractionText(firstDefined(entry, TYPE_KEYS), 40),
    description: coerceExtractionText(firstDefined(entry, DESCRIPTION_KEYS)),
    tags: normalizeExtractionTags(firstDefined(entry, TAG_KEYS))
  }))
}

/**
 * 把 AI 返回的原始结构解析为规范化候选集合。
 * 容错：字段缺失兜底为空，tags 过滤/去重/截断，名称缺失的条目直接丢弃。
 */
export function parseExtractionResult(raw: unknown): ExtractionCandidates {
  const source = coerceRawRecord(raw)
  return {
    characters: parseCharacterEntries(source.characters),
    scenes: parseSceneEntries(source.scenes),
    props: parsePropEntries(source.props)
  }
}
