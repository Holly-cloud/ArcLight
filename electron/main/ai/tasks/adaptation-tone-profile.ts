/**
 * adaptation-tone-profile：全书基调（PRD §3.2 P0-4 + deconstruction-prompts.md §3.5）
 * - 含三刻度数值：humorLevel / romanceLevel / darknessLevel（0-100）
 * - 三遍扫描：chunkPass / synthesis / singlePass
 * - defaultCapabilities 加 writing-style（受文风影响）
 */
import type { TaskHandler, PromptBuildInput } from './base.ts'
import { normalizeAssistantText } from './base.ts'
import type { AiTaskResult } from '../shared-types.ts'

interface ToneProfilePayload {
  raw: string
  hasTone: boolean
}

function resolvePassLabel(context: Record<string, unknown>): string {
  if (context.adaptationChunkPass === true) {
    return `当前是原文分块 ${Number(context.adaptationChunkIndex ?? 1)}/${Number(context.adaptationChunkTotal ?? 1)}，只返回本块稳定信号；不要重复返回完整用户状态字段。`
  }
  if (context.adaptationSynthesis === true) {
    return '当前是分块结果聚合，请合并重复信号，区分全书稳定基调与局部阶段变化。'
  }
  return '当前是完整原文扫描。'
}

const handler: TaskHandler = {
  name: 'adaptation-tone-profile',
  outputType: 'text',
  useSkills: false,
  defaultCapabilities: ['analysis', 'settings', 'writing-style', 'import-export'],
  resolveMaxTokens() {
    return 4000
  },
  buildPrompt(input: PromptBuildInput) {
    const { context, capabilityPreamble } = input
    const passLabel = resolvePassLabel(context as Record<string, unknown>)
    return {
      system: `${capabilityPreamble.system}

你是长篇小说改编的基调编辑。只返回语义标记文本，不要 JSON 外壳，不要生成逐集集纲、正文、台词或镜头。
${passLabel}
必须从原文归纳稳定叙事基调，不能用题材套路猜测。
基调是后续集纲生成的约束，不是对原文的复述。`,
      user: `${capabilityPreamble.user}

参考作品：${String(context.referenceTitle ?? '')}
正文（≤ 24000 字）：
${String(context.sourceText ?? '').slice(0, 24000)}

输出协议（每个任务最多产出 1 个 <TONE> 块）：
<TONE>
CORE_TONE: 核心基调
GENRE_PROMISE: 类型承诺
AUDIENCE_PROMISE: 观众承诺
EMOTIONAL_PALETTE: 情绪色板（以"；"分隔）
NARRATIVE_VOICE: 叙事声音
PACING: 节奏
CONFLICT_TEMPERATURE: 冲突温度
DIALOGUE_STYLE: 对白风格
HUMOR_LEVEL: 0-100 幽默浓度
ROMANCE_LEVEL: 0-100 浪漫浓度
DARKNESS_LEVEL: 0-100 黑暗浓度
MUST_KEEP_RULES:
- 正向约束
AVOID_RULES:
- 负向约束
DEVIATION_WARNINGS:
- 偏离警告
EVIDENCE_REFS:
- 第X章：原文证据原因
</TONE>

硬约束：
- 三刻度数值必须给出，禁止默认值填充
- 字段缺失必须写"原文未明确"
- 不得返回 episodeOutline / episodes / 章节正文或连续台词
- 使用本地脚本可解析的标记格式；不要生成 ID / 状态 / 版本字段`
    }
  },
  normalize(raw: string): AiTaskResult {
    const cleaned = normalizeAssistantText(raw).content
    const result: ToneProfilePayload = {
      raw: cleaned,
      hasTone: /<TONE>[\s\S]*?<\/TONE>/.test(cleaned)
    }
    return result as unknown as AiTaskResult
  },
  validate(result: AiTaskResult): boolean {
    const payload = result as unknown as ToneProfilePayload
    return Boolean(payload.hasTone
      && payload.raw.includes('HUMOR_LEVEL:')
      && payload.raw.includes('ROMANCE_LEVEL:')
      && payload.raw.includes('DARKNESS_LEVEL:')
      && payload.raw.includes('EVIDENCE_REFS'))
  }
}
export default handler
