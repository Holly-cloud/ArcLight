/**
 * v1.32.0 FeatureHelp 工具函数单测
 * - 6 条 featureId 穷举覆盖
 * - getFeatureDescription 单条查表 + null 兜底
 * - getFeatureDescriptions 聚合 + 顺序 + 空数组 + 非法 id 过滤
 * - keyConcepts 单条 ≤ 60 字（PRD §5.3）
 *
 * 运行方式：
 *   set ELECTRON_RUN_AS_NODE=1&& electron --test renderer/src/features/help/types.test.mjs
 *
 * 注：用 node:module 的 registerHooks 解析 @/ 别名（参考 persistence.test.mjs 范式）
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

const { getFeatureDescription, getFeatureDescriptions, ALL_FEATURE_IDS } = await import('./types.ts')

test('6 条 featureId 全部命中查表函数', () => {
  assert.equal(ALL_FEATURE_IDS.length, 6, 'FeatureId 联合类型必须 6 条穷举')
  for (const id of ALL_FEATURE_IDS) {
    const desc = getFeatureDescription(id)
    assert.ok(desc, `${id} 必须命中查表函数（不应返回 null）`)
    assert.equal(desc.id, id)
    assert.ok(desc.title.length > 0, `${id} title 必填`)
    assert.ok(desc.whyItMatters.length > 0, `${id} whyItMatters 必填`)
    assert.ok(Array.isArray(desc.keyConcepts), `${id} keyConcepts 必填`)
    assert.ok(desc.keyConcepts.length >= 3, `${id} keyConcepts 至少 3 条`)
    assert.ok(desc.keyConcepts.length <= 5, `${id} keyConcepts 最多 5 条`)
  }
})

test('getFeatureDescription 单条查表返回正确数据', () => {
  const desc = getFeatureDescription('scene-location')
  assert.ok(desc)
  assert.equal(desc.id, 'scene-location')
  assert.equal(desc.title, '关于「场景」')
  assert.ok(desc.whyItMatters.length > 10, 'whyItMatters 应有实际内容')
  assert.ok(desc.keyConcepts.length >= 3, 'keyConcepts 至少 3 条')
})

test('getFeatureDescription 找不到时静默返回 null（绕过 TS 校验）', () => {
  const desc = getFeatureDescription('nonexistent-id')
  assert.equal(desc, null)
})

test('getFeatureDescriptions 聚合 3 条返回 3 条且顺序与输入一致', () => {
  const ids = ['scene-location', 'prop-item', 'relations-graph']
  const descs = getFeatureDescriptions(ids)
  assert.equal(descs.length, 3)
  assert.equal(descs[0].id, 'scene-location')
  assert.equal(descs[1].id, 'prop-item')
  assert.equal(descs[2].id, 'relations-graph')
})

test('getFeatureDescriptions 空数组返回 []', () => {
  const descs = getFeatureDescriptions([])
  assert.deepEqual(descs, [])
})

test('getFeatureDescriptions 含非法 id 自动过滤（不抛错）', () => {
  const descs = getFeatureDescriptions([
    'scene-location',
    // @ts-expect-error 故意构造非法 id
    'invalid-id',
    'prop-item'
  ])
  assert.equal(descs.length, 2)
  assert.equal(descs[0].id, 'scene-location')
  assert.equal(descs[1].id, 'prop-item')
})

test('6 条全部含必填字段且 keyConcepts 单条 ≤ 60 字', () => {
  for (const id of ALL_FEATURE_IDS) {
    const desc = getFeatureDescription(id)
    assert.ok(desc)
    for (const concept of desc.keyConcepts) {
      assert.ok(concept.length <= 60, `${id} 的 keyConcepts 单条超过 60 字：${concept}`)
    }
  }
})

test('docLink 可选字段：本期 6 条全部含 docLink', () => {
  for (const id of ALL_FEATURE_IDS) {
    const desc = getFeatureDescription(id)
    assert.ok(desc)
    assert.ok(desc.docLink, `${id} docLink 应配置`)
    assert.match(desc.docLink.href, /prd\.md/)
  }
})
