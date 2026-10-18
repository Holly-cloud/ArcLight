/**
 * asset-visual-prompt handler 单测
 * - buildPrompt：以简介为核心依据、必须与原文片段一致、按类型覆盖视觉维度、固定段序输出
 * - buildPrompt：按资产类型自动匹配版式；显式 layoutId 与题材禁词注入
 * - buildPrompt：缺原文片段时给降级提示、缺简介时提示补充
 * - normalize：清洗代码块标记；validate：content 非空
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import handler from './asset-visual-prompt.ts'

function buildInput(overrides) {
  return {
    context: {
      kind: 'character',
      name: '林昭',
      typeLabel: '男主',
      tags: ['剑修', '少年'],
      description: '临川城出身的少年剑修，惯穿青灰布衣，左眼下一道旧疤。',
      novelSnippet: '林昭抬手时，左眼下的旧疤在灯下泛白。',
      projectStyle: { renderMode: 'anime', palette: ['青灰', '暖黄'], moodWords: ['清冷'] },
      ...(overrides?.context ?? {})
    },
    skills: [],
    capabilityPreamble: { system: '你是生成器。', user: '请生成。' },
    skillsBlock: '',
    knowledgeBlock: ''
  }
}

test('asset-visual-prompt buildPrompt: 简介为核心依据、片段为一致性依据、固定段序与版式', () => {
  const prompt = handler.buildPrompt(buildInput())
  assert.ok(prompt.system.includes('简介是核心生成依据'), 'system 应强调简介为核心依据')
  assert.ok(prompt.system.includes('以**原文为准**'), 'system 应规定冲突时以原文为准')
  assert.ok(prompt.system.includes('外貌与五官'), 'system 应列出角色视觉维度')
  assert.ok(prompt.system.includes('固定段序'), 'system 应要求固定段序输出')
  assert.ok(prompt.system.includes('【主体】'), 'system 应给出段标记')
  assert.ok(prompt.system.includes('不要输出这一段'), 'system 应声明「画面规格」不由模型生成')
  assert.ok(prompt.user.includes('临川城出身的少年剑修'), 'user 应包含简介')
  assert.ok(prompt.user.includes('左眼下的旧疤在灯下泛白'), 'user 应包含原文片段')
  assert.ok(prompt.user.includes('资产类型：角色'), 'user 应标注资产类型')
  assert.ok(prompt.user.includes('青灰'), 'user 应包含项目视觉风格')
  assert.ok(prompt.user.includes('角色三视图资产板'), '缺 layoutId 时按类型自动匹配角色三视图')
  assert.ok(prompt.user.includes('画面规格'), 'user 应给出画面规格（版式）')
})

test('asset-visual-prompt buildPrompt: 显式版式与题材禁词注入', () => {
  const scene = handler.buildPrompt(buildInput({
    context: { kind: 'scene', name: '临川城', projectGenre: '仙侠', layoutId: 'scene-nine-grid' }
  }))
  assert.ok(scene.user.includes('项目题材：仙侠'), 'user 应标注项目题材')
  assert.ok(scene.user.includes('场景九宫格'), 'user 应使用显式版式')
  assert.ok(scene.user.includes('禁现代元素'), '古代题材应注入时代禁词（A9）')

  const prop = handler.buildPrompt(buildInput({ context: { kind: 'prop', layoutId: '' } }))
  assert.ok(prop.user.includes('道具白底单件'), '空 layoutId 回退按类型匹配')

  const free = handler.buildPrompt(buildInput({ context: { layoutId: 'none', projectGenre: '都市' } }))
  assert.ok(free.user.includes('不套版式'), 'none 版式给出自由构图说明')
  assert.ok(free.user.includes('禁古代元素'), '现代题材注入反向时代禁词')
})

test('asset-visual-prompt buildPrompt: 缺原文片段时给降级提示、缺简介时提示补充', () => {
  const noSnippet = handler.buildPrompt(buildInput({ context: { novelSnippet: '' } }))
  assert.ok(noSnippet.user.includes('未提供原文片段'), 'user 应提示未提供片段')

  const noDesc = handler.buildPrompt(buildInput({ context: { description: '' } }))
  assert.ok(noDesc.user.includes('未填写简介'), 'user 应提示先补充简介')
})

test('asset-visual-prompt buildPrompt: 非角色类型用对应维度', () => {
  const scene = handler.buildPrompt(buildInput({ context: { kind: 'scene', name: '临川城' } }))
  assert.ok(scene.user.includes('资产类型：场景'), 'user 应标注场景类型')

  const prop = handler.buildPrompt(buildInput({ context: { kind: 'prop', name: '断剑' } }))
  assert.ok(prop.user.includes('资产类型：道具'), 'user 应标注道具类型')
})

test('asset-visual-prompt normalize/validate: 清洗代码块、content 非空才通过', () => {
  const cleaned = handler.normalize('```text\n少年剑修，青灰布衣。\n```')
  assert.equal(cleaned.content, '少年剑修，青灰布衣。')
  assert.equal(handler.validate(cleaned), true)

  assert.equal(handler.validate(handler.normalize('   ')), false)
})

test('asset-visual-prompt resolveMaxTokens: 返回正数上限', () => {
  const tokens = handler.resolveMaxTokens(buildInput())
  assert.equal(typeof tokens, 'number')
  assert.ok(tokens > 0)
})
