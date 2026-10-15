/**
 * adaptation-plot-cards：剧情卡拆解（PRD §3.2 P0-4 + deconstruction-prompts.md §3.3）
 * - 三遍扫描：chunkPass / aggregatePass / singlePass
 * - 支持 focusStage / gapInstruction 路径（缺口补拆入口）
 * - maxTokens: 7000
 * - 主角因果链 + 反抄原文 + 合法"不知道"出口
 * - validate() 仅校验 title + synopsis 非空（完整质量门禁走前端 validateAdaptationRun）
 */
import type { TaskHandler, PromptBuildInput } from './base'
import { normalizeAssistantText } from './base'
import type { AiTaskResult } from '../shared-types'

interface PlotCardsPayload {
  raw: string
  hasCards: boolean
}

function resolvePassLabel(context: Record<string, unknown>): string {
  if (context.adaptationChunkPass === true) {
    return `当前是原文分块 ${Number(context.adaptationChunkIndex ?? 1)}/${Number(context.adaptationChunkTotal ?? 1)}，只记录本块能被证据支持的剧情卡。`
  }
  if (context.adaptationSynthesis === true) {
    return '当前是分块结果聚合，请合并重复信号，去重相同剧情卡。'
  }
  return '当前是完整原文扫描。'
}

const handler: TaskHandler = {
  name: 'adaptation-plot-cards',
  outputType: 'text',
  useSkills: false,
  defaultCapabilities: ['analysis', 'settings', 'import-export'],
  resolveMaxTokens() {
    return 7000
  },
  buildPrompt(input: PromptBuildInput) {
    const { context, capabilityPreamble } = input
    const passLabel = resolvePassLabel(context as Record<string, unknown>)
    const focusStage = context.focusStage as { id?: string; index?: number; title?: string; start?: number; end?: number } | undefined
    const focusInstruction = focusStage
      ? `本轮只处理阶段 ${focusStage.index ?? '?'}"${focusStage.title ?? ''}"（第${focusStage.start ?? '?'}章至第${focusStage.end ?? '?'}章），不得扩写其他阶段。`
      : ''
    const coverageGaps = Array.isArray(context.coverageGaps) ? context.coverageGaps : []
    const gapInstruction = coverageGaps.length
      ? `这是用户主动要求的缺口补拆，只检查这些范围：${JSON.stringify(coverageGaps)}。如果某段只是与主角因果较弱的支线，可以返回"可删支线"卡或不返回卡，不要为了覆盖率编造主线。`
      : ''
    const lead = context.lead as { name?: string; userNote?: string } | undefined
    const bookUnderstanding = context.bookUnderstanding
    const toneProfile = context.toneProfile
    return {
      system: `${capabilityPreamble.system}

你是剧情卡编辑。只返回语义标记文本，不要 JSON 外壳，不要生成逐集集纲、分镜或正文。
${passLabel}${focusInstruction}${gapInstruction}
所有进入主线的事件都必须说明它与主角目标、行动、阻力、选择、结果或状态变化因果关系。
主角不在场的事件只能作为"外部压力 / 主角关系变化 / 关键信息揭示"；
无法说明主角因果关系的内容标为"可删支线"。
卡片必须是功能化摘要，不复制连续原文或台词；原文没有证据的地方写"原文未明确"。`,
      user: `${capabilityPreamble.user}

参考作品：${String(context.referenceTitle ?? '')}
章节索引：${JSON.stringify(context.chapterManifest ?? [])}
正文（≤ 24000 字）：
${String(context.sourceText ?? '').slice(0, 24000)}

唯一主角视角：${lead?.name ?? ''}
主角补充：${lead?.userNote ?? ''}
全书理解记忆：${JSON.stringify(bookUnderstanding ?? null)}
全书基调记忆：${JSON.stringify(toneProfile ?? null)}

输出协议（每张卡一个 <CARD> 块）：
<CARD>
TITLE: 像"初临大唐，崭露头角"这样的故事标题
STAGE_ID: ${focusStage?.id ?? ''}
SOURCE_RANGE: 第X章至第Y章
FUNCTION: 9 类功能标签之一（opening/trigger/escalation/reversal/reveal/relationship/emotional-reward/payoff/transition）
PROTAGONIST_RELATION: 5 类关系标签之一（direct-action/external-pressure/relationship-change/information-reveal/side-branch）
SYNOPSIS: 一句话摘要
STORY_BEATS:
- 故事节拍（2-5 条）
PROTAGONIST_GOAL: 主角目标
PROTAGONIST_ACTION: 主角行动
PROTAGONIST_OBSTACLE: 主角阻力
PROTAGONIST_CHOICE: 主角选择
PROTAGONIST_RESULT: 主角结果
PROTAGONIST_STATE_CHANGE: 主角状态变化
NEXT_HOOK: 下一集钩子
CONFLICT: 冲突
RESULT: 结果
EMOTIONAL_EFFECT: 情绪效果
CHARACTERS:
- 主角
EVIDENCE_REFS:
- 第X章：原文证据原因
</CARD>

硬约束：
- 字段缺失必须写"原文未明确"，禁止用默认值填充
- 不得为了覆盖率编造主线
- 卡片仅作为"功能化摘要"，不复制连续原文或台词`
    }
  },
  normalize(raw: string): AiTaskResult {
    const cleaned = normalizeAssistantText(raw).content
    const result: PlotCardsPayload = {
      raw: cleaned,
      hasCards: /<CARD>[\s\S]*?<\/CARD>/.test(cleaned)
    }
    return result as unknown as AiTaskResult
  },
  validate(result: AiTaskResult): boolean {
    const payload = result as unknown as PlotCardsPayload
    return Boolean(payload.hasCards && payload.raw.includes('TITLE:') && payload.raw.includes('SYNOPSIS:'))
  }
}
export default handler
