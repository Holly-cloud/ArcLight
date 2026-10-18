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
    if (specifier.startsWith('@shared/')) {
      return nextResolve(new URL(`../../../../electron/shared/${specifier.slice(8)}.ts`, import.meta.url).href, context)
    }
    return nextResolve(specifier, context)
  }
})

const {
  composeAssetImagePrompt,
  compileAssetImagePrompt,
  recommendAspectRatio,
  resolveDefaultAspectRatio,
  resolveAssetPrompt,
  ASPECT_RATIO_OPTIONS
} = await import('./composeAssetImagePrompt.ts')
const { VISUAL_PROMPT_LAYOUTS, parseVisualPromptText, NEGATIVE_PROMPT_TITLE } = await import('../../../../electron/shared/visual-prompt.ts')

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
  assert.ok(composeAssetImagePrompt({ asset: named }).startsWith('断魂剑'), '仅有名称时以名称起头')
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

test('recommendAspectRatio：角色 / 场景 16:9、道具 1:1（缺省 1:1）', () => {
  assert.equal(recommendAspectRatio('character'), '16:9')
  assert.equal(recommendAspectRatio('scene'), '16:9')
  assert.equal(recommendAspectRatio('prop'), '1:1')
  assert.equal(recommendAspectRatio(undefined), '1:1')
  assert.ok(ASPECT_RATIO_OPTIONS.includes('auto'))
})

test('resolveDefaultAspectRatio：项目主风格优先，缺省回退推荐值', () => {
  assert.equal(resolveDefaultAspectRatio('character', null), '16:9', '无项目风格时用推荐值')
  assert.equal(resolveDefaultAspectRatio('prop', { defaultAspectRatio: '1:1' }), '1:1', '项目风格覆盖默认')
  assert.equal(resolveDefaultAspectRatio('character', { defaultAspectRatio: '3:4' }), '3:4', '项目合法值优先')
  assert.equal(resolveDefaultAspectRatio('scene', { defaultAspectRatio: 'not-a-ratio' }), '16:9', '非法值回退推荐值')
})

test('项目图片主风格注入渲染方式前缀', () => {
  const prompt = composeAssetImagePrompt({
    asset: characterAsset,
    projectStyle: { renderMode: 'realistic', palette: [], seasonPalette: [], lightingRules: '', moodWords: [] }
  })
  assert.ok(prompt.includes('项目渲染方式：realistic'), '应含项目渲染方式')
})

test('resolveAssetPrompt：优先资产视觉提示词（尾部带负向词），为空时回退拼装', () => {
  const withPrompt = { ...characterAsset, visualPrompt: '少年剑客，青灰布衣，左眼旧疤。' }
  const compiled = resolveAssetPrompt(withPrompt, null)
  assert.ok(compiled.startsWith('少年剑客，青灰布衣，左眼旧疤。'), '旧纯文本原样作为正文')
  assert.ok(compiled.includes(`${NEGATIVE_PROMPT_TITLE}：`), '尾部带独立负向词')
  assert.ok(compiled.includes('可读文字'), '含 A13 默认负向词')

  const blank = { ...characterAsset, visualPrompt: '   ' }
  const fallback = resolveAssetPrompt(blank, null)
  assert.ok(fallback.startsWith(composeAssetImagePrompt({ asset: characterAsset })), '空白提示词回退拼装')
  assert.ok(fallback.includes('不改变用户指定的主体与构图'), '回退拼装含 A3 尾巴')
  assert.ok(fallback.includes(`${NEGATIVE_PROMPT_TITLE}：`), '回退拼装也带负向词')

  assert.equal(resolveAssetPrompt(null, null), '资产配图', '无资产回退默认文案且不追加负向词')
})

test('composeAssetImagePrompt：有实质内容时追加 A3/A4 尾巴，全空不加', () => {
  const prompt = composeAssetImagePrompt({ asset: characterAsset })
  assert.ok(prompt.includes('不改变用户指定的主体与构图'), '含 A3 风格层解耦尾巴')
  assert.ok(prompt.includes('不生效'), '含 A4 媒介硬锁说明')
  assert.ok(prompt.indexOf('标签：') < prompt.indexOf('不改变用户指定的主体与构图'), '尾巴追加在资产段之后')

  const emptyWithNote = composeAssetImagePrompt({ asset: null, userNote: '只写一句说明' })
  assert.equal(emptyWithNote, '只写一句说明', '无实质内容时不追加尾巴')
})

test('compileAssetImagePrompt：分节文档按固定段序渲染并带负向词', () => {
  const doc = parseVisualPromptText(
    '【主体】少年剑客\n【服装或结构】青灰布衣',
    'character-base-sheet',
    'character',
    '仙侠'
  )
  const compiled = compileAssetImagePrompt({ asset: { ...characterAsset, visualPrompt: doc } })
  assert.ok(compiled.includes('【画面规格】'), '首段为画面规格')
  assert.ok(compiled.includes('【主体】少年剑客'), '主体段归位')
  assert.ok(compiled.indexOf('【画面规格】') < compiled.indexOf('【主体】'), '段序固定')
  assert.ok(compiled.includes(`${NEGATIVE_PROMPT_TITLE}：`), '带独立负向词')
  assert.ok(compiled.includes('禁现代元素'), '按题材注入时代禁词（A9）')
})

test('compileAssetImagePrompt：文档自带负向词优先于默认负向词', () => {
  const doc = { v: 1, layout: 'prop-white-bg', sections: { spec: VISUAL_PROMPT_LAYOUTS['prop-white-bg'].spec, subject: '断魂剑', costume: '', material: '', lighting: '' }, negativePrompt: '不要出现剑鞘' }
  const compiled = compileAssetImagePrompt({ asset: { ...characterAsset, kind: 'prop', visualPrompt: doc } })
  assert.ok(compiled.includes('不要出现剑鞘'), '采用文档自带负向词')
  assert.ok(!compiled.includes('可读文字'), '不重复叠加默认负向词')
})

