/**
 * 小说「按章 / 集划分」的 AI 编排（纯函数式编排，依赖注入，可单测）。
 *
 * 职责：把脚本预筛出的候选行**分批**喂给 `novel-split-locate` 任务，
 * 清洗模型返回的行号（只保留落在该批候选集合内的行号），全局去重升序。
 *
 * 回退原则：未就绪 / 无候选 / **任一批返回 null** / 清洗后无任何 chapter → 整体返回 `null`，
 * 由调用方回退脚本切分（避免局部混用两套切分）。
 *
 * 本模块不直接依赖 store / IPC；真实 `callBatch` 由向导注入。
 */
import type { SplitCandidate, SplitPlan } from '@shared/continuation-import'

export interface SplitAiDeps {
  isReady: boolean
  /** 每批候选行上限；默认 300。 */
  maxCandidatesPerBatch?: number
  /** 单批调用：返回该批切点，或 null 表示失败。 */
  callBatch: (candidates: SplitCandidate[], batchIndex: number) => Promise<SplitPlan | null>
}

export interface SplitResolution {
  /** 章节级切点行号（升序、去重）。 */
  chapters: number[]
  /** 卷级切点行号（升序、去重）。 */
  volumes: number[]
  usedAi: true
  /** 实际发起的批次数。 */
  batches: number
}

const DEFAULT_MAX_CANDIDATES_PER_BATCH = 300

/**
 * 分批调用 AI 定位切点并清洗合并。
 * @returns 合并后的切点计划；应回退脚本时返回 null。
 */
export async function resolveNovelSplitWithAi(
  candidates: SplitCandidate[],
  deps: SplitAiDeps
): Promise<SplitResolution | null> {
  if (!deps.isReady) return null
  if (!Array.isArray(candidates) || candidates.length === 0) return null

  const batchSize = Math.max(1, deps.maxCandidatesPerBatch ?? DEFAULT_MAX_CANDIDATES_PER_BATCH)
  const chapterIndexes = new Set<number>()
  const volumeIndexes = new Set<number>()
  let batches = 0

  for (let start = 0; start < candidates.length; start += batchSize) {
    const batch = candidates.slice(start, start + batchSize)
    let plan: SplitPlan | null = null
    try {
      plan = await deps.callBatch(batch, batches)
    } catch {
      plan = null
    }
    batches += 1
    if (!plan) return null

    // 只信任落在本批候选行号集合内的行号，丢弃越界 / 幻觉索引。
    const allowed = new Set(batch.map((candidate) => candidate.index))
    for (const index of plan.chapters ?? []) {
      if (allowed.has(index)) chapterIndexes.add(index)
    }
    for (const index of plan.volumes ?? []) {
      if (allowed.has(index)) volumeIndexes.add(index)
    }
  }

  if (chapterIndexes.size === 0) return null

  const ascending = (a: number, b: number) => a - b
  return {
    chapters: [...chapterIndexes].sort(ascending),
    volumes: [...volumeIndexes].sort(ascending),
    usedAi: true,
    batches
  }
}
