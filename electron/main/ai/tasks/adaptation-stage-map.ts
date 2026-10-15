/**
 * adaptation-stage-map：阶段划分 + 全书理解 + 基调（PRD §3.2 P0-4 + deconstruction-prompts.md §3.2）
 * - 含 <TONE> 与 <BOOK_UNDERSTANDING> 块产出
 * - useSkills: true（允许 maxSkills: 4）—— 阶段划分受用户 Skill 与文风影响
 * - 主角由用户提供，禁止重新识别
 * - 三遍扫描策略：chunkPass / synthesis / singlePass 由 context 标志动态切换
 */
import type { TaskHandler, PromptBuildInput } from './base.ts'
import { normalizeAssistantText } from './base.ts'
import type { AiTaskResult } from '../shared-types.ts'

interface StageMapPayload {
  /** 原始返回（含 <STAGE> <TONE> <BOOK_UNDERSTANDING>） */
  raw: string
  hasStages: boolean
  hasTone: boolean
  hasBookUnderstanding: boolean
}

function resolvePassLabel(context: Record<string, unknown>): string {
  if (context.adaptationChunkPass === true) {
    return `当前是原文分块 ${Number(context.adaptationChunkIndex ?? 1)}/${Number(context.adaptationChunkTotal ?? 1)}，只记录本块能被证据支持的阶段候选。`
  }
  if (context.adaptationSynthesis === true) {
    return '当前是分块结果聚合，请合并重复信号，区分全书稳定基调与局部阶段变化。'
  }
  return '当前是完整原文扫描。'
}

const handler: TaskHandler = {
  name: 'adaptation-stage-map',
  outputType: 'text',
  useSkills: true,
  maxSkills: 4,
  defaultCapabilities: ['analysis', 'settings', 'project-skills', 'import-export'],
  resolveMaxTokens() {
    return 7000
  },
  buildPrompt(input: PromptBuildInput) {
    const { context, capabilityPreamble } = input
    const passLabel = resolvePassLabel(context as Record<string, unknown>)
    const focusStage = context.focusStage as { index?: number; title?: string; start?: number; end?: number } | undefined
    const focusInstruction = focusStage
      ? `本轮只处理阶段 ${focusStage.index ?? '?'}"${focusStage.title ?? ''}"（第${focusStage.start ?? '?'}章至第${focusStage.end ?? '?'}章），不得扩写其他阶段。`
      : ''
    const leadName = String(context.leadName ?? '').trim()
    const leadInstruction = leadName
      ? `主角名字由用户提供（${leadName}），不要识别、猜测或返回主角候选；只围绕该主角组织事件。`
      : '必须先识别主角（参考 lead-identify 协议），或在缺少原文时返回"原文未明确"。'
    return {
      system: `${capabilityPreamble.system}

你是长篇小说改编结构编辑。只返回语义标记文本，不要 JSON 外壳，不要输出逐集集纲。
${passLabel}${focusInstruction}
${leadInstruction}
所有证据引用必须给出章节 ID + 原因；缺字段则填写"原文未明确"。`,
      user: `${capabilityPreamble.user}

参考作品：${String(context.referenceTitle ?? '')}
章节索引：${JSON.stringify(context.chapterManifest ?? [])}
正文（≤ 24000 字）：
${String(context.sourceText ?? '').slice(0, 24000)}

输出协议：
A) <STAGE> 块（每阶段一个，4~5 个）
<STAGE>
TITLE: 阶段标题
SOURCE_RANGE: 第X章至第Y章
TARGET_RANGE: 第A集至第B集
START_STATE: 起势
END_STATE: 终势
GOAL: 阶段目标
OBSTACLE: 阻力
PERSONALITY: 人物性格
EMOTIONAL_NEED: 情感需求
TURNING_POINT: 转折点
STAGE_PAYOFF: 阶段兑现
TRANSITION_HOOK: 承接钩子
PROTAGONIST_EVENTS:
- 主角行动及局势变化
EVIDENCE_REFS:
- 第X章：原文证据原因
</STAGE>

B) 聚合模式额外产出 <TONE> 全书基调（15 字段，含 HUMOR_LEVEL / ROMANCE_LEVEL / DARKNESS_LEVEL 三刻度 0-100）

C) 聚合模式额外产出 <BOOK_UNDERSTANDING> 全书理解记忆
包含 WHOLE_BOOK_SUMMARY / MAJOR_STORY_LINES / KEY_TURNING_POINTS /
PROTAGONIST_ARC / COVERAGE_NOTE / EVIDENCE_REFS 六字段

硬约束：
- 不允许返回 JSON 外壳
- 字段缺失必须写"原文未明确"，禁止用默认值填充
- 缺少 EVIDENCE_REFS 的阶段将被整批拒收`
    }
  },
  normalize(raw: string): AiTaskResult {
    const cleaned = normalizeAssistantText(raw).content
    const result: StageMapPayload = {
      raw: cleaned,
      hasStages: /<STAGE>[\s\S]*?<\/STAGE>/.test(cleaned),
      hasTone: /<TONE>[\s\S]*?<\/TONE>/.test(cleaned),
      hasBookUnderstanding: /<BOOK_UNDERSTANDING>[\s\S]*?<\/BOOK_UNDERSTANDING>/.test(cleaned)
    }
    return result as unknown as AiTaskResult
  },
  validate(result: AiTaskResult): boolean {
    const payload = result as unknown as StageMapPayload
    return Boolean(payload.hasStages && payload.raw.includes('EVIDENCE_REFS'))
  }
}
export default handler
