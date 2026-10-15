/**
 * adaptation-plot-cards handler 单测（PRD T8 P1 留底）
 * - validate() 拒绝：缺 TITLE / SYNOPSIS
 * - validate() 通过：完整 CARD 块
 * - buildPrompt fixture：包含因果强制 + 反抄原文
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import handler from './adaptation-plot-cards.ts'

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

test('adaptation-plot-cards validate: 含 CARD + TITLE + SYNOPSIS → 通过', () => {
  const raw = '<CARD>\nTITLE: 初临大唐\nSYNOPSIS: 主角陷入危机\nEVIDENCE_REFS:\n- 第1章：开篇\n</CARD>'
  const result = handler.normalize(raw)
  assert.equal(handler.validate(result), true)
})

test('adaptation-plot-cards validate: 缺 CARD 块 → 拒绝', () => {
  const result = handler.normalize('text without card')
  assert.equal(handler.validate(result), false)
})

test('adaptation-plot-cards buildPrompt: 包含因果强制与反抄原文', () => {
  const prompt = handler.buildPrompt(buildInput())
  assert.ok(prompt.system.includes('不要 JSON'), 'system 应禁止 JSON 外壳')
  assert.ok(prompt.system.includes('主角目标'), 'system 应包含主角因果链')
  assert.ok(prompt.system.includes('不复制连续原文') || prompt.system.includes('原文未明确'),
    'system 应包含反抄原文约束')
  assert.ok(prompt.user.includes('CARD'), 'user 应输出 CARD 协议')
})

test('adaptation-plot-cards buildPrompt: focusStage 注入', () => {
  const input = buildInput()
  input.context.focusStage = { id: 'stage-1', index: 0, title: '初临大唐', start: 1, end: 30 }
  const prompt = handler.buildPrompt(input)
  assert.ok(prompt.system.includes('只处理阶段 0'), 'focusStage 应注入 system 提示')
})
