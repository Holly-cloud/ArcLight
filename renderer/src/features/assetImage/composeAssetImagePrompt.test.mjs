/**
 * v1.33.0 资产图库「提示词组装」单测（纯函数，无网络）
 * 运行方式：
 *   set ELECTRON_RUN_AS_NODE=1&& electron --test renderer/src/features/assetImage/composeAssetImagePrompt.test.mjs
 * 注：用 node:module 的 registerHooks 解析 @/ 别名（参考 features/help/types.test.mjs 范式）
 */
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      return nextResolve(new URL(`../../${specifier.slice(2)}.ts`, import.meta.url).href, context)
    }
    return nextResolve(specifier, context)
  }
})

const { composeAssetImagePrompt, recommendAspectRatio, ASPECT_RATIO_OPTIONS } = await import('./composeAssetImagePrompt.ts')

const characterAsset = {
  kind: 'character',
  name: '李雷',
  typeLabel: '男主',
  description: '冷静的剑客',
  tags: ['热血', '主角'],
  renderMode: 'anime',
  palette: ['#112233', '#445566'],
  moodWords: ['冷峻'],
  keyReferences: ['长发'],
  lightingNote: '',
  seasonNote: '',
  materialityNote: ''
}

test('角色资产：视觉字段被拼进提示词（名称 · 定位 / 渲染方式 / 配色 / 氛围词 / 标签）', () => {
  const prompt = composeAssetImagePrompt({ asset: characterAsset })
  assert.ok(prompt.includes('李雷 · 男主'), '应含「名称 · 定位」标题行')
  assert.ok(prompt.includes('渲染方式：anime'), '应含渲染方式')
  assert.ok(prompt.includes('配色：'), '应含配色')
  assert.ok(prompt.includes('氛围词：冷峻'), '应含氛围词')
  assert.ok(prompt.includes('标签：热血 / 主角'), '应含标签行')
})

test('项目级视觉风格注入前缀（配色 / 季相 / 光影 / 氛围词）', () => {
  const prompt = composeAssetImagePrompt({
    asset: characterAsset,
    projectStyle: {
      palette: ['#000000'],
      seasonPalette: ['冬'],
      lightingRules: '强侧光',
      moodWords: ['史诗']
    }
  })
  assert.ok(prompt.includes('项目配色：'), '应含项目配色')
  assert.ok(prompt.includes('项目季相色板：冬'), '应含季相色板')
  assert.ok(prompt.includes('项目光影规则：强侧光'), '应含光影规则')
  assert.ok(prompt.includes('项目氛围词：史诗'), '应含项目氛围词')
  // 项目段在资产段之前
  assert.ok(prompt.indexOf('项目配色：') < prompt.indexOf('李雷 · 男主'))
})

test('用户附加说明追加在末尾', () => {
  const prompt = composeAssetImagePrompt({ asset: characterAsset, userNote: '换一身黑色礼服' })
  assert.ok(prompt.trimEnd().endsWith('换一身黑色礼服'))
})

test('空视觉字段 / 空输入一律兜底，不抛错', () => {
  const empty = {
    kind: 'prop',
    name: '',
    typeLabel: '',
    description: '',
    tags: [],
    renderMode: '',
    palette: [],
    moodWords: [],
    keyReferences: [],
    lightingNote: '',
    seasonNote: '',
    materialityNote: ''
  }
  assert.equal(composeAssetImagePrompt({ asset: empty }), '资产配图', '全空回退默认文案')
  assert.equal(composeAssetImagePrompt({}), '资产配图', '无资产回退默认文案')
  const named = { ...empty, name: '断魂剑' }
  assert.equal(composeAssetImagePrompt({ asset: named }), '断魂剑', '仅有名称时用名称')
})

test('场景资产：场景视觉上下文映射（光影 / 季相 / 材质 / 配色）', () => {
  const scene = {
    kind: 'scene',
    name: '云顶城',
    typeLabel: '城市',
    description: '高空之城',
    tags: [],
    renderMode: '',
    palette: ['#223344'],
    moodWords: [],
    keyReferences: [],
    lightingNote: '晨雾',
    seasonNote: '春',
    materialityNote: '石材'
  }
  const prompt = composeAssetImagePrompt({ asset: scene })
  assert.ok(prompt.includes('光影：晨雾'))
  assert.ok(prompt.includes('季相：春'))
  assert.ok(prompt.includes('材质：石材'))
})

test('recommendAspectRatio：角色 3:4 / 场景 16:9 / 道具 1:1（缺省 1:1）', () => {
  assert.equal(recommendAspectRatio('character'), '3:4')
  assert.equal(recommendAspectRatio('scene'), '16:9')
  assert.equal(recommendAspectRatio('prop'), '1:1')
  assert.equal(recommendAspectRatio(undefined), '1:1')
  assert.ok(ASPECT_RATIO_OPTIONS.includes('auto'))
})
