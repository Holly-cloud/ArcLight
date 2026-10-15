/**
 * adaptation-stage-map handler 单测（PRD T8 P1 留底）
 * - validate() 拒绝：缺 EVIDENCE_REFS
 * - validate() 拒绝：缺 STAGE 块
 * - validate() 通过：完整 STAGE + EVIDENCE_REFS
 * - buildPrompt fixture：包含主角不再识别 + 三遍扫描 passLabel
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import handler from './adaptation-stage-map.ts'

function buildInput(overrides) {
  return {
    context: {
      referenceTitle: '《测试源》',
      chapterManifest: JSON.stringify([{ id: 'chapter-1', number: 1, title: '第一章' }]),
      sourceText: '原文片段…',
      leadName: '林昭',
      ...(overrides?.context ?? {})
    },
    skills: [],
    capabilityPreamble: { system: '', user: '' },
    skillsBlock: '',
    knowledgeBlock: ''
  }
}

test('adaptation-stage-map validate: 含 STAGE 块 + EVIDENCE_REFS → 通过', () => {
  const raw = '<STAGE>\nTITLE: 初临大唐\nSOURCE_RANGE: 第1章至第30章\nGOAL: 站稳脚跟\nEVIDENCE_REFS:\n- 第1章：开篇\n</STAGE>'
  const result = handler.normalize(raw)
  assert.equal(handler.validate(result), true)
})

test('adaptation-stage-map validate: 缺 EVIDENCE_REFS → 拒绝', () => {
  const raw = '<STAGE>\nTITLE: 初临大唐\nSOURCE_RANGE: 第1章至第30章\nGOAL: 站稳脚跟\n</STAGE>'
  const result = handler.normalize(raw)
  assert.equal(handler.validate(result), false)
})

test('adaptation-stage-map validate: 无 STAGE 块 → 拒绝', () => {
  const result = handler.normalize('text without stage tag')
  assert.equal(handler.validate(result), false)
})

test('adaptation-stage-map buildPrompt: 包含 leadInstruction + passLabel', () => {
  const prompt = handler.buildPrompt(buildInput())
  assert.ok(prompt.system.includes('不要 JSON'), 'system 应禁止 JSON 外壳')
  assert.ok(prompt.system.includes('林昭'), 'system 应包含已确认主角名')
  assert.ok(prompt.user.includes('STAGE'), 'user 应包含 STAGE 协议')
  assert.ok(prompt.user.includes('BOOK_UNDERSTANDING') || prompt.user.includes('TONE'), '聚合模式应包含 TONE / BOOK_UNDERSTANDING')
})

test('adaptation-stage-map buildPrompt: adaptationChunkPass 时提示分块', () => {
  const prompt = handler.buildPrompt(buildInput({
    context: { adaptationChunkPass: true, adaptationChunkIndex: 1, adaptationChunkTotal: 3 }
  }))
  assert.ok(prompt.system.includes('分块 1/3'), 'passLabel 应含分块进度')
})
