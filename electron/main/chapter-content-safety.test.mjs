/**
 * 章节正文数据安全防回归测试。
 *
 * 背景：v1.21.0 曾引入过一起严重的数据丢失事故——保存分卷和章节时，
 * 连带删除了章节正文与历史版本，用户看到的现象是"只有第一章有内容，
 * 其余章节全部变空"。v1.21.1 修复后，正文保护的实现依赖两个约定：
 *
 *   1. `PersistedChapterRecord.contentLoaded === false` 表示"渲染层只有
 *      预览/列表数据，没有加载完整正文"，此时**绝不允许**用请求里的
 *      content 覆盖数据库中的正文（见 chapter-persistence.ts#writeChapterRows，
 *      以及 workspace-store.ts#writeWorkspaceSnapshot 的元数据分支）。
 *   2. 增量载荷必须是完整的：readChapterMutationPayload 只要发现任一章节
 *      不存在，就整体返回 null，避免用残缺载荷去写回。
 *
 * 本文件专门锁定这些约定。这里的用例不是为了覆盖新功能，而是为了在
 * 有人"顺手简化"这些分支时第一时间失败。
 *
 * ⚠️ 修改章节正文持久化相关代码后，务必先跑：
 *    pnpm run test:chapter-persistence
 */

import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

import { countChapterCharacters, ensureChapterContentMetadata } from './chapter-content-metadata.ts'
import {
  readChapterMutationPayload,
  writeChapterOrder,
  writeChapterRows
} from './chapter-persistence.ts'

const FULL_CONTENT = {
  'chapter-1': '<p>第一章完整正文，这段内容必须被完整保留。</p>',
  'chapter-2': '<p>第二章完整正文，用于验证未加载章节不会被覆盖。</p>',
  'chapter-3': '<p>第三章完整正文，排序变更后也应完好无损。</p>'
}

/** 列表态下前端仅持有很短的预览片段，一旦被写回就是数据丢失 */
const PREVIEW_TEXT = '预览片段…'

function createDb() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      word_count TEXT NOT NULL,
      last_edited TEXT NOT NULL
    ) STRICT;
    CREATE TABLE chapters (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      volume_id TEXT NOT NULL,
      outline_item_id TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      status TEXT NOT NULL,
      word_target TEXT NOT NULL,
      content TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE chapter_versions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      status TEXT NOT NULL,
      word_target TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;
  `)

  db.prepare('INSERT INTO projects (id, word_count, last_edited) VALUES (?, ?, ?)')
    .run('project-1', '共 300 字', '2026-10-01T00:00:00.000Z')
  db.prepare('INSERT INTO projects (id, word_count, last_edited) VALUES (?, ?, ?)')
    .run('project-2', '共 10 字', '2026-10-01T00:00:00.000Z')

  const insertChapter = db.prepare(`
    INSERT INTO chapters (
      id, project_id, volume_id, outline_item_id, title, summary,
      status, word_target, content, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertVersion = db.prepare(`
    INSERT INTO chapter_versions (
      id, project_id, chapter_id, title, summary, status, word_target, content, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  Object.entries(FULL_CONTENT).forEach(([id, content], index) => {
    const title = `第${index + 1}章`
    insertChapter.run(
      id, 'project-1', 'volume-1', '', title, `${title}摘要`,
      'draft', '预估 3000字', content, (index + 1) * 1024
    )
    insertVersion.run(
      `version-${index + 1}`, 'project-1', id, `${title}（历史）`, '', 'draft',
      '预估 3000字', `<p>${title}的历史版本正文</p>`, '2026-10-02T00:00:00.000Z'
    )
  })

  // 另一个项目的章节，用于验证保存不会越界影响其他项目
  insertChapter.run(
    'chapter-other', 'project-2', 'volume-other', '', '别项目的章节', '',
    'draft', '预估 3000字', '<p>别项目正文</p>', 1024
  )

  return db
}

function readChapterContents(db) {
  return Object.fromEntries(
    db.prepare('SELECT id, content FROM chapters ORDER BY id').all()
      .map((row) => [row.id, row.content])
  )
}

function readVersionContents(db) {
  return Object.fromEntries(
    db.prepare('SELECT id, content FROM chapter_versions ORDER BY id').all()
      .map((row) => [row.id, row.content])
  )
}

test('列表态批量保存（全部未加载正文）不会覆盖任何章节正文与历史版本', () => {
  const db = createDb()
  const contentsBefore = readChapterContents(db)
  const versionsBefore = readVersionContents(db)

  // 模拟"渲染层只持有目录树数据"时发起的一次批量保存
  writeChapterRows(db, {
    projectId: 'project-1',
    projectWordCount: '共 300 字',
    chapters: Object.keys(FULL_CONTENT).map((id, index) => ({
      id,
      outlineItemId: '',
      volumeId: 'volume-1',
      sortOrder: (index + 1) * 1024,
      title: `第${index + 1}章（列表态）`,
      summary: '从列表页批量改写的摘要',
      status: 'review',
      wordTarget: '预估 4000字',
      content: PREVIEW_TEXT,
      contentLoaded: false
    }))
  })

  // 元数据应当更新
  assert.equal(
    db.prepare('SELECT title FROM chapters WHERE id = ?').get('chapter-1').title,
    '第1章（列表态）'
  )
  // 正文与历史版本必须逐字保留
  assert.deepEqual(readChapterContents(db), contentsBefore)
  assert.deepEqual(readVersionContents(db), versionsBefore)

  db.close()
})

test('混批量保存只写入已加载章节，未加载与未提交章节正文保持不变', () => {
  const db = createDb()

  writeChapterRows(db, {
    projectId: 'project-1',
    projectWordCount: '共 400 字',
    chapters: [
      {
        id: 'chapter-1',
        outlineItemId: '',
        volumeId: 'volume-1',
        sortOrder: 1024,
        title: '第1章',
        summary: '',
        status: 'polish',
        wordTarget: '预估 3000字',
        content: '<p>第一章已加载的新正文</p>',
        contentLoaded: true
      },
      {
        id: 'chapter-2',
        outlineItemId: '',
        volumeId: 'volume-1',
        sortOrder: 2048,
        title: '第2章（仅改标题）',
        summary: '',
        status: 'draft',
        wordTarget: '预估 3000字',
        content: PREVIEW_TEXT,
        contentLoaded: false
      }
      // chapter-3 完全不在载荷里
    ]
  })

  assert.equal(
    db.prepare('SELECT content FROM chapters WHERE id = ?').get('chapter-1').content,
    '<p>第一章已加载的新正文</p>'
  )
  assert.equal(
    db.prepare('SELECT content FROM chapters WHERE id = ?').get('chapter-2').content,
    FULL_CONTENT['chapter-2']
  )
  assert.equal(
    db.prepare('SELECT content FROM chapters WHERE id = ?').get('chapter-3').content,
    FULL_CONTENT['chapter-3']
  )
  // 其他项目不受影响
  assert.equal(
    db.prepare('SELECT content FROM chapters WHERE id = ?').get('chapter-other').content,
    '<p>别项目正文</p>'
  )

  db.close()
})

test('未加载正文的章节在库中不存在时安全跳过，不会插入空正文行', () => {
  const db = createDb()

  writeChapterRows(db, {
    projectId: 'project-1',
    projectWordCount: '共 300 字',
    chapters: [{
      id: 'chapter-not-in-db',
      outlineItemId: '',
      volumeId: 'volume-1',
      sortOrder: 4096,
      title: '幽灵章节',
      summary: '',
      status: 'draft',
      wordTarget: '预估 3000字',
      content: PREVIEW_TEXT,
      contentLoaded: false
    }]
  })

  assert.equal(
    db.prepare('SELECT COUNT(*) AS total FROM chapters WHERE id = ?').get('chapter-not-in-db').total,
    0
  )
  assert.deepEqual(readChapterContents(db), {
    'chapter-1': FULL_CONTENT['chapter-1'],
    'chapter-2': FULL_CONTENT['chapter-2'],
    'chapter-3': FULL_CONTENT['chapter-3'],
    'chapter-other': '<p>别项目正文</p>'
  })

  db.close()
})

test('跨卷大范围重排后所有章节正文与历史版本完好', () => {
  const db = createDb()
  const contentsBefore = readChapterContents(db)
  const versionsBefore = readVersionContents(db)

  writeChapterOrder(db, {
    projectId: 'project-1',
    chapters: [
      { id: 'chapter-3', volumeId: 'volume-2', sortOrder: 1024 },
      { id: 'chapter-1', volumeId: 'volume-2', sortOrder: 2048 },
      { id: 'chapter-2', volumeId: 'volume-1', sortOrder: 1024 }
    ]
  })

  const order = db.prepare('SELECT id, volume_id FROM chapters WHERE project_id = ? ORDER BY volume_id, sort_order')
    .all('project-1').map((row) => ({ ...row }))
  assert.deepEqual(order, [
    { id: 'chapter-2', volume_id: 'volume-1' },
    { id: 'chapter-3', volume_id: 'volume-2' },
    { id: 'chapter-1', volume_id: 'volume-2' }
  ])
  assert.deepEqual(readChapterContents(db), contentsBefore)
  assert.deepEqual(readVersionContents(db), versionsBefore)

  db.close()
})

test('增量载荷只要有一个章节缺失就整体拒绝，避免用残缺载荷写回', () => {
  const db = createDb()

  // 全部存在 → 正常返回，且按请求顺序、去重
  const ok = readChapterMutationPayload(db, 'project-1', ['chapter-2', 'chapter-1', 'chapter-2'])
  assert.deepEqual(ok.chapters.map((chapter) => chapter.id), ['chapter-2', 'chapter-1'])
  assert.equal(ok.chapters[0].content, FULL_CONTENT['chapter-2'])

  // 任一缺失 → 整体 null，调用方必须放弃这次写回
  assert.equal(readChapterMutationPayload(db, 'project-1', ['chapter-1', 'chapter-missing']), null)
  // 空请求同样拒绝
  assert.equal(readChapterMutationPayload(db, 'project-1', []), null)
  // 跨项目取章节 → 缺失，同样拒绝
  assert.equal(readChapterMutationPayload(db, 'project-1', ['chapter-other']), null)

  db.close()
})

test('字数元数据迁移只增加统计列，不改动正文与历史版本', () => {
  const db = new DatabaseSync(':memory:')
  db.function('chapter_character_count', (content) => countChapterCharacters(String(content ?? '')))
  db.exec(`
    CREATE TABLE chapters (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL
    ) STRICT;
    CREATE TABLE chapter_versions (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL
    ) STRICT;
    INSERT INTO chapters (id, content) VALUES ('chapter-1', '<p>第一章完整正文</p>');
    INSERT INTO chapter_versions (id, content) VALUES ('version-1', '<p>历史版本正文</p>');
  `)

  const chaptersBefore = db.prepare('SELECT id, content FROM chapters ORDER BY id').all().map((r) => ({ ...r }))
  const versionsBefore = db.prepare('SELECT id, content FROM chapter_versions ORDER BY id').all().map((r) => ({ ...r }))

  ensureChapterContentMetadata(db)
  // 重复执行必须幂等（第二次不应重复 ALTER / 重复回填）
  ensureChapterContentMetadata(db)

  assert.deepEqual(
    db.prepare('SELECT id, content FROM chapters ORDER BY id').all().map((r) => ({ ...r })),
    chaptersBefore
  )
  assert.deepEqual(
    db.prepare('SELECT id, content FROM chapter_versions ORDER BY id').all().map((r) => ({ ...r })),
    versionsBefore
  )
  // '第一章完整正文' = 7 字，'历史版本正文' = 6 字
  assert.equal(db.prepare('SELECT content_length FROM chapters WHERE id = ?').get('chapter-1').content_length, 7)
  assert.equal(db.prepare('SELECT content_length FROM chapter_versions WHERE id = ?').get('version-1').content_length, 6)

  db.close()
})
