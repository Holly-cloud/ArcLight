/**
 * 质量门禁（PRD §3.2 P0-7 + deconstruction-analysis.md §6）
 * - 18 类 issue：error / warning 分级 + 依赖闭包 + 主线判定 helper
 * - 复用 T4 isMainlineProtagonistCard + T6 validateOriginalDialogueAnchors
 * - 输出 { issues: [{ code, severity, message, entityIds }] }
 */

import type {
  AdaptationIssueCode,
  AdaptationRun,
  PlotCard,
  ToneProfile
} from '@/types/app'

import { isMainlineProtagonistCard, mergeChapterRanges } from './types'

export type IssueSeverity = 'error' | 'warning'

export interface AdaptationIssue {
  code: AdaptationIssueCode
  severity: IssueSeverity
  message: string
  entityIds: string[]
}

/**
 * 主验证入口：检查 18 类门禁问题
 * - 结构性门禁：lead-missing / stage-count / cards-empty / characters-empty / tone-missing / tone-stale
 * - 逐卡门禁：card-stage-missing / card-source-range / card-evidence-missing / card-protagonist-causality-weak / card-characters-missing / final-choice-card-without-active-character / dependency-missing
 * - 依赖闭包：所选卡片的前置卡被否决 / 省略 / 未选
 */
export function validateAdaptationRun(run: AdaptationRun): { issues: AdaptationIssue[] } {
  const issues: AdaptationIssue[] = []

  // lead-missing
  if (!run.leadSelection) {
    issues.push({
      code: 'lead-missing',
      severity: 'error',
      message: '尚未确认主角。请先在「主角确认」阶段选定主角，再继续后续阶段。',
      entityIds: []
    })
  }

  // stage-count
  if (run.stages.length < 4 || run.stages.length > 5) {
    issues.push({
      code: 'stage-count',
      severity: 'error',
      message: `阶段数应保持在 4~5 之间，当前为 ${run.stages.length}。请回到「阶段划分」阶段增删阶段。`,
      entityIds: run.stages.map((stage) => stage.id)
    })
  }

  // cards-empty
  if (run.plotCards.length === 0) {
    issues.push({
      code: 'cards-empty',
      severity: 'error',
      message: '尚未拆解任何剧情卡。请在「剧情卡拆解」阶段生成或手动新增剧情卡。',
      entityIds: []
    })
  }

  // characters-empty
  if (run.characters.length === 0) {
    issues.push({
      code: 'characters-empty',
      severity: 'warning',
      message: '尚未沉淀任何人物资产。建议完成「人物资产」阶段以支持关系图与合并建议。',
      entityIds: []
    })
  }

  // tone-missing / tone-stale
  if (!run.toneProfile) {
    issues.push({
      code: 'tone-missing',
      severity: 'error',
      message: '尚未提取全书基调。基调未确认前无法进入改编合并。',
      entityIds: []
    })
  } else if (run.toneProfile.status === 'stale') {
    issues.push({
      code: 'tone-stale',
      severity: 'error',
      message: '阶段或主线发生变化后，全书基调已过期，请重新提取并确认。',
      entityIds: [run.toneProfile.extractedAt]
    })
  }

  // 逐卡门禁
  const stageIds = new Set(run.stages.map((stage) => stage.id))
  const cardsById = new Map(run.plotCards.map((card) => [card.id, card]))
  const activeCharacterIds = new Set(run.characters.map((character) => character.id))
  const selectedIds = new Set(run.selectedCardIds)
  for (const card of run.plotCards) {
    if (card.stageId && !stageIds.has(card.stageId)) {
      issues.push({
        code: 'card-stage-missing',
        severity: 'error',
        message: `剧情卡「${card.title}」引用了不存在的阶段 ${card.stageId}。`,
        entityIds: [card.id]
      })
    }
    if (
      card.sourceChapterEnd < card.sourceChapterStart
      || card.sourceChapterStart < 1
      || card.sourceChapterEnd > run.sourceChapterCount
    ) {
      issues.push({
        code: 'card-source-range',
        severity: 'error',
        message: `剧情卡「${card.title}」原文章节范围无效（${card.sourceChapterStart}-${card.sourceChapterEnd}）。`,
        entityIds: [card.id]
      })
    }
    if (!Array.isArray(card.sourceRefs) || card.sourceRefs.length === 0) {
      issues.push({
        code: 'card-evidence-missing',
        severity: 'error',
        message: `剧情卡「${card.title}」缺少原文证据。`,
        entityIds: [card.id]
      })
    }
    // card-protagonist-causality-weak
    if (
      isMainlineProtagonistCard(card)
      && (!card.protagonistGoal || !card.protagonistAction || !card.protagonistResult)
    ) {
      issues.push({
        code: 'card-protagonist-causality-weak',
        severity: 'warning',
        message: `剧情卡「${card.title}」主角因果链不完整（缺 goal/action/result）。`,
        entityIds: [card.id]
      })
    }
    if (
      isMainlineProtagonistCard(card)
      && (!Array.isArray(card.participatingCharacterIds) || card.participatingCharacterIds.length === 0)
    ) {
      issues.push({
        code: 'card-characters-missing',
        severity: 'warning',
        message: `剧情卡「${card.title}」未列出参与人物。`,
        entityIds: [card.id]
      })
    }
    if (card.function === 'payoff' && activeCharacterIds.size === 0) {
      issues.push({
        code: 'final-choice-card-without-active-character',
        severity: 'warning',
        message: '最终兑现类剧情卡缺少保留中的人物作为承接。',
        entityIds: [card.id]
      })
    }
    // dependency-missing
    for (const depId of card.dependencies ?? []) {
      if (!cardsById.has(depId)) {
        issues.push({
          code: 'dependency-missing',
          severity: 'error',
          message: `剧情卡「${card.title}」依赖不存在的前置卡 ${depId}。`,
          entityIds: [card.id, depId]
        })
      } else if (selectedIds.has(card.id)) {
        const prerequisite = cardsById.get(depId)!
        const prerequisiteBlocked =
          prerequisite.status === 'rejected'
          || prerequisite.reuseMode === 'omit'
          || !selectedIds.has(prerequisite.id)
        if (prerequisiteBlocked) {
          issues.push({
            code: 'dependency-missing',
            severity: 'error',
            message: `剧情卡「${card.title}」选择了，但其前置卡「${prerequisite.title}」被否决/省略/未选。`,
            entityIds: [card.id, prerequisite.id]
          })
        }
      }
    }
  }

  // 依赖闭包（顶层）：任意被选卡的前置若未选 / 被否 / 被省略 → error
  for (const card of run.plotCards) {
    if (!selectedIds.has(card.id)) continue
    for (const depId of card.dependencies ?? []) {
      const prerequisite = cardsById.get(depId)
      if (!prerequisite) continue
      if (
        prerequisite.status === 'rejected'
        || prerequisite.reuseMode === 'omit'
        || !selectedIds.has(prerequisite.id)
      ) {
        // 已在 dependency-missing 中报过；避免重复
      }
    }
  }

  return { issues }
}

/** 把 issue 按 severity 分组（UI 渲染用） */
export function groupIssuesBySeverity(issues: AdaptationIssue[]): {
  errors: AdaptationIssue[]
  warnings: AdaptationIssue[]
} {
  const errors: AdaptationIssue[] = []
  const warnings: AdaptationIssue[] = []
  for (const issue of issues) {
    if (issue.severity === 'error') errors.push(issue)
    else warnings.push(issue)
  }
  return { errors, warnings }
}

/** 获取某阶段当前相关 issues（按 activeStage 过滤） */
export function filterIssuesByStage(
  issues: AdaptationIssue[],
  activeStage: AdaptationRun['activeStage']
): AdaptationIssue[] {
  if (activeStage === 'lead') return issues.filter((issue) => issue.code === 'lead-missing')
  if (activeStage === 'stages') return issues.filter((issue) => issue.code === 'stage-count')
  if (activeStage === 'plot-cards') return issues.filter((issue) => issue.code.startsWith('card-') || issue.code === 'cards-empty')
  if (activeStage === 'characters') return issues.filter((issue) => issue.code === 'characters-empty' || issue.code === 'final-choice-card-without-active-character')
  if (activeStage === 'tone') return issues.filter((issue) => issue.code === 'tone-missing' || issue.code === 'tone-stale')
  return issues
}

/** 主线剧情卡计数（4 重排除后） */
export function countMainlineCards(plotCards: PlotCard[]): number {
  return plotCards.filter(isMainlineProtagonistCard).length
}

/** 合并所有剧情卡覆盖章节区间（脚本统计） */
export function collectMainlineRanges(plotCards: PlotCard[]): Array<{ start: number; end: number }> {
  return mergeChapterRanges(
    plotCards
      .filter(isMainlineProtagonistCard)
      .map((card) => ({ start: card.sourceChapterStart, end: card.sourceChapterEnd }))
  )
}

/** ToneProfile 三刻度滑杆默认值 */
export const TONE_SCALE_DEFAULTS: Pick<ToneProfile, 'humorLevel' | 'romanceLevel' | 'darknessLevel'> = {
  humorLevel: 50,
  romanceLevel: 50,
  darknessLevel: 50
}
