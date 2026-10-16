import assert from 'node:assert/strict'
import test from 'node:test'

import { chapterContentToPlainText } from './chapterText.ts'

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
