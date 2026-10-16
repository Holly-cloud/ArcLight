import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applySplitPlan,
  buildContinuationChapterTitle,
  inferNextContinuationChapterTitle,
  parseContinuationNovelText,
  plainNovelTextToHtml
} from './continuation-import.ts'

test('按分卷和章节标题拆分小说正文', () => {
  const parsed = parseContinuationNovelText(`第一卷 风起\n第1章 初见\n甲看见了乙。\n\n第2章 夜雨\n雨下了一夜。\n第二卷 远行\n第三章 出城\n他们离开故乡。`, '测试小说')

  assert.equal(parsed.chapterCount, 3)
  assert.equal(parsed.volumeCount, 2)
  assert.equal(parsed.chapters[0].volumeTitle, '第一卷 风起')
  assert.equal(parsed.chapters[2].volumeTitle, '第二卷 远行')
  assert.equal(parsed.chapters[1].title, '第2章 夜雨')
})

test('拆章时保留每章第一段的原始缩进', () => {
  const parsed = parseContinuationNovelText(`第1章 初见\r\n\r\n　　甲看见了乙。\r\n\r\n　　这是第二段。\r\n第2章 夜雨\r\n\t雨下了一夜。\r\n第3章 天明\r\n  天终于亮了。`, '测试小说')

  assert.equal(parsed.chapters[0].content, '　　甲看见了乙。\n\n　　这是第二段。')
  assert.equal(parsed.chapters[1].content, '\t雨下了一夜。')
  assert.equal(parsed.chapters[2].content, '  天终于亮了。')
})

test('保留第一章之前的正文内容供用户校对', () => {
  const parsed = parseContinuationNovelText(`作者：某人\n这是一段作品简介。\n第1章 开始\n正文一。\n第2章 继续\n正文二。`, '测试小说')

  assert.equal(parsed.chapters[0].title, '正文前内容')
  assert.match(parsed.chapters[0].content, /作品简介/)
  assert.ok(parsed.warnings.length > 0)
})

test('无法稳定识别章节时完整保留全文', () => {
  const parsed = parseContinuationNovelText('只有一段没有章节标题的小说正文。', '短文')

  assert.equal(parsed.chapterCount, 1)
  assert.equal(parsed.chapters[0].content, '只有一段没有章节标题的小说正文。')
  assert.equal(parsed.chapters[0].confidence, 'low')
})

test('正文转 HTML 时转义标签并保留段落', () => {
  const html = plainNovelTextToHtml('第一段 <危险>\n\n第二段')

  assert.equal(html, '<p>第一段 &lt;危险&gt;</p><p>第二段</p>')
  assert.equal(buildContinuationChapterTitle(12), '第13章：续写')
})

test('下一章编号忽略前言并支持中文章节数字', () => {
  assert.equal(inferNextContinuationChapterTitle([
    { title: '正文前内容' },
    { title: '第九十九章 风雪' },
    { title: '第一百章 重逢' }
  ]), '第101章：续写')
})

test('识别章节编号后没有空格或标点的常见标题', () => {
  const parsed = parseContinuationNovelText(`第1章初遇\n正文一。\n第二章风波再起\n正文二。`, '紧凑标题')

  assert.equal(parsed.chapterCount, 2)
  assert.equal(parsed.chapters[0].title, '第1章初遇')
  assert.equal(parsed.chapters[1].title, '第二章风波再起')
})

test('加固后：第X话 标题可切章', () => {
  const parsed = parseContinuationNovelText(`第1话 开端\n甲出发了。\n第2话 相遇\n乙出现了。\n第3话 分离\n两人告别。`, '话本')

  assert.equal(parsed.chapterCount, 3)
  assert.equal(parsed.chapters[0].title, '第1话 开端')
  assert.equal(parsed.chapters[2].content, '两人告别。')
})

test('加固后：【第X章…】 包裹标题可切章', () => {
  const parsed = parseContinuationNovelText(`【第1章 初见】\n正文一。\n【第2章 夜雨】\n正文二。`, '包裹标题')

  assert.equal(parsed.chapterCount, 2)
  assert.equal(parsed.chapters[0].title, '【第1章 初见】')
  assert.equal(parsed.chapters[0].content, '正文一。')
})

test('applySplitPlan：按程序化切点切章并按 volumes 归卷', () => {
  const raw = [
    '第一卷 风起',
    '第1章 初见',
    '甲看见了乙。',
    '第2章 夜雨',
    '雨下了一夜。',
    '第二卷 远行',
    '第3章 出城',
    '他们离开故乡。'
  ].join('\n')

  const doc = applySplitPlan(raw, { chapters: [1, 3, 6], volumes: [0, 5] })

  assert.equal(doc.chapterCount, 3)
  assert.equal(doc.volumeCount, 2)
  assert.equal(doc.chapters[0].title, '第1章 初见')
  assert.equal(doc.chapters[0].volumeTitle, '第一卷 风起')
  assert.equal(doc.chapters[1].content, '雨下了一夜。')
  assert.equal(doc.chapters[1].volumeTitle, '第一卷 风起')
  assert.equal(doc.chapters[2].volumeTitle, '第二卷 远行')
})

test('applySplitPlan：首个切点前正文 ≥8 字会前置「正文前内容」', () => {
  const raw = [
    '作者：某人',
    '这是一段作品简介。',
    '第1章 开始',
    '正文一。',
    '第2章 继续',
    '正文二。'
  ].join('\n')

  const doc = applySplitPlan(raw, { chapters: [2, 4], volumes: [] })

  assert.equal(doc.chapterCount, 3)
  assert.equal(doc.chapters[0].title, '正文前内容')
  assert.match(doc.chapters[0].content, /作品简介/)
  assert.ok(doc.warnings.some((warning) => warning.includes('正文内容')))
})

test('applySplitPlan：chapters 为空时回退 parseContinuationNovelText', () => {
  const raw = `第1章 初见\n正文一。\n第2章 夜雨\n正文二。`

  const doc = applySplitPlan(raw, { chapters: [], volumes: [0] })
  const fallback = parseContinuationNovelText(raw, '未命名作品')

  assert.equal(doc.chapterCount, fallback.chapterCount)
  assert.deepEqual(doc.chapters.map((chapter) => chapter.title), fallback.chapters.map((chapter) => chapter.title))
})

test('加固后：收尾引号包裹的对白不会被误当章节标题', () => {
  const parsed = parseContinuationNovelText('“第1章，他走了。”\n第2章 B\n乙。', '对白')

  assert.equal(parsed.chapterCount, 1)
  assert.equal(parsed.chapters[0].title, '全文')
})
