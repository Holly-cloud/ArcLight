/**
 * 状态机单测（PRD T10 验收要求）
 * - 初始状态 / 解锁 / 重跑级联 / 错误态 / tone 与 characters 同级同步
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ADAPTATION_STAGE_IDS
} from '../types.ts'
import {
  canEnterStage,
  getInitialStageStates,
  markDownstreamStagesStale,
  transitionStage,
  unlockStage
} from './adaptationStageMachine.ts'

const NOW = '2026-10-15T00:00:00.000Z'

test('getInitialStageStates: lead=running, 其余=locked', () => {
  const states = getInitialStageStates(NOW)
  assert.equal(states.length, 5)
  assert.equal(states[0].id, 'lead')
  assert.equal(states[0].status, 'running')
  assert.equal(states[1].status, 'locked')
  assert.equal(states[2].status, 'locked')
  assert.equal(states[3].status, 'locked')
  assert.equal(states[4].status, 'locked')
})

test('canEnterStage: 前一阶段 completed 才返回 true', () => {
  const states = getInitialStageStates(NOW)
  assert.equal(canEnterStage('lead', states), true)
  assert.equal(canEnterStage('stages', states), false)
  const completed = transitionStage('lead', 'completed', '', NOW)(states)
  assert.equal(canEnterStage('stages', completed), true)
  assert.equal(canEnterStage('plot-cards', completed), false)
  const plotCardsDone = transitionStage('stages', 'completed', '', NOW)(completed)
  assert.equal(canEnterStage('plot-cards', plotCardsDone), true)
  // tone 与 characters 同级：plot-cards.completed 后两者均可进入
  assert.equal(canEnterStage('characters', plotCardsDone), true)
  assert.equal(canEnterStage('tone', plotCardsDone), true)
})

test('transitionStage: 状态更新不可变', () => {
  const states = getInitialStageStates(NOW)
  const next = transitionStage('lead', 'failed', '解析失败', NOW)(states)
  assert.notEqual(next, states)
  assert.equal(next[0].status, 'failed')
  assert.equal(next[0].error, '解析失败')
  assert.equal(states[0].status, 'running')
})

test('markDownstreamStagesStale: 从指定阶段开始全部级联 stale', () => {
  let states = getInitialStageStates(NOW)
  states = transitionStage('lead', 'completed', '', NOW)(states)
  states = transitionStage('stages', 'completed', '', NOW)(states)
  states = transitionStage('plot-cards', 'completed', '', NOW)(states)
  // 重跑 stages：stages / plot-cards / characters / tone 都应变 stale
  const stale = markDownstreamStagesStale('stages', states, NOW)
  assert.equal(stale[0].status, 'completed', 'lead 不受影响')
  assert.equal(stale[1].status, 'stale')
  assert.equal(stale[2].status, 'stale')
  assert.equal(stale[3].status, 'stale')
  assert.equal(stale[4].status, 'stale')
})

test('tone 与 characters 同级同步标 stale', () => {
  let states = getInitialStageStates(NOW)
  states = transitionStage('lead', 'completed', '', NOW)(states)
  states = transitionStage('stages', 'completed', '', NOW)(states)
  states = transitionStage('plot-cards', 'completed', '', NOW)(states)
  states = transitionStage('characters', 'completed', '', NOW)(states)
  states = transitionStage('tone', 'completed', '', NOW)(states)
  // 重跑 plot-cards：characters + tone 同级同步 stale
  const stale = markDownstreamStagesStale('plot-cards', states, NOW)
  assert.equal(stale[2].status, 'stale')
  assert.equal(stale[3].status, 'stale')
  assert.equal(stale[4].status, 'stale')
})

test('markDownstreamStagesStale 不会把 locked 阶段提前解锁', () => {
  const states = getInitialStageStates(NOW)
  const stale = markDownstreamStagesStale('lead', states, NOW)
  for (const state of stale) {
    assert.notEqual(state.status, 'locked', 'locked 阶段不应被标记为 stale')
  }
})

test('unlockStage: locked → running', () => {
  const states = getInitialStageStates(NOW)
  const next = unlockStage('stages', states, NOW)
  assert.equal(next[1].status, 'running')
  assert.equal(next[2].status, 'locked')
})

test('ADAPTATION_STAGE_IDS 顺序固定', () => {
  assert.deepEqual([...ADAPTATION_STAGE_IDS], [
    'lead',
    'stages',
    'plot-cards',
    'characters',
    'tone'
  ])
})
