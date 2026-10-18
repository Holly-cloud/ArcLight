import assert from 'node:assert/strict'
import test from 'node:test'

import {
  EXTRACTION_LIMITS,
  parseExtractionResult
} from './parseExtractionResult.ts'

test('v1.36.1：visualPrompt 初稿透传；缺失/占位不产出该字段；超长截断', () => {
  const result = parseExtractionResult({
    characters: [
      { name: '林昭', role: '主角', evidence: '林昭出场。', visualPrompt: '  【主体】少年剑修  ' },
      { name: '苏卿', role: '配角', evidence: '苏卿出场。' },
      { name: '顾衡', role: '配角', evidence: '顾衡出场。', visualPrompt: '原文未明确' },
      { name: '长文', role: '配角', evidence: '长文出场。', visualPrompt: '【主体】' + '长'.repeat(800) }
    ],
    scenes: [],
    props: []
  })

  assert.equal(result.characters[0].visualPrompt, '【主体】少年剑修', '初稿应 trim 后透传')
  assert.equal(result.characters[1].visualPrompt, undefined, '未产出时不带该字段（保持既有结构）')
  assert.equal(result.characters[2].visualPrompt, undefined, '占位文本归一为空 → 不产出')
  assert.equal(
    result.characters[3].visualPrompt.length,
    EXTRACTION_LIMITS.maxVisualPromptLength,
    '超长初稿应截断到上限'
  )
})

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
  assert.deepEqual(result.scenes, [{ name: '临川城', type: '', description: '', tags: [], evidence: '' }])
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

test('evidence 保留：读出原文证据、占位文本归一为空串、中文键兼容', () => {
  const result = parseExtractionResult({
    characters: [
      { name: '林昭', evidence: '  林昭走进临川城。  ' },
      { name: '苏卿', evidence: '原文未明确' },
      { name: '路人甲' }
    ],
    scenes: [{ name: '临川城', 证据: '城门缓缓打开。' }]
  })

  assert.equal(result.characters[0].evidence, '林昭走进临川城。')
  assert.equal(result.characters[1].evidence, '')
  assert.equal(result.characters[2].evidence, '')
  assert.equal(result.scenes[0].evidence, '城门缓缓打开。')
})
