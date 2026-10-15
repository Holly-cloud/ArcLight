/**
 * adaptation-lead-identify：主角候选识别（PRD §3.2 P0-4 + deconstruction-prompts.md §3.1）
 * - outputType: 'text'（自造标记协议，不返 JSON）
 * - defaultCapabilities: ['analysis', 'settings', 'import-export']
 * - maxTokens: 2800
 * - validate() 强制 evidenceRefs.length > 0（每条 ref 需 chapterId + reason）
 * - 整批拒收不自动重试（handler validate 失败应触发 UI 层手动修复）
 */
import type { TaskHandler, PromptBuildInput } from './base'
import { normalizeAssistantText } from './base'
import type { AiTaskResult } from '../shared-types'

interface LeadIdentifyPayload {
  /** AI 返回的原文（含 <LEAD>...</LEAD> 标签），UI 层用 parseLeadBlocks 解析 */
  raw: string
  /** 是否包含至少一条 <LEAD> 块 */
  hasBlocks: boolean
}

const handler: TaskHandler = {
  name: 'adaptation-lead-identify',
  outputType: 'text',
  useSkills: false,
  defaultCapabilities: ['analysis', 'settings', 'import-export'],
  resolveMaxTokens() {
    return 2800
  },
  buildPrompt(input: PromptBuildInput) {
    const { context, capabilityPreamble } = input
    const referenceTitle = String(context.referenceTitle ?? '').trim()
    const chapterManifest = JSON.stringify(context.chapterManifest ?? [])
    const sourceText = String(context.sourceText ?? '').slice(0, 24000)
    return {
      system: `${capabilityPreamble.system}

你是小说改编拆书主角候选编辑。只返回语义标记文本，不要 JSON，不要 Markdown，不要生成集纲。必须根据提供的章节证据列出候选，不得凭套路补造人物。`,
      user: `${capabilityPreamble.user}

参考作品：${referenceTitle}
章节索引：${chapterManifest}
正文/分块（≤ 24000 字）：
${sourceText}

输出协议（每条候选用以下标记格式；至少 1 条 EVIDENCE_REFS；如无法识别则写"原文未明确"）：
<LEAD>
NAME: 角色名
ROLE: male-lead | female-lead | supporting
CONFIDENCE: 0.0-1.0
REASON: 判断理由
EVIDENCE_REFS:
- 第1章：原文证据原因
</LEAD>

硬约束：
- evidenceRefs 每条必须包含 chapterId + reason 两项，缺则整批拒收
- 不得返回 JSON 外壳；不得输出 Markdown 围栏
- 不得在没有证据的情况下编造主角`
    }
  },
  normalize(raw: string): AiTaskResult {
    const cleaned = normalizeAssistantText(raw).content
    const hasBlocks = /<LEAD>[\s\S]*?<\/LEAD>/.test(cleaned)
    const result: LeadIdentifyPayload = { raw: cleaned, hasBlocks }
    return result as unknown as AiTaskResult
  },
  validate(result: AiTaskResult): boolean {
    const payload = result as unknown as LeadIdentifyPayload
    return Boolean(payload.hasBlocks && payload.raw.includes('EVIDENCE_REFS'))
  }
}
export default handler
