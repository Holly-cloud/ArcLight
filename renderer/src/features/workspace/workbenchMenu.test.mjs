import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_WORKBENCH_MENU_ORDER,
  moveWorkbenchMenuItem,
  normalizeWorkbenchMenuOrder,
  shiftWorkbenchMenuItem
} from './workbenchMenu.ts'

test('默认顺序将资产库置顶并保持其他菜单排列（工作台已下线）', () => {
  assert.deepEqual(DEFAULT_WORKBENCH_MENU_ORDER, [
    'assetLibrary',
    'overview',
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
      'assetLibrary',
      'chapters',
      'overview',
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

test('升级场景：旧顺序（不含 assetLibrary）→ assetLibrary 置顶且其余顺序不变', () => {
  const legacyOrder = [
    'overview',
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
  assert.equal(normalized[0], 'assetLibrary', 'assetLibrary 必须置顶（v1.32 决策）')
  // 其余顺序保持相对位置（仅在前插入 assetLibrary）
  assert.deepEqual(normalized.slice(1), legacyOrder)
})

test('升级场景：空数组 / null / undefined → assetLibrary 在首位且补齐全部默认项', () => {
  assert.equal(normalizeWorkbenchMenuOrder([])[0], 'assetLibrary')
  assert.equal(normalizeWorkbenchMenuOrder(null)[0], 'assetLibrary')
  assert.equal(normalizeWorkbenchMenuOrder(undefined)[0], 'assetLibrary')
})

test('用户已自定义 assetLibrary 位置 → 尊重用户位置且不重复', () => {
  const userOrder = ['chapters', 'assetLibrary', 'overview']
  const normalized = normalizeWorkbenchMenuOrder(userOrder)
  assert.equal(normalized.indexOf('assetLibrary'), 1, '尊重用户自定义位置')
  assert.equal(normalized.indexOf('assetLibrary'), normalized.lastIndexOf('assetLibrary'), 'assetLibrary 不应重复')
  assert.deepEqual(new Set(normalized), new Set(DEFAULT_WORKBENCH_MENU_ORDER))
})

test('拖拽和按钮移动都保持完整菜单集合', () => {
  const dragged = moveWorkbenchMenuItem(DEFAULT_WORKBENCH_MENU_ORDER, 'chapters', 'overview', 'before')
  // assetLibrary 在 DEFAULT 前置；chapters 移至 overview 之前
  assert.equal(dragged[0], 'assetLibrary')
  assert.equal(dragged[1], 'chapters')
  assert.equal(dragged[2], 'overview')
  assert.deepEqual(new Set(dragged), new Set(DEFAULT_WORKBENCH_MENU_ORDER))

  const shifted = shiftWorkbenchMenuItem(dragged, 'chapters', -1)
  // chapters 上移一位后，chapters / assetLibrary / overview 在前三
  assert.deepEqual(shifted.slice(0, 3), ['chapters', 'assetLibrary', 'overview'])
})
