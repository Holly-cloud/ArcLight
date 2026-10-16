import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

/**
 * 回归守卫：清空/替换章节时必须一并清空 chapterVersions。
 *
 * 背景（v1.30.0 修复）：`clearProjectNovelChapters`（清空小说）与
 * `replaceProjectNovelChapters`（整本覆盖）最初只清了 chapters/outlineItems/outlineVolumes，
 * 内存里残留指向已删章节的历史版本；下一次快照保存时 `chapter_versions.chapter_id`
 * 外键指向不存在的章节 → `FOREIGN KEY constraint failed`（应用顶部「本地数据读写异常」）。
 */

function bodyOf(source, name) {
  const start = source.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `未找到函数 ${name}`)
  const next = source.indexOf('\n  function ', start + 1)
  return next > start ? source.slice(start, next) : source.slice(start)
}

test('清空小说必须同时清空 chapterVersions（防 chapter_versions 外键失败）', async () => {
  const source = await readFile(new URL('../../stores/app.ts', import.meta.url), 'utf8')
  assert.match(bodyOf(source, 'clearProjectNovelChapters'), /chapterVersions:\s*\[\]/)
})

test('整本覆盖必须同时清空 chapterVersions（防 chapter_versions 外键失败）', async () => {
  const source = await readFile(new URL('../../stores/app.ts', import.meta.url), 'utf8')
  assert.match(bodyOf(source, 'replaceProjectNovelChapters'), /chapterVersions:\s*\[\]/)
})
