/**
 * novel-split-locate handler 单测
 * - normalize：非整数 / 负数 / 非数字剔除，去重升序
 * - validate：chapters 非空且均为有限整数
 * - buildPrompt：候选行以 { i, t } 注入、只返回 JSON 约定
 * - resolveMaxTokens：随候选数增长并封顶 4096
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import handler from './novel-split-locate.ts'

function buildInput(overrides) {
  return {
    context: {
      projectId: 'project-a',
      projectTitle: '测试小说',
      candidates: [
        { index: 12, text: '第1话 开端' },
        { index: 40, text: '第2话 重逢' }
      ],
      ...(overrides?.context ?? {})
    },
    skills: [],
    capabilityPreamble: { system: '你是定位器。', user: '请定位。' },
    skillsBlock: '',
    knowledgeBlock: ''
  }
}

test('novel-split-locate normalize：非整数剔除、去重升序', () => {
  const raw = JSON.stringify({ chapters: [40, 12, 12, 'x', 3.5, -1], volumes: [7, 7, null] })

  const result = handler.normalize(raw, buildInput().context)
  assert.deepEqual(result.chapters, [12, 40])
  assert.deepEqual(result.volumes, [7])
})

test('novel-split-locate validate：chapters 非空且均为有限整数', () => {
  assert.equal(handler.validate({ chapters: [], volumes: [] }), false)
  assert.equal(handler.validate({ chapters: [1], volumes: [] }), true)

  const nonInteger = handler.normalize(JSON.stringify({ chapters: ['a'], volumes: [] }))
  assert.equal(handler.validate(nonInteger), false)
})

test('novel-split-locate buildPrompt：注入候选行、只返回 JSON', () => {
  const prompt = handler.buildPrompt(buildInput())
  assert.ok(prompt.system.includes('只返回 JSON'), 'system 应约定只返回 JSON')
  assert.ok(prompt.system.includes('chapters'), 'system 应说明 chapters')
  assert.ok(prompt.user.includes('"i":12'), 'user 应注入候选行号')
  assert.ok(prompt.user.includes('第1话 开端'), 'user 应注入候选行预览')
  assert.ok(prompt.user.includes('测试小说'), 'user 应包含项目名')
})

test('novel-split-locate resolveMaxTokens：随候选数增长并封顶 4096', () => {
  assert.equal(handler.resolveMaxTokens(buildInput()), Math.min(4096, 1024 + 2 * 2))

  const many = buildInput({ context: { candidates: Array.from({ length: 5000 }, () => ({})) } })
  assert.equal(handler.resolveMaxTokens(many), 4096)
})
