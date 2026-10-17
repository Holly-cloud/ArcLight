import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_WORKBENCH_MENU_ORDER,
  moveWorkbenchMenuItem,
  normalizeWorkbenchMenuOrder,
  shiftWorkbenchMenuItem
} from './workbenchMenu.ts'

test('默认顺序将资产库 / Prompt 中心置顶并保持其他菜单排列（工作台已下线）', () => {
  assert.deepEqual(DEFAULT_WORKBENCH_MENU_ORDER, [
    'assetLibrary',
    'promptCenter',
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
      'promptCenter',
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

test('升级场景：旧顺序（不含 assetLibrary）→ assetLibrary 置顶、其余顺序不变且补齐新菜单', () => {
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
  // 其余旧项相对位置不变；新增项（Prompt 中心）按 DEFAULT 顺序补到末尾
  assert.deepEqual(normalized.slice(1, 1 + legacyOrder.length), legacyOrder)
  assert.deepEqual(normalized.slice(1 + legacyOrder.length), ['promptCenter'])
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
  // assetLibrary / promptCenter 固定在前；chapters 移至 overview 之前
  assert.deepEqual(dragged.slice(0, 4), ['assetLibrary', 'promptCenter', 'chapters', 'overview'])
  assert.deepEqual(new Set(dragged), new Set(DEFAULT_WORKBENCH_MENU_ORDER))

  const shifted = shiftWorkbenchMenuItem(dragged, 'chapters', -1)
  // chapters 上移一位后，assetLibrary / chapters / promptCenter / overview 在前四
  assert.deepEqual(shifted.slice(0, 4), ['assetLibrary', 'chapters', 'promptCenter', 'overview'])
})
