import assert from 'node:assert/strict'
import test from 'node:test'

import { chapterContentToPlainText, extractEntitySnippet } from './chapterText.ts'

test('剥离 HTML 标签：br 转换行、段落闭合转空行', () => {
  assert.equal(
    chapterContentToPlainText('<p>第一段<br>第二行</p><p>第三段</p>'),
    '第一段\n第二行\n\n第三段'
  )
})

test('与 plainNovelTextToHtml 往返：段落结构一致', () => {
  assert.equal(chapterContentToPlainText('<p>第一段</p><p>第二段</p>'), '第一段\n\n第二段')
})

test('HTML 实体解码', () => {
  assert.equal(
    chapterContentToPlainText('<p>甲&amp;乙 &lt;丙&gt; &quot;丁&quot; &#39;戊&#39;</p>'),
    '甲&乙 <丙> "丁" \'戊\''
  )
})

test('纯文本输入原样保留（仅规整换行与首尾空白）', () => {
  assert.equal(chapterContentToPlainText('  第一行\n\n\n第二行  '), '第一行\n\n第二行')
})

test('空值 / 空白正文返回空串（旧项目兼容）', () => {
  assert.equal(chapterContentToPlainText(''), '')
  assert.equal(chapterContentToPlainText('   '), '')
  assert.equal(chapterContentToPlainText(undefined), '')
})

test('实体片段：优先命中含实体名的段落', () => {
  const texts = ['无关段落一', '李雷走进酒馆，他是一名剑客。\n\n韩梅梅在窗边等他。']
  const snippet = extractEntitySnippet(texts, ['李雷'])
  assert.ok(snippet.includes('李雷走进酒馆'))
  assert.ok(!snippet.includes('韩梅梅'))
})

test('实体片段：无命中回退开头段落，并受长度上限保护', () => {
  const texts = ['第一段内容', '第二段内容']
  assert.equal(extractEntitySnippet(texts, ['不存在的人']), '第一段内容\n\n第二段内容')
  assert.equal(extractEntitySnippet(['a'.repeat(20)], ['a'], { maxChars: 8 }).length, 8)
  assert.equal(extractEntitySnippet([], ['李雷']), '')
  assert.equal(extractEntitySnippet([''], ['李雷']), '')
})
