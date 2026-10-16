/**
 * asset-extract：从项目小说原文提取角色 / 场景 / 道具候选（outputType: 'json'）。
 *
 * 反幻觉约定：
 * - 只返回 JSON 对象，不要 Markdown / 解释；
 * - 只能提取原文中**真实出现**的实体，不得编造；
 * - 原文未明确的字段留空或写「原文未明确」；
 * - 严格避开 existingNames（已在资产库中的同名实体）。
 *
 * 分批：原文超长时由渲染层按段切分，逐批调用；本地按 name 去重。
 */
import type { AiTaskResult, AssetExtractResult } from '../shared-types.ts'
import { resolveWritingStyleInstruction } from '../prompts/shared.ts'
import { extractJsonObject, jsonStringField, type PromptBuildInput, type TaskHandler } from './base.ts'

const MAX_ENTRIES_PER_KIND = 30
const MAX_NAME_LENGTH = 40
const MAX_FIELD_LENGTH = 400
const MAX_TAGS = 6

/** 收集本批待提取的原文：优先 novelSegments，其次 novelText。 */
function collectNovelText(context: Record<string, unknown>): string {
  if (Array.isArray(context.novelSegments)) {
    return context.novelSegments
      .map((segment) => String(segment ?? '').trim())
      .filter(Boolean)
      .join('\n\n')
  }
  return String(context.novelText ?? '').trim()
}

/** 规范化 existingNames：兼容数组或 {characters,scenes,props} 对象。 */
function normalizeExistingNames(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, 200)
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return [...normalizeExistingNames(record.characters), ...normalizeExistingNames(record.scenes), ...normalizeExistingNames(record.props)]
  }
  return []
}

function normalizeText(value: unknown, maxLength = MAX_FIELD_LENGTH): string {
  const text = jsonStringField(value)
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((tag) => (tag && typeof tag === 'object' ? jsonStringField((tag as Record<string, unknown>).label) : jsonStringField(tag)))
    .filter((tag) => tag && tag !== '[object Object]')
    .slice(0, MAX_TAGS)
}

function normalizeEntries(raw: unknown, typeField: 'role' | 'type'): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      const entry = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      const name = normalizeText(entry.name, MAX_NAME_LENGTH)
      if (!name) return null
      const normalized: Record<string, unknown> = {
        name,
        [typeField]: normalizeText(entry[typeField] ?? entry.role ?? entry.type, MAX_NAME_LENGTH),
        description: normalizeText(entry.description ?? entry.desc),
        tags: normalizeTags(entry.tags)
      }
      return normalized
    })
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .slice(0, MAX_ENTRIES_PER_KIND)
}

const handler: TaskHandler = {
  name: 'asset-extract',
  outputType: 'json',
  useSkills: false,
  defaultCapabilities: ['settings', 'characters', 'relations', 'worldview', 'writing-style'],
  buildPrompt(input: PromptBuildInput) {
    const { context, capabilityPreamble } = input
    const novelText = collectNovelText(context)
    const existingNames = normalizeExistingNames(context.existingNames)
    const style = resolveWritingStyleInstruction(context)
    const batchLabel = Number.isFinite(Number(context.batchIndex)) ? `第 ${Number(context.batchIndex) + 1} 批` : '本批'

    return {
      system: `${capabilityPreamble.system}\n\n你是小说资产提取器。你**只返回 JSON 对象**，不要 Markdown、解释或提问。

## 强制约束（反幻觉）
1. 只能提取上面原文中**确实出现过的**角色 / 场景 / 道具，严禁依据套路、常识或题材猜测补造实体。
2. 每个实体的字段只能来自原文：原文未明确描述的字段留空字符串，或写「原文未明确」，不要编造。
3. 不得与「已在资产库中的同名实体」重复（严格避开 existingNames 中的名称）。
4. 名称保持原文写法，不要翻译、不要加前缀。

## 输出格式
{"characters":[{"name":"","role":"","description":"","tags":[""]}],"scenes":[{"name":"","type":"","description":"","tags":[""]}],"props":[{"name":"","type":"","description":"","tags":[""]}]}
字段说明：character 用 role（定位/身份）；scene 与 prop 用 type（类型）。tags 为 2-4 个来自原文的关键词。没有某类实体就返回空数组。`,
      user: `${capabilityPreamble.user}\n\n当前项目：${String(context.projectTitle ?? '').trim() || '（未命名）'}（题材：${String(context.projectGenre ?? '').trim() || '未指明'}）
本次处理范围：${batchLabel}
写作风格：${style}

已有实体名称（严格避重）：${JSON.stringify(existingNames)}

小说原文（节选）：
${novelText || '（未提供原文——请告诉用户需要先导入小说原文。）'}

现在只返回 JSON 对象，不要任何多余文字。`
    }
  },
  normalize(raw: string): AiTaskResult {
    const parsed = extractJsonObject(raw)
    return {
      characters: normalizeEntries(parsed.characters, 'role'),
      scenes: normalizeEntries(parsed.scenes, 'type'),
      props: normalizeEntries(parsed.props, 'type')
    } as AssetExtractResult
  },
  validate(result: AiTaskResult): boolean {
    const extracted = result as AssetExtractResult
    const entries = [...(extracted.characters ?? []), ...(extracted.scenes ?? []), ...(extracted.props ?? [])]
    return entries.length > 0
      && entries.every((entry) => Boolean(String(entry.name ?? '').trim()) && Boolean(String(entry.description ?? '').trim()))
  },
  describeValidationErrors(result: AiTaskResult): string[] {
    const extracted = result as AssetExtractResult
    const entries = [...(extracted.characters ?? []), ...(extracted.scenes ?? []), ...(extracted.props ?? [])]
    if (!entries.length) return ['未提取到任何实体，characters / scenes / props 不能同时为空。']
    return ['存在缺少 name 或 description 的实体，每个实体都必须有名称与描述。']
  },
  resolveMaxTokens(input: PromptBuildInput): number {
    const text = collectNovelText(input.context)
    return Math.min(8000, 3000 + Math.min(2000, Math.ceil(text.length / 200) * 50))
  }
}

export default handler
