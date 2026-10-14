import type { DatabaseSync } from 'node:sqlite'
import type { SaveWorkspaceEntitiesRequest } from '@shared/ipc-types'

type EntityTable =
  | 'worldview_entries'
  | 'characters'
  | 'inspiration_entries'
  | 'scene_locations'
  | 'prop_items'

/** 安全解析字符串数组 JSON 列，非法值回退为空数组。 */
function parseStringArray(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : []
  } catch {
    return []
  }
}

function deleteMissingRows(
  db: DatabaseSync,
  table: EntityTable,
  projectId: string,
  activeIds: Set<string>
): void {
  const rows = db.prepare(`SELECT id FROM ${table} WHERE project_id = ?`).all(projectId) as Array<{ id: string }>
  const remove = db.prepare(`DELETE FROM ${table} WHERE id = ? AND project_id = ?`)
  for (const row of rows) {
    if (!activeIds.has(String(row.id))) remove.run(row.id, projectId)
  }
}

/**
 * 删除角色后清理悬空引用（双层级清理的主进程侧）：
 * - 关系 / 组织归属：整行删除；
 * - 场景 / 道具：重写 JSON 列剔除已删除角色 id，持有者置空。
 */
function cleanupDeletedCharacterReferences(
  db: DatabaseSync,
  projectId: string,
  activeCharacterIds: Set<string>
): void {
  const relationships = db.prepare(`
    SELECT id, from_character_id AS fromCharacterId, to_character_id AS toCharacterId
    FROM character_relationships
    WHERE project_id = ?
  `).all(projectId) as Array<{ id: string; fromCharacterId: string; toCharacterId: string }>
  const removeRelationship = db.prepare('DELETE FROM character_relationships WHERE id = ? AND project_id = ?')
  for (const relationship of relationships) {
    if (
      !activeCharacterIds.has(String(relationship.fromCharacterId))
      || !activeCharacterIds.has(String(relationship.toCharacterId))
    ) {
      removeRelationship.run(relationship.id, projectId)
    }
  }

  const memberships = db.prepare(`
    SELECT id, character_id AS characterId
    FROM organization_memberships
    WHERE project_id = ?
  `).all(projectId) as Array<{ id: string; characterId: string }>
  const removeMembership = db.prepare('DELETE FROM organization_memberships WHERE id = ? AND project_id = ?')
  for (const membership of memberships) {
    if (!activeCharacterIds.has(String(membership.characterId))) {
      removeMembership.run(membership.id, projectId)
    }
  }

  const scenes = db.prepare(`
    SELECT id, related_character_ids_json AS relatedCharacterIdsJson
    FROM scene_locations
    WHERE project_id = ?
  `).all(projectId) as Array<{ id: string; relatedCharacterIdsJson: string }>
  const updateSceneRefs = db.prepare(
    'UPDATE scene_locations SET related_character_ids_json = ? WHERE id = ? AND project_id = ?'
  )
  for (const scene of scenes) {
    const ids = parseStringArray(scene.relatedCharacterIdsJson)
    const next = ids.filter((id) => activeCharacterIds.has(id))
    if (next.length !== ids.length) updateSceneRefs.run(JSON.stringify(next), scene.id, projectId)
  }

  const props = db.prepare(`
    SELECT id, owner_character_id AS ownerCharacterId, related_character_ids_json AS relatedCharacterIdsJson
    FROM prop_items
    WHERE project_id = ?
  `).all(projectId) as Array<{ id: string; ownerCharacterId: string; relatedCharacterIdsJson: string }>
  const clearPropOwner = db.prepare("UPDATE prop_items SET owner_character_id = '' WHERE id = ? AND project_id = ?")
  const updatePropRefs = db.prepare(
    'UPDATE prop_items SET related_character_ids_json = ? WHERE id = ? AND project_id = ?'
  )
  for (const prop of props) {
    if (prop.ownerCharacterId && !activeCharacterIds.has(String(prop.ownerCharacterId))) {
      clearPropOwner.run(prop.id, projectId)
    }
    const ids = parseStringArray(prop.relatedCharacterIdsJson)
    const next = ids.filter((id) => activeCharacterIds.has(id))
    if (next.length !== ids.length) updatePropRefs.run(JSON.stringify(next), prop.id, projectId)
  }
}

/** 删除场景后清理道具侧悬空引用（道具 relatedSceneIds 剔除已删除场景 id）。 */
function cleanupDeletedSceneReferences(
  db: DatabaseSync,
  projectId: string,
  activeSceneIds: Set<string>
): void {
  const props = db.prepare(`
    SELECT id, related_scene_ids_json AS relatedSceneIdsJson
    FROM prop_items
    WHERE project_id = ?
  `).all(projectId) as Array<{ id: string; relatedSceneIdsJson: string }>
  const updatePropRefs = db.prepare(
    'UPDATE prop_items SET related_scene_ids_json = ? WHERE id = ? AND project_id = ?'
  )
  for (const prop of props) {
    const ids = parseStringArray(prop.relatedSceneIdsJson)
    const next = ids.filter((id) => activeSceneIds.has(id))
    if (next.length !== ids.length) updatePropRefs.run(JSON.stringify(next), prop.id, projectId)
  }
}

/** 删除道具后清理场景侧悬空引用（场景 relatedPropIds 剔除已删除道具 id）。 */
function cleanupDeletedPropReferences(
  db: DatabaseSync,
  projectId: string,
  activePropIds: Set<string>
): void {
  const scenes = db.prepare(`
    SELECT id, related_prop_ids_json AS relatedPropIdsJson
    FROM scene_locations
    WHERE project_id = ?
  `).all(projectId) as Array<{ id: string; relatedPropIdsJson: string }>
  const updateSceneRefs = db.prepare(
    'UPDATE scene_locations SET related_prop_ids_json = ? WHERE id = ? AND project_id = ?'
  )
  for (const scene of scenes) {
    const ids = parseStringArray(scene.relatedPropIdsJson)
    const next = ids.filter((id) => activePropIds.has(id))
    if (next.length !== ids.length) updateSceneRefs.run(JSON.stringify(next), scene.id, projectId)
  }
}

export function writeWorkspaceEntities(db: DatabaseSync, request: SaveWorkspaceEntitiesRequest): void {
  db.exec('BEGIN')
  try {
    if (request.worldviewEntries) {
      const upsert = db.prepare(`
        INSERT INTO worldview_entries (id, project_id, type, title, content, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          project_id = excluded.project_id,
          type = excluded.type,
          title = excluded.title,
          content = excluded.content,
          sort_order = excluded.sort_order,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `)
      const activeIds = new Set<string>()
      for (const entry of request.worldviewEntries) {
        activeIds.add(entry.id)
        upsert.run(
          entry.id,
          request.projectId,
          entry.type,
          entry.title,
          entry.content,
          entry.sortOrder,
          entry.createdAt,
          entry.updatedAt
        )
      }
      deleteMissingRows(db, 'worldview_entries', request.projectId, activeIds)
    }

    if (request.characters) {
      const upsert = db.prepare(`
        INSERT INTO characters (id, project_id, name, role, description, avatar, tags_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          project_id = excluded.project_id,
          name = excluded.name,
          role = excluded.role,
          description = excluded.description,
          avatar = excluded.avatar,
          tags_json = excluded.tags_json
      `)
      const activeIds = new Set<string>()
      for (const character of request.characters) {
        activeIds.add(character.id)
        upsert.run(
          character.id,
          request.projectId,
          character.name,
          character.role,
          character.description,
          character.avatar,
          JSON.stringify(character.tags ?? [])
        )
      }
      deleteMissingRows(db, 'characters', request.projectId, activeIds)
      cleanupDeletedCharacterReferences(db, request.projectId, activeIds)
    }

    if (request.inspirationEntries) {
      const upsert = db.prepare(`
        INSERT INTO inspiration_entries (
          id, project_id, type, title, content, tags_json, source, sort_order, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          project_id = excluded.project_id,
          type = excluded.type,
          title = excluded.title,
          content = excluded.content,
          tags_json = excluded.tags_json,
          source = excluded.source,
          sort_order = excluded.sort_order,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `)
      const activeIds = new Set<string>()
      for (const entry of request.inspirationEntries) {
        activeIds.add(entry.id)
        upsert.run(
          entry.id,
          request.projectId,
          entry.type,
          entry.title,
          entry.content,
          JSON.stringify(entry.tags ?? []),
          entry.source,
          entry.sortOrder,
          entry.createdAt,
          entry.updatedAt
        )
      }
      deleteMissingRows(db, 'inspiration_entries', request.projectId, activeIds)
    }

    if (request.sceneLocations) {
      const upsert = db.prepare(`
        INSERT INTO scene_locations (
          id, project_id, name, type, description, tags_json, color, sort_order,
          related_character_ids_json, related_prop_ids_json, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          project_id = excluded.project_id,
          name = excluded.name,
          type = excluded.type,
          description = excluded.description,
          tags_json = excluded.tags_json,
          color = excluded.color,
          sort_order = excluded.sort_order,
          related_character_ids_json = excluded.related_character_ids_json,
          related_prop_ids_json = excluded.related_prop_ids_json,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `)
      const activeIds = new Set<string>()
      for (const scene of request.sceneLocations) {
        activeIds.add(scene.id)
        upsert.run(
          scene.id,
          request.projectId,
          scene.name,
          scene.type,
          scene.description,
          JSON.stringify(scene.tags ?? []),
          scene.color ?? '',
          scene.sortOrder,
          JSON.stringify(scene.relatedCharacterIds ?? []),
          JSON.stringify(scene.relatedPropIds ?? []),
          scene.createdAt,
          scene.updatedAt
        )
      }
      deleteMissingRows(db, 'scene_locations', request.projectId, activeIds)
      cleanupDeletedSceneReferences(db, request.projectId, activeIds)
    }

    if (request.propItems) {
      const upsert = db.prepare(`
        INSERT INTO prop_items (
          id, project_id, name, type, description, owner_character_id, tags_json, color, sort_order,
          related_scene_ids_json, related_character_ids_json, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          project_id = excluded.project_id,
          name = excluded.name,
          type = excluded.type,
          description = excluded.description,
          owner_character_id = excluded.owner_character_id,
          tags_json = excluded.tags_json,
          color = excluded.color,
          sort_order = excluded.sort_order,
          related_scene_ids_json = excluded.related_scene_ids_json,
          related_character_ids_json = excluded.related_character_ids_json,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `)
      const activeIds = new Set<string>()
      for (const prop of request.propItems) {
        activeIds.add(prop.id)
        upsert.run(
          prop.id,
          request.projectId,
          prop.name,
          prop.type,
          prop.description,
          prop.ownerCharacterId ?? '',
          JSON.stringify(prop.tags ?? []),
          prop.color ?? '',
          prop.sortOrder,
          JSON.stringify(prop.relatedSceneIds ?? []),
          JSON.stringify(prop.relatedCharacterIds ?? []),
          prop.createdAt,
          prop.updatedAt
        )
      }
      deleteMissingRows(db, 'prop_items', request.projectId, activeIds)
      cleanupDeletedPropReferences(db, request.projectId, activeIds)
    }

    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
