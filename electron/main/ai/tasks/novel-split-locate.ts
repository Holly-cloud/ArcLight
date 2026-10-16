/**
 * novel-split-locate：小说「分章 / 分集」定位器（outputType: 'json'）。
 *
 * 输入 = 脚本预筛出的**候选行**（每行截断 ≤40 字），而非整篇原文；
 * 输出 = **仅整数行号数组**：普通章节 / 集 / 话级分界放 `chapters`，卷 / 部级分界放 `volumes`。
 *
 * 反幻觉约定：
 * - 只在给定候选行里挑，正文 / 对话的误报不要选；
 * - 只返回 JSON，不解释、不改写标题。
 * 因为输出只有整数数组，completion token 极短，也无法幻觉出正文。
 */
import type { AiTaskResult, NovelSplitLocateResult } from '../shared-types.ts'
import { extractJsonObject, type PromptBuildInput, type TaskHandler } from './base.ts'

/** 仅保留有限整数、去重升序。 */
function normalizeIndexes(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  const set = new Set<number>()
  for (const item of value) {
    if (typeof item === 'number' && Number.isFinite(item) && Number.isInteger(item) && item >= 0) {
      set.add(item)
    }
  }
  return [...set].sort((a, b) => a - b)
}

/** 把候选行统一成 `{ i, t }`（兼容 SplitCandidate 的 index/text 与已归一化的 i/t）；预览二次截断 ≤40 字兜底。 */
function normalizeCandidatePreview(entry: unknown): { i: number; t: string } {
  const record = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {}
  const index = Number(record.i ?? record.index)
  const text = String(record.t ?? record.text ?? '').slice(0, 40)
  return { i: Number.isFinite(index) ? index : 0, t: text }
}

const handler: TaskHandler = {
  name: 'novel-split-locate',
  outputType: 'json',
  useSkills: false,
  defaultCapabilities: ['settings'],
  buildPrompt(input: PromptBuildInput) {
    const { context, capabilityPreamble } = input
    const rawCandidates = Array.isArray(context.candidates) ? context.candidates : []
    const candidates = rawCandidates.map(normalizeCandidatePreview)
    const projectTitle = String(context.projectTitle ?? '').trim() || '未命名作品'

    return {
      system: `${capabilityPreamble.system}\n\n你是小说「分章 / 分集」定位器。输入是脚本预筛出的候选行，你**只在这些候选行里挑真正的切点**。

## 分工
- 普通的章节 / 集 / 话级分界 → 放进 \`chapters\`。
- 卷 / 部一级的分界 → 放进 \`volumes\`。
- 正文与对话的误报**不要选**（例如以编号开头但其实是正文或对白的行）。

## 硬约束
1. 只能选**下面列出的候选行**，并输出它们的**行号**；不要编造候选行之外的行号。
2. **只返回 JSON 对象**，不要 Markdown、解释或提问。
3. 不改写标题、不重排、不合并——你只输出行号。

## 输出格式
{"chapters":[行号...],"volumes":[行号...]}
说明：chapters 至少给出一个（否则视为定位失败）；不需要归卷时 volumes 可为空数组 []。`,
      user: `${capabilityPreamble.user}\n\n当前项目：${projectTitle}

候选行（行号: 预览）：
${JSON.stringify(candidates)}

现在只返回 JSON 对象，不要任何多余文字。`
    }
  },
  normalize(raw: string): AiTaskResult {
    const parsed = extractJsonObject(raw)
    return {
      chapters: normalizeIndexes(parsed.chapters),
      volumes: normalizeIndexes(parsed.volumes)
    } as NovelSplitLocateResult
  },
  validate(result: AiTaskResult): boolean {
    const chapters = (result as NovelSplitLocateResult).chapters
    return Array.isArray(chapters)
      && chapters.length > 0
      && chapters.every((index) => Number.isFinite(index) && Number.isInteger(index))
  },
  resolveMaxTokens(input: PromptBuildInput): number {
    const count = Array.isArray(input.context.candidates) ? input.context.candidates.length : 0
    return Math.min(4096, 1024 + count * 2)
  }
}

export default handler
