/**
 * v1.34.0 资产生图「结构化提示词」单测（纯函数，无网络、无 IO）
 * 运行方式：
 *   set ELECTRON_RUN_AS_NODE=1&& electron --test renderer/src/features/assetImage/imagePrompt.test.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

const { buildImagePrompt } = await import('./imagePrompt.ts')

test('buildImagePrompt：组装结构化 Prompt 文本', () => {
  const prompt = buildImagePrompt({
    name: '云澈',
    type: '主角',
    renderMode: 'anime',
    palette: ['#1b3a5b', '#f2d9a0'],
    moodWords: ['冷峻'],
    keyReferences: ['水墨青绿'],
    lightingNote: '晨光',
    seasonNote: '初春',
    materialityNote: '青石',
    description: '年轻剑修'
  })
  assert.ok(prompt.includes('云澈 · 主角'))
  assert.ok(prompt.includes('渲染方式：anime'))
  assert.ok(prompt.includes('配色：#1b3a5b / #f2d9a0'))
  assert.ok(prompt.includes('光影：晨光'))
  assert.ok(prompt.includes('年轻剑修'))
  assert.equal(buildImagePrompt(null), '')
})

test('空输入：null / undefined 返回空串，不抛错', () => {
  assert.equal(buildImagePrompt(null), '')
  assert.equal(buildImagePrompt(undefined), '')
  assert.equal(buildImagePrompt({}), '')
})
