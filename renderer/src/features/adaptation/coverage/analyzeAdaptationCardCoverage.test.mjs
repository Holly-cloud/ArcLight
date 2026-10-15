/**
 * 覆盖率分析单测（PRD T4 验收要求）
 * - 区间合并（含相邻 / 重叠）、缺口合并（含阶段、百分比计算、4 重主线判定 helper
 * - 纯函数测试，不依赖 store / Vue
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { analyzeAdaptationCardCoverage, analyzeStageCoverage } from './analyzeAdaptationCardCoverage.ts'
import {
  isMainlineProtagonistCard,
  mergeChapterRanges,
  missingChapterRanges
} from '../types.ts'

function buildCard(overrides) {
  return {
    id: overrides.id ?? `card-${Math.random()}`,
    stageId: overrides.stageId ?? 'stage-1',
    title: overrides.title ?? '测试卡',
    function: overrides.function ?? 'opening',
    protagonistRelation: overrides.protagonistRelation ?? 'direct-action',
    synopsis: overrides.synopsis ?? '测试摘要',
    storyBeats: [],
    protagonistGoal: '',
    protagonistAction: '',
    protagonistObstacle: '',
    protagonistChoice: '',
    protagonistResult: '',
    protagonistStateChange: '',
    nextHook: '',
    conflict: '',
    result: '',
    emotionalEffect: '',
    sourceChapterStart: overrides.sourceChapterStart ?? 1,
    sourceChapterEnd: overrides.sourceChapterEnd ?? 1,
    sourceRefs: [],
    participatingCharacterIds: [],
    dependencies: [],
    status: overrides.status ?? 'active',
    reuseMode: overrides.reuseMode ?? 'keep',
    dialogueAnchors: []
  }
}

test('mergeChapterRanges merges adjacent and overlapping ranges', () => {
  const merged = mergeChapterRanges([
    { start: 1, end: 5 },
    { start: 6, end: 10 },
    { start: 12, end: 15 },
    { start: 15, end: 18 }
  ])
  assert.deepEqual(merged, [
    { start: 1, end: 10 },
    { start: 12, end: 18 }
  ])
})

test('mergeChapterRanges discards invalid input and ignores unordered data', () => {
  const merged = mergeChapterRanges([
    { start: 8, end: 5 },
    { start: 4, end: 6 },
    { start: 100, end: 110 }
  ])
  assert.deepEqual(merged, [
    { start: 4, end: 6 },
    { start: 100, end: 110 }
  ])
})

test('missingChapterRanges finds gaps between merged intervals', () => {
  const gaps = missingChapterRanges(1, 20, [
    { start: 1, end: 5 },
    { start: 6, end: 10 },
    { start: 16, end: 20 }
  ])
  assert.deepEqual(gaps, [{ start: 11, end: 15 }])
})

test('missingChapterRanges returns empty when fully covered', () => {
  assert.deepEqual(missingChapterRanges(1, 5, [{ start: 1, end: 5 }]), [])
})

test('isMainlineProtagonistCard covers all four exclusions', () => {
  const base = { protagonistRelation: 'direct-action', status: 'active', reuseMode: 'keep' }
  assert.equal(isMainlineProtagonistCard(buildCard({ ...base })), true)
  assert.equal(isMainlineProtagonistCard(buildCard({ ...base, status: 'rejected' })), false)
  assert.equal(isMainlineProtagonistCard(buildCard({ ...base, reuseMode: 'omit' })), false)
  assert.equal(isMainlineProtagonistCard(buildCard({ ...base, reuseMode: 'merge' })), false)
  assert.equal(isMainlineProtagonistCard(buildCard({ ...base, protagonistRelation: 'side-branch' })), false)
})

test('analyzeStageCoverage counts only mainline cards and computes gaps', () => {
  const stage = {
    id: 'stage-1',
    index: 0,
    title: '初临大唐',
    sourceChapterStart: 1,
    sourceChapterEnd: 30,
    targetEpisodeStart: 1,
    targetEpisodeEnd: 20,
    startState: '',
    endState: '',
    goal: '',
    obstacle: '',
    personality: '',
    emotionalNeed: '',
    turningPoint: '',
    stagePayoff: '',
    transitionHook: '',
    protagonistEvents: [],
    evidenceRefs: []
  }
  const cards = [
    buildCard({ stageId: 'stage-1', sourceChapterStart: 1, sourceChapterEnd: 5 }),
    buildCard({ stageId: 'stage-1', sourceChapterStart: 7, sourceChapterEnd: 10 }),
    buildCard({ stageId: 'stage-1', sourceChapterStart: 12, sourceChapterEnd: 12, status: 'rejected' }),
    buildCard({ stageId: 'stage-1', sourceChapterStart: 14, sourceChapterEnd: 16, reuseMode: 'omit' })
  ]
  const report = analyzeStageCoverage(stage, cards)
  assert.equal(report.mainlineCardCount, 2)
  assert.equal(report.totalChapterCount, 30)
  assert.equal(report.coveredChapterCount, 9)
  assert.deepEqual(report.gaps, [
    { start: 6, end: 6 },
    { start: 11, end: 30 }
  ])
})

test('analyzeAdaptationCardCoverage returns cross-stage gaps and percent', () => {
  const run = {
    id: 'adapt-run-1',
    referenceWorkId: 'ref-1',
    sourceTitle: '测试源',
    sourceContentHash: 'hash',
    sourceChapterCount: 50,
    targetEpisodeCount: 80,
    requestedWorkKind: 'novel-to-short-drama',
    adaptationMode: 'faithful-adaptation',
    status: 'running',
    activeStage: 'plot-cards',
    leadCandidates: [],
    leadSelection: null,
    stages: [
      {
        id: 'stage-1',
        index: 0,
        title: '阶段一',
        sourceChapterStart: 1,
        sourceChapterEnd: 25,
        targetEpisodeStart: 1,
        targetEpisodeEnd: 40,
        startState: '',
        endState: '',
        goal: '',
        obstacle: '',
        personality: '',
        emotionalNeed: '',
        turningPoint: '',
        stagePayoff: '',
        transitionHook: '',
        protagonistEvents: [],
        evidenceRefs: []
      },
      {
        id: 'stage-2',
        index: 1,
        title: '阶段二',
        sourceChapterStart: 26,
        sourceChapterEnd: 50,
        targetEpisodeStart: 41,
        targetEpisodeEnd: 80,
        startState: '',
        endState: '',
        goal: '',
        obstacle: '',
        personality: '',
        emotionalNeed: '',
        turningTriggerPoint: '',
        stagePayoff: '',
        transitionHook: '',
        protagonistEvents: [],
        evidenceRefs: []
      }
    ],
    plotCards: [
      buildCard({ stageId: 'stage-1', sourceChapterStart: 1, sourceChapterEnd: 5 }),
      buildCard({ stageId: 'stage-1', sourceChapterStart: 6, sourceChapterEnd: 10 }),
      buildCard({ stageId: 'stage-2', sourceChapterStart: 26, sourceChapterEnd: 30 })
    ],
    characters: [],
    relationships: [],
    characterMergeLedger: [],
    toneProfile: null,
    bookUnderstanding: null,
    selectedCardIds: [],
    stageStates: [],
    fusionImport: null,
    error: '',
    createdAt: '',
    updatedAt: ''
  }
  const report = analyzeAdaptationCardCoverage(run)
  assert.equal(report.mainlineCardCount, 3)
  assert.equal(report.totalChapterCount, 50)
  assert.equal(report.coveredChapterCount, 15)
  assert.equal(report.percent, 30)
  assert.deepEqual(report.gaps, [
    { start: 11, end: 25 },
    { start: 31, end: 50 }
  ])
})
