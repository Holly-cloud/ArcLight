/**
 * asset-extract：从项目章节正文提取「实际登场」的角色 / 场景 / 道具候选（outputType: 'json'）。
 *
 * 反幻觉约定：
 * - 只返回 JSON 对象，不要 Markdown / 解释；
 * - 只提取在本段正文中**确有出场 / 戏份**的实体，仅被提及的一律剔除，不得编造；
 * - 每条候选必须给 **evidence**（引用原文原句），无证据视为不合格；
 * - 原文未明确的字段留空或写「原文未明确」；
 * - 严格避开 existingNames（已在资产库中的同名实体）。
 *
 * 分批：正文超长时由渲染层按段切分，逐批调用；本地按 name 去重。
 */
import type { AiTaskResult, AssetExtractResult } from '../shared-types.ts'
import { resolveWritingStyleInstruction } from '../prompts/shared.ts'
import { extractJsonObject, jsonStringField, type PromptBuildInput, type TaskHandler } from './base.ts'

const MAX_ENTRIES_PER_KIND = 30
const MAX_NAME_LENGTH = 40
const MAX_FIELD_LENGTH = 400
const MAX_TAGS = 6
/** v1.36.1（#10）视觉提示词初稿：单条长度上限（超出截断，避免异常输出撑爆 UI / 落库） */
const MAX_VISUAL_PROMPT_LENGTH = 600
/** v1.36.1（#10）视觉提示词配额上限（本批跨类别合计） */
const MAX_VISUAL_PROMPT_QUOTA = 30

/** 目标类别：v1.30.0 起「提取资产」按类别分，一次只提取其中一类。 */
type TargetKind = 'character' | 'scene' | 'prop'
const TARGET_KIND_LABELS: Record<TargetKind, string> = { character: '角色', scene: '场景', prop: '道具' }

/** 规范化 context.targetKind；非三类之一时返回空串（=不限定，兼容旧调用）。 */
function normalizeTargetKind(value: unknown): TargetKind | '' {
  return value === 'character' || value === 'scene' || value === 'prop' ? value : ''
}

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

/**
 * v1.36.1（#10）：视觉提示词产出配额。
 * >0 表示对**本批前 N 条**候选额外要求 `visualPrompt`；缺省 / 非正数 = 不要求（旧行为完全不变）。
 */
function normalizeVisualPromptQuota(value: unknown): number {
  const quota = Number(value)
  if (!Number.isFinite(quota) || quota <= 0) return 0
  return Math.min(MAX_VISUAL_PROMPT_QUOTA, Math.floor(quota))
}

/**
 * v1.36.1（#10）：按「角色 → 场景 → 道具」顺序施加配额。
 * 配额 ≤0（未要求）或超出配额的条目**一律剥除该字段**——保证「没开开关时结果与旧版完全一致」。
 */
function applyVisualPromptQuota(
  entries: Array<Record<string, unknown>>,
  quota: number,
  counter: { kept: number }
): Array<Record<string, unknown>> {
  return entries.map((entry) => {
    const text = jsonStringField(entry.visualPrompt)
    if (!text) return entry
    if (quota > 0) {
      counter.kept += 1
      if (counter.kept <= quota) return { ...entry, visualPrompt: text }
    }
    const clone: Record<string, unknown> = { ...entry }
    delete clone.visualPrompt
    return clone
  })
}

function normalizeEntries(raw: unknown, typeField: 'role' | 'type'): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      const entry = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      const name = normalizeText(entry.name, MAX_NAME_LENGTH)
      if (!name) return null
      const evidence = normalizeText(entry.evidence)
      // 逐条剔除无证据候选：证据为空视为「仅被提及 / 编造」，不符合「只提取实际登场」，不进入结果集。
      if (!evidence) return null
      const normalized: Record<string, unknown> = {
        name,
        [typeField]: normalizeText(entry[typeField] ?? entry.role ?? entry.type, MAX_NAME_LENGTH),
        description: normalizeText(entry.description ?? entry.desc),
        tags: normalizeTags(entry.tags),
        evidence
      }
      // v1.36.1（#10）：视觉提示词初稿（可选字段，缺失即不写；超长截断）
      const visualPrompt = normalizeText(entry.visualPrompt, MAX_VISUAL_PROMPT_LENGTH)
      if (visualPrompt) normalized.visualPrompt = visualPrompt
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
    const targetKind = normalizeTargetKind(context.targetKind)
    const scopeInstruction = targetKind
      ? `\n\n## 本次范围\n本次**只提取${TARGET_KIND_LABELS[targetKind]}**（${targetKind} 类）；其余两类一律返回空数组，不要输出。`
      : ''
    // v1.36.1（#10）：配额 >0 时才在 JSON 契约里要求 visualPrompt（配额缺省 = 旧行为零变化）
    const visualPromptQuota = normalizeVisualPromptQuota(context.visualPromptQuota)
    const vpField = visualPromptQuota > 0
      ? ',"visualPrompt":"【主体】…【服装或结构】…【材质与渲染】…【统一光影】…【负面提示词】…"'
      : ''
    const vpInstruction = visualPromptQuota > 0
      ? `\n\n## 视觉提示词初稿（本次额外要求）
仅对**前 ${visualPromptQuota} 条**候选额外产出 \`visualPrompt\`（其余候选不要输出该字段）。该字段必须是**分节标记文本**，段标记原样使用、段序固定：
【主体】…【服装或结构】…【材质与渲染】…【统一光影】…【负面提示词】…
- **不要输出「画面规格」段**（由系统按版式给定）；
- 各段 30–80 字，逗号分隔，不要 Markdown 标题 / 解释 / 分点前缀；
- 【负面提示词】只列与该资产事实冲突的排除项，不机械堆砌。`
      : ''
    const vpUserLine = visualPromptQuota > 0
      ? `\n视觉提示词初稿：本批最多为**前 ${visualPromptQuota} 条**候选产出 visualPrompt（分节标记文本，不含「画面规格」段）。`
      : ''

    return {
      system: `${capabilityPreamble.system}\n\n你是小说资产提取器。你**只返回 JSON 对象**，不要 Markdown、解释或提问。

## 强制约束（反幻觉 / 只提取实际登场）
1. **只提取在本段正文中确有出场、参与剧情**的角色 / 场景 / 道具；仅被提及、点名却未参与情节的一律不要。
2. 严禁依据套路、常识或题材猜测补造实体。
3. **每条候选必须给出 evidence**：引用本段正文中的**原句**（包含该实体出场 / 戏份的那句话），不得编造、不得空泛概括；**无证据的候选视为不合格**。
4. 每个实体的字段只能来自原文：原文未明确描述的字段留空字符串，或写「原文未明确」，不要编造。
5. 不得与「已在资产库中的同名实体」重复（严格避开 existingNames 中的名称）。
6. 名称保持原文写法，不要翻译、不要加前缀。

## 输出格式
{"characters":[{"name":"","role":"","description":"","tags":[""],"evidence":"原文原句"${vpField}}],"scenes":[{"name":"","type":"","description":"","tags":[""],"evidence":"原文原句"${vpField}}],"props":[{"name":"","type":"","description":"","tags":[""],"evidence":"原文原句"${vpField}}]}
字段说明：character 用 role（定位/身份）；scene 与 prop 用 type（类型）。tags 为 2-4 个来自原文的关键词；evidence 必须引用原文原句。没有某类实体就返回空数组。${scopeInstruction}${vpInstruction}`,
      user: `${capabilityPreamble.user}\n\n当前项目：${String(context.projectTitle ?? '').trim() || '（未命名）'}（题材：${String(context.projectGenre ?? '').trim() || '未指明'}）
本次处理范围：${batchLabel}
写作风格：${style}${vpUserLine}

已有实体名称（严格避重）：${JSON.stringify(existingNames)}

章节正文（节选）：
${novelText || '（未提供章节正文——请告诉用户需要先在「章节创作」中导入小说。）'}

现在只返回 JSON 对象，不要任何多余文字。`
    }
  },
  normalize(raw: string, context?: Record<string, unknown>): AiTaskResult {
    const parsed = extractJsonObject(raw)
    const characters = normalizeEntries(parsed.characters, 'role')
    const scenes = normalizeEntries(parsed.scenes, 'type')
    const props = normalizeEntries(parsed.props, 'type')
    // v1.30.0：按类别分后，一次只保留 targetKind 指定的那一类，其余两类置空数组。
    const targetKind = normalizeTargetKind(context?.targetKind)
    const scopedCharacters = !targetKind || targetKind === 'character' ? characters : []
    const scopedScenes = !targetKind || targetKind === 'scene' ? scenes : []
    const scopedProps = !targetKind || targetKind === 'prop' ? props : []
    // v1.36.1（#10）：按「角色 → 场景 → 道具」顺序施加视觉提示词配额。
    // 先按 targetKind 过滤再计数——否则模型越界返回的、最终会被丢弃的条目会白耗配额。
    const quotaCounter = { kept: 0 }
    const quota = normalizeVisualPromptQuota(context?.visualPromptQuota)
    return {
      characters: applyVisualPromptQuota(scopedCharacters, quota, quotaCounter),
      scenes: applyVisualPromptQuota(scopedScenes, quota, quotaCounter),
      props: applyVisualPromptQuota(scopedProps, quota, quotaCounter)
    } as AssetExtractResult
  },
  validate(result: AiTaskResult): boolean {
    const extracted = result as AssetExtractResult
    const entries = [...(extracted.characters ?? []), ...(extracted.scenes ?? []), ...(extracted.props ?? [])]
    // normalize 已逐条剔除无证据候选，这里只需「剩余至少 1 条有证据实体」即通过；
    // 某类为空不影响，只要本批整体仍有命中（避免任一条缺证据就整批判失败）。
    return entries.length > 0
  },
  describeValidationErrors(result: AiTaskResult): string[] {
    const extracted = result as AssetExtractResult
    const entries = [...(extracted.characters ?? []), ...(extracted.scenes ?? []), ...(extracted.props ?? [])]
    if (!entries.length) {
      return ['本批未提取到有证据的实体：每条候选都必须引用本段正文的原句作为出场证据，仅被提及的实体应直接剔除。']
    }
    return []
  },
  resolveMaxTokens(input: PromptBuildInput): number {
    const text = collectNovelText(input.context)
    const quota = normalizeVisualPromptQuota(input.context.visualPromptQuota)
    // 「实际登场 + 证据」需要额外输出 evidence 字段；v1.36.1（#10）再为视觉提示词初稿追加预算
    const visualBudget = quota > 0 ? Math.min(3000, quota * 260) : 0
    return Math.min(10000, 3500 + Math.min(2500, Math.ceil(text.length / 200) * 60) + visualBudget)
  }
}

export default handler
