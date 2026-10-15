import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { writeWorkspaceEntities } from './workspace-entity-persistence.ts'

function createDb() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE worldview_entries (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL,
      content TEXT NOT NULL, sort_order INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE characters (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL,
      description TEXT NOT NULL, avatar TEXT NOT NULL, tags_json TEXT NOT NULL
    ) STRICT;
    CREATE TABLE inspiration_entries (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL,
      content TEXT NOT NULL, tags_json TEXT NOT NULL, source TEXT NOT NULL, sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE character_relationships (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, from_character_id TEXT NOT NULL,
      to_character_id TEXT NOT NULL
    ) STRICT;
    CREATE TABLE organization_memberships (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, character_id TEXT NOT NULL
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
    CREATE TABLE adaptation_runs (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, reference_work_id TEXT NOT NULL,
      source_title TEXT NOT NULL, source_content_hash TEXT NOT NULL,
      source_chapter_count INTEGER NOT NULL, target_episode_count INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft', payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    ) STRICT;
  `)
  return db
}

test('实体增量保存会更新排序并删除当前项目中的旧行', () => {
  const db = createDb()
  db.prepare(`INSERT INTO worldview_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'world-old', 'project-1', '历史', '旧条目', '旧内容', 0, '2026-01-01', '2026-01-01'
  )
  db.prepare(`INSERT INTO worldview_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'world-keep', 'project-1', '地理', '旧标题', '旧内容', 1, '2026-01-01', '2026-01-01'
  )

  writeWorkspaceEntities(db, {
    projectId: 'project-1',
    worldviewEntries: [{
      id: 'world-keep',
      type: '法则',
      title: '新标题',
      content: '新内容',
      sortOrder: 0,
      createdAt: '2026-01-01',
      updatedAt: '2026-10-02'
    }]
  })

  const rows = db.prepare(`SELECT id, type, title, sort_order AS sortOrder FROM worldview_entries`)
    .all()
    .map((row) => ({ ...row }))
  assert.deepEqual(rows, [{ id: 'world-keep', type: '法则', title: '新标题', sortOrder: 0 }])
})

test('删除角色时会在同一事务清理关系和组织归属', () => {
  const db = createDb()
  const insertCharacter = db.prepare(`INSERT INTO characters VALUES (?, ?, ?, ?, ?, ?, ?)`)
  insertCharacter.run('char-keep', 'project-1', '保留角色', '', '', '', '[]')
  insertCharacter.run('char-delete', 'project-1', '删除角色', '', '', '', '[]')
  db.prepare(`INSERT INTO character_relationships VALUES (?, ?, ?, ?)`).run(
    'rel-delete', 'project-1', 'char-keep', 'char-delete'
  )
  db.prepare(`INSERT INTO organization_memberships VALUES (?, ?, ?)`).run(
    'membership-delete', 'project-1', 'char-delete'
  )

  writeWorkspaceEntities(db, {
    projectId: 'project-1',
    characters: [{
      id: 'char-keep',
      name: '保留角色（更新）',
      role: '主角',
      description: '',
      avatar: '',
      tags: []
    }]
  })

  assert.deepEqual(db.prepare(`SELECT id, name FROM characters`).all().map((row) => ({ ...row })), [
    { id: 'char-keep', name: '保留角色（更新）' }
  ])
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM character_relationships`).get().count, 0)
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM organization_memberships`).get().count, 0)
})

test('灵感集合以最后一次快照为准并删除旧卡片', () => {
  const db = createDb()
  db.prepare(`INSERT INTO inspiration_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'idea-old', 'project-1', '场景火花', '旧灵感', '旧内容', '[]', 'manual', 0, '2026-01-01', '2026-01-01'
  )

  writeWorkspaceEntities(db, {
    projectId: 'project-1',
    inspirationEntries: [{
      id: 'idea-new',
      type: '剧情转折',
      title: '新灵感',
      content: '新内容',
      tags: ['反转'],
      source: 'manual',
      sortOrder: 0,
      createdAt: '2026-10-02',
      updatedAt: '2026-10-02'
    }]
  })

  assert.deepEqual(
    db.prepare(`SELECT id, title, tags_json AS tagsJson FROM inspiration_entries`).all().map((row) => ({ ...row })),
    [{ id: 'idea-new', title: '新灵感', tagsJson: '["反转"]' }]
  )
})

test('场景与道具可增量保存并在重启后完整读回', () => {
  const db = createDb()

  writeWorkspaceEntities(db, {
    projectId: 'project-1',
    sceneLocations: [{
      id: 'scene-1',
      name: '云顶城',
      type: '城市',
      description: '悬于山巅的城池',
      tags: [{ label: '主舞台', tone: 'success' }],
      color: '',
      sortOrder: 0,
      relatedCharacterIds: ['char-1'],
      relatedPropIds: ['prop-1'],
      createdAt: '2026-10-01',
      updatedAt: '2026-10-01'
    }],
    propItems: [{
      id: 'prop-1',
      name: '断魂剑',
      type: '武器',
      description: '主角随身佩剑',
      ownerCharacterId: 'char-1',
      tags: [{ label: '线索物' }],
      color: '',
      sortOrder: 0,
      relatedSceneIds: ['scene-1'],
      relatedCharacterIds: [],
      createdAt: '2026-10-01',
      updatedAt: '2026-10-01'
    }]
  })

  const scene = db.prepare(`
    SELECT id, name, related_character_ids_json AS charsJson, related_prop_ids_json AS propsJson
    FROM scene_locations
  `).get()
  assert.deepEqual({ ...scene }, {
    id: 'scene-1',
    name: '云顶城',
    charsJson: '["char-1"]',
    propsJson: '["prop-1"]'
  })

  const prop = db.prepare(`
    SELECT id, owner_character_id AS ownerCharacterId, related_scene_ids_json AS scenesJson
    FROM prop_items
  `).get()
  assert.deepEqual({ ...prop }, {
    id: 'prop-1',
    ownerCharacterId: 'char-1',
    scenesJson: '["scene-1"]'
  })

  // 删除被移除的行：再次写入只保留 scene-1 时旧场景应被清除
  writeWorkspaceEntities(db, {
    projectId: 'project-1',
    sceneLocations: [{
      id: 'scene-2',
      name: '落雪谷',
      type: '自然地形',
      description: '常年积雪的峡谷',
      tags: [],
      color: '',
      sortOrder: 0,
      relatedCharacterIds: [],
      relatedPropIds: [],
      createdAt: '2026-10-02',
      updatedAt: '2026-10-02'
    }]
  })

  assert.deepEqual(
    db.prepare(`SELECT id FROM scene_locations ORDER BY id`).all().map((row) => ({ ...row })),
    [{ id: 'scene-2' }]
  )
})

test('删除角色会重写场景/道具的悬空引用，持有者置空', () => {
  const db = createDb()
  const insertCharacter = db.prepare(`INSERT INTO characters VALUES (?, ?, ?, ?, ?, ?, ?)`)
  insertCharacter.run('char-keep', 'project-1', '保留角色', '', '', '', '[]')
  insertCharacter.run('char-gone', 'project-1', '删除角色', '', '', '', '[]')
  db.prepare(`INSERT INTO scene_locations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'scene-1', 'project-1', '场景', '城市', '', '[]', '', 0, '["char-keep","char-gone"]', '[]', '2026-10-01', '2026-10-01'
  )
  db.prepare(`INSERT INTO prop_items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'prop-1', 'project-1', '道具', '武器', '', 'char-gone', '[]', '', 0, '[]', '["char-keep","char-gone"]', '2026-10-01', '2026-10-01'
  )

  writeWorkspaceEntities(db, {
    projectId: 'project-1',
    characters: [{
      id: 'char-keep',
      name: '保留角色',
      role: '',
      description: '',
      avatar: '',
      tags: []
    }]
  })

  const scene = db.prepare(`SELECT related_character_ids_json AS charsJson FROM scene_locations`).get()
  assert.equal(scene.charsJson, '["char-keep"]')

  const prop = db.prepare(`SELECT owner_character_id AS owner, related_character_ids_json AS charsJson FROM prop_items`).get()
  assert.equal(prop.owner, '')
  assert.equal(prop.charsJson, '["char-keep"]')
})

test('删除道具会清理场景侧 related_prop_ids 悬空引用', () => {
  const db = createDb()
  db.prepare(`INSERT INTO scene_locations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'scene-1', 'project-1', '场景', '城市', '', '[]', '', 0, '[]', '["prop-keep","prop-gone"]', '2026-10-01', '2026-10-01'
  )

  writeWorkspaceEntities(db, {
    projectId: 'project-1',
    propItems: [{
      id: 'prop-keep',
      name: '保留道具',
      type: '信物',
      description: '',
      ownerCharacterId: '',
      tags: [],
      color: '',
      sortOrder: 0,
      relatedSceneIds: [],
      relatedCharacterIds: [],
      createdAt: '2026-10-02',
      updatedAt: '2026-10-02'
    }]
  })

  const scene = db.prepare(`SELECT related_prop_ids_json AS propsJson FROM scene_locations`).get()
  assert.equal(scene.propsJson, '["prop-keep"]')
})

test('adaptation_runs round-trip：创建 run → upsert → 再次写入保持一致', () => {
  const db = createDb()
  const initial = {
    projectId: 'project-1',
    adaptationRuns: [{
      id: 'adapt-run-1',
      referenceWorkId: 'ref-1',
      sourceTitle: '测试源',
      sourceContentHash: 'hash',
      sourceChapterCount: 60,
      targetEpisodeCount: 80,
      status: 'running',
      payloadJson: JSON.stringify({ activeStage: 'lead', stageStates: [] }),
      createdAt: '2026-10-15T00:00:00.000Z',
      updatedAt: '2026-10-15T00:00:00.000Z'
    }]
  }
  writeWorkspaceEntities(db, initial)

  const row = db.prepare(`SELECT * FROM adaptation_runs WHERE id = ?`).get('adapt-run-1')
  assert.ok(row)
  assert.equal(row.reference_work_id, 'ref-1')
  assert.equal(row.status, 'running')
  assert.equal(row.target_episode_count, 80)

  // 再次写入：upsert 同一 id，状态更新为 completed
  writeWorkspaceEntities(db, {
    projectId: 'project-1',
    adaptationRuns: [{
      ...initial.adaptationRuns[0],
      status: 'completed',
      payloadJson: JSON.stringify({ activeStage: 'tone', stageStates: [] }),
      updatedAt: '2026-10-15T01:00:00.000Z'
    }]
  })

  const updated = db.prepare(`SELECT status, payload_json AS payloadJson FROM adaptation_runs WHERE id = ?`).get('adapt-run-1')
  assert.equal(updated.status, 'completed')
  const payload = JSON.parse(updated.payloadJson)
  assert.equal(payload.activeStage, 'tone')
})

test('删除参考作品时关联 adaptation_runs 标 archived 而非真删（双层兜底）', () => {
  const db = createDb()
  writeWorkspaceEntities(db, {
    projectId: 'project-1',
    adaptationRuns: [
      {
        id: 'adapt-run-1',
        referenceWorkId: 'ref-to-delete',
        sourceTitle: '测试源',
        sourceContentHash: 'hash',
        sourceChapterCount: 60,
        targetEpisodeCount: 80,
        status: 'running',
        payloadJson: '{}',
        createdAt: '2026-10-15T00:00:00.000Z',
        updatedAt: '2026-10-15T00:00:00.000Z'
      },
      {
        id: 'adapt-run-2',
        referenceWorkId: 'ref-keep',
        sourceTitle: '测试源2',
        sourceContentHash: 'hash2',
        sourceChapterCount: 60,
        targetEpisodeCount: 80,
        status: 'running',
        payloadJson: '{}',
        createdAt: '2026-10-15T00:00:00.000Z',
        updatedAt: '2026-10-15T00:00:00.000Z'
      }
    ]
  })

  // 触发级联：写一个空 activeIds 的 batch 模拟已删除 referenceWorkId
  // 这里直接 update 来模拟 store 级 archive 调用
  db.prepare(`UPDATE adaptation_runs SET status = 'archived' WHERE id = ?`).run('adapt-run-1')

  const archived = db.prepare(`SELECT status FROM adaptation_runs WHERE id = ?`).get('adapt-run-1')
  assert.equal(archived.status, 'archived')

  // 重新 writeWorkspaceEntities 时 archived 行不应被真删
  writeWorkspaceEntities(db, {
    projectId: 'project-1',
    adaptationRuns: [{
      id: 'adapt-run-2',
      referenceWorkId: 'ref-keep',
      sourceTitle: '测试源2',
      sourceContentHash: 'hash2',
      sourceChapterCount: 60,
      targetEpisodeCount: 80,
      status: 'running',
      payloadJson: '{}',
      createdAt: '2026-10-15T00:00:00.000Z',
      updatedAt: '2026-10-15T00:00:00.000Z'
    }]
  })

  const remaining = db.prepare(`SELECT id, status FROM adaptation_runs ORDER BY id`).all()
  // 仍保留 archived 行 + 更新后的 run-2
  assert.equal(remaining.length, 2)
  assert.equal(remaining[0].id, 'adapt-run-1')
  assert.equal(remaining[0].status, 'archived')
  assert.equal(remaining[1].id, 'adapt-run-2')
  assert.equal(remaining[1].status, 'running')
})
