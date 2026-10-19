import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'

import { applyImageProfileSchema } from './workspace-image-profile-migration.ts'

// workspace-store.ts 内部使用无扩展名相对导入与 @shared 别名，沿用既有 registerHooks 范式。
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@shared/')) {
      return nextResolve(new URL(`../shared/${specifier.slice(8)}.ts`, import.meta.url).href, context)
    }
    if (specifier.startsWith('.') && context.parentURL) {
      if (specifier.endsWith('.ts') || specifier.endsWith('.js')) return nextResolve(specifier, context)
      const candidate = new URL(`${specifier}.ts`, context.parentURL)
      if (existsSync(candidate)) return nextResolve(candidate.href, context)
    }
    return nextResolve(specifier, context)
  }
})

const { WORKSPACE_SCHEMA_VERSION } = await import('./workspace-store.ts')

test('schemaVersion 升到 5（v1.37.0 生图渠道改多套配置：删旧四列）', () => {
  assert.equal(WORKSPACE_SCHEMA_VERSION, 5)
})

/** schema 4 的 app_settings：生图渠道是四个独立列，只能存一套 */
const LEGACY_DDL = `
  CREATE TABLE app_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    theme TEXT NOT NULL,
    selected_project_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    api_key TEXT NOT NULL,
    base_url TEXT NOT NULL,
    ai_profiles_json TEXT NOT NULL DEFAULT '[]',
    active_ai_profile_id TEXT NOT NULL DEFAULT '',
    image_provider TEXT NOT NULL DEFAULT '',
    image_model TEXT NOT NULL DEFAULT '',
    image_api_key TEXT NOT NULL DEFAULT '',
    image_base_url TEXT NOT NULL DEFAULT '',
    auto_save_interval TEXT NOT NULL,
    dark_mode_style TEXT NOT NULL DEFAULT 'standard'
  ) STRICT;
`

/** schema 5 新建库的形状 */
const CURRENT_DDL = `
  CREATE TABLE app_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    theme TEXT NOT NULL,
    selected_project_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    api_key TEXT NOT NULL,
    base_url TEXT NOT NULL,
    ai_profiles_json TEXT NOT NULL DEFAULT '[]',
    active_ai_profile_id TEXT NOT NULL DEFAULT '',
    image_profiles_json TEXT NOT NULL DEFAULT '[]',
    active_image_profile_id TEXT NOT NULL DEFAULT '',
    auto_save_interval TEXT NOT NULL,
    dark_mode_style TEXT NOT NULL DEFAULT 'standard'
  ) STRICT;
`

function createLegacyDb(legacyImageColumns = {}) {
  const db = new DatabaseSync(':memory:')
  db.exec(LEGACY_DDL)
  db.prepare(`
    INSERT INTO app_settings (id, theme, selected_project_id, provider, model, api_key, base_url, auto_save_interval,
      image_provider, image_model, image_api_key, image_base_url)
    VALUES (1, 'ocean', '', 'deepseek', 'deepseek-chat', '', 'https://api.deepseek.com/v1', '5m', ?, ?, ?, ?)
  `).run(
    legacyImageColumns.imageProvider ?? '',
    legacyImageColumns.imageModel ?? '',
    legacyImageColumns.imageApiKey ?? '',
    legacyImageColumns.imageBaseUrl ?? ''
  )
  return db
}

function columnNames(db) {
  return (db.prepare(`PRAGMA table_info('app_settings')`).all()).map((column) => column.name)
}

function readRow(db) {
  return db.prepare(`SELECT image_profiles_json, active_image_profile_id FROM app_settings WHERE id = 1`).get()
}

test('schema 4→5：旧四列收成一条配置，API Key 原样保留', () => {
  const db = createLegacyDb({
    imageProvider: 'custom-openai-compatible',
    imageModel: 'gpt-image-1',
    imageApiKey: 'sk-用户填的key',
    imageBaseUrl: 'https://compat.test/v1'
  })

  applyImageProfileSchema(db)

  const row = readRow(db)
  assert.deepEqual(JSON.parse(row.image_profiles_json), [{
    id: 'legacy-image-profile',
    name: '迁移自旧配置',
    protocol: 'openai-images',
    baseUrl: 'https://compat.test/v1',
    apiKey: 'sk-用户填的key',
    model: 'gpt-image-1'
  }])
  assert.equal(row.active_image_profile_id, 'legacy-image-profile')
  db.close()
})

test('schema 4→5：旧列指向 GRS 主机时协议判为 grsai', () => {
  const db = createLegacyDb({
    imageProvider: '',
    imageModel: 'nano-banana-fast',
    imageApiKey: 'sk-grsai',
    imageBaseUrl: 'https://api.grsaiapi.com/v1'
  })

  applyImageProfileSchema(db)

  assert.equal(JSON.parse(readRow(db).image_profiles_json)[0].protocol, 'grsai')
  db.close()
})

test('schema 4→5：旧四列全空时不产生幽灵配置', () => {
  const db = createLegacyDb()

  applyImageProfileSchema(db)

  const row = readRow(db)
  assert.equal(row.image_profiles_json, '[]')
  assert.equal(row.active_image_profile_id, '')
  db.close()
})

test('schema 4→5：image_base_url 为空时不回填语言模型 base_url', () => {
  const db = createLegacyDb({ imageModel: 'gpt-image-1', imageApiKey: 'sk-key' })

  applyImageProfileSchema(db)

  // transport 从来只读 imageBaseUrl；回填会让升级后的生图静默打到语言模型端点
  assert.equal(JSON.parse(readRow(db).image_profiles_json)[0].baseUrl, '')
  db.close()
})

test('schema 4→5：四列被删除，升级库与新建库的列集合一致', () => {
  const upgraded = createLegacyDb({ imageModel: 'gpt-image-1' })
  applyImageProfileSchema(upgraded)

  const fresh = new DatabaseSync(':memory:')
  fresh.exec(CURRENT_DDL)
  applyImageProfileSchema(fresh)

  for (const column of ['image_provider', 'image_model', 'image_api_key', 'image_base_url']) {
    assert.equal(columnNames(upgraded).includes(column), false, `${column} 应已删除`)
  }
  // 列顺序不同（升级库把新列追加在末尾），但所有读写都显式列名，只需集合一致
  assert.deepEqual([...columnNames(upgraded)].sort(), [...columnNames(fresh)].sort())

  upgraded.close()
  fresh.close()
})

test('schema 4→5：重复执行不报错，也不会覆盖用户后来新建的配置', () => {
  const db = createLegacyDb({ imageModel: 'gpt-image-1', imageApiKey: 'sk-old' })
  applyImageProfileSchema(db)

  db.prepare(`UPDATE app_settings SET image_profiles_json = ?, active_image_profile_id = ? WHERE id = 1`)
    .run(JSON.stringify([{
      id: 'profile-user',
      name: '用户新建',
      protocol: 'openai-images',
      baseUrl: 'https://compat.test/v1',
      apiKey: 'sk-new',
      model: 'gpt-image-1'
    }]), 'profile-user')

  applyImageProfileSchema(db)

  const row = readRow(db)
  assert.equal(JSON.parse(row.image_profiles_json)[0].id, 'profile-user')
  assert.equal(row.active_image_profile_id, 'profile-user')
  db.close()
})

test('schema 5 新建库：只补两列，不做任何迁移', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(CURRENT_DDL)
  db.prepare(`
    INSERT INTO app_settings (id, theme, selected_project_id, provider, model, api_key, base_url, auto_save_interval)
    VALUES (1, 'ocean', '', 'deepseek', 'deepseek-chat', '', 'https://api.deepseek.com/v1', '5m')
  `).run()

  applyImageProfileSchema(db)

  assert.equal(readRow(db).image_profiles_json, '[]')
  assert.equal(columnNames(db).includes('image_provider'), false)
  db.close()
})
