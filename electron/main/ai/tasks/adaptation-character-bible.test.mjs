/**
 * adaptation-character-bible handler 单测（PRD T8 P1 留底）
 * - validate() 拒绝：缺 NAME 或 EVIDENCE_REFS
 * - validate() 通过：完整 CHARACTER 块
 * - buildPrompt fixture：包含合并建议硬约束（"只能作为建议"）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import handler from './adaptation-character-bible.ts'

function buildInput() {
  return {
    context: {
      referenceTitle: '《测试源》',
      chapterManifest: JSON.stringify([]),
      sourceText: '原文片段…',
      lead: { name: '林昭', userNote: '穿越者' }
    },
    skills: [],
    capabilityPreamble: { system: '', user: '' },
    skillsBlock: '',
    knowledgeBlock: ''
  }
}

test('adaptation-character-bible validate: 含 CHARACTER 块 + NAME + EVIDENCE_REFS → 通过', () => {
  const raw = '<CHARACTER>\nNAME: 林昭\nIDENTITY: 穿越者\nEVIDENCE_REFS:\n- 第1章：开篇\n</CHARACTER>'
  const result = handler.normalize(raw)
  assert.equal(handler.validate(result), true)
})

test('adaptation-character-bible validate: 无 CHARACTER 块 → 拒绝', () => {
  const result = handler.normalize('text without character')
  assert.equal(handler.validate(result), false)
})

test('adaptation-character-bible buildPrompt: 包含合并"只能作为建议"硬约束', () => {
  const prompt = handler.buildPrompt(buildInput())
  assert.ok(prompt.system.includes('不要 JSON'), 'system 应禁止 JSON 外壳')
  assert.ok(prompt.system.includes('合并只能作为建议'), 'system 应包含合并硬约束')
  assert.ok(prompt.system.includes('戏剧功能'), 'system 应说明合并首要标准')
  assert.ok(prompt.user.includes('CHARACTER'), 'user 应输出 CHARACTER 协议')
})
