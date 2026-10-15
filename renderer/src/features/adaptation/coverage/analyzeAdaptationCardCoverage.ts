/**
 * 覆盖率分析（PRD §3.2 P0-8）
 * - 合并区间 → 找缺口 → 逐阶段 + 全书覆盖率百分比
 * - UI 用 NProgress + 缺口列表呈现；依赖主线判定 helper（from types.ts）
 */

import type { AdaptationRun, AdaptationStage, PlotCard } from '@/types/app'
import {
  isMainlineProtagonistCard,
  mergeChapterRanges,
  missingChapterRanges,
  type ChapterRange
} from '../types.ts'

/** 单阶段覆盖率报告 */
export interface StageCoverageReport {
  stageId: string
  stageTitle: string
  chapterStart: number
  chapterEnd: number
  mainlineCardCount: number
  coveredChapterCount: number
  totalChapterCount: number
  gaps: ChapterRange[]
}

/** 全书覆盖率报告 */
export interface AdaptationCoverageReport {
  /** 主线剧情卡总数（4 重排除后） */
  mainlineCardCount: number
  /** 已覆盖章节数（合并区间后） */
  coveredChapterCount: number
  /** 原文章节总数 */
  totalChapterCount: number
  /** 覆盖率百分比 0-100（整数） */
  percent: number
  /** 全部缺口区间（跨阶段展平） */
  gaps: ChapterRange[]
  /** 逐阶段覆盖率列表 */
  stages: StageCoverageReport[]
}

/**
 * 分析单阶段的覆盖率
 * - 仅计入主线剧情卡（4 重排除后）
 * - 合并区间后统计已覆盖章节数；剩余章节即为缺口
 */
export function analyzeStageCoverage(stage: AdaptationStage, cards: PlotCard[]): StageCoverageReport {
  const mainlineCards = cards.filter((card) => card.stageId === stage.id && isMainlineProtagonistCard(card))
  const ranges = mainlineCards.map((card) => ({
    start: card.sourceChapterStart,
    end: card.sourceChapterEnd
  }))
  const merged = mergeChapterRanges(ranges)
  const gaps = missingChapterRanges(stage.sourceChapterStart, stage.sourceChapterEnd, merged)
  const totalChapterCount = Math.max(0, stage.sourceChapterEnd - stage.sourceChapterStart + 1)
  const coveredChapterCount = Math.max(
    0,
    totalChapterCount - gaps.reduce((sum, gap) => sum + (gap.end - gap.start + 1), 0)
  )
  return {
    stageId: stage.id,
    stageTitle: stage.title,
    chapterStart: stage.sourceChapterStart,
    chapterEnd: stage.sourceChapterEnd,
    mainlineCardCount: mainlineCards.length,
    coveredChapterCount,
    totalChapterCount,
    gaps
  }
}

/**
 * 分析整本改编运行的覆盖率
 * - totalChapterCount 取自 sourceChapterCount（脚本统计）
 * - percent 已覆盖章节 / 原文章节总数（向下取整）
 */
export function analyzeAdaptationCardCoverage(run: AdaptationRun): AdaptationCoverageReport {
  const stages = run.stages
  const stageReports = stages.map((stage) => analyzeStageCoverage(stage, run.plotCards))
  const allGaps: ChapterRange[] = []
  for (const report of stageReports) {
    allGaps.push(...report.gaps)
  }
  const totalCoveredAcrossStages = stageReports.reduce((sum, report) => sum + report.coveredChapterCount, 0)
  const totalChapterCount = Math.max(1, run.sourceChapterCount)
  const percent = Math.max(0, Math.min(100, Math.round((totalCoveredAcrossStages / totalChapterCount) * 100)))
  return {
    mainlineCardCount: run.plotCards.filter(isMainlineProtagonistCard).length,
    coveredChapterCount: totalCoveredAcrossStages,
    totalChapterCount,
    percent,
    gaps: mergeChapterRanges(allGaps),
    stages: stageReports
  }
}
