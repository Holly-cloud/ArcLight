/**
 * 小说资产再提取：目标卡现有字段 + AI 返回建议 → 逐字段 diff（纯函数）。
 *
 * 产出结构与 `renderer/src/components/AiEnhancePreview.vue` 的 `EnhanceFieldDiff` 对齐，
 * 供预览弹窗逐项采纳。`changed` 仅在「AI 给出了非空建议且与当前值不同」时为 true，
 * 保证默认不会把用户已填内容判成待采纳。
 */

import { coerceExtractionText, normalizeExtractionTags, normalizeCandidateName } from './parseExtractionResult.ts'

/** 与 AiEnhancePreview 保持一致的字段渲染类型。 */
export type ExtractionFieldType = 'text' | 'textarea' | 'select' | 'tags'

/** 单字段 diff 结果（对齐 EnhanceFieldDiff）。 */
export interface ExtractionFieldDiff {
  key: string
  label: string
  type: ExtractionFieldType
  original: string | string[]
  suggested: string | string[]
  changed: boolean
}

/** 再提取目标种类 */
export type ReextractKind = 'character' | 'scene' | 'prop'

type FieldDiffBuilder = (
  original: unknown,
  suggested: unknown
) => { original: string | string[]; suggested: string | string[]; changed: boolean }

interface FieldSpec {
  key: string
  label: string
  type: ExtractionFieldType
  /** AI 返回建议中该字段可用的键名（按优先级） */
  suggestedKeys: readonly string[]
  build: FieldDiffBuilder
}

/** 文本字段 diff：仅当建议非空且（归一后）与当前不同时判定 changed。 */
function buildTextDiff(original: unknown, suggested: unknown): { original: string; suggested: string; changed: boolean } {
  const originalText = coerceExtractionText(original, 400)
  const suggestedText = coerceExtractionText(suggested, 400)
  const changed = Boolean(suggestedText) && normalizeText(suggestedText) !== normalizeText(originalText)
  return { original: originalText, suggested: suggestedText, changed }
}

/** 标签字段 diff：按集合比较（大小写不敏感），仅当建议非空且集合不同时判定 changed。 */
function buildTagsDiff(original: unknown, suggested: unknown): { original: string[]; suggested: string[]; changed: boolean } {
  const originalTags = normalizeExtractionTags(original)
  const suggestedTags = normalizeExtractionTags(suggested)
  const changed = suggestedTags.length > 0 && !sameTagSet(originalTags, suggestedTags)
  return { original: originalTags, suggested: suggestedTags, changed }
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

function sameTagSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  const set = new Set(left.map((item) => item.toLowerCase()))
  return right.every((item) => set.has(item.toLowerCase()))
}

const CHARACTER_FIELD_SPECS: readonly FieldSpec[] = [
  { key: 'name', label: '名称', type: 'text', suggestedKeys: ['name'], build: (o, s) => buildTextDiff(normalizeCandidateName(o), s) },
  { key: 'role', label: '定位', type: 'text', suggestedKeys: ['role'], build: buildTextDiff },
  { key: 'description', label: '描述', type: 'textarea', suggestedKeys: ['description'], build: buildTextDiff },
  { key: 'tags', label: '标签', type: 'tags', suggestedKeys: ['tags'], build: buildTagsDiff }
]

const SCENE_FIELD_SPECS: readonly FieldSpec[] = [
  { key: 'name', label: '名称', type: 'text', suggestedKeys: ['name'], build: (o, s) => buildTextDiff(normalizeCandidateName(o), s) },
  { key: 'type', label: '类型', type: 'text', suggestedKeys: ['type'], build: buildTextDiff },
  { key: 'description', label: '描述', type: 'textarea', suggestedKeys: ['description'], build: buildTextDiff },
  { key: 'tags', label: '标签', type: 'tags', suggestedKeys: ['tags'], build: buildTagsDiff }
]

const PROP_FIELD_SPECS: readonly FieldSpec[] = SCENE_FIELD_SPECS

const FIELD_SPECS_BY_KIND: Record<ReextractKind, readonly FieldSpec[]> = {
  character: CHARACTER_FIELD_SPECS,
  scene: SCENE_FIELD_SPECS,
  prop: PROP_FIELD_SPECS
}

function pickSuggested(entry: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = entry[key]
    if (value != null && value !== '') return value
  }
  return undefined
}

export interface BuildReextractSuggestionsInput {
  kind: ReextractKind
  /** 目标卡当前字段 */
  currentFields?: Record<string, unknown> | null
  /** AI 返回的该目标字段建议（缺失字段视为无建议） */
  suggestedFields?: Record<string, unknown> | null
}

/**
 * 逐字段 diff：把 AI 建议与目标卡当前字段对照，产出可预览采纳的字段差异列表。
 * 未在 AI 建议中出现的字段也会保留（changed=false），便于预览完整展示。
 */
export function buildReextractSuggestions(input: BuildReextractSuggestionsInput): ExtractionFieldDiff[] {
  const specs = FIELD_SPECS_BY_KIND[input.kind] ?? []
  const current = input.currentFields && typeof input.currentFields === 'object' ? input.currentFields : {}
  const suggested = input.suggestedFields && typeof input.suggestedFields === 'object' ? input.suggestedFields : {}

  return specs.map((spec) => {
    const originalValue = current[spec.key]
    const suggestedValue = pickSuggested(suggested, spec.suggestedKeys)
    const diff = spec.build(originalValue, suggestedValue)
    return {
      key: spec.key,
      label: spec.label,
      type: spec.type,
      original: diff.original,
      suggested: diff.suggested,
      changed: diff.changed
    }
  })
}
