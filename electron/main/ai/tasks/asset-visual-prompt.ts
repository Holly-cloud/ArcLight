/**
 * asset-visual-prompt：把单张资产卡的**简介**转写为可直接生图的**分节视觉提示词**（outputType: 'text'）。
 *
 * 输入 = 资产类型 + 名称/定位/标签/简介 + 项目视觉风格 + 构图版式 + 题材 + 该资产在小说中的原文片段；
 * 输出 = 按**固定段序**输出的分节文本（渲染层解析为 VisualPromptDocument 后写入资产卡用于生图）。
 *
 * v1.36.0 变更：输出契约由「一段纯文本」改为「固定分段标记」；「画面规格（版式）」由系统按版式模板给定，
 * 不由模型生成（AR-2）；题材注明的时代禁词只做提示，最终默认负向词由共享模块统一给出。
 *
 * 反幻觉约定：
 * - 简介是核心生成依据，画面必须能看出就是这个资产；
 * - 必须与给定小说原文片段一致，冲突时以原文为准并简要说明；
 * - 原文与简介都未提及的专有细节不臆造。
 */
import type { AiTaskResult } from '../shared-types.ts'
import { normalizeAssistantText, type PromptBuildInput, type TaskHandler } from './base.ts'
import {
  VISUAL_PROMPT_LAYOUTS,
  VISUAL_PROMPT_MARKERS,
  defaultLayoutForKind,
  genreNegativeWords,
  normalizeLayoutId
} from '../../../shared/visual-prompt.ts'

const KIND_LABELS: Record<string, string> = {
  character: '角色',
  scene: '场景',
  prop: '道具'
}

function normalizeTextList(value: unknown): string {
  if (!Array.isArray(value)) return ''
  return value
    .map((item) => (item && typeof item === 'object' ? String((item as Record<string, unknown>).label ?? '') : String(item ?? '')))
    .map((item) => item.trim())
    .filter((item) => item && item !== '[object Object]')
    .slice(0, 8)
    .join(' / ')
}

const handler: TaskHandler = {
  name: 'asset-visual-prompt',
  outputType: 'text',
  useSkills: false,
  defaultCapabilities: ['settings', 'characters', 'writing-style'],
  buildPrompt(input: PromptBuildInput) {
    const { context, capabilityPreamble } = input
    const rawKind = String(context.kind ?? '').trim()
    const kindLabel = KIND_LABELS[rawKind] ?? '角色'
    const name = String(context.name ?? '').trim()
    const typeLabel = String(context.typeLabel ?? '').trim()
    const tags = normalizeTextList(context.tags)
    const description = String(context.description ?? '').trim()
    const snippet = String(context.novelSnippet ?? '').trim()
    const genre = String(context.projectGenre ?? '').trim()
    const style = (context.projectStyle && typeof context.projectStyle === 'object')
      ? context.projectStyle as Record<string, unknown>
      : {}
    const renderMode = String(style.renderMode ?? '').trim()
    const palette = normalizeTextList(style.palette)
    const moodWords = normalizeTextList(style.moodWords)
    const styleLine = [
      renderMode ? `渲染方式：${renderMode}` : '',
      palette ? `项目配色：${palette}` : '',
      moodWords ? `氛围词：${moodWords}` : ''
    ].filter(Boolean).join('；')

    // 版式：显式给出优先，否则按资产类型自动匹配（AR-2：画面规格由模板确定性生成）
    const rawLayout = String(context.layoutId ?? '').trim()
    const layoutId = rawLayout ? normalizeLayoutId(rawLayout) : defaultLayoutForKind(rawKind)
    const layout = VISUAL_PROMPT_LAYOUTS[layoutId]
    const eraNegatives = genreNegativeWords(genre)

    return {
      system: `${capabilityPreamble.system}

你是「资产视觉提示词」生成器。你把一张资产卡（角色 / 场景 / 道具）的**简介**转写成可直接用于 AI 绘图的**分节视觉提示词**。

## 核心依据与反幻觉
1. **简介是核心生成依据**：资产的身份、外貌、器物、场景细节以简介为准，画面必须能看出「就是这个资产」。
2. **必须与下面的小说原文片段一致**：若简介与原文片段冲突，以**原文为准**，并在【负面提示词】段之后另起一行写「（依据原文修正：……）」简要说明改了什么。
3. 原文与简介都未提及的专有细节（姓名、地名、势力、具体纹样）不得臆造；确需补足画面时只做中性、不设专名的描述。
4. 只描述**该资产本身**；质感与色彩可以写，但**不改变用户指定的主体与构图**；**不要写与项目渲染方式冲突的媒介词**（如写实项目里的「二次元 / Q版」）。

## 输出要求
- 严格按**固定段序**输出，每段以段标记开头，段内为一段连续中文（逗号分隔）；不要 Markdown 标题、不要解释、不要分点前缀。
- 段序与标记（原样使用）：
${VISUAL_PROMPT_MARKERS.subject}…
${VISUAL_PROMPT_MARKERS.costume}…
${VISUAL_PROMPT_MARKERS.material}…
${VISUAL_PROMPT_MARKERS.lighting}…
${VISUAL_PROMPT_MARKERS.negative}…
- 「${VISUAL_PROMPT_MARKERS.spec.slice(1, -1)}」由系统按版式给定，**你不要输出这一段**。
- 各段 30–80 字；【负面提示词】只列与当前资产事实冲突的排除项，不机械堆砌。
- 各段的画法与取景必须服从下面给定的**画面规格（版式）**。
- 按资产类型覆盖维度：
  - 角色：身份气质 / 外貌与五官 / 发型 / 身形 / 标志物 / 服装材质
  - 场景：地形地貌 / 建筑或环境要素 / 氛围 / 光照 / 季相 / 材质
  - 道具：外观造型 / 材质工艺 / 使用痕迹 / 标志纹样`,
      user: `${capabilityPreamble.user}

资产类型：${kindLabel}
名称：${name || '未命名资产'}
${typeLabel ? `定位 / 类型：${typeLabel}` : ''}
${tags ? `标签：${tags}` : ''}
${styleLine ? `项目视觉风格：${styleLine}` : ''}
${genre ? `项目题材：${genre}` : ''}

构图版式：${layout.label}
画面规格（版式，生成时必须服从；你不要输出这一段）：
${layout.spec || '（不套版式——自由构图，但仍须自洽）'}

时代禁词提示：${eraNegatives.length ? eraNegatives.join('；') : '（本项目未识别出特定时代取向，按常识排除明显错位的元素）'}

简介（核心生成依据）：
${description || '（未填写简介——请提示用户先补充简介，不要凭空编造资产设定。）'}

小说原文片段（一致性依据；与简介冲突时以本片段为准）：
${snippet || '（未提供原文片段——仅依据简介生成，不要臆造具体细节。）'}

现在按固定段序输出分节视觉提示词（不要输出「画面规格」段）。`
    }
  },
  normalize(raw: string): AiTaskResult {
    return normalizeAssistantText(raw)
  },
  validate(result: AiTaskResult): boolean {
    return 'content' in result && typeof result.content === 'string' && result.content.trim().length > 0
  },
  describeValidationErrors(): string[] {
    return ['未返回视觉提示词内容，必须输出非空的分节文本。']
  },
  resolveMaxTokens(): number {
    return 1600
  }
}

export default handler
