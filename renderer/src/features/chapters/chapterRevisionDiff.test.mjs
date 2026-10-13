import assert from 'node:assert/strict'
import test from 'node:test'
import { compareChapterRevision } from './chapterRevisionDiff.ts'

test('审阅对照仅高亮改动文字，多处改动之间的上下文不着色', () => {
  const result = compareChapterRevision('他走进旧城，然后见到小李。', '他走进北城，然后见到老李。')
  assert.deepEqual(result.before[0].segments.filter((segment) => segment.changed).map((segment) => segment.text), ['旧', '小'])
  assert.deepEqual(result.after[0].segments.filter((segment) => segment.changed).map((segment) => segment.text), ['北', '老'])
  assert.equal(result.after[0].segments.map((segment) => segment.text).join(''), '他走进北城，然后见到老李。')
})

test('审阅对照保留独立段落，未改段落没有标记', () => {
  const result = compareChapterRevision('不变。\n旧句。\n结尾。', '不变。\n新句。\n结尾。\n新增段落')
  assert.equal(result.before.length, 3)
  assert.equal(result.after.length, 4)
  assert.ok(result.after[0].segments.every((segment) => !segment.changed))
  assert.ok(result.after[2].segments.every((segment) => !segment.changed))
  assert.deepEqual(result.after[3].segments, [{ text: '新增段落', changed: true }])
})

test('删除内容只在原文中标记，保留内容不着色', () => {
  const result = compareChapterRevision('他缓缓走进城。', '他走进城。')
  assert.deepEqual(result.before[0].segments.filter((segment) => segment.changed), [{ text: '缓缓', changed: true }])
  assert.ok(result.after[0].segments.every((segment) => !segment.changed))
  assert.deepEqual(compareChapterRevision('', ''), { before: [], after: [] })
})
