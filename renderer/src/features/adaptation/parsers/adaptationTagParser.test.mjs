/**
 * 自造标记解析器单测（PRD T5 验收要求）
 * - 7 标签解析成功路径 + 缺字段抛错 + 行号错误定位 + 多标签块分隔
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ParseError,
  parseBookUnderstandingBlocks,
  parseCardBlocks,
  parseCharacterBlocks,
  parseLeadBlocks,
  parseRelationshipBlocks,
  parseStageBlocks,
  parseToneBlocks
} from './adaptationTagParser.ts'

test('parseLeadBlocks extracts evidence and required fields', () => {
  const raw = `<LEAD>
NAME: 林昭
ROLE: male-lead
CONFIDENCE: 0.8
REASON: 第一人称视角核心
EVIDENCE_REFS:
- 第1章：开篇主角人物描
- 第3章：穿越动机自述
</LEAD>`
  const [lead] = parseLeadBlocks(raw)
  assert.equal(lead.name, '林昭')
  assert.equal(lead.role, 'male-lead')
  assert.equal(lead.confidence, 0.8)
  assert.equal(lead.evidenceRefs.length, 2)
})

test('parseLeadBlocks throws on missing EVIDENCE_REFS with line number', () => {
  const raw = `<LEAD>
NAME: 林昭
ROLE: male-lead
CONFIDENCE: 0.8
REASON: 推断
</LEAD>`
  assert.throws(() => parseLeadBlocks(raw), (error: Error) => {
    return error instanceof ParseError && error.lineNumber > 0 && /EVIDENCE_REFS/.test(error.message)
  })
})

test('parseStageBlocks parses 4 stages and reports parse errors with line numbers', () => {
  const raw = `<STAGE>
TITLE: 初临大唐
SOURCE_RANGE: 第1章至第30章
GOAL: 站稳脚跟
OBSTACLE: 身份暴露
TRANSITION_HOOK: 第一次反派出场
PROTAGONIST_EVENTS:
- 穿越受困
- 稳定伪装
EVIDENCE_REFS:
- 第1章：开篇
</STAGE>
<STAGE>
TITLE: 崭露头角
SOURCE_RANGE: 第31章至第60章
GOAL: 立足官场
OBSTACLE: 政敌陷害
TRANSITION_HOOK: 派系分化
PROTAGONIST_EVENTS:
- 首次立功
EVIDENCE_REFS:
- 第31章：第一次任职
</STAGE>`
  const stages = parseStageBlocks(raw)
  assert.equal(stages.length, 2)
  assert.equal(stages[0].sourceChapterStart, 1)
  assert.equal(stages[0].sourceChapterEnd, 30)
  assert.equal(stages[1].title, '崭露头角')
})

test('parseStageBlocks throws on missing EVIDENCE_REFS', () => {
  const raw = `<STAGE>
TITLE: 初临大唐
SOURCE_RANGE: 第1章至第30章
GOAL: 站稳脚跟
</STAGE>`
  assert.throws(() => parseStageBlocks(raw), (error: Error) => {
    return error instanceof ParseError && /EVIDENCE_REFS/.test(error.message)
  })
})

test('parseCardBlocks parses multi-card blocks', () => {
  const raw = `<CARD>
TITLE: 初临大唐，崭露头角
STAGE_ID: stage-1
SOURCE_RANGE: 第1章至第30章
FUNCTION: 触发事件
PROTAGONIST_RELATION: 主角直接行动
SYNOPSIS: 穿越即陷入危机，主角化解首场冲突
STORY_BEATS:
- 穿越与危机
- 崭露头角
PROTAGONIST_GOAL: 活下来
PROTAGONIST_ACTION: 自救
PROTAGONIST_OBSTACLE: 时空错位
PROTAGONIST_CHOICE: 抛弃旧身份
PROTAGONIST_RESULT: 立足
PROTAGONIST_STATE_CHANGE: 从被动到主动
NEXT_HOOK: 反派出场
CONFLICT: 身份暴露
RESULT: 主角站稳
EMOTIONAL_EFFECT: 紧张后放松
CHARACTERS:
- 主角
EVIDENCE_REFS:
- 第1章：开篇
</CARD>`
  const [card] = parseCardBlocks(raw)
  assert.equal(card.title, '初临大唐，崭露头角')
  assert.equal(card.storyBeats.length, 2)
})

test('parseCharacterBlocks extracts identity and evidence', () => {
  const raw = `<CHARACTER>
NAME: 林昭
IDENTITY: 穿越者
GENDER: 男
SOCIAL_STATUS: 平民书生
PERSONALITY: 谨慎机敏
GOAL: 在大唐立足
FEAR_OR_WEAKNESS: 身份暴露
EVIDENCE_REFS:
- 第1章：开篇主角
</CHARACTER>`
  const [character] = parseCharacterBlocks(raw)
  assert.equal(character.name, '林昭')
  assert.equal(character.evidenceRefs.length, 1)
})

test('parseRelationshipBlocks requires FROM and TO', () => {
  const raw = `<RELATIONSHIP>
FROM: 林昭
TO: 王氏
TYPE: 同盟
DESCRIPTION: 政治盟友
INTENSITY: 70
</RELATIONSHIP>`
  const [rel] = parseRelationshipBlocks(raw)
  assert.equal(rel.fromCharacterId, '林昭')
  assert.equal(rel.intensity, 70)
})

test('parseToneBlocks parses 3 numerical scales 0-100', () => {
  const raw = `<TONE>
CORE_TONE: 冷峻克制
GENRE_PROMISE: 群像权谋
AUDIENCE_PROMISE: 沉浸式大唐权斗
EMOTIONAL_PALETTE: 紧张；克制；反转
NARRATIVE_VOICE: 第三人称
PACING: 中速
CONFLICT_TEMPERATURE: 高
DIALOGUE_STYLE: 简洁
HUMOR_LEVEL: 20
ROMANCE_LEVEL: 30
DARKNESS_LEVEL: 70
MUST_KEEP_RULES:
- 维持权谋基调
AVOID_RULES:
- 避免现代梗
DEVIATION_WARNINGS:
- 警惕过度浪漫
EVIDENCE_REFS:
- 第1章：基调
</TONE>`
  const tone = parseToneBlocks(raw)
  assert.equal(tone.humorLevel, 20)
  assert.equal(tone.romanceLevel, 30)
  assert.equal(tone.darknessLevel, 70)
  assert.equal(tone.status, 'fresh')
})

test('parseBookUnderstandingBlocks parses 6 fields + evidence', () => {
  const raw = `<BOOK_UNDERSTANDING>
WHOLE_BOOK_SUMMARY: 主角穿越大唐，经历四阶段成长
MAJOR_STORY_LINES:
- 立足
- 崭露头角
- 派系分化
- 顶点对决
KEY_TURNING_POINTS:
- 第一次反派出场
- 派系投诚
PROTAGONIST_ARC: 谨慎书生 → 大唐权臣
COVERAGE_NOTE: 全书 100 章均覆盖
EVIDENCE_REFS:
- 第1章：开篇
</BOOK_UNDERSTANDING>`
  const book = parseBookUnderstandingBlocks(raw)
  assert.equal(book.majorStoryLines.length, 4)
  assert.equal(book.evidenceRefs.length, 1)
})

test('parser locates EVIDENCE_REFS missing line correctly', () => {
  const raw = `\n\n\n\n<LEAD>\nNAME: 林昭\nREASON: 推断\n</LEAD>`
  try {
    parseLeadBlocks(raw)
    assert.fail('应当抛出 ParseError')
  } catch (error) {
    assert.ok(error instanceof ParseError)
    assert.ok(error.lineNumber > 0, `应当报告行号，实际为 ${error.lineNumber}`)
  }
})
