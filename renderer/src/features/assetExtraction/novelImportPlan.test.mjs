/**
 * novelImportPlan 纯函数单测
 * - parseChapterOrdinal：阿拉伯 / 中文数字序数解析、「第X章·话·回·节」、识别不到返回 null
 * - buildImportPlan：append 跳过已存在（含本次内部重复）、overwrite 全量、range 计算
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { buildImportPlan, parseChapterOrdinal } from './novelImportPlan.ts'

test('parseChapterOrdinal：阿拉伯数字序数', () => {
  assert.equal(parseChapterOrdinal('第1章 开端'), 1)
  assert.equal(parseChapterOrdinal('第 12 话'), 12)
  assert.equal(parseChapterOrdinal('第001章'), 1)
  assert.equal(parseChapterOrdinal('第3回'), 3)
  assert.equal(parseChapterOrdinal('第9节'), 9)
})

test('parseChapterOrdinal：中文数字序数', () => {
  assert.equal(parseChapterOrdinal('第十章'), 10)
  assert.equal(parseChapterOrdinal('第十一章'), 11)
  assert.equal(parseChapterOrdinal('第二十章'), 20)
  assert.equal(parseChapterOrdinal('第二十一章'), 21)
  assert.equal(parseChapterOrdinal('第三话'), 3)
  assert.equal(parseChapterOrdinal('第一节'), 1)
  assert.equal(parseChapterOrdinal('第一百零五章'), 105)
  assert.equal(parseChapterOrdinal('第两百章'), 200)
  assert.equal(parseChapterOrdinal('第二百三十章'), 230)
  assert.equal(parseChapterOrdinal('第一千零一节'), 1001)
})

test('parseChapterOrdinal：识别不到返回 null', () => {
  assert.equal(parseChapterOrdinal('序章'), null)
  assert.equal(parseChapterOrdinal('没有章节号'), null)
  assert.equal(parseChapterOrdinal('Chapter 1'), null)
  assert.equal(parseChapterOrdinal(''), null)
  assert.equal(parseChapterOrdinal('   '), null)
})

test('buildImportPlan append：跳过已存在的章，其余沿用标题序数', () => {
  const plan = buildImportPlan({
    novel: {
      title: '测试小说',
      chapters: [
        { title: '第一章', volumeTitle: '第一卷', content: '一', characterCount: 100 },
        { title: '第二章', volumeTitle: '第一卷', content: '二', characterCount: 200 },
        { title: '第三章', volumeTitle: '第一卷', content: '三', characterCount: 300 }
      ]
    },
    existingChapterTitles: ['第二章'],
    mode: 'append'
  })

  assert.equal(plan.mode, 'append')
  assert.deepEqual(plan.skipped.map((chapter) => chapter.title), ['第二章'])
  assert.deepEqual(plan.newChapters.map((chapter) => chapter.ordinal), [1, 3])
  assert.deepEqual(plan.newChapters.map((chapter) => chapter.title), ['第一章', '第三章'])
  assert.deepEqual(plan.range, { from: 1, to: 3, count: 2 })
})

test('buildImportPlan append：既有标题 trim 比对 + 本次内部重复也跳过', () => {
  const plan = buildImportPlan({
    novel: {
      chapters: [
        { title: '  第一章  ', volumeTitle: '第一卷', content: '一', characterCount: 1 },
        { title: '第一章', volumeTitle: '第一卷', content: '重复', characterCount: 1 }
      ]
    },
    existingChapterTitles: new Set(['第一章']),
    mode: 'append'
  })

  assert.equal(plan.newChapters.length, 0)
  assert.equal(plan.skipped.length, 2)
  assert.deepEqual(plan.range, { from: null, to: null, count: 0 })
})

test('buildImportPlan append：全部新增时 range 取序数 min/max', () => {
  const plan = buildImportPlan({
    novel: {
      chapters: [
        { title: '第十章', volumeTitle: '正文', content: '', characterCount: 0 },
        { title: '第十二章', volumeTitle: '正文', content: '', characterCount: 0 }
      ]
    },
    existingChapterTitles: [],
    mode: 'append'
  })
  assert.deepEqual(plan.range, { from: 10, to: 12, count: 2 })
})

test('buildImportPlan append：无法解析序数时 from/to 为 null，count 仍计入', () => {
  const plan = buildImportPlan({
    novel: {
      chapters: [{ title: '序章', volumeTitle: '正文', content: '', characterCount: 0 }]
    },
    existingChapterTitles: [],
    mode: 'append'
  })
  assert.deepEqual(plan.newChapters[0].ordinal, null)
  assert.deepEqual(plan.range, { from: null, to: null, count: 1 })
})

test('buildImportPlan overwrite：newChapters 为全部章，skipped 恒为空', () => {
  const plan = buildImportPlan({
    novel: {
      chapters: [
        { title: '第一章', volumeTitle: '第一卷', content: '一', characterCount: 100 },
        { title: '第二章', volumeTitle: '第一卷', content: '二', characterCount: 200 }
      ]
    },
    existingChapterTitles: ['第一章', '第二章'],
    mode: 'overwrite'
  })

  assert.equal(plan.mode, 'overwrite')
  assert.equal(plan.newChapters.length, 2)
  assert.equal(plan.skipped.length, 0)
  assert.deepEqual(plan.range, { from: 1, to: 2, count: 2 })
})

test('buildImportPlan：默认按 append 处理未知 mode', () => {
  const plan = buildImportPlan({
    novel: { chapters: [{ title: '第一章', volumeTitle: '正文', content: '', characterCount: 0 }] },
    existingChapterTitles: ['第一章'],
    mode: 'unknown'
  })
  assert.equal(plan.mode, 'append')
  assert.equal(plan.newChapters.length, 0)
})
