/**
 * adaptation-tone-profile handler 单测（PRD T8 P1 留底）
 * - validate() 拒绝：缺三刻度数值或 EVIDENCE_REFS
 * - validate() 通过：完整 TONE 块
 * - buildPrompt fixture：包含数值刻度字段名
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import handler from './adaptation-tone-profile.ts'

function buildInput() {
  return {
    context: {
      referenceTitle: '《测试源》',
      chapterManifest: JSON.stringify([]),
      sourceText: '原文片段…'
    },
    skills: [],
    capabilityPreamble: { system: '', user: '' },
    skillsBlock: '',
    knowledgeBlock: ''
  }
}

test('adaptation-tone-profile validate: 含 TONE + 三刻度 + EVIDENCE_REFS → 通过', () => {
  const raw = '<TONE>\nCORE_TONE: 冷峻克制\nHUMOR_LEVEL: 20\nROMANCE_LEVEL: 30\nDARKNESS_LEVEL: 70\nEVIDENCE_REFS:\n- 第1章：基调\n</TONE>'
  const result = handler.normalize(raw)
  assert.equal(handler.validate(result), true)
})

test('adaptation-tone-profile validate: 缺 TONE 块 → 拒绝', () => {
  const result = handler.normalize('text without tone')
  assert.equal(handler.validate(result), false)
})

test('adaptation-tone-profile buildPrompt: 包含三刻度字段名', () => {
  const prompt = handler.buildPrompt(buildInput())
  assert.ok(prompt.system.includes('不要 JSON'), 'system 应禁止 JSON 外壳')
  assert.ok(prompt.user.includes('HUMOR_LEVEL'), 'user 应输出 HUMOR_LEVEL 字段')
  assert.ok(prompt.user.includes('ROMANCE_LEVEL'), 'user 应输出 ROMANCE_LEVEL 字段')
  assert.ok(prompt.user.includes('DARKNESS_LEVEL'), 'user 应输出 DARKNESS_LEVEL 字段')
})
