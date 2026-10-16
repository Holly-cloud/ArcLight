/**
 * asset-reextract：针对选中资产卡的**再提取**（outputType: 'json'）。
 *
 * 输入 = 项目小说原文中与目标相关的片段 + 目标卡现有字段；
 * 输出 = 逐目标的**字段建议**（不直接覆盖用户已填内容），并附**原文证据**。
 *
 * 反幻觉约定：
 * - 只基于给定原文片段给出建议，片段未提及的字段不要臆造；
 * - 每条建议必须附 evidence（引用片段中的原句）；
 * - 建议仅供渲染层预览逐项采纳，绝不自动覆盖。
 */
import type { AiTaskResult, AssetReextractResult, AssetReextractSuggestion } from '../shared-types.ts'
import { extractJsonObject, jsonStringField, type PromptBuildInput, type TaskHandler } from './base.ts'

const KIND_VALUES = new Set(['character', 'scene', 'prop'])

function normalizeText(value: unknown, maxLength = 400): string {
  const text = jsonStringField(value)
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((tag) => (tag && typeof tag === 'object' ? jsonStringField((tag as Record<string, unknown>).label) : jsonStringField(tag)))
    .filter((tag) => tag && tag !== '[object Object]')
    .slice(0, 6)
}

/** 从 context.targets 中按 id 解析目标种类，AI 未给 kind 时兜底。 */
function resolveKindById(context: Record<string, unknown>, id: string): AssetReextractSuggestion['kind'] {
  const targets = Array.isArray(context.targets) ? context.targets : []
  const matched = targets.find((target) => (
    target && typeof target === 'object' && String((target as Record<string, unknown>).id ?? '').trim() === id
  )) as Record<string, unknown> | undefined
  const kind = String(matched?.kind ?? '').trim()
  return KIND_VALUES.has(kind) ? kind as AssetReextractSuggestion['kind'] : 'character'
}

function normalizeSuggestionFields(raw: unknown): AssetReextractSuggestion['fields'] {
  const entry = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const fields: AssetReextractSuggestion['fields'] = {}
  const name = normalizeText(entry.name, 40)
  const description = normalizeText(entry.description ?? entry.desc)
  const evidenceLikeRole = normalizeText(entry.role, 40)
  const evidenceLikeType = normalizeText(entry.type, 40)
  if (name) fields.name = name
  if (evidenceLikeRole) fields.role = evidenceLikeRole
  if (evidenceLikeType) fields.type = evidenceLikeType
  if (description) fields.description = description
  const tags = normalizeTags(entry.tags)
  if (tags.length) fields.tags = tags
  return fields
}

const handler: TaskHandler = {
  name: 'asset-reextract',
  outputType: 'json',
  useSkills: false,
  defaultCapabilities: ['settings', 'characters', 'writing-style'],
  buildPrompt(input: PromptBuildInput) {
    const { context, capabilityPreamble } = input
    const targets = Array.isArray(context.targets) ? context.targets : []
    const snippet = String(context.novelSnippet ?? '').trim()

    return {
      system: `${capabilityPreamble.system}\n\n你是小说资产「再提取」建议器。你**只返回 JSON 对象**，不要 Markdown、解释或提问。

## 强制约束（反幻觉 + 不覆盖）
1. 你给出的是**建议**，不是最终值：渲染层会逐项预览，由用户勾选后才写回，**你不得声称已修改卡片**。
2. 建议只能**基于下面给出的原文片段**：片段未提及的字段不要臆造，宁可不给该字段建议。
3. 每个目标必须附 \`evidence\`，引用片段中的原句作为依据；找不到依据就不要给出该目标的建议。
4. 不要与用户已填内容冲突时不作说明——若建议与现有值不同，请在 evidence 中说明依据来自哪句原文。

## 输出格式
{"suggestions":[{"kind":"character|scene|prop","id":"原样返回目标 id","fields":{"name":"","role":"","type":"","description":"","tags":[""]},"evidence":"引用原文原句"}]}
说明：character 建议用 role；scene / prop 建议用 type；只填写确有原文依据的字段。`,
      user: `${capabilityPreamble.user}\n\n当前项目题材：${String(context.projectGenre ?? '').trim() || '未指明'}

待再提取的目标（逐项返回建议，id 原样返回）：
${JSON.stringify(targets)}

原文片段（唯一依据）：
${snippet || '（未提供原文片段——请告诉用户需要先导入小说原文。）'}

现在只返回 JSON 对象，不要任何多余文字。`
    }
  },
  normalize(raw: string, context?: Record<string, unknown>): AiTaskResult {
    const parsed = extractJsonObject(raw)
    const ctx = context ?? {}
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.map((item) => {
          const entry = item && typeof item === 'object' ? item as Record<string, unknown> : {}
          const id = String(entry.id ?? '').trim()
          const rawKind = String(entry.kind ?? '').trim()
          const kind = KIND_VALUES.has(rawKind) ? rawKind as AssetReextractSuggestion['kind'] : resolveKindById(ctx, id)
          return {
            kind,
            id,
            fields: normalizeSuggestionFields(entry.fields),
            evidence: normalizeText(entry.evidence, 400)
          }
        }).filter((suggestion) => suggestion.id)
      : []
    return { suggestions } as AssetReextractResult
  },
  validate(result: AiTaskResult): boolean {
    const suggestions = (result as AssetReextractResult).suggestions ?? []
    return suggestions.length > 0
      && suggestions.every((suggestion) => Boolean(String(suggestion.id ?? '').trim()) && Boolean(String(suggestion.evidence ?? '').trim()))
  },
  describeValidationErrors(result: AiTaskResult): string[] {
    const suggestions = (result as AssetReextractResult).suggestions ?? []
    if (!suggestions.length) return ['未返回任何字段建议，suggestions 不能为空。']
    return ['存在缺少 id 或 evidence 的建议，每条建议都必须携带原文证据。']
  },
  resolveMaxTokens(input: PromptBuildInput): number {
    const targets = Array.isArray(input.context.targets) ? input.context.targets.length : 1
    return Math.min(6000, 1500 + Math.max(1, targets) * 700)
  }
}

export default handler
