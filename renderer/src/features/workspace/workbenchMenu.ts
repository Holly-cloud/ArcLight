export const WORKBENCH_MENU_DEFINITIONS = [
  { id: 'workbench', label: '工作台' },
  { id: 'assetLibrary', label: '资产库' },
  { id: 'overview', label: '作品概览' },
  { id: 'characters', label: '角色图鉴' },
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
 * - v1.25 起：将"工作台"（workbench）置顶，使其成为菜单最显眼位置
 * - v1.26 起：将"资产库"（assetLibrary）固定排在 workbench 之后（index 1）
 * - 用户自定义顺序（appSettings.workspaceMenuOrder）若已包含对应项，则按用户位置保留
 * - 缺失项（含 'workbench' / 'assetLibrary'）由 normalizeWorkbenchMenuOrder 自动补齐
 */
export const DEFAULT_WORKBENCH_MENU_ORDER: WorkbenchMenuId[] = [
  'workbench',
  'assetLibrary',
  ...WORKBENCH_MENU_DEFINITIONS.filter((d) => d.id !== 'workbench' && d.id !== 'assetLibrary').map((d) => d.id)
]

const workbenchMenuIdSet = new Set<string>(DEFAULT_WORKBENCH_MENU_ORDER)

export function normalizeWorkbenchMenuOrder(value?: readonly string[] | null): WorkbenchMenuId[] {
  const result: WorkbenchMenuId[] = []
  const seen = new Set<string>()
  let hasWorkbench = false

  if (Array.isArray(value)) {
    for (const rawId of value) {
      const id = typeof rawId === 'string' ? rawId.trim() : ''
      if (!id || seen.has(id) || !workbenchMenuIdSet.has(id)) continue
      seen.add(id)
      if (id === 'workbench') hasWorkbench = true
      result.push(id as WorkbenchMenuId)
    }
  }

  // v1.25 决策：用户升级场景（值不含 workbench）→ 强制 unshift 到首位，
  // 避免旧配置（11 项 v1.24 顺序）补齐后 'workbench' 落到末尾。
  if (!hasWorkbench) {
    result.unshift('workbench')
    seen.add('workbench')
  }

  // v1.26 决策：升级场景（值缺 assetLibrary）→ 插到 workbench 之后（index 1），
  // 避免旧配置补齐后 'assetLibrary' 落到末尾。
  if (!seen.has('assetLibrary')) {
    const workbenchIndex = result.indexOf('workbench')
    result.splice(workbenchIndex >= 0 ? workbenchIndex + 1 : 1, 0, 'assetLibrary')
    seen.add('assetLibrary')
  }

  // 其他缺失项按 DEFAULT 顺序补到末尾（workbench / assetLibrary 已在前面处理）
  for (const id of DEFAULT_WORKBENCH_MENU_ORDER) {
    if (id === 'workbench' || id === 'assetLibrary') continue
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
