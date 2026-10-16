import assert from 'node:assert/strict'
import test from 'node:test'

import {
  NOVEL_APPEND_MARKER,
  NOVEL_SOURCE_TYPE,
  appendNovelText,
  buildNovelDocument,
  locateProjectNovel,
  readProjectNovelContent
} from './novelSource.ts'

test('追加合并：空输入幂等，重复内容不重复追加', () => {
  assert.equal(appendNovelText('', '第一章正文'), '第一章正文')
  assert.equal(appendNovelText('第一章正文', ''), '第一章正文')
  assert.equal(appendNovelText('第一章正文', '第一章正文'), '第一章正文')
})

test('追加合并：新增内容加分隔标记，且再次追加相同内容幂等', () => {
  const merged = appendNovelText('第一章正文', '第二章正文')
  assert.ok(merged.includes(NOVEL_APPEND_MARKER))
  assert.ok(merged.startsWith('第一章正文'))
  assert.ok(merged.endsWith('第二章正文'))

  assert.equal(appendNovelText(merged, '第二章正文'), merged)
})

test('追加合并：按段落过滤已存在段落，只追加真正新增的段落', () => {
  const base = '第一段\n\n第二段'
  const incoming = '第二段\n\n第三段'
  const merged = appendNovelText(base, incoming)
  assert.ok(merged.includes('第三段'))
  assert.equal(merged.split('第二段').length - 1, 1)
})

test('追加合并：超出上限做头截断保护', () => {
  const merged = appendNovelText('a'.repeat(10), 'b'.repeat(10), { maxChars: 15 })
  assert.equal(merged.length, 15)
})

test('定位/读取项目小说：无文档返回空串（旧项目兼容）', () => {
  const documents = [
    { id: 'novel-a', projectId: 'project-a', sourceType: NOVEL_SOURCE_TYPE, content: '项目A的全文' },
    { id: 'novel-b', projectId: 'project-b', sourceType: NOVEL_SOURCE_TYPE, content: '项目B的全文' },
    { id: 'fact', projectId: 'project-a', sourceType: 'canon-fact', content: '设定' }
  ]

  assert.equal(locateProjectNovel(documents, 'project-a')?.id, 'novel-a')
  assert.equal(readProjectNovelContent(documents, 'project-a'), '项目A的全文')
  assert.equal(readProjectNovelContent(documents, 'project-c'), '')
  assert.equal(locateProjectNovel([], 'project-a'), null)
})

test('构建项目小说文档：固定来源标题、来源类型与摘要', () => {
  const doc = buildNovelDocument({
    projectId: 'project-a',
    content: '  正文内容  ',
    now: '2026-10-16T00:00:00.000Z'
  })

  assert.equal(doc.sourceType, NOVEL_SOURCE_TYPE)
  assert.equal(doc.metadata.sourceTitle, '小说原文')
  assert.equal(doc.content, '正文内容')
  assert.equal(doc.projectId, 'project-a')
  assert.equal(doc.id, 'novel-source-project-a')
})
