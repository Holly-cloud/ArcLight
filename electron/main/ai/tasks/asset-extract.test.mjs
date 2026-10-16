/**
 * asset-extract handler 单测
 * - normalize：容忍字段缺失，缺 name / 缺 evidence 的条目逐条剔除，过滤 tags 中的对象项与 [object Object]，读出 evidence
 * - validate：逐条剔除无证据候选后，剩余至少 1 条有证据实体即通过
 * - buildPrompt：只提取实际登场 + 强制证据 的约束、existingNames 避重
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import handler from './asset-extract.ts'

function buildInput(overrides) {
  return {
    context: {
      projectId: 'project-a',
      projectTitle: '测试项目',
      projectGenre: '都市异能',
      novelText: '林昭走进临川城，腰间挂着青锋剑。',
      existingNames: { characters: ['苏卿'], scenes: [], props: [] },
      ...(overrides?.context ?? {})
    },
    skills: [],
    capabilityPreamble: { system: '你是提取器。', user: '请提取实体。' },
    skillsBlock: '',
    knowledgeBlock: ''
  }
}

test('asset-extract normalize: 缺 name / 缺 evidence 的条目逐条剔除，tags 过滤对象项与 [object Object]，读出 evidence', () => {
  const raw = JSON.stringify({
    characters: [
      { name: '林昭', role: '主角', description: '少年剑修', tags: ['剑修', { label: '主角' }, '[object Object]'], evidence: '  林昭走进临川城。  ' },
      { name: '无名无证', role: '路人' },
      { role: '缺名字', evidence: '仅被提及' }
    ],
    scenes: [{ name: '临川城', type: '城池', description: '边境重镇', tags: [], evidence: '林昭走进临川城。' }],
    props: [
      { name: '青锋剑', type: '兵器', description: '原文未明确', tags: ['佩剑'] },
      { name: '断剑', type: '兵器', description: '残破兵器', tags: [], evidence: '  断剑插在地上。  ' }
    ]
  })

  const result = handler.normalize(raw)
  assert.deepEqual(result.characters.map((item) => item.name), ['林昭'])
  assert.deepEqual(result.characters[0].tags, ['剑修', '主角'])
  assert.equal(result.characters[0].evidence, '林昭走进临川城。')
  assert.equal(result.scenes[0].type, '城池')
  assert.equal(result.scenes[0].evidence, '林昭走进临川城。')
  // 缺 evidence 的「青锋剑」被逐条剔除，仅保留有证据的「断剑」
  assert.deepEqual(result.props.map((item) => item.name), ['断剑'])
  assert.equal(result.props[0].description, '残破兵器')
  assert.equal(result.props[0].evidence, '断剑插在地上。')
})

test('asset-extract validate: 剔除无证据候选后剩余至少 1 条即通过，全部无证据则失败', () => {
  const ok = handler.normalize(JSON.stringify({
    characters: [
      { name: '林昭', role: '主角', description: '少年剑修', tags: [], evidence: '林昭走进临川城。' },
      { name: '仅被提及者', role: '路人', description: '', tags: [] }
    ],
    scenes: [],
    props: []
  }))
  assert.equal(handler.validate(ok), true, '缺证据条目被剔除后，剩余有证据条目即通过')

  const empty = handler.normalize(JSON.stringify({ characters: [], scenes: [], props: [] }))
  assert.equal(handler.validate(empty), false)
  assert.ok(
    handler.describeValidationErrors(empty).some((message) => message.includes('有证据')),
    '无剩余时应提示「本批未提取到有证据的实体」'
  )

  const onlyNoEvidence = handler.normalize(JSON.stringify({
    characters: [{ name: '林昭', role: '主角', description: '少年剑修', tags: [] }],
    scenes: [],
    props: []
  }))
  assert.equal(handler.validate(onlyNoEvidence), false, '全部缺证据→逐条剔除后为空→不合格')
})

test('asset-extract buildPrompt: 只提取实际登场、强制证据、避重与原文注入', () => {
  const prompt = handler.buildPrompt(buildInput())
  assert.ok(prompt.system.includes('只返回 JSON'), 'system 应要求只返回 JSON')
  assert.ok(prompt.system.includes('猜测补造实体'), 'system 应禁止编造实体')
  assert.ok(prompt.system.includes('确有出场'), 'system 应强调只提取实际登场')
  assert.ok(prompt.system.includes('evidence'), 'system 应要求提供出场证据')
  assert.ok(prompt.system.includes('原文未明确'), 'system 应给出合法"不知道"出口')
  assert.ok(prompt.user.includes('已有实体名称（严格避重）'), 'user 应提示避重')
  assert.ok(prompt.user.includes('苏卿'), 'user 应包含已有实体名单')
  assert.ok(prompt.user.includes('林昭走进临川城'), 'user 应包含原文片段')
})
