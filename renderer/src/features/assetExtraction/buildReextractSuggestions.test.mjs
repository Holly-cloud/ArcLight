import assert from 'node:assert/strict'
import test from 'node:test'

import { buildReextractSuggestions } from './buildReextractSuggestions.ts'

function byKey(diffs, key) {
  return diffs.find((item) => item.key === key)
}

test('逐字段 diff：仅建议非空且与当前不同时 changed=true', () => {
  const diffs = buildReextractSuggestions({
    kind: 'character',
    currentFields: { name: '林昭', role: '主角', description: '少年剑修', tags: ['剑修'] },
    suggestedFields: {
      role: '主角',
      description: '临川城出身的少年剑修',
      tags: ['剑修', '主角']
    }
  })

  assert.equal(byKey(diffs, 'name').changed, false)
  assert.equal(byKey(diffs, 'role').changed, false)
  assert.equal(byKey(diffs, 'description').changed, true)
  assert.equal(byKey(diffs, 'description').original, '少年剑修')
  assert.equal(byKey(diffs, 'description').suggested, '临川城出身的少年剑修')
  assert.equal(byKey(diffs, 'description').type, 'textarea')
  assert.equal(byKey(diffs, 'tags').type, 'tags')
  assert.equal(byKey(diffs, 'tags').changed, true)
  assert.deepEqual(byKey(diffs, 'tags').suggested, ['剑修', '主角'])
})

test('标签集合相同时判定 changed=false（顺序无关）', () => {
  const diffs = buildReextractSuggestions({
    kind: 'scene',
    currentFields: { name: '临川城', type: '城池', description: '边境重镇', tags: ['A', 'B'] },
    suggestedFields: { tags: ['b', 'a'] }
  })

  assert.equal(byKey(diffs, 'tags').changed, false)
  assert.equal(byKey(diffs, 'name').changed, false)
  assert.equal(byKey(diffs, 'type').changed, false)
  assert.equal(byKey(diffs, 'description').changed, false)
})

test('AI 未给出建议时所有字段 changed=false；字段类型按种类对齐', () => {
  const diffs = buildReextractSuggestions({ kind: 'prop', currentFields: { name: '青锋剑', type: '兵器' } })
  assert.equal(diffs.every((item) => item.changed === false), true)
  assert.deepEqual(diffs.map((item) => item.key), ['name', 'type', 'description', 'tags'])
  assert.equal(byKey(diffs, 'type').type, 'text')
  assert.equal(byKey(diffs, 'description').type, 'textarea')
  assert.equal(byKey(diffs, 'tags').original.length, 0)
})
