/**
 * v1.25.2 功能说明（FeatureHelp）公共类型与查表函数
 * - 数据按模块拆分（v1.23 sceneprop / v1.24 adaptation / v1.25 workbench）
 * - 数据层纯静态常量导出（不接 IPC / 不进 store / 不持久化）
 * - TS 类型严格：FeatureId 联合类型 13 条穷举；新增 featureId 必须 TS 报错
 */

import { SCENEPROP_HELP } from '@/features/sceneprop/help/sceneprop-help'
import { ADAPTATION_HELP } from '@/features/adaptation/help/adaptation-help'
import { WORKBENCH_HELP } from '@/features/workbench/help/workbench-help'

/**
 * 13 条功能 id 的严格联合类型（避免拼写错）
 * - v1.23 sceneprop（3）
 * - v1.24 adaptation（8）
 * - v1.25 workbench（2）
 *
 * 新增 featureId 必须 TS 报错（防止漏写 / 拼写错）
 */
export type FeatureId =
  // v1.23 sceneprop（3）
  | 'scene-location'
  | 'prop-item'
  | 'relations-graph'
  // v1.24 adaptation（8）
  | 'lead-confirmation'
  | 'stage-mapping'
  | 'plot-card'
  | 'character-bible'
  | 'tone-profile'
  | 'tag-protocol'
  | 'dialogue-anchors'
  | '18-gates'
  // v1.25 workbench（2）
  | 'workbench'
  | 'p1-placeholder'

/**
 * "查看完整文档"链接
 */
export interface DocLink {
  label: string
  href: string
}

/**
 * 单条功能说明（FeatureHelp 数据源）
 */
export interface FeatureDescription {
  /** 全局唯一 id，与 FeatureId 联合类型一一对应 */
  id: FeatureId
  /** 显示在 NPopover 卡片头部的标题 */
  title: string
  /** 1-2 句为什么有这个功能（whyItMatters） */
  whyItMatters: string
  /** 3-5 个关键概念（每条 ≤ 60 字） */
  keyConcepts: string[]
  /** 可选：查看完整文档的链接 */
  docLink?: DocLink
}

/**
 * 13 条 featureId 的总表（聚合 3 个模块的 HELP_DATA）
 */
const ALL_DESCRIPTIONS: ReadonlyMap<FeatureId, FeatureDescription> = new Map(
  [...SCENEPROP_HELP, ...ADAPTATION_HELP, ...WORKBENCH_HELP].map((desc) => [desc.id, desc])
)

/**
 * FeatureHelp 组件查表函数：从 id 查 FeatureDescription
 * - 找不到返回 null（D7 兜底：组件静默渲染 null，不报错）
 */
export function getFeatureDescription(id: FeatureId): FeatureDescription | null {
  return ALL_DESCRIPTIONS.get(id) ?? null
}

/**
 * FeatureHelp 组件查表函数：聚合 1-3 条功能说明为弹卡片内容（Q7 锁定）
 * - 调用方用 v-for 渲染多个组件；组件内部不处理聚合
 * - 顺序与输入 ids 一致；找不到的 id 自动过滤
 */
export function getFeatureDescriptions(ids: FeatureId[]): FeatureDescription[] {
  return ids
    .map((id) => ALL_DESCRIPTIONS.get(id))
    .filter((d): d is FeatureDescription => d !== undefined)
}

/**
 * 13 条 featureId 联合类型的常量元组（用于测试 / 静态校验）
 */
export const ALL_FEATURE_IDS: readonly FeatureId[] = [
  'scene-location',
  'prop-item',
  'relations-graph',
  'lead-confirmation',
  'stage-mapping',
  'plot-card',
  'character-bible',
  'tone-profile',
  'tag-protocol',
  'dialogue-anchors',
  '18-gates',
  'workbench',
  'p1-placeholder'
] as const
