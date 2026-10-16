/**
 * collectSplitCandidates 单测（脚本高召回候选行扫描）
 * - 话 / 集 / 1. / 一、 / （一） / 【】 / 纯数字 均入选
 * - 正文 / 对话行不入选
 * - index 为原始行号、text 截断 ≤40 字
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { collectSplitCandidates } from './continuation-import.ts'

test('collectSplitCandidates：话 / 集 / 1. / 一、 / （一） / 【】 / 纯数字 均入选', () => {
  const text = [
    '第1话 开端',
    '正文一。',
    '第2集 风起',
    '1. 初见',
    '一、再见',
    '（一）第三章',
    '【第5章 归途】',
    '123'
  ].join('\n')

  const { candidates } = collectSplitCandidates(text)
  assert.deepEqual(candidates.map((candidate) => candidate.index), [0, 2, 3, 4, 5, 6, 7])
})

test('collectSplitCandidates：正文与对话行不入选', () => {
  const text = [
    '甲看见了乙，心里一惊。',
    '“你终于来了。”',
    '他点了点头，没有说话。',
    '1999年，他出生在一个小城。',
    '3天后他离开了学校。'
  ].join('\n')

  const { lineCount, candidates } = collectSplitCandidates(text)
  assert.equal(lineCount, 5)
  assert.deepEqual(candidates, [])
})

test('collectSplitCandidates：index 为原始行号、text 截断 ≤40 字', () => {
  const longTitle = `第1章 ${'很长的标题'.repeat(20)}`
  const text = `标题前说明行\n\n${longTitle}\n正文`

  const { lineCount, candidates } = collectSplitCandidates(text)
  assert.equal(lineCount, 4)
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].index, 2)
  assert.ok(candidates[0].text.length <= 40)
  assert.ok(candidates[0].text.startsWith('第1章'))
})
