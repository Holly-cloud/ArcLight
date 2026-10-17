/**
 * v1.32.0 schema 3→4 破坏性迁移回归测试（`ensureWorkbenchDissolutionSchema`）
 *
 * 关键断言（防灾难性回归）：
 * - 删参考作品库 / 改编运行两张表；
 * - 重建 projects 去掉 reference_works_json 列，且**其余列与行数据保留**；
 * - ⚠️ 子表（`REFERENCES projects(id) ON DELETE CASCADE`）数据**不得被级联清空**
 *   —— 迁移内部必须 `PRAGMA foreign_keys = OFF` 后重建父表。
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'

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

const { ensureWorkbenchDissolutionSchema, WORKSPACE_SCHEMA_VERSION } = await import('./workspace-store.ts')

function tableNames(db) {
  return db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((row) => row.name)
}

/** 构造"旧格式"库：projects 含 reference_works_json，另有参考作品/改编两表与一张级联子表。 */
function createLegacyDb() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      genre TEXT NOT NULL,
      word_count TEXT NOT NULL DEFAULT '0',
      writing_style_preset_id TEXT NOT NULL DEFAULT 'cinematic-cool',
      skill_policy_json TEXT NOT NULL DEFAULT '{"mode":"auto","skillIds":[]}',
      reference_works_json TEXT NOT NULL DEFAULT '[]'
    ) STRICT;

    CREATE TABLE reference_works (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL
    ) STRICT;

    CREATE TABLE adaptation_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      reference_work_id TEXT NOT NULL
    ) STRICT;

    -- 级联子表（模拟 worldview/characters/chapters 等同构关系）
    CREATE TABLE worldview_entries (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
    ) STRICT;

    INSERT INTO projects (id, title, genre, word_count, writing_style_preset_id, reference_works_json)
      VALUES ('p1', '旧项目', '都市', '12345', 'minimal-clean', '[{"id":"w1"}]');
    INSERT INTO reference_works (id, title) VALUES ('w1', '参考书甲');
    INSERT INTO adaptation_runs (id, project_id, reference_work_id) VALUES ('r1', 'p1', 'w1');
    INSERT INTO worldview_entries (id, project_id, title) VALUES ('e1', 'p1', '设定甲');
  `)
  return db
}

test('ensureWorkbenchDissolutionSchema：删两表 + 去列，且父表与级联子表数据不丢', () => {
  const db = createLegacyDb()

  ensureWorkbenchDissolutionSchema(db)

  const names = tableNames(db)
  assert.ok(!names.includes('reference_works'), 'reference_works 应被删除')
  assert.ok(!names.includes('adaptation_runs'), 'adaptation_runs 应被删除')

  const projectColumns = db.prepare(`PRAGMA table_info('projects')`).all().map((column) => column.name)
  assert.ok(!projectColumns.includes('reference_works_json'), 'projects 不应再有 reference_works_json 列')

  // 重建保真度：其余列的类型 / NOT NULL / 带引号 DEFAULT 必须原样保留
  const createSql = db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'projects'`).get().sql
  assert.ok(createSql.includes(`writing_style_preset_id TEXT NOT NULL DEFAULT 'cinematic-cool'`), '列类型/默认值应保留')
  assert.ok(createSql.includes(`skill_policy_json TEXT NOT NULL DEFAULT '{"mode":"auto","skillIds":[]}'`), '含引号的默认值应保留')
  assert.ok(createSql.includes('STRICT'), 'STRICT 属性应保留')

  // 父表行与其余列保留（node:sqlite 行对象为 null-prototype，逐字段断言）
  const project = db
    .prepare(`SELECT id, title, genre, word_count AS wordCount, writing_style_preset_id AS preset, skill_policy_json AS policy FROM projects`)
    .get()
  assert.equal(project.id, 'p1')
  assert.equal(project.title, '旧项目')
  assert.equal(project.genre, '都市')
  assert.equal(project.wordCount, '12345')
  assert.equal(project.preset, 'minimal-clean')
  assert.equal(project.policy, '{"mode":"auto","skillIds":[]}')

  // ⚠️ 子表数据不得被级联清空
  const childCount = db.prepare(`SELECT COUNT(*) AS count FROM worldview_entries`).get().count
  assert.equal(childCount, 1, '级联子表数据必须保留（迁移内部已关闭外键）')
})

test('ensureWorkbenchDissolutionSchema：幂等（再次调用无副作用，表结构不变）', () => {
  const db = createLegacyDb()

  ensureWorkbenchDissolutionSchema(db)
  const columnsAfterFirst = db.prepare(`PRAGMA table_info('projects')`).all().map((column) => column.name)

  ensureWorkbenchDissolutionSchema(db)
  const columnsAfterSecond = db.prepare(`PRAGMA table_info('projects')`).all().map((column) => column.name)

  assert.deepEqual(columnsAfterSecond, columnsAfterFirst)
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM worldview_entries`).get().count, 1)
})

test('WORKSPACE_SCHEMA_VERSION 已升到 4（破坏性迁移标记）', () => {
  assert.equal(WORKSPACE_SCHEMA_VERSION, 4)
})
