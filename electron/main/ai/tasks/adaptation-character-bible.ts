/**
 * adaptation-character-bible：人物资产 + 合并建议（PRD §3.2 P0-4 + deconstruction-prompts.md §3.4）
 * - 4 模式：chunkPass / assetSynthesis / synthesis / singlePass
 * - 关系"参与卡 ID"由本地脚本计算，提示词不写
 * - 合并"只能作为建议"，不替用户自动执行
 * - 合并首要标准：戏剧功能重复（而非同场出现）
 */
import type { TaskHandler, PromptBuildInput } from './base.ts'
import { normalizeAssistantText } from './base.ts'
import type { AiTaskResult } from '../shared-types.ts'

interface CharacterBiblePayload {
  raw: string
  hasCharacters: boolean
  /** 资产合成模式额外含 RELATIONSHIP 块 */
  hasRelationships: boolean
}

function resolvePassLabel(context: Record<string, unknown>): string {
  if (context.adaptationChunkPass === true) {
    return `当前是原文分块 ${Number(context.adaptationChunkIndex ?? 1)}/${Number(context.adaptationChunkTotal ?? 1)}，只返回本块能被证据支持的人物；不得声称覆盖全书。`
  }
  if (context.adaptationAssetSynthesis === true) {
    return '当前输入是本地脚本从已拆剧情卡整理出的主角证据包，不要再次要求扫描整本原文。'
  }
  if (context.adaptationSynthesis === true) {
    return '当前是分块结果聚合，请合并别名并去重。'
  }
  return '当前是完整原文扫描。'
}

const handler: TaskHandler = {
  name: 'adaptation-character-bible',
  outputType: 'text',
  useSkills: false,
  defaultCapabilities: ['analysis', 'settings', 'import-export'],
  resolveMaxTokens() {
    return 7000
  },
  buildPrompt(input: PromptBuildInput) {
    const { context, capabilityPreamble } = input
    const passLabel = resolvePassLabel(context as Record<string, unknown>)
    const lead = context.lead as { name?: string; userNote?: string } | undefined
    const isAssetSynthesis = context.adaptationAssetSynthesis === true
    const characterInstruction = isAssetSynthesis
      ? `资产合成模式：返回字段 id, name, aliases, identity, socialStatus, stageIds, firstAppearanceChapter, lastAppearanceChapter, DRAMATIC_FUNCTION, PROTAGONIST_IMPACT, MERGE_CANDIDATES, MERGE_REASON, MERGE_PLAN, MERGE_RISK, MERGE_CONFIDENCE, EVIDENCE_REFS；每角色限 2~3 句。关系由脚本生成，最多补 20 条核心关系（intensity 0-100）。`
      : `完整扫描模式：返回全字段 gender, age, identity, socialStatus, background, personality, goal, fearOrWeakness, stageIds, first/lastAppearanceChapter, evidenceRefs, mergeCandidates, mergeReason, mergeConfidence, dramaticFunction, protagonistImpact；关系含 intensity (0-100)。`
    return {
      system: `${capabilityPreamble.system}

你是长篇小说改编人物编辑。只返回语义标记文本，不要 JSON 外壳，不要生成集纲。
${passLabel}
这不是人物百科，而是"主线角色压缩分析"：必须区分每个角色自己的行为和功能，不能把主角的行动复制给所有参与者；必须说明每个人对主角推动/阻碍/关系改变/信息揭示的具体作用，并识别承担相同戏剧功能、可以合并以减少主要出场角色的人物。
合并只能作为建议，不能替用户自动执行。
合并建议必须说明合并后的功能、保留谁、会影响哪些剧情段、会损失什么以及风险。
人物合并的首要标准是"对主角承担的戏剧功能是否重复"，而不是仅仅同场出现。
所有角色结论需要 evidenceRefs。
参与次数、主线卡次数、受影响剧情卡 ID 由本地脚本计算，不要凭空填写。`,
      user: `${capabilityPreamble.user}

参考作品：${String(context.referenceTitle ?? '')}
唯一主角视角：${lead?.name ?? ''}
主角补充：${lead?.userNote ?? ''}
章节索引：${JSON.stringify(context.chapterManifest ?? [])}
正文（≤ 24000 字）：
${String(context.sourceText ?? '').slice(0, 24000)}

${characterInstruction}

输出协议（每个角色一个 <CHARACTER> 块）：
<CHARACTER>
NAME: 人物姓名
ALIASES: 别名（以"；"分隔）
IDENTITY: 身份
GENDER: 性别
AGE: 年龄段
SOCIAL_STATUS: 社会身份
BACKGROUND: 背景
PERSONALITY: 性格
GOAL: 目标
FEAR_OR_WEAKNESS: 恐惧/弱点
STAGE_IDS: 涉及阶段 ID 列表（以"；"分隔）
FIRST_APPEARANCE_CHAPTER: 首次出场章节序号
LAST_APPEARANCE_CHAPTER: 末次出场章节序号
DRAMATIC_FUNCTION: 戏剧功能
PROTAGONIST_IMPACT: 对主角的影响
MERGE_CANDIDATES: 合并候选 ID 列表（以"；"分隔）
MERGE_REASON: 合并理由
MERGE_CONFIDENCE: 0.0-1.0
EVIDENCE_REFS:
- 第X章：原文证据原因
</CHARACTER>

资产合成模式额外产出：
<RELATIONSHIP>
FROM: 起点角色 ID
TO: 终点角色 ID
TYPE: 关系类型
DESCRIPTION: 关系描述
INTENSITY: 0-100
</RELATIONSHIP>

硬约束：
- 字段缺失必须写"原文未明确"，禁止用默认值填充
- 不得替用户自动执行合并；只能输出建议
- 关系"参与卡 ID"由本地脚本计算，提示词不写`
    }
  },
  normalize(raw: string): AiTaskResult {
    const cleaned = normalizeAssistantText(raw).content
    const result: CharacterBiblePayload = {
      raw: cleaned,
      hasCharacters: /<CHARACTER>[\s\S]*?<\/CHARACTER>/.test(cleaned),
      hasRelationships: /<RELATIONSHIP>[\s\S]*?<\/RELATIONSHIP>/.test(cleaned)
    }
    return result as unknown as AiTaskResult
  },
  validate(result: AiTaskResult): boolean {
    const payload = result as unknown as CharacterBiblePayload
    return Boolean(payload.hasCharacters && payload.raw.includes('NAME:') && payload.raw.includes('EVIDENCE_REFS'))
  }
}
export default handler
