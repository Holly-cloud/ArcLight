/**
 * adaptation-lead-identify handler 单测（PRD T8 P1 留底）
 * - validate() 拒绝：缺 EVIDENCE_REFS 整批拒收
 * - validate() 拒绝：缺 LEAD 块
 * - validate() 通过：完整 LEAD + EVIDENCE_REFS
 * - buildPrompt fixture：system / user 文案包含关键约束
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import handler from './adaptation-lead-identify.ts'

function buildInput(overrides) {
  return {
    context: {
      referenceTitle: '《测试源》',
      chapterManifest: JSON.stringify([{ id: 'chapter-1', number: 1, title: '第一章' }]),
      sourceText: '林昭走出大唐城门，迎面走来一位书生。',
      ...(overrides?.context ?? {})
    },
    skills: [],
    capabilityPreamble: { system: '你是拆书主编。', user: '请列出候选。' },
    skillsBlock: '',
    knowledgeBlock: ''
  }
}

test('adaptation-lead-identify validate: 含 LEAD 块 + EVIDENCE_REFS → 通过', () => {
  const raw = '<LEAD>\nNAME: 林昭\nROLE: male-lead\nCONFIDENCE: 0.8\nREASON: 推断\nEVIDENCE_REFS:\n- 第1章：开篇主角\n</LEAD>'
  const result = handler.normalize(raw)
  assert.equal(handler.validate(result), true)
})

test('adaptation-lead-identify validate: 缺 EVIDENCE_REFS → 拒绝', () => {
  const raw = '<LEAD>\nNAME: 林昭\nROLE: male-lead\nREASON: 推断\n</LEAD>'
  const result = handler.normalize(raw)
  assert.equal(handler.validate(result), false)
})

test('adaptation-lead-identify validate: 无 LEAD 块 → 拒绝', () => {
  const raw = 'some random text without tags'
  const result = handler.normalize(raw)
  assert.equal(handler.validate(result), false)
})

test('adaptation-lead-identify buildPrompt: 包含反 JSON 与原文证据约束', () => {
  const prompt = handler.buildPrompt(buildInput())
  assert.ok(prompt.system.includes('不要 JSON'), 'system 应禁止 JSON 外壳')
  assert.ok(prompt.system.includes('不得凭套路补造人物'), 'system 应禁止凭套路造人物')
  assert.ok(prompt.user.includes('EVIDENCE_REFS'), 'user 应输出 EVIDENCE_REFS 协议')
  assert.ok(prompt.user.includes('《测试源》'), 'user 应包含参考作品标题')
})
