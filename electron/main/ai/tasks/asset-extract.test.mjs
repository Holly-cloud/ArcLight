/**
 * asset-extract handler 单测
 * - normalize：容忍字段缺失，缺 name / 缺 evidence 的条目逐条剔除，过滤 tags 中的对象项与 [object Object]，读出 evidence
 * - validate：逐条剔除无证据候选后，剩余至少 1 条有证据实体即通过
 * - buildPrompt：只提取实际登场 + 强制证据 的约束、existingNames 避重
 * - v1.36.1（#10）：视觉提示词配额——配额>0 才要字段；normalize 按配额剥除超出条目并截断超长
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

test('asset-extract targetKind: normalize 只保留该类（其余置空），prompt 声明本次只提取该类', () => {
  const raw = JSON.stringify({
    characters: [{ name: '林昭', role: '主角', description: '', tags: [], evidence: '林昭走进临川城。' }],
    scenes: [{ name: '临川城', type: '城池', description: '', tags: [], evidence: '林昭走进临川城。' }],
    props: [{ name: '断剑', type: '兵器', description: '', tags: [], evidence: '断剑插在地上。' }]
  })

  const characterOnly = handler.normalize(raw, { targetKind: 'character' })
  assert.equal(characterOnly.characters.length, 1)
  assert.equal(characterOnly.scenes.length, 0, '非目标类的场景应被置空')
  assert.equal(characterOnly.props.length, 0, '非目标类的道具应被置空')

  const propOnly = handler.normalize(raw, { targetKind: 'prop' })
  assert.equal(propOnly.characters.length, 0)
  assert.equal(propOnly.scenes.length, 0)
  assert.equal(propOnly.props.length, 1)

  const unscoped = handler.normalize(raw)
  assert.equal(unscoped.characters.length, 1, '未传 targetKind 时保留三类（向后兼容）')
  assert.equal(unscoped.scenes.length, 1)
  assert.equal(unscoped.props.length, 1)

  const prompt = handler.buildPrompt(buildInput({ context: { targetKind: 'prop' } }))
  assert.ok(prompt.system.includes('只提取道具'), 'system 应声明本次只提取指定类别')
})

test('asset-extract v1.36.1：配额缺省时不要求 visualPrompt（旧行为零变化）', () => {
  const prompt = handler.buildPrompt(buildInput())
  assert.ok(!prompt.system.includes('visualPrompt'), 'system 不应出现 visualPrompt 契约')
  assert.ok(!prompt.system.includes('视觉提示词初稿'), 'system 不应出现视觉提示词说明')
  assert.ok(!prompt.user.includes('视觉提示词初稿'), 'user 不应出现视觉提示词配额行')

  const raw = JSON.stringify({
    characters: [{ name: '林昭', role: '主角', description: '', tags: [], evidence: '林昭走进临川城。', visualPrompt: '【主体】少年剑修' }],
    scenes: [],
    props: []
  })
  const result = handler.normalize(raw)
  assert.equal(result.characters[0].visualPrompt, undefined, '未要求时即便模型给了也剥除（保证与旧版一致）')
})

test('asset-extract v1.36.1：配额>0 时契约要求 visualPrompt，并按「角色→场景→道具」顺序限量', () => {
  const prompt = handler.buildPrompt(buildInput({ context: { visualPromptQuota: 2 } }))
  assert.ok(prompt.system.includes('visualPrompt'), 'system 应把 visualPrompt 写进 JSON 契约')
  assert.ok(prompt.system.includes('前 2 条'), 'system 应声明只对前 2 条产出')
  assert.ok(prompt.system.includes('不要输出「画面规格」段'), 'system 应声明画面规格由系统给定')
  assert.ok(prompt.user.includes('前 2 条'), 'user 应给出配额说明')
  assert.ok(
    handler.resolveMaxTokens(buildInput({ context: { visualPromptQuota: 2 } })) > handler.resolveMaxTokens(buildInput()),
    '配额>0 时 token 预算应增加'
  )

  const raw = JSON.stringify({
    characters: [
      { name: '甲', role: '主角', description: '', tags: [], evidence: '甲出场。', visualPrompt: '【主体】甲' },
      { name: '乙', role: '配角', description: '', tags: [], evidence: '乙出场。', visualPrompt: '【主体】乙' }
    ],
    scenes: [{ name: '丙城', type: '城池', description: '', tags: [], evidence: '丙城出现。', visualPrompt: '【主体】丙城' }],
    props: [{ name: '丁剑', type: '兵器', description: '', tags: [], evidence: '丁剑出现。', visualPrompt: '【主体】丁剑' }]
  })

  const limited = handler.normalize(raw, { visualPromptQuota: 2 })
  assert.equal(limited.characters[0].visualPrompt, '【主体】甲', '第 1 条保留')
  assert.equal(limited.characters[1].visualPrompt, '【主体】乙', '第 2 条（角色类内）保留')
  assert.equal(limited.scenes[0].visualPrompt, undefined, '超出配额（场景类）应被剥除')
  assert.equal(limited.props[0].visualPrompt, undefined, '超出配额（道具类）应被剥除')

  const unlimited = handler.normalize(raw, { visualPromptQuota: 9 })
  assert.equal(unlimited.scenes[0].visualPrompt, '【主体】丙城', '配额充足时三类均保留')

  const long = handler.normalize(JSON.stringify({
    characters: [{ name: '甲', role: '主角', description: '', tags: [], evidence: '甲出场。', visualPrompt: '长'.repeat(700) }],
    scenes: [],
    props: []
  }), { visualPromptQuota: 1 })
  assert.equal(long.characters[0].visualPrompt.length, 600, '超长初稿应截断到上限')
})
