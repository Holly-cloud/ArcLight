/**
 * Prompt 中心（v1.35.0）：「◈ 用当前项目试拼」的上下文组装（**纯函数**）。
 *
 * 输出的是**通用项目上下文**——把各任务常用到的键尽量给全，让试拼结果尽量接近真实运行。
 * 它**不等于**每个任务的完整真实输入：个别任务需要的专用字段（如资产卡的「简介 + 原文片段」）
 * 这里给不出，界面会以占位提示呈现。
 *
 * 约束：
 * - 只接收**参数切片**（不接 store 实例），因此可在裸 Node 下单测；
 * - **不拉章节正文**（不调用 `ensureChapterContent`），章节只取 `id / title / summary`；
 * - 空值（空串 / 空数组）**一律剔除**，避免让 `buildPromptInput` 误判「上下文里有该模块」。
 */

/** 试拼上下文的输入切片（由页面从 store 取好后传入） */
export interface PreviewContextInput {
  projectId?: string
  projectTitle?: string
  projectGenre?: string
  writingStyleLabel?: string
  writingStylePrompt?: string
  characters?: readonly unknown[]
  organizations?: readonly unknown[]
  characterRelationships?: readonly unknown[]
  organizationMemberships?: readonly unknown[]
  worldviewEntries?: readonly unknown[]
  outlineItems?: readonly unknown[]
  inspirationEntries?: readonly unknown[]
  chapters?: readonly unknown[]
}

/** 各类集合的截断上限，避免试拼上下文过大 */
const LIMITS = {
  characters: 40,
  organizations: 40,
  relations: 60,
  worldview: 30,
  outline: 40,
  inspiration: 30,
  chapters: 60
} as const
/** 单字段文本截断上限 */
const MAX_TEXT = 400

function text(value: unknown, max = MAX_TEXT): string {
  if (value == null) return ''
  const str = String(value)
  return str.length > max ? str.slice(0, max) : str
}

function records(value: unknown, limit: number): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => item && typeof item === 'object')
    .slice(0, limit)
    .map((item) => item as Record<string, unknown>)
}

/** 去掉空串 / 空数组 / undefined / null，避免污染「上下文提示键」判定 */
function compact(source: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) {
    if (value == null) continue
    if (typeof value === 'string' && !value.trim()) continue
    if (Array.isArray(value) && value.length === 0) continue
    result[key] = value
  }
  return result
}

/**
 * 组装通用项目上下文。返回对象已剔除空值，可直接作为 `context` 传给预览 IPC。
 */
export function buildProjectPreviewContext(input: PreviewContextInput): Record<string, unknown> {
  const characters = records(input.characters, LIMITS.characters)
    .map((item) => ({
      id: text(item.id, 60),
      name: text(item.name, 60),
      role: text(item.role, 60),
      description: text(item.description)
    }))
    .filter((item) => item.name.trim())

  const worldviewEntries = records(input.worldviewEntries, LIMITS.worldview)
    .map((item) => ({
      type: text(item.type, 40),
      title: text(item.title, 120),
      content: text(item.content)
    }))
    .filter((item) => item.title.trim())

  const outlineItems = records(input.outlineItems, LIMITS.outline)
    .map((item) => ({
      title: text(item.title, 120),
      summary: text(item.summary),
      conflict: text(item.conflict)
    }))
    .filter((item) => item.title.trim())

  const inspirationEntries = records(input.inspirationEntries, LIMITS.inspiration)
    .map((item) => ({
      type: text(item.type, 40),
      title: text(item.title, 120),
      content: text(item.content)
    }))
    .filter((item) => item.title.trim())

  const chapters = records(input.chapters, LIMITS.chapters)
    .map((item) => ({
      id: text(item.id, 60),
      title: text(item.title, 120),
      summary: text(item.summary)
    }))
    .filter((item) => item.id.trim() || item.title.trim())

  return compact({
    projectId: text(input.projectId, 60),
    projectTitle: text(input.projectTitle, 120),
    projectGenre: text(input.projectGenre, 60),
    writingStyleLabel: text(input.writingStyleLabel, 60),
    writingStylePrompt: text(input.writingStylePrompt, 1200),
    characters,
    characterNames: characters.map((item) => item.name),
    organizations: records(input.organizations, LIMITS.organizations),
    characterRelationships: records(input.characterRelationships, LIMITS.relations),
    organizationMemberships: records(input.organizationMemberships, LIMITS.relations),
    worldviewEntries,
    worldviewTitles: worldviewEntries.map((item) => item.title),
    outlineItems,
    outlineTitles: outlineItems.map((item) => item.title),
    inspirationEntries,
    chapters
  })
}
