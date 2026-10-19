/**
 * v1.37.0（schema 4→5，破坏性）：生图渠道由「四列单套配置」改为「image_profiles_json 多套配置」。
 *
 * 单独成模块有两个原因：
 * 1. 顺序不可颠倒——先删列会把用户已填的 API Key 一起带走，所以必须先归一再 DROP；
 * 2. workspace-store.ts 的依赖链里有大量无扩展名相对导入，node 测试跑不起来，
 *    把这段迁移抽出来才能被单测直接覆盖。
 */

import type { DatabaseSync } from 'node:sqlite'
import { type ImageProfile, legacyImageColumnsToProfile } from '../shared/image-profile.ts'

const LEGACY_IMAGE_COLUMNS = ['image_provider', 'image_model', 'image_api_key', 'image_base_url'] as const

function readColumnNames(db: DatabaseSync): Set<string> {
  const columns = db.prepare(`PRAGMA table_info('app_settings')`).all() as Array<{ name: string }>
  return new Set(columns.map((column) => column.name))
}

function parseProfiles(raw: string | null | undefined): ImageProfile[] {
  try {
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as ImageProfile[]) : []
  } catch {
    return []
  }
}

/** 幂等：新库直接补两列，旧库先把四列收成一条配置再删列 */
export function applyImageProfileSchema(db: DatabaseSync): void {
  const before = readColumnNames(db)

  if (!before.has('image_profiles_json')) {
    db.exec(`ALTER TABLE app_settings ADD COLUMN image_profiles_json TEXT NOT NULL DEFAULT '[]';`)
  }

  if (!before.has('active_image_profile_id')) {
    db.exec(`ALTER TABLE app_settings ADD COLUMN active_image_profile_id TEXT NOT NULL DEFAULT '';`)
  }

  if (before.has('image_provider')) {
    migrateLegacyImageColumns(db)
  }
}

function migrateLegacyImageColumns(db: DatabaseSync): void {
  const row = db.prepare(`
    SELECT image_provider, image_model, image_api_key, image_base_url, image_profiles_json
    FROM app_settings WHERE id = 1
  `).get() as
    | {
        image_provider: string
        image_model: string
        image_api_key: string
        image_base_url: string
        image_profiles_json: string
      }
    | undefined

  if (row && parseProfiles(row.image_profiles_json).length === 0) {
    const profile = legacyImageColumnsToProfile({
      imageProvider: row.image_provider,
      imageModel: row.image_model,
      imageApiKey: row.image_api_key,
      imageBaseUrl: row.image_base_url
    })
    if (profile) {
      db.prepare(`UPDATE app_settings SET image_profiles_json = ?, active_image_profile_id = ? WHERE id = 1`)
        .run(JSON.stringify([profile]), profile.id)
    }
  }

  const after = readColumnNames(db)
  for (const column of LEGACY_IMAGE_COLUMNS) {
    if (after.has(column)) db.exec(`ALTER TABLE app_settings DROP COLUMN ${column};`)
  }
}
