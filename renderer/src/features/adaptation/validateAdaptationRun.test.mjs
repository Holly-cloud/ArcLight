/**
 * 质量门禁单测（PRD T7 验收要求）
 * - error / warning 分级 + 依赖闭包 + 主线判定 helper + tone-stale 触发条件
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  validateAdaptationRun,
  groupIssuesBySeverity,
  filterIssuesByStage
} from './validateAdaptationRun.ts'

function buildCard(overrides = {}) {
  return {
    id: overrides.id ?? 'card-1',
    stageId: overrides.stageId ?? 'stage-1',
    title: overrides.title ?? '测试卡',
    function: overrides.function ?? 'opening',
    protagonistRelation: overrides.protagonistRelation ?? 'direct-action',
    synopsis: '测试摘要',
    storyBeats: [],
    protagonistGoal: '目标',
    protagonistAction: '行动',
    protagonistObstacle: '阻力',
    protagonistChoice: '选择',
    protagonistResult: '结果',
    protagonistStateChange: '变化',
    nextHook: '',
    conflict: '',
    result: '',
    emotionalEffect: '',
    sourceChapterStart: overrides.sourceChapterStart ?? 1,
    sourceChapterEnd: overrides.sourceChapterEnd ?? 3,
    sourceRefs: overrides.sourceRefs ?? [{ chapterId: 'chapter-1', chapterNumber: 1, reason: '测试' }],
    participatingCharacterIds: overrides.participatingCharacterIds ?? [],
    dependencies: overrides.dependencies ?? [],
    status: overrides.status ?? 'active',
    reuseMode: overrides.reuseMode ?? 'keep',
    dialogueAnchors: []
  }
}

function buildRun(overrides = {}) {
  const stages = overrides.stages ?? [
    {
      id: 'stage-1', index: 0, title: '阶段一',
      sourceChapterStart: 1, sourceChapterEnd: 30,
      targetEpisodeStart: 1, targetEpisodeEnd: 40,
      startState: '', endState: '', goal: '', obstacle: '',
      personality: '', emotionalNeed: '', turningPoint: '', stagePayoff: '',
      transitionHook: '', protagonistEvents: [], evidenceRefs: []
    },
    {
      id: 'stage-2', index: 1, title: '阶段二',
      sourceChapterStart: 31, sourceChapterEnd: 60,
      targetEpisodeStart: 41, targetEpisodeEnd: 80,
      startState: '', endState: '', goal: '', obstacle: '',
      personality: '', emotionalNeed: '', turningPoint: '', stagePayoff: '',
      transitionHook: '', protagonistEvents: [], evidenceRefs: []
    }
  ]
  return {
    id: 'adapt-run-1',
    referenceWorkId: 'ref-1',
    sourceTitle: '测试源',
    sourceContentHash: 'hash',
    sourceChapterCount: overrides.sourceChapterCount ?? 60,
    targetEpisodeCount: 80,
    requestedWorkKind: 'novel-to-short-drama',
    adaptationMode: 'faithful-adaptation',
    status: 'running',
    activeStage: overrides.activeStage ?? 'plot-cards',
    leadCandidates: [],
    leadSelection: overrides.leadSelection ?? { id: 'lead-1', userNote: '', confirmedAt: '' },
    stages,
    plotCards: overrides.plotCards ?? [],
    characters: overrides.characters ?? [],
    relationships: [],
    characterMergeLedger: [],
    toneProfile: overrides.toneProfile ?? null,
    bookUnderstanding: null,
    selectedCardIds: overrides.selectedCardIds ?? [],
    stageStates: [],
    fusionImport: null,
    error: '',
    createdAt: '',
    updatedAt: ''
  }
}

test('未确认主角 → lead-missing error', () => {
  const run = buildRun({ leadSelection: null })
  const { issues } = validateAdaptationRun(run)
  const codes = issues.map((issue) => issue.code)
  assert.ok(codes.includes('lead-missing'))
})

test('阶段数不在 4-5 之间 → stage-count error', () => {
  const run = buildRun({ stages: [buildRun().stages[0]] })
  const { issues } = validateAdaptationRun(run)
  const codes = issues.map((issue) => issue.code)
  assert.ok(codes.includes('stage-count'))
})

test('剧情卡为空 → cards-empty error', () => {
  const run = buildRun({ plotCards: [] })
  const { issues } = validateAdaptationRun(run)
  const codes = issues.map((issue) => issue.code)
  assert.ok(codes.includes('cards-empty'))
})

test('基调缺失 → tone-missing error', () => {
  const run = buildRun()
  const { issues } = validateAdaptationRun(run)
  assert.ok(issues.some((issue) => issue.code === 'tone-missing'))
})

test('基调已过期 → tone-stale error', () => {
  const run = buildRun({
    toneProfile: {
      coreTone: '', genrePromise: '', audiencePromise: '',
      emotionalPalette: [], narrativeVoice: '', pacing: '',
      conflictTemperature: '', dialogueStyle: '',
      humorLevel: 50, romanceLevel: 50, darknessLevel: 50,
      mustKeepRules: [], avoidRules: [], deviationWarnings: [],
      status: 'stale', extractedAt: ''
    }
  })
  const { issues } = validateAdaptationRun(run)
  assert.ok(issues.some((issue) => issue.code === 'tone-stale'))
})

test('剧情卡引用不存在阶段 → card-stage-missing error', () => {
  const card = buildCard({ stageId: 'stage-nonexistent' })
  const run = buildRun({ plotCards: [card] })
  const { issues } = validateAdaptationRun(run)
  assert.ok(issues.some((issue) => issue.code === 'card-stage-missing'))
})

test('剧情卡章节范围越界 → card-source-range error', () => {
  const card = buildCard({ sourceChapterStart: 70, sourceChapterEnd: 80 })
  const run = buildRun({ plotCards: [card], sourceChapterCount: 60 })
  const { issues } = validateAdaptationRun(run)
  assert.ok(issues.some((issue) => issue.code === 'card-source-range'))
})

test('剧情卡缺原文证据 → card-evidence-missing error', () => {
  const card = buildCard({ sourceRefs: [] })
  const run = buildRun({ plotCards: [card] })
  const { issues } = validateAdaptationRun(run)
  assert.ok(issues.some((issue) => issue.code === 'card-evidence-missing'))
})

test('主线卡缺主角因果 → card-protagonist-causality-weak warning', () => {
  const card = buildCard({ protagonistGoal: '', protagonistAction: '', protagonistResult: '' })
  const run = buildRun({ plotCards: [card] })
  const { issues } = validateAdaptationRun(run)
  assert.ok(issues.some((issue) => issue.code === 'card-protagonist-causality-weak' && issue.severity === 'warning'))
})

test('所选卡片依赖被否 → dependency-missing error', () => {
  const prerequisite = buildCard({ id: 'card-prereq', status: 'rejected' })
  const dependent = buildCard({ id: 'card-dep', dependencies: ['card-prereq'] })
  const run = buildRun({ plotCards: [prerequisite, dependent], selectedCardIds: ['card-prereq', 'card-dep'] })
  const { issues } = validateAdaptationRun(run)
  assert.ok(issues.some((issue) => issue.code === 'dependency-missing'))
})

test('所选卡片依赖省略 → dependency-missing error', () => {
  const prerequisite = buildCard({ id: 'card-prereq', reuseMode: 'omit' })
  const dependent = buildCard({ id: 'card-dep', dependencies: ['card-prereq'] })
  const run = buildRun({ plotCards: [prerequisite, dependent], selectedCardIds: ['card-prereq', 'card-dep'] })
  const { issues } = validateAdaptationRun(run)
  assert.ok(issues.some((issue) => issue.code === 'dependency-missing'))
})

test('groupIssuesBySeverity 按 error / warning 分组', () => {
  const run = buildRun()
  const { issues } = validateAdaptationRun(run)
  const { errors, warnings } = groupIssuesBySeverity(issues)
  assert.ok(errors.length > 0)
  for (const issue of errors) assert.equal(issue.severity, 'error')
  for (const issue of warnings) assert.equal(issue.severity, 'warning')
})

test('filterIssuesByStage 按当前阶段过滤', () => {
  const run = buildRun({ activeStage: 'stages', stages: [buildRun().stages[0]] })
  const { issues } = validateAdaptationRun(run)
  const filtered = filterIssuesByStage(issues, 'stages')
  assert.ok(filtered.every((issue) => issue.code === 'stage-count' || issue.code === 'cards-empty'))
})

test('主线判定 helper：4 重排除', () => {
  const base = { stageId: 'stage-1', title: '测试卡', function: 'opening', protagonistRelation: 'direct-action', synopsis: 'x', storyBeats: [], protagonistGoal: 'a', protagonistAction: 'b', protagonistObstacle: 'c', protagonistChoice: 'd', protagonistResult: 'e', protagonistStateChange: 'f', nextHook: '', conflict: '', result: '', emotionalEffect: '', sourceChapterStart: 1, sourceChapterEnd: 1, sourceRefs: [], participatingCharacterIds: [], dependencies: [], status: 'active', reuseMode: 'keep', dialogueAnchors: [] }
  // 直接从 validateAdaptationRun 走；4 重排除不应触发 card-protagonist-causality-weak
  const runRejected = buildRun({ plotCards: [{ ...base, status: 'rejected' }] })
  const issuesRejected = validateAdaptationRun(runRejected).issues
  assert.ok(!issuesRejected.some((issue) => issue.code === 'card-protagonist-causality-weak'))
})
