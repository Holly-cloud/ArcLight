import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_WORKBENCH_MENU_ORDER,
  moveWorkbenchMenuItem,
  normalizeWorkbenchMenuOrder,
  shiftWorkbenchMenuItem
} from './workbenchMenu.ts'

test('默认顺序将工作台置顶、资产库紧随其后并保持其他菜单排列', () => {
  assert.deepEqual(DEFAULT_WORKBENCH_MENU_ORDER, [
    'workbench',
    'assetLibrary',
    'overview',
    'characters',
    'relations',
    'world',
    'outline',
    'threads',
    'chapters',
    'inspiration',
    'project-knowledge',
    'global-assistant-v2'
  ])
})

test('标准化会过滤无效和重复菜单并将缺失菜单追加到末尾', () => {
  assert.deepEqual(
    normalizeWorkbenchMenuOrder(['chapters', 'overview', 'chapters', 'removed-menu']),
    [
      'workbench',
      'assetLibrary',
      'chapters',
      'overview',
      'characters',
      'relations',
      'world',
      'outline',
      'threads',
      'inspiration',
      'project-knowledge',
      'global-assistant-v2'
    ]
  )
})

test('升级场景：旧 11 项顺序（v1.24 持久化）→ workbench 置顶、assetLibrary 紧随其后', () => {
  // 模拟 v1.24 旧顺序（不含 workbench / assetLibrary）—— 用户从 v1.24 升级不丢数据
  const legacyOrder = [
    'overview',
    'characters',
    'relations',
    'world',
    'outline',
    'threads',
    'chapters',
    'inspiration',
    'project-knowledge',
    'global-assistant-v2'
  ]
  const normalized = normalizeWorkbenchMenuOrder(legacyOrder)
  assert.equal(normalized[0], 'workbench', 'workbench 必须置顶（架构 §6.6 决策）')
  assert.equal(normalized[1], 'assetLibrary', 'assetLibrary 必须排在 workbench 之后（v1.26 决策）')
  // 其余顺序保持相对位置（仅在前面插入 workbench + assetLibrary）
  assert.deepEqual(normalized.slice(2), legacyOrder)
})

test('升级场景：空数组 / null / undefined → workbench 在首位且补齐全部默认项', () => {
  assert.equal(normalizeWorkbenchMenuOrder([])[0], 'workbench')
  assert.equal(normalizeWorkbenchMenuOrder([])[1], 'assetLibrary')
  assert.equal(normalizeWorkbenchMenuOrder(null)[0], 'workbench')
  assert.equal(normalizeWorkbenchMenuOrder(undefined)[0], 'workbench')
})

test('用户已自定义 workbench 在首位 → 尊重用户位置，assetLibrary 插到其后且不重复', () => {
  const userOrder = ['workbench', 'overview', 'chapters']
  const normalized = normalizeWorkbenchMenuOrder(userOrder)
  // workbench 仍在首
  assert.equal(normalized[0], 'workbench')
  assert.equal(normalized.indexOf('workbench'), normalized.lastIndexOf('workbench'), '不应重复')
  // v1.26 新增断言：assetLibrary 缺失时插到 workbench 之后（index 1），且不重复
  assert.equal(normalized[1], 'assetLibrary', 'assetLibrary 应插入到 index 1')
  assert.equal(normalized.indexOf('assetLibrary'), normalized.lastIndexOf('assetLibrary'), 'assetLibrary 不应重复')

  // 用户已包含 assetLibrary → 保留用户自定义位置，且完整菜单集合不变
  const userPlaced = normalizeWorkbenchMenuOrder(['workbench', 'overview', 'assetLibrary', 'chapters'])
  assert.equal(userPlaced.indexOf('assetLibrary'), 2, '尊重用户自定义位置')
  assert.deepEqual(new Set(userPlaced), new Set(DEFAULT_WORKBENCH_MENU_ORDER))
})

test('拖拽和按钮移动都保持完整菜单集合', () => {
  const dragged = moveWorkbenchMenuItem(DEFAULT_WORKBENCH_MENU_ORDER, 'chapters', 'overview', 'before')
  // workbench / assetLibrary 在 DEFAULT 前置；chapters 移至 overview 之前
  assert.equal(dragged[0], 'workbench')
  assert.equal(dragged[1], 'assetLibrary')
  assert.equal(dragged[2], 'chapters')
  assert.deepEqual(new Set(dragged), new Set(DEFAULT_WORKBENCH_MENU_ORDER))

  const shifted = shiftWorkbenchMenuItem(dragged, 'chapters', -1)
  // chapters 上移一位后，workbench / chapters / assetLibrary 在前三
  assert.deepEqual(shifted.slice(0, 3), ['workbench', 'chapters', 'assetLibrary'])
})
