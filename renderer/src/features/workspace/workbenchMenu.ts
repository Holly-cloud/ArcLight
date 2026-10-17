export const WORKBENCH_MENU_DEFINITIONS = [
  { id: 'assetLibrary', label: '资产库' },
  { id: 'overview', label: '作品概览' },
  { id: 'relations', label: '关系组织' },
  { id: 'world', label: '世界观设定' },
  { id: 'outline', label: '剧情大纲' },
  { id: 'threads', label: '剧情线索' },
  { id: 'chapters', label: '章节创作' },
  { id: 'inspiration', label: '灵感模块' },
  { id: 'project-knowledge', label: '项目知识库' },
  { id: 'global-assistant-v2', label: '全局助手 v2' }
] as const

export type WorkbenchMenuId = typeof WORKBENCH_MENU_DEFINITIONS[number]['id']
export type WorkbenchMenuDropPosition = 'before' | 'after'

/**
 * 默认菜单顺序。
 * - v1.32 起：工作台容器下线，'assetLibrary'（资产库）置顶
 * - 用户自定义顺序（appSettings.workspaceMenuOrder）若已包含对应项，则按用户位置保留
 * - 缺失项（含 'assetLibrary'）由 normalizeWorkbenchMenuOrder 自动补齐
 */
export const DEFAULT_WORKBENCH_MENU_ORDER: WorkbenchMenuId[] = [
  'assetLibrary',
  ...WORKBENCH_MENU_DEFINITIONS.filter((d) => d.id !== 'assetLibrary').map((d) => d.id)
]

const workbenchMenuIdSet = new Set<string>(DEFAULT_WORKBENCH_MENU_ORDER)

export function normalizeWorkbenchMenuOrder(value?: readonly string[] | null): WorkbenchMenuId[] {
  const result: WorkbenchMenuId[] = []
  const seen = new Set<string>()

  if (Array.isArray(value)) {
    for (const rawId of value) {
      const id = typeof rawId === 'string' ? rawId.trim() : ''
      if (!id || seen.has(id) || !workbenchMenuIdSet.has(id)) continue
      seen.add(id)
      result.push(id as WorkbenchMenuId)
    }
  }

  // v1.32 决策：升级场景（值缺 assetLibrary）→ 置顶，
  // 避免旧配置补齐后 'assetLibrary' 落到末尾。
  if (!seen.has('assetLibrary')) {
    result.unshift('assetLibrary')
    seen.add('assetLibrary')
  }

  // 其他缺失项按 DEFAULT 顺序补到末尾（assetLibrary 已在前面处理）
  for (const id of DEFAULT_WORKBENCH_MENU_ORDER) {
    if (id === 'assetLibrary') continue
    if (!seen.has(id)) result.push(id)
  }

  return result
}

export function moveWorkbenchMenuItem(
  order: readonly string[],
  sourceId: WorkbenchMenuId,
  targetId: WorkbenchMenuId,
  position: WorkbenchMenuDropPosition
): WorkbenchMenuId[] {
  const normalized = normalizeWorkbenchMenuOrder(order)
  if (sourceId === targetId) return normalized

  const remaining = normalized.filter((id) => id !== sourceId)
  const targetIndex = remaining.indexOf(targetId)
  if (targetIndex === -1) return normalized

  const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex
  remaining.splice(insertIndex, 0, sourceId)
  return remaining
}

export function shiftWorkbenchMenuItem(
  order: readonly string[],
  menuId: WorkbenchMenuId,
  offset: -1 | 1
): WorkbenchMenuId[] {
  const normalized = normalizeWorkbenchMenuOrder(order)
  const currentIndex = normalized.indexOf(menuId)
  const targetIndex = currentIndex + offset
  if (currentIndex === -1 || targetIndex < 0 || targetIndex >= normalized.length) return normalized

  const next = [...normalized]
  ;[next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]]
  return next
}
