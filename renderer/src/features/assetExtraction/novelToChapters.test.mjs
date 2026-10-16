import assert from 'node:assert/strict'
import test from 'node:test'

import { buildNovelChapters } from './novelToChapters.ts'

function makeIdFactory() {
  let counter = 0
  return (prefix) => `${prefix}-${++counter}`
}

test('按 volumeTitle 分卷：保持首现顺序并合计该卷字数', () => {
  const result = buildNovelChapters({
    novel: {
      title: '测试小说',
      chapters: [
        { title: '第一章', volumeTitle: '第一卷', content: '一', characterCount: 100 },
        { title: '第二章', volumeTitle: '第一卷', content: '二', characterCount: 200 },
        { title: '第三章', volumeTitle: '第二卷', content: '三', characterCount: 50 }
      ]
    },
    createId: makeIdFactory()
  })

  assert.deepEqual(result.volumes.map((volume) => volume.title), ['第一卷', '第二卷'])
  assert.deepEqual(result.volumes.map((volume) => volume.wordTarget), ['300', '50'])
  assert.equal(result.volumes.every((volume) => volume.summary === '原文导入分卷，待补充分卷摘要。'), true)
  assert.equal((result.volumes[0].workflowDocuments ?? []).length > 0, true)
  assert.equal(result.chapters.length, 3)
  assert.equal(result.outlineItems.length, 3)
})

test('同名字符章跳过：既有章节标题命中即不重复建，分卷字数随之收敛', () => {
  const result = buildNovelChapters({
    novel: {
      chapters: [
        { title: '第一章', volumeTitle: '第一卷', content: '一', characterCount: 100 },
        { title: '第二章', volumeTitle: '第一卷', content: '二', characterCount: 200 }
      ]
    },
    existingChapterTitles: ['第一章'],
    createId: makeIdFactory()
  })

  assert.equal(result.chapters.length, 1)
  assert.equal(result.chapters[0].title, '第二章')
  assert.equal(result.outlineItems.length, 1)
  assert.deepEqual(result.volumes.map((volume) => volume.wordTarget), ['200'])
})

test('全量重复时只追加 0 章：不生成空分卷 / 空节点', () => {
  const result = buildNovelChapters({
    novel: {
      chapters: [{ title: '第一章', volumeTitle: '第一卷', content: '一', characterCount: 100 }]
    },
    existingChapterTitles: new Set(['第一章']),
    createId: makeIdFactory()
  })

  assert.deepEqual(result, { volumes: [], outlineItems: [], chapters: [] })
})

test('标题 / 字数映射：状态、冲突占位、字数下限 1、正文转 HTML', () => {
  const result = buildNovelChapters({
    novel: {
      chapters: [{ title: '  序章  ', volumeTitle: '  正文  ', content: '第一段\n\n第二段', characterCount: 0 }]
    },
    createId: makeIdFactory()
  })

  assert.deepEqual(result.volumes.map((volume) => volume.title), ['正文'])
  assert.equal(result.chapters[0].title, '序章')
  assert.equal(result.chapters[0].status, 'final')
  assert.equal(result.chapters[0].wordTarget, '1')
  assert.equal(result.chapters[0].content, '<p>第一段</p><p>第二段</p>')
  assert.equal(result.chapters[0].outlineItemId, result.outlineItems[0].id)
  assert.equal(result.chapters[0].volumeId, result.volumes[0].id)
  assert.equal(result.outlineItems[0].title, '序章')
  assert.equal(result.outlineItems[0].conflict, '原文既有剧情')
  assert.equal(result.outlineItems[0].status, 'done')
  assert.equal(result.outlineItems[0].sortOrder, 0)
})
