/**
 * 文章拆解改编页（DeconstructionAdaptationPage）领域类型聚合
 * - 重导出所有 AdaptationRun 相关实体类型
 * - 暴露 ADAPTATION_STAGE_IDS 常量供 UI / 状态机 / 持久化共用
 * - 暴露主线判定 / 区间合并 / 缺口等纯函数供覆盖率分析与门禁复用
 */

import type {
  AdaptationCharacter,
  AdaptationEvidenceRef,
  AdaptationRun,
  AdaptationSourceEvidence,
  AdaptationStage,
  AdaptationStageId,
  AdaptationStageState,
  AdaptationStageStatus,
  BookUnderstanding,
  CharacterMergeEntry,
  CharacterRelationship,
  DialogueAnchor,
  DialogueAnchorMode,
  LeadCandidate,
  LeadSelection,
  PlotCard,
  PlotCardFunction,
  PlotCardProtagonistRelation,
  PlotCardReuseMode,
  PlotCardStatus,
  ToneProfile
} from '@/types/app'

export type {
  AdaptationCharacter,
  AdaptationEvidenceRef,
  AdaptationRun,
  AdaptationSourceEvidence,
  AdaptationStage,
  AdaptationStageId,
  AdaptationStageState,
  AdaptationStageStatus,
  BookUnderstanding,
  CharacterMergeEntry,
  CharacterRelationship,
  DialogueAnchor,
  DialogueAnchorMode,
  LeadCandidate,
  LeadSelection,
  PlotCard,
  PlotCardFunction,
  PlotCardProtagonistRelation,
  PlotCardReuseMode,
  PlotCardStatus,
  ToneProfile
}

/** 4 阶段串行 + tone/characters 同级：进度条与门禁共用的固定顺序 */
export const ADAPTATION_STAGE_IDS: readonly AdaptationStageId[] = [
  'lead',
  'stages',
  'plot-cards',
  'characters',
  'tone'
] as const

/** 阶段中文标签（UI 进度条渲染） */
export const ADAPTATION_STAGE_LABELS: Record<AdaptationStageId, string> = {
  lead: '主角确认',
  stages: '阶段划分',
  'plot-cards': '剧情卡拆解',
  characters: '人物资产',
  tone: '全书基调'
}

/** 状态视觉令牌映射（与 PRD §3 设计令牌对齐；UI 渲染用） */
export const ADAPTATION_STAGE_TOKEN: Record<AdaptationStageStatus, string> = {
  locked: '--arc-border',
  running: '--arc-warning',
  completed: '--arc-primary',
  stale: '--arc-warning-soft',
  failed: '--arc-danger'
}

/** 9 类剧情卡功能标签中文映射（PRD §3 复用） */
export const PLOT_CARD_FUNCTION_LABELS: Record<PlotCardFunction, string> = {
  opening: '开场建立',
  trigger: '触发事件',
  escalation: '冲突升级',
  reversal: '局势反转',
  reveal: '重要揭示',
  relationship: '关系推进',
  'emotional-reward': '情绪回报',
  payoff: '阶段兑现',
  transition: '阶段承接'
}

/** 5 类主角关系标签中文映射（side-branch 唯一标"可删支线"） */
export const PLOT_CARD_RELATION_LABELS: Record<PlotCardProtagonistRelation, string> = {
  'direct-action': '主角直接行动',
  'external-pressure': '外部压力',
  'relationship-change': '主角关系变化',
  'information-reveal': '关键信息揭示',
  'side-branch': '可删支线'
}

/** 章节范围结构（覆盖率分析使用） */
export interface ChapterRange {
  /** 起始章节序号（含） */
  start: number
  /** 结束章节序号（含） */
  end: number
}

/** 主线判定 helper（与 PRD §4.2 + deconstruction-analysis.md §4.2 一致） */
export function isMainlineProtagonistCard(card: PlotCard): boolean {
  return (
    card.status !== 'rejected'
    && card.reuseMode !== 'omit'
    && card.reuseMode !== 'merge'
    && card.protagonistRelation !== 'side-branch'
  )
}

/** 合并相邻/重叠章节区间（previous && range.start <= previous.end + 1 即合并） */
export function mergeChapterRanges(ranges: ChapterRange[]): ChapterRange[] {
  const sorted = [...ranges]
    .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end) && range.start <= range.end)
    .map((range) => ({ start: Math.max(1, Math.floor(range.start)), end: Math.max(1, Math.floor(range.end)) }))
    .sort((left, right) => left.start - right.start)

  const merged: ChapterRange[] = []
  for (const range of sorted) {
    const previous = merged[merged.length - 1]
    if (previous && range.start <= previous.end + 1) {
      previous.end = Math.max(previous.end, range.end)
    } else {
      merged.push({ start: range.start, end: range.end })
    }
  }
  return merged
}

/** 基于合并后区间找缺口（start..end 全集减去 covered 后剩下的章节区间） */
export function missingChapterRanges(start: number, end: number, covered: ChapterRange[]): ChapterRange[] {
  const totalStart = Math.min(start, end)
  const totalEnd = Math.max(start, end)
  if (totalEnd < totalStart) return []

  const merged = mergeChapterRanges(covered)
  const missing: ChapterRange[] = []
  let cursor = totalStart
  for (const range of merged) {
    if (range.end < totalStart) continue
    if (range.start > totalEnd) break
    const segStart = Math.max(range.start, totalStart)
    const segEnd = Math.min(range.end, totalEnd)
    if (cursor < segStart) {
      missing.push({ start: cursor, end: segStart - 1 })
    }
    cursor = Math.max(cursor, segEnd + 1)
  }
  if (cursor <= totalEnd) {
    missing.push({ start: cursor, end: totalEnd })
  }
  return missing.filter((gap) => gap.start <= gap.end)
}
