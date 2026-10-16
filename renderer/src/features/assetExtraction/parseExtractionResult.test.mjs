import assert from 'node:assert/strict'
import test from 'node:test'

import {
  EXTRACTION_LIMITS,
  parseExtractionResult
} from './parseExtractionResult.ts'

test('字段缺失兜底为空、占位文本归一为空、无名称条目丢弃', () => {
  const result = parseExtractionResult({
    characters: [
      { name: '林昭', role: '主角' },
      { name: '  ', role: '配角' },
      { role: '无名角色' },
      { name: '苏卿', description: '原文未明确', tags: [] }
    ],
    scenes: [{ name: '临川城' }],
    props: null
  })

  assert.deepEqual(result.characters.map((item) => item.name), ['林昭', '苏卿'])
  assert.equal(result.characters[0].description, '')
  assert.equal(result.characters[0].tags.length, 0)
  assert.equal(result.characters[1].description, '')
  assert.deepEqual(result.scenes, [{ name: '临川城', type: '', description: '', tags: [] }])
  assert.deepEqual(result.props, [])
})

test('tags 过滤对象项与 [object Object]、去重并截断', () => {
  const result = parseExtractionResult({
    characters: [{
      name: '林昭',
      tags: ['剑修', { label: '主角' }, '[object Object]', '剑修', 123, null, '原文未明确']
    }]
  })

  assert.deepEqual(result.characters[0].tags, ['剑修', '主角', '123'])
})

test('名称与描述按上限截断，每类候选数量受 maxPerKind 限制', () => {
  const longName = '名'.repeat(60)
  const longDescription = '描'.repeat(500)
  const many = Array.from({ length: 70 }, (_, index) => ({ name: `角色${index + 1}`, description: longDescription }))

  const result = parseExtractionResult({
    characters: [{ name: longName, description: longDescription }, ...many]
  })

  assert.equal(result.characters[0].name.length, EXTRACTION_LIMITS.maxNameLength)
  assert.equal(result.characters[0].description.length, EXTRACTION_LIMITS.maxFieldLength)
  assert.equal(result.characters.length, EXTRACTION_LIMITS.maxPerKind)
})

test('字符串输入尝试 JSON 解析，非法字符串返回空结果', () => {
  const parsed = parseExtractionResult('{"scenes":[{"name":"城门"}]}')
  assert.equal(parsed.scenes[0].name, '城门')

  const invalid = parseExtractionResult('not-json-at-all')
  assert.deepEqual(invalid, { characters: [], scenes: [], props: [] })
})
