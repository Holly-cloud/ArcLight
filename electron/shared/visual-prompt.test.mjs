/**
 * v1.36.0「版式型视觉提示词」共享契约与模板单测（纯函数，无 IO / 无网络）
 * 运行方式：
 *   set ELECTRON_RUN_AS_NODE=1&& electron --test electron/shared/visual-prompt.test.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  VISUAL_PROMPT_SECTION_ORDER,
  VISUAL_PROMPT_SECTION_TITLES,
  VISUAL_PROMPT_MARKERS,
  VISUAL_PROMPT_LAYOUTS,
  VISUAL_PROMPT_LAYOUT_ORDER,
  STYLE_DECOUPLE_TAIL,
  MEDIA_LOCK_NOTE,
  DEFAULT_NEGATIVE_BASE,
  layoutsForKind,
  defaultLayoutForKind,
  normalizeKind,
  normalizeLayoutId,
  layoutSpec,
  genreNegativeWords,
  defaultNegativePrompt,
  normalizeVisualPromptValue,
  toVisualPromptDocument,
  createDocumentForLayout,
  parseVisualPromptText,
  renderVisualPromptDocument,
  mergeNegativePrompts,
  isEmptyDocument
} from './visual-prompt.ts'

test('段序与标题：固定顺序、标题单一来源、标记齐全', () => {
  assert.deepEqual([...VISUAL_PROMPT_SECTION_ORDER], ['spec', 'subject', 'costume', 'material', 'lighting'])
  assert.equal(VISUAL_PROMPT_SECTION_TITLES.spec, '画面规格')
  assert.equal(VISUAL_PROMPT_SECTION_TITLES.costume, '服装或结构')
  assert.equal(VISUAL_PROMPT_MARKERS.negative, '【负面提示词】')
  for (const key of VISUAL_PROMPT_SECTION_ORDER) {
    assert.ok(VISUAL_PROMPT_MARKERS[key].startsWith('【'), `标记缺失：${key}`)
    assert.ok(VISUAL_PROMPT_LAYOUTS.none.spec === '', 'none 版式无画面规格')
  }
  assert.equal(VISUAL_PROMPT_LAYOUT_ORDER.length, 6)
})

test('版式匹配：角色三视图 / 场景四宫格（可切九宫格与群像）/ 道具白底', () => {
  assert.equal(defaultLayoutForKind('character'), 'character-base-sheet')
  assert.equal(defaultLayoutForKind('scene'), 'scene-four-view')
  assert.equal(defaultLayoutForKind('prop'), 'prop-white-bg')

  const sceneLayouts = layoutsForKind('scene').map((layout) => layout.id)
  assert.deepEqual(sceneLayouts, ['scene-four-view', 'scene-nine-grid', 'group-sheet', 'none'])

  const charLayouts = layoutsForKind('character').map((layout) => layout.id)
  assert.deepEqual(charLayouts, ['character-base-sheet', 'none'])

  assert.equal(normalizeKind('scene'), 'scene')
  assert.equal(normalizeKind('未知'), 'character')
  assert.equal(normalizeLayoutId('不存在'), 'none')
  assert.equal(normalizeLayoutId('scene-nine-grid'), 'scene-nine-grid')
})

test('版式模板：三视图含基准形象继承语义（A7），四宫格/九宫格含固定机位', () => {
  const sheet = layoutSpec('character-base-sheet')
  assert.ok(sheet.includes('纯白无缝背景'), '三视图应含纯白背景')
  assert.ok(sheet.includes('只能继承并引用这一基准形象'), '三视图应含基准形象继承语义')
  assert.ok(sheet.includes('缺头部的全身微侧'), '三视图应含左侧缺头全身微侧')

  const four = layoutSpec('scene-four-view')
  assert.ok(four.includes('鸟瞰总览'), '四宫格应含四个机位名')
  assert.ok(four.includes('无人出现'), '四宫格应为空场景')

  const nine = layoutSpec('scene-nine-grid')
  assert.ok(nine.includes('跟拍路径'), '九宫格应含固定 8 号镜头')
  assert.ok(nine.includes('固定顺序'), '九宫格应强调固定顺序')

  assert.equal(layoutSpec('prop-white-bg').includes('纯白或均匀浅灰无缝背景'), true)
  assert.equal(layoutSpec('none'), '')
})

test('默认负向词：恒含 A13，题材派生 A9', () => {
  const base = defaultNegativePrompt('character', '')
  assert.ok(base.includes(DEFAULT_NEGATIVE_BASE), '恒含全域负向词')
  assert.ok(base.includes('可读文字'), '应禁可读文字')

  const xianxia = defaultNegativePrompt('character', '仙侠')
  assert.ok(xianxia.includes('禁现代元素'), '古代题材应禁现代元素')
  assert.ok(xianxia.includes('牛仔'), '古代题材禁词应含牛仔')

  const urban = defaultNegativePrompt('character', '都市异能')
  assert.ok(urban.includes('禁古代元素'), '现代题材应禁古代元素')

  assert.deepEqual(genreNegativeWords('意识流'), [], '未命中题材返回空')
  assert.deepEqual(genreNegativeWords(''), [])
})

test('mergeNegativePrompts：按逗号 / 分号切分去重并统一分隔符', () => {
  assert.equal(mergeNegativePrompts('不要文字，水印', '水印；不要 Logo'), '不要文字；水印；不要 Logo')
  assert.equal(mergeNegativePrompts('', DEFAULT_NEGATIVE_BASE), DEFAULT_NEGATIVE_BASE)
  assert.equal(mergeNegativePrompts('', ''), '')
})

test('编译期尾巴常量（A3 / A4）存在且非空', () => {
  assert.ok(STYLE_DECOUPLE_TAIL.includes('不改变用户指定的主体与构图'))
  assert.ok(MEDIA_LOCK_NOTE.includes('不生效'))
})

test('normalizeVisualPromptValue：旧字符串保留、空串记 null、对象收敛', () => {
  assert.equal(normalizeVisualPromptValue('  少年剑客  '), '少年剑客')
  assert.equal(normalizeVisualPromptValue('   '), null)
  assert.equal(normalizeVisualPromptValue(null), null)
  assert.equal(normalizeVisualPromptValue(undefined), null)
  assert.equal(normalizeVisualPromptValue(123), null)

  const doc = normalizeVisualPromptValue({ layout: 'character-base-sheet', sections: { subject: '少年剑客' }, negativePrompt: '' })
  assert.ok(doc && typeof doc === 'object')
  assert.equal(doc.layout, 'character-base-sheet')
  assert.equal(doc.sections.subject, '少年剑客')
  assert.equal(doc.sections.spec, '', '未显式给 spec 时不自动补模板（归一不等同于新建）')

  assert.equal(normalizeVisualPromptValue({ layout: 'none', sections: {}, negativePrompt: '' }), null, '内容全空记 null')
})

test('toVisualPromptDocument：旧纯文本整段落入「主体」且画面规格取模板', () => {
  const doc = toVisualPromptDocument('少年剑客，青灰布衣，左眼旧疤。', 'character-base-sheet', '仙侠')
  assert.ok(doc)
  assert.equal(doc.layout, 'character-base-sheet')
  assert.equal(doc.sections.subject, '少年剑客，青灰布衣，左眼旧疤。', '旧文本整段落入主体，不丢内容')
  assert.equal(doc.sections.spec, layoutSpec('character-base-sheet'), '画面规格取模板')
  assert.ok(doc.negativePrompt.includes('禁现代元素'), '负向词按题材给默认')

  assert.equal(toVisualPromptDocument('', 'none'), null)
  assert.ok(isEmptyDocument(null))
})

test('createDocumentForLayout：画面规格由模板确定性生成', () => {
  const doc = createDocumentForLayout('scene-nine-grid', 'scene', '科幻')
  assert.equal(doc.layout, 'scene-nine-grid')
  assert.equal(doc.sections.spec, layoutSpec('scene-nine-grid'))
  assert.equal(doc.sections.subject, '')
  assert.ok(doc.negativePrompt.includes('禁古代元素'))
})

test('parseVisualPromptText：命中标记时分段归位（spec 恒取模板）', () => {
  const text = [
    '【画面规格】模型不该决定这里',
    '【主体】少年剑客，青灰布衣',
    '【服装或结构】交领右衽，束发',
    '【材质与渲染】粗麻布，写实质感',
    '【统一光影】左侧柔和侧逆光',
    '【负面提示词】不要出现现代眼镜'
  ].join('\n')
  const doc = parseVisualPromptText(text, 'character-base-sheet', 'character', '仙侠')
  assert.equal(doc.sections.spec, layoutSpec('character-base-sheet'), '画面规格恒取模板，不采用模型输出')
  assert.equal(doc.sections.subject, '少年剑客，青灰布衣')
  assert.equal(doc.sections.costume, '交领右衽，束发')
  assert.equal(doc.sections.material, '粗麻布，写实质感')
  assert.equal(doc.sections.lighting, '左侧柔和侧逆光')
  assert.ok(doc.negativePrompt.includes('不要出现现代眼镜'), '保留模型给的负向补充')
  assert.ok(doc.negativePrompt.includes('可读文字'), '并入默认负向词')
})

test('parseVisualPromptText：模型复写默认负向词时只保留一份（去重）', () => {
  const text = `【主体】少年剑客\n【负面提示词】${DEFAULT_NEGATIVE_BASE}`
  const doc = parseVisualPromptText(text, 'character-base-sheet', 'character', '')
  const occurrences = doc.negativePrompt.split('画面不得出现可读文字').length - 1
  assert.equal(occurrences, 1, '默认负向词不重复')
})

test('parseVisualPromptText：无标记（旧格式 / 模型未服从）整段降级到「主体」，不丢内容', () => {
  const doc = parseVisualPromptText('一整段自由文本，没有任何段标记。', 'prop-white-bg', 'prop', '')
  assert.equal(doc.sections.subject, '一整段自由文本，没有任何段标记。')
  assert.equal(doc.sections.spec, layoutSpec('prop-white-bg'))
  assert.equal(doc.sections.costume, '')
})

test('renderVisualPromptDocument：按固定段序带标记输出，空段跳过', () => {
  const doc = toVisualPromptDocument('少年剑客', 'character-base-sheet')
  const rendered = renderVisualPromptDocument(doc)
  assert.ok(rendered.startsWith('【画面规格】'), '首段为画面规格')
  assert.ok(rendered.includes('【主体】少年剑客'))
  assert.ok(!rendered.includes('【服装或结构】'), '空段跳过')
  assert.ok(rendered.indexOf('【画面规格】') < rendered.indexOf('【主体】'), '段序固定')
  assert.equal(renderVisualPromptDocument(null), '')
})
