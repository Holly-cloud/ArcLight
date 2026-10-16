/**
 * v1.27.0 renderMode 模板建议单测
 * - 8 条固定模板 × ≥3 示例（≥24 断言）
 * - 不匹配 / 空输入 / 缺省输入返回 null
 * - 不调 LLM、不联网（纯字符串匹配）
 *
 * 运行：set ELECTRON_RUN_AS_NODE=1&& electron --test renderer/src/features/visualStyle/visualStyleTemplates.test.mjs
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

const { VISUAL_STYLE_TEMPLATES, suggestRenderMode } = await import('./visualStyleTemplates.ts')

test('固定 8 条模板规则', () => {
  assert.equal(VISUAL_STYLE_TEMPLATES.length, 8, '模板必须固定 8 条')
  for (const rule of VISUAL_STYLE_TEMPLATES) {
    assert.ok(rule.id.length > 0, '规则须有 id')
    assert.ok(Array.isArray(rule.keywords) && rule.keywords.length > 0, `${rule.id} 须有关键词`)
  }
})

test('8 条模板 × 3 示例命中正确 renderMode（≥24 断言）', () => {
  const cases = [
    // fantasy-anime → anime
    { input: { genre: '玄幻' }, expected: 'anime' },
    { input: { premise: '这是一段仙侠修真之旅' }, expected: 'anime' },
    { input: { tags: ['武侠'] }, expected: 'anime' },
    // urban-realistic → realistic
    { input: { genre: '都市言情' }, expected: 'realistic' },
    { input: { tag: undefined, tags: ['甜宠'] }, expected: 'realistic' },
    { input: { premise: '总裁与她的一段往事' }, expected: 'realistic' },
    // scifi-realistic → realistic
    { input: { genre: '科幻' }, expected: 'realistic' },
    { input: { tags: ['赛博朋克'] }, expected: 'realistic' },
    { input: { premise: '机甲驾驶员的战斗' }, expected: 'realistic' },
    // chinese-ink → ink-wash
    { input: { genre: '水墨' }, expected: 'ink-wash' },
    { input: { tags: ['古风'] }, expected: 'ink-wash' },
    { input: { premise: '一段国风山水画卷' }, expected: 'ink-wash' },
    // low-poly → low-poly
    { input: { genre: '低多边形' }, expected: 'low-poly' },
    { input: { tags: ['像素风'] }, expected: 'low-poly' },
    { input: { premise: '体素沙盒世界' }, expected: 'low-poly' },
    // oil-paint → oil-paint
    { input: { genre: '油画' }, expected: 'oil-paint' },
    { input: { tags: ['文艺'] }, expected: 'oil-paint' },
    { input: { premise: '印象派重彩风格' }, expected: 'oil-paint' },
    // flat-illustration → flat-illustration
    { input: { genre: '平面插画' }, expected: 'flat-illustration' },
    { input: { tags: ['绘本'] }, expected: 'flat-illustration' },
    { input: { premise: '儿童童话故事' }, expected: 'flat-illustration' },
    // suspense-realistic → realistic
    { input: { genre: '悬疑' }, expected: 'realistic' },
    { input: { tags: ['恐怖'] }, expected: 'realistic' },
    { input: { premise: '一桩暗黑推理案件' }, expected: 'realistic' }
  ]
  assert.equal(cases.length, 24, '示例须覆盖 8 模板 × 3')
  for (const { input, expected } of cases) {
    assert.equal(suggestRenderMode(input), expected, `输入 ${JSON.stringify(input)} 应建议 ${expected}`)
  }
})

test('不匹配时返回 null（不臆测）', () => {
  assert.equal(suggestRenderMode(null), null)
  assert.equal(suggestRenderMode(undefined), null)
  assert.equal(suggestRenderMode({}), null)
  assert.equal(suggestRenderMode({ genre: '经济管理' }), null)
  assert.equal(suggestRenderMode({ tags: ['日常', '治愈'] }), null)
  assert.equal(suggestRenderMode({ premise: '一段关于成长与选择的故事' }), null)
})

test('优先级：命中第一条规则即返回（玄幻优先于插画）', () => {
  assert.equal(suggestRenderMode({ genre: '玄幻', tags: ['插画'] }), 'anime')
})
