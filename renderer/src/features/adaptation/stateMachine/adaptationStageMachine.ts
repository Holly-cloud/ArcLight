/**
 * 4 阶段串行状态机 + 重跑级联（PRD §3.5 + deconstruction-analysis.md §1）
 * - 纯函数模块：不依赖 store / Vue，可在 main 进程 + Node test runner 单独测试
 * - tone 与 characters 同级：可同时进入，无相互阻塞
 * - 重跑某阶段 → 后续阶段级联 stale
 */

import type { AdaptationStageId, AdaptationStageState, AdaptationStageStatus } from '@/types/app'
import { ADAPTATION_STAGE_IDS } from '../types'

/**
 * 获取初始阶段状态：lead=running，其余=locked
 * - 不依赖 toIsoTimestamp，传 now 即可，便于测试
 */
export function getInitialStageStates(now: string): AdaptationStageState[] {
  return ADAPTATION_STAGE_IDS.map((id, index) => ({
    id,
    status: index === 0 ? 'running' : 'locked',
    error: '',
    updatedAt: now
  }))
}

/**
 * 阶段解锁判定：前一阶段必须 completed
 * - 第一阶段（lead）初始为 running，可直接进入
 * - tone 与 characters 互为同级：都以 plot-cards.completed 为前置；
 *   characters / tone 之间互不阻塞
 */
export function canEnterStage(stageId: AdaptationStageId, stageStates: AdaptationStageState[]): boolean {
  const targetIndex = ADAPTATION_STAGE_IDS.indexOf(stageId)
  if (targetIndex <= 0) return true
  // tone 与 characters 同级：以 plot-cards 为前驱
  const effectivePrevIndex = (stageId === 'tone' || stageId === 'characters') ? 2 : targetIndex - 1
  const prevId = ADAPTATION_STAGE_IDS[effectivePrevIndex]
  const statesById = new Map(stageStates.map((state) => [state.id, state]))
  const previous = statesById.get(prevId)
  return previous?.status === 'completed'
}

/** reducer 工厂：返回新的阶段状态数组 */
function applyStatus(
  states: AdaptationStageState[],
  stageId: AdaptationStageId,
  nextStatus: AdaptationStageStatus,
  error: string,
  now: string
): AdaptationStageState[] {
  return states.map((state) =>
    state.id === stageId
      ? { ...state, status: nextStatus, error: error ?? '', updatedAt: now }
      : state
  )
}

/**
 * 状态切换 reducer
 * - 返回新的 states 数组（不可变）
 */
export function transitionStage(
  stageId: AdaptationStageId,
  nextStatus: AdaptationStageStatus,
  error = '',
  now = new Date().toISOString()
): (states: AdaptationStageState[]) => AdaptationStageState[] {
  return (states) => applyStatus(states, stageId, nextStatus, error, now)
}

/**
 * 重跑级联：从给定阶段起，所有后续阶段（含自身）status: 'stale'
 * - 包括 tone 与 characters 同步标 stale（PRD §3.3 重联要求）
 * - locked 阶段一并标 stale，由调用方在 UI 层负责重新解锁
 */
export function markDownstreamStagesStale(
  fromStageId: AdaptationStageId,
  states: AdaptationStageState[],
  now: string
): AdaptationStageState[] {
  const fromIndex = ADAPTATION_STAGE_IDS.indexOf(fromStageId)
  if (fromIndex < 0) return states
  return states.map((state) => {
    const idx = ADAPTATION_STAGE_IDS.indexOf(state.id)
    if (idx >= fromIndex) {
      return { ...state, status: 'stale', updatedAt: now }
    }
    return state
  })
}

/**
 * 解锁后续阶段（通常在 markDownstreamStagesStale 之后用于恢复）
 * - locked → running（其它阶段保持原状）
 */
export function unlockStage(
  stageId: AdaptationStageId,
  states: AdaptationStageState[],
  now: string
): AdaptationStageState[] {
  return states.map((state) =>
    state.id === stageId && state.status === 'locked'
      ? { ...state, status: 'running', updatedAt: now }
      : state
  )
}
