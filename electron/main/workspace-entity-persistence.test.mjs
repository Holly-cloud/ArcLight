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
      description TEXT NOT NULL, avatar TEXT NOT NULL, tags_json TEXT NOT NULL,
      visual_style_json TEXT NOT NULL DEFAULT ''
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
  const insertCharacter = db.prepare(`INSERT INTO characters VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
  insertCharacter.run('char-keep', 'project-1', '保留角色', '', '', '', '[]', '')
  insertCharacter.run('char-delete', 'project-1', '删除角色', '', '', '', '[]', '')
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
  const insertCharacter = db.prepare(`INSERT INTO characters VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
  insertCharacter.run('char-keep', 'project-1', '保留角色', '', '', '', '[]', '')
  insertCharacter.run('char-gone', 'project-1', '删除角色', '', '', '', '[]', '')
  db.prepare(`INSERT INTO scene_locations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'scene-1', 'project-1', '场景', '城市', '', '[]', '', 0, '["char-keep","char-gone"]', '[]', '2026-10-01', '2026-10-01', ''
  )
  db.prepare(`INSERT INTO prop_items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'prop-1', 'project-1', '道具', '武器', '', 'char-gone', '[]', '', 0, '[]', '["char-keep","char-gone"]', '2026-10-01', '2026-10-01', ''
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
  db.prepare(`INSERT INTO scene_locations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'scene-1', 'project-1', '场景', '城市', '', '[]', '', 0, '[]', '["prop-keep","prop-gone"]', '2026-10-01', '2026-10-01', ''
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

test('角色视觉风格 / 场景·道具视觉上下文可增量保存并完整读回（空值默认空串）', () => {
  const db = createDb()

  writeWorkspaceEntities(db, {
    projectId: 'project-1',
    characters: [{
      id: 'char-1',
      name: '云澈',
      role: '主角',
      description: '',
      avatar: '',
      tags: [],
      visualStyle: {
        renderMode: 'anime',
        palette: ['#1b3a5b', '#f2d9a0'],
        moodWords: ['冷峻', '坚定'],
        keyReferences: ['水墨青绿']
      }
    }],
    sceneLocations: [{
      id: 'scene-1',
      name: '云顶城',
      type: '城市',
      description: '',
      tags: [],
      color: '',
      sortOrder: 0,
      relatedCharacterIds: [],
      relatedPropIds: [],
      createdAt: '2026-10-01',
      updatedAt: '2026-10-01',
      visualContext: {
        colorPalette: ['#334455'],
        lightingNote: '晨光斜射',
        seasonNote: '初春',
        materialityNote: '青石'
      }
    }],
    propItems: [{
      id: 'prop-1',
      name: '断魂剑',
      type: '武器',
      description: '',
      ownerCharacterId: '',
      tags: [],
      color: '',
      sortOrder: 0,
      relatedSceneIds: [],
      relatedCharacterIds: [],
      createdAt: '2026-10-01',
      updatedAt: '2026-10-01',
      visualContext: {
        colorPalette: ['#9c9c9c'],
        lightingNote: '冷光',
        seasonNote: '',
        materialityNote: '寒铁'
      }
    }]
  })

  const character = JSON.parse(db.prepare(`SELECT visual_style_json AS v FROM characters`).get().v)
  assert.equal(character.renderMode, 'anime')
  assert.deepEqual(character.palette, ['#1b3a5b', '#f2d9a0'])
  assert.deepEqual(character.moodWords, ['冷峻', '坚定'])

  const scene = JSON.parse(db.prepare(`SELECT visual_context_json AS v FROM scene_locations`).get().v)
  assert.equal(scene.lightingNote, '晨光斜射')
  assert.deepEqual(scene.colorPalette, ['#334455'])

  const prop = JSON.parse(db.prepare(`SELECT visual_context_json AS v FROM prop_items`).get().v)
  assert.equal(prop.materialityNote, '寒铁')

  // 视觉字段为 null / 缺省时写回空串（向后兼容，不抛错）
  writeWorkspaceEntities(db, {
    projectId: 'project-1',
    characters: [{
      id: 'char-1', name: '云澈', role: '主角', description: '', avatar: '', tags: [], visualStyle: null
    }]
  })
  assert.equal(db.prepare(`SELECT visual_style_json AS v FROM characters`).get().v, '')
})
