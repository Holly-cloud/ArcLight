import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'

// workspace-store.ts 内部大量使用无扩展名相对导入与 @shared 别名，
// 需借助 node:module 的 registerHooks 解析（沿用 project-archive.test.mjs 范式）。
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

const { WORKSPACE_SCHEMA_VERSION, ensureEntityVisualColumns } = await import('./workspace-store.ts')

/** 读取某表全部列名（PRAGMA table_info）。 */
function tableColumns(db, table) {
  return db.prepare(`PRAGMA table_info('${table}')`).all().map((column) => column.name)
}

/**
 * 构造"旧格式"库：characters / scene_locations / prop_items / projects 均**不含**视觉列。
 * 与 v1.26.0 及更早版本的建表结构一致。
 */
function createLegacyDb() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE characters (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL,
      description TEXT NOT NULL, avatar TEXT NOT NULL, tags_json TEXT NOT NULL
    ) STRICT;
    CREATE TABLE scene_locations (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL,
      description TEXT NOT NULL, tags_json TEXT NOT NULL DEFAULT '[]', color TEXT NOT NULL,
      sort_order INTEGER NOT NULL, related_character_ids_json TEXT NOT NULL DEFAULT '[]',
      related_prop_ids_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE prop_items (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL,
      description TEXT NOT NULL, owner_character_id TEXT NOT NULL DEFAULT '', tags_json TEXT NOT NULL DEFAULT '[]',
      color TEXT NOT NULL, sort_order INTEGER NOT NULL, related_scene_ids_json TEXT NOT NULL DEFAULT '[]',
      related_character_ids_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE projects (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, genre TEXT NOT NULL
    ) STRICT;
  `)
  return db
}

/** 构造"新格式"库：已含全部视觉列（等价于已升级库）。 */
function createUpgradedDb() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE characters (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL,
      description TEXT NOT NULL, avatar TEXT NOT NULL, tags_json TEXT NOT NULL,
      visual_style_json TEXT NOT NULL DEFAULT ''
    ) STRICT;
    CREATE TABLE scene_locations (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL,
      description TEXT NOT NULL, tags_json TEXT NOT NULL DEFAULT '[]', color TEXT NOT NULL,
      sort_order INTEGER NOT NULL, related_character_ids_json TEXT NOT NULL DEFAULT '[]',
      related_prop_ids_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      visual_context_json TEXT NOT NULL DEFAULT ''
    ) STRICT;
    CREATE TABLE prop_items (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL,
      description TEXT NOT NULL, owner_character_id TEXT NOT NULL DEFAULT '', tags_json TEXT NOT NULL DEFAULT '[]',
      color TEXT NOT NULL, sort_order INTEGER NOT NULL, related_scene_ids_json TEXT NOT NULL DEFAULT '[]',
      related_character_ids_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      visual_context_json TEXT NOT NULL DEFAULT ''
    ) STRICT;
    CREATE TABLE projects (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, genre TEXT NOT NULL,
      project_visual_style_json TEXT NOT NULL DEFAULT ''
    ) STRICT;
  `)
  return db
}

test('schemaVersion 升到 4（v1.32 解散工作台：删参考作品/改编表、projects 去列）', () => {
  assert.equal(WORKSPACE_SCHEMA_VERSION, 4)
})

test('旧格式库迁移：4 张表补齐视觉列，且旧行值默认为空串', () => {
  const db = createLegacyDb()
  // 旧行：无视觉数据的既有资产
  db.prepare(`INSERT INTO characters VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    'char-legacy', 'project-1', '旧角色', '主角', '描述', '', '[]'
  )
  db.prepare(`INSERT INTO scene_locations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'scene-legacy', 'project-1', '旧场景', '城市', '', '[]', '', 0, '[]', '[]', '2026-01-01', '2026-01-01'
  )
  db.prepare(`INSERT INTO prop_items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'prop-legacy', 'project-1', '旧道具', '武器', '', '', '[]', '', 0, '[]', '[]', '2026-01-01', '2026-01-01'
  )
  db.prepare(`INSERT INTO projects VALUES (?, ?, ?)`).run('project-1', '旧项目', '玄幻')

  ensureEntityVisualColumns(db)

  // 4 个新列存在
  assert.ok(tableColumns(db, 'characters').includes('visual_style_json'), 'characters 应补 visual_style_json')
  assert.ok(tableColumns(db, 'scene_locations').includes('visual_context_json'), 'scene_locations 应补 visual_context_json')
  assert.ok(tableColumns(db, 'prop_items').includes('visual_context_json'), 'prop_items 应补 visual_context_json')
  assert.ok(tableColumns(db, 'projects').includes('project_visual_style_json'), 'projects 应补 project_visual_style_json')

  // 旧行默认值为空串（向后兼容：读取侧再回退为 null）
  assert.equal(db.prepare(`SELECT visual_style_json AS v FROM characters`).get().v, '')
  assert.equal(db.prepare(`SELECT visual_context_json AS v FROM scene_locations`).get().v, '')
  assert.equal(db.prepare(`SELECT visual_context_json AS v FROM prop_items`).get().v, '')
  assert.equal(db.prepare(`SELECT project_visual_style_json AS v FROM projects`).get().v, '')

  // 旧行其余数据保持不变
  assert.equal(db.prepare(`SELECT name FROM characters`).get().name, '旧角色')
  assert.equal(db.prepare(`SELECT title FROM projects`).get().title, '旧项目')
  db.close()
})

test('新格式（已升级）库重复调用迁移守卫：幂等、不报错、不重复加列', () => {
  const db = createUpgradedDb()

  assert.doesNotThrow(() => ensureEntityVisualColumns(db))
  assert.doesNotThrow(() => ensureEntityVisualColumns(db))

  // 每列各出现一次（未被重复添加）
  const charColumns = tableColumns(db, 'characters')
  assert.equal(charColumns.filter((name) => name === 'visual_style_json').length, 1, 'visual_style_json 不应重复')
  const sceneColumns = tableColumns(db, 'scene_locations')
  assert.equal(sceneColumns.filter((name) => name === 'visual_context_json').length, 1, 'scene visual_context_json 不应重复')
  const propColumns = tableColumns(db, 'prop_items')
  assert.equal(propColumns.filter((name) => name === 'visual_context_json').length, 1, 'prop visual_context_json 不应重复')
  const projectColumns = tableColumns(db, 'projects')
  assert.equal(projectColumns.filter((name) => name === 'project_visual_style_json').length, 1, 'project 视觉列不应重复')

  // 已存视觉数据不被覆盖
  db.prepare(`INSERT INTO characters VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'char-new', 'project-1', '新角色', '主角', '', '', '[]', '{"renderMode":"anime","palette":["#fff"],"moodWords":[],"keyReferences":[]}'
  )
  ensureEntityVisualColumns(db)
  assert.match(db.prepare(`SELECT visual_style_json AS v FROM characters`).get().v, /"renderMode":"anime"/)
  db.close()
})

test('旧格式库连续两次迁移：幂等且不破坏已补列数据', () => {
  const db = createLegacyDb()
  db.prepare(`INSERT INTO characters VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    'char-1', 'project-1', '角色', '主角', '', '', '[]'
  )

  ensureEntityVisualColumns(db)
  ensureEntityVisualColumns(db)

  assert.ok(tableColumns(db, 'characters').includes('visual_style_json'))
  assert.equal(tableColumns(db, 'characters').filter((name) => name === 'visual_style_json').length, 1)
  assert.equal(db.prepare(`SELECT visual_style_json AS v FROM characters`).get().v, '')
  db.close()
})
