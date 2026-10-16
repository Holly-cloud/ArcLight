/**
 * asset-reextract handler 单测
 * - normalize：逐目标建议规范化，kind 缺省按 context.targets 兜底，无 id 建议丢弃，tags 过滤
 * - validate：至少 1 条且每条必须有 id + evidence
 * - buildPrompt：强调「仅基于给定片段」「建议不覆盖」「证据必须引用原文」
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import handler from './asset-reextract.ts'

function buildInput(overrides) {
  return {
    context: {
      projectId: 'project-a',
      projectGenre: '都市异能',
      targets: [
        { kind: 'character', id: 'c1', name: '林昭', currentFields: { description: '旧描述' } },
        { kind: 'scene', id: 's1', name: '临川城', currentFields: {} }
      ],
      novelSnippet: '林昭走出临川城城门。',
      ...(overrides?.context ?? {})
    },
    skills: [],
    capabilityPreamble: { system: '你是建议器。', user: '请给建议。' },
    skillsBlock: '',
    knowledgeBlock: ''
  }
}

test('asset-reextract normalize: 建议规范化、kind 兜底、无 id 丢弃', () => {
  const raw = JSON.stringify({
    suggestions: [
      {
        kind: 'character',
        id: 'c1',
        fields: { description: '临川城出身的少年剑修', tags: ['剑修', { label: '主角' }, '[object Object]'] },
        evidence: '原文：林昭走出临川城城门。'
      },
      { id: 's1', fields: { type: '城池' }, evidence: '原文片段引用' },
      { name: '缺 id', fields: {}, evidence: '证据' }
    ]
  })

  const result = handler.normalize(raw, buildInput().context)
  assert.equal(result.suggestions.length, 2)
  assert.equal(result.suggestions[0].fields.description, '临川城出身的少年剑修')
  assert.deepEqual(result.suggestions[0].fields.tags, ['剑修', '主角'])
  assert.equal(result.suggestions[1].kind, 'scene')
  assert.equal(result.suggestions[1].fields.type, '城池')
})

test('asset-reextract validate: 每条建议必须有 id 与 evidence', () => {
  const ok = handler.normalize(JSON.stringify({
    suggestions: [{ kind: 'character', id: 'c1', fields: { description: '新' }, evidence: '引用原句' }]
  }), buildInput().context)
  assert.equal(handler.validate(ok), true)

  const noEvidence = handler.normalize(JSON.stringify({
    suggestions: [{ kind: 'character', id: 'c1', fields: { description: '新' }, evidence: '' }]
  }), buildInput().context)
  assert.equal(handler.validate(noEvidence), false)

  const empty = handler.normalize(JSON.stringify({ suggestions: [] }), buildInput().context)
  assert.equal(handler.validate(empty), false)
})

test('asset-reextract buildPrompt: 仅基于片段、不覆盖、证据引用原文', () => {
  const prompt = handler.buildPrompt(buildInput())
  assert.ok(prompt.system.includes('建议'), 'system 应强调输出为建议')
  assert.ok(prompt.system.includes('不得声称已修改卡片'), 'system 应禁止覆盖用户内容')
  assert.ok(prompt.system.includes('evidence'), 'system 应要求证据')
  assert.ok(prompt.user.includes('原文片段（唯一依据）'), 'user 应标注片段为唯一依据')
  assert.ok(prompt.user.includes('林昭走出临川城城门'), 'user 应包含原文片段')
})
