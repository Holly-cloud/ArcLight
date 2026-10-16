import assert from 'node:assert/strict'
import test from 'node:test'

import { mergeExtractionCandidates, normalizeExtractionName } from './mergeExtractionCandidates.ts'

test('多批合并按名称去重（大小写 / 空白归一，首次出现优先）', () => {
  const first = {
    characters: [{ name: '林昭', role: '主角', description: '第一版', tags: [] }],
    scenes: [{ name: '临川城', type: '城池', description: '', tags: [] }],
    props: [{ name: '青锋剑', type: '兵器', description: '', tags: [] }]
  }
  const second = {
    characters: [
      { name: ' 林 昭 ', role: '重复项', description: '第二版', tags: [] },
      { name: '苏卿', role: '配角', description: '', tags: [] }
    ],
    scenes: [{ name: '临川城', type: '重复', description: '', tags: [] }],
    props: []
  }

  const merged = mergeExtractionCandidates([first, second])

  assert.deepEqual(merged.characters.map((item) => item.name), ['林昭', '苏卿'])
  assert.equal(merged.characters[0].description, '第一版')
  assert.deepEqual(merged.scenes.map((item) => item.name), ['临川城'])
  assert.deepEqual(merged.props.map((item) => item.name), ['青锋剑'])
})

test('合并容忍空批 / 缺失字段', () => {
  const merged = mergeExtractionCandidates([null, undefined, {}, { characters: undefined }])
  assert.deepEqual(merged, { characters: [], scenes: [], props: [] })
})

test('名称归一 trim + 小写 + 去空白', () => {
  assert.equal(normalizeExtractionName('  李 三 '), '李三')
  assert.equal(normalizeExtractionName('ABC'), 'abc')
})
