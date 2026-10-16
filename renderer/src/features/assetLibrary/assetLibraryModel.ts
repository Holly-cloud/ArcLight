// v1.26.0 资产库聚合页 — 纯函数模型（聚合 + 筛选）
// 设计原则：不引入任何 Vue 依赖，便于 Node 单测；页面只做渲染。
import type {
  CharacterRelationship,
  CharacterTag,
  OrganizationMembership,
  ProjectSummary,
  ProjectWorkspaceData
} from '@/types/app'

/** 4 类资产（组织本期只读） */
export type AssetKind = 'character' | 'prop' | 'scene' | 'organization'

/** 4 类资产的固定顺序（左栏分类用） */
export const ASSET_KINDS: readonly AssetKind[] = ['character', 'prop', 'scene', 'organization']

/** 资产类型展示名 */
export const ASSET_KIND_LABELS: Record<AssetKind, string> = {
  character: '角色',
  prop: '道具',
  scene: '场景',
  organization: '组织'
}

/** 聚合后的一条资产 */
export interface AssetEntry {
  /** 全局唯一 key，含 projectId 防止跨项目同名冲突 */
  key: string
  kind: AssetKind
  id: string
  /** 所属项目 ID */
  projectId: string
  /** 所属项目名称（全部项目模式下卡片展示） */
  projectName: string
  name: string
  /** 类型/定位展示文案：角色=role，场景/道具/组织=type */
  typeLabel: string
  description: string
  tags: string[]
  /** 主色（缺省空串，渲染时回退主题令牌） */
  color: string
  /** 关联计数（角色=涉及关系条数；场景/道具=关联实体数；组织=成员数） */
  relationCount: number
}

/** 筛选参数：类型 + 项目范围 + 关键字 */
export interface AssetLibraryFilter {
  kind: AssetKind | 'all'
  /** 'all'=全部项目；'current'=当前项目；其他值=指定 projectId */
  scope: string
  query: string
}

function buildKey(projectId: string, kind: AssetKind, id: string): string {
  return `${projectId}:${kind}:${id}`
}

function tagLabels(tags: CharacterTag[] | undefined): string[] {
  return (tags ?? []).map((tag) => tag.label).filter(Boolean)
}

/** 角色关联计数：涉及该角色的关系条数（from 或 to 命中即计 1） */
function countCharacterRelations(relationships: CharacterRelationship[] | undefined, characterId: string): number {
  return (relationships ?? []).filter(
    (relationship) => relationship.fromCharacterId === characterId || relationship.toCharacterId === characterId
  ).length
}

/** 组织关联计数：该组织下的成员归属条数 */
function countOrganizationMemberships(memberships: OrganizationMembership[] | undefined, organizationId: string): number {
  return (memberships ?? []).filter((membership) => membership.organizationId === organizationId).length
}

/**
 * 聚合所有项目的 4 类资产为 AssetEntry 列表。
 * 项目顺序：先按 projects 顺序，再补上 projectWorkspaces 里未登记的项目。
 * 老项目 / 未水合项目缺字段一律兜底为空数组，不抛错。
 */
export function collectAssets(
  projectWorkspaces: Record<string, ProjectWorkspaceData>,
  projects: ProjectSummary[],
  _selectedProjectId: string
): AssetEntry[] {
  const entries: AssetEntry[] = []
  const orderedProjectIds: string[] = []
  const seenProjectIds = new Set<string>()

  for (const project of projects ?? []) {
    if (!project?.id || seenProjectIds.has(project.id)) continue
    seenProjectIds.add(project.id)
    orderedProjectIds.push(project.id)
  }
  for (const projectId of Object.keys(projectWorkspaces ?? {})) {
    if (seenProjectIds.has(projectId)) continue
    seenProjectIds.add(projectId)
    orderedProjectIds.push(projectId)
  }

  const titleById = new Map((projects ?? []).map((project) => [project.id, project.title]))

  for (const projectId of orderedProjectIds) {
    const workspace = projectWorkspaces?.[projectId]
    if (!workspace) continue
    const projectName = titleById.get(projectId) ?? ''

    for (const character of workspace.characters ?? []) {
      entries.push({
        key: buildKey(projectId, 'character', character.id),
        kind: 'character',
        id: character.id,
        projectId,
        projectName,
        name: character.name,
        typeLabel: character.role,
        description: character.description,
        tags: tagLabels(character.tags),
        color: character.avatar ?? '',
        relationCount: countCharacterRelations(workspace.characterRelationships, character.id)
      })
    }

    for (const prop of workspace.propItems ?? []) {
      entries.push({
        key: buildKey(projectId, 'prop', prop.id),
        kind: 'prop',
        id: prop.id,
        projectId,
        projectName,
        name: prop.name,
        typeLabel: prop.type,
        description: prop.description,
        tags: tagLabels(prop.tags),
        color: prop.color ?? '',
        relationCount: (prop.relatedSceneIds?.length ?? 0) + (prop.relatedCharacterIds?.length ?? 0)
      })
    }

    for (const scene of workspace.sceneLocations ?? []) {
      entries.push({
        key: buildKey(projectId, 'scene', scene.id),
        kind: 'scene',
        id: scene.id,
        projectId,
        projectName,
        name: scene.name,
        typeLabel: scene.type,
        description: scene.description,
        tags: tagLabels(scene.tags),
        color: scene.color ?? '',
        relationCount: (scene.relatedCharacterIds?.length ?? 0) + (scene.relatedPropIds?.length ?? 0)
      })
    }

    for (const organization of workspace.organizations ?? []) {
      entries.push({
        key: buildKey(projectId, 'organization', organization.id),
        kind: 'organization',
        id: organization.id,
        projectId,
        projectName,
        name: organization.name,
        typeLabel: organization.type,
        description: organization.description,
        tags: [],
        color: organization.color ?? '',
        relationCount: countOrganizationMemberships(workspace.organizationMemberships, organization.id)
      })
    }
  }

  return entries
}

/**
 * 按类型 + 项目范围 + 关键字筛选资产。
 * - kind: 'all' 或具体 AssetKind
 * - scope: 'all'=全部项目；'current'=当前项目；其他=指定 projectId
 * - query: name / typeLabel / description / tags 全文（不区分大小写）
 */
export function filterAssets(
  entries: AssetEntry[],
  filter: AssetLibraryFilter,
  currentProjectId: string
): AssetEntry[] {
  const query = filter.query.trim().toLowerCase()

  return entries.filter((entry) => {
    if (filter.kind !== 'all' && entry.kind !== filter.kind) return false
    if (filter.scope === 'current') {
      if (entry.projectId !== currentProjectId) return false
    } else if (filter.scope !== 'all') {
      if (entry.projectId !== filter.scope) return false
    }
    if (!query) return true
    const haystack = [entry.name, entry.typeLabel, entry.description, entry.tags.join(' ')].join(' ').toLowerCase()
    return haystack.includes(query)
  })
}

/** 统计各类型（含全部）的数量，供左栏分类计数使用 */
export function countAssetsByKind(entries: AssetEntry[]): Record<AssetKind | 'all', number> {
  const counts: Record<AssetKind | 'all', number> = { all: entries.length, character: 0, prop: 0, scene: 0, organization: 0 }
  for (const entry of entries) {
    counts[entry.kind] += 1
  }
  return counts
}
