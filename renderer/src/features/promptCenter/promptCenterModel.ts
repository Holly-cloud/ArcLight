/**
 * Prompt 中心（v1.35.0）：列表与档案文案的纯函数模型。
 */
import type { AiPromptCatalogEntry } from '@shared/ipc-types'
import { resolveTaskLabel } from '@/features/ai/taskLabels'

/** 左栏列表项：任务名 + 中文名 + 原始档案 */
export interface PromptCatalogItem {
  task: string
  label: string
  entry: AiPromptCatalogEntry
}

/** 输出格式的中文展示 */
export function outputTypeLabel(outputType: string): string {
  return outputType === 'json' ? 'JSON' : '文本'
}

/** 由任务档案构建左栏列表项（中文名缺失时回退任务名） */
export function buildCatalogItems(entries: readonly AiPromptCatalogEntry[]): PromptCatalogItem[] {
  return entries.map((entry) => ({
    task: entry.task,
    label: resolveTaskLabel(entry.task),
    entry
  }))
}

/** 按关键字过滤列表项（匹配中文名或任务名，忽略大小写）；空关键字原样返回 */
export function filterCatalogItems(items: readonly PromptCatalogItem[], query: string): PromptCatalogItem[] {
  const keyword = String(query ?? '').trim().toLowerCase()
  if (!keyword) return [...items]
  return items.filter((item) =>
    item.label.toLowerCase().includes(keyword) || item.task.toLowerCase().includes(keyword)
  )
}

/**
 * 顶部一行 chips 文案：`世界观生成 · JSON · 能力：设置与模型配置 / 世界观设定 / 写作风格`
 * 能力为空时不追加能力段。
 */
export function buildCatalogMetaLine(item: PromptCatalogItem): string {
  const parts: string[] = [item.label, outputTypeLabel(item.entry.outputType)]
  const labels = item.entry.capabilityLabels ?? []
  if (labels.length) parts.push(`能力：${labels.join(' / ')}`)
  return parts.join(' · ')
}

/** 试拼上下文的口径说明（界面固定展示，避免把试拼误解为真实运行输入） */
export const PREVIEW_SCOPE_NOTE = '试拼＝用当前项目的通用上下文尽力拼装，不等于该任务的完整真实输入。'
