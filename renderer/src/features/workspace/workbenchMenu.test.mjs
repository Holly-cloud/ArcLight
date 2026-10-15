import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_WORKBENCH_MENU_ORDER,
  moveWorkbenchMenuItem,
  normalizeWorkbenchMenuOrder,
  shiftWorkbenchMenuItem
} from './workbenchMenu.ts'

test('默认顺序将工作台置顶并保持其他菜单排列', () => {
  assert.deepEqual(DEFAULT_WORKBENCH_MENU_ORDER, [
    'workbench',
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
      'chapters',
      'overview',
      'workbench',
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

test('拖拽和按钮移动都保持完整菜单集合', () => {
  const dragged = moveWorkbenchMenuItem(DEFAULT_WORKBENCH_MENU_ORDER, 'chapters', 'overview', 'before')
  // workbench 在 DEFAULT_WORKBENCH_MENU_ORDER 中已置顶；chapters 移至 overview 之前
  assert.equal(dragged[0], 'workbench')
  assert.equal(dragged[1], 'chapters')
  assert.deepEqual(new Set(dragged), new Set(DEFAULT_WORKBENCH_MENU_ORDER))

  const shifted = shiftWorkbenchMenuItem(dragged, 'chapters', 1)
  // chapters 上移一位后，workbench / overview / chapters 在前三
  assert.deepEqual(shifted.slice(0, 3), ['workbench', 'overview', 'chapters'])
})
