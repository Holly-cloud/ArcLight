/**
 * Prompt 中心：列表与档案文案单测
 * 注：用 `node:module` 的 registerHooks 解析 `@/` 别名（对齐 features 既有测试范式）。
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

const {
  buildCatalogItems,
  filterCatalogItems,
  buildCatalogMetaLine,
  outputTypeLabel
} = await import('./promptCenterModel.ts')

const ENTRIES = [
  { task: 'worldview-entry', outputType: 'json', capabilities: ['settings', 'worldview'], capabilityLabels: ['设置与模型配置', '世界观设定'], useSkills: true, agentRuntime: false },
  { task: 'ranking-style-analysis', outputType: 'text', capabilities: ['settings'], capabilityLabels: ['设置与模型配置'], useSkills: false, agentRuntime: false },
  { task: 'chapter-session-note', outputType: 'json', capabilities: [], capabilityLabels: [], useSkills: true, agentRuntime: false },
  { task: 'brand-new-task', outputType: 'text', capabilities: ['settings'], capabilityLabels: ['设置与模型配置'], useSkills: true, agentRuntime: false }
]

test('buildCatalogItems：用中文名，缺项回退任务名（新增任务自动出现）', () => {
  const items = buildCatalogItems(ENTRIES)
  assert.equal(items.length, 4)
  assert.equal(items[0].label, '世界观生成')
  assert.equal(items[3].label, 'brand-new-task', '未收录中文名的任务回退任务名')
})

test('filterCatalogItems：按中文名或任务名搜索，空关键字原样返回', () => {
  const items = buildCatalogItems(ENTRIES)
  assert.equal(filterCatalogItems(items, '').length, 4)
  assert.deepEqual(filterCatalogItems(items, '世界观').map((item) => item.task), ['worldview-entry'])
  assert.deepEqual(filterCatalogItems(items, 'RANKING').map((item) => item.task), ['ranking-style-analysis'], '大小写不敏感')
  assert.deepEqual(filterCatalogItems(items, 'brand').map((item) => item.task), ['brand-new-task'])
  assert.equal(filterCatalogItems(items, '不存在的任务').length, 0)
})

test('buildCatalogMetaLine：中文名 · 输出格式 · 能力（中文标签，能力为空则不追加）', () => {
  const items = buildCatalogItems(ENTRIES)
  assert.equal(buildCatalogMetaLine(items[0]), '世界观生成 · JSON · 能力：设置与模型配置 / 世界观设定')
  assert.equal(buildCatalogMetaLine(items[1]), 'AI 扫榜分析 · 文本 · 能力：设置与模型配置')
  assert.equal(buildCatalogMetaLine(items[2]), '写作日志 · JSON', '能力为空时不追加速度段')
})

test('outputTypeLabel：json → JSON，其余 → 文本', () => {
  assert.equal(outputTypeLabel('json'), 'JSON')
  assert.equal(outputTypeLabel('text'), '文本')
})
