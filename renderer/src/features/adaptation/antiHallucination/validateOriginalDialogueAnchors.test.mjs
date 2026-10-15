/**
 * 对白锚点防伪单测（PRD T6 验收要求）
 * - 等值通过、双向包含通过、不匹配降级、章节 excerpt 兜底通过、mode !== 'original' 跳过校验
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { validateOriginalDialogueAnchors } from './validateOriginalDialogueAnchors.ts'

function buildEvidence(overrides) {
  return {
    chapterId: overrides.chapterId ?? 'chapter-1',
    chapterNumber: overrides.chapterNumber ?? 1,
    chapterTitle: overrides.chapterTitle ?? '第一章',
    excerpt: overrides.excerpt ?? '林昭走出大唐城门，迎面走来一位书生，他开口道：敢问公子，何故深夜独自行走？',
    dialogueQuotes: overrides.dialogueQuotes ?? [
      { speaker: '林昭', text: '敢问公子，何故深夜独自行走？', sourceOffset: 0 }
    ],
    purpose: overrides.purpose ?? '测试'
  }
}

test('等值匹配通过', () => {
  const evidence = [buildEvidence({})]
  const anchor = {
    id: 'anchor-1',
    text: '敢问公子，何故深夜独自行走？',
    mode: 'original',
    sourceChapterId: 'chapter-1',
    sourceQuote: '敢问公子',
    notes: ''
  }
  const result = validateOriginalDialogueAnchors([anchor], evidence)
  assert.equal(result.valid.length, 1)
  assert.equal(result.downgraded.length, 0)
})

test('双向包含匹配通过（anchor.text 被 quote.text 包含）', () => {
  const evidence = [buildEvidence({
    dialogueQuotes: [{ speaker: '林昭', text: '敢问公子，何故深夜独自行走？', sourceOffset: 0 }]
  })]
  const anchor = {
    id: 'anchor-1',
    text: '何故深夜独自行走',
    mode: 'original',
    sourceChapterId: 'chapter-1',
    sourceQuote: '',
    notes: ''
  }
  const result = validateOriginalDialogueAnchors([anchor], evidence)
  assert.equal(result.valid.length, 1)
  assert.equal(result.downgraded.length, 0)
})

test('双向包含匹配通过（anchor.text 包含 quote.text）', () => {
  const evidence = [buildEvidence({
    dialogueQuotes: [{ speaker: '林昭', text: '何故深夜独自行走？', sourceOffset: 0 }]
  })]
  const anchor = {
    id: 'anchor-1',
    text: '林昭走出大唐城门，迎面走来一位书生，他开口道：何故深夜独自行走？',
    mode: 'original',
    sourceChapterId: 'chapter-1',
    sourceQuote: '',
    notes: ''
  }
  const result = validateOriginalDialogueAnchors([anchor], evidence)
  assert.equal(result.valid.length, 1)
  assert.equal(result.downgraded.length, 0)
})

test('章节 excerpt 兜底匹配通过', () => {
  const evidence = [buildEvidence({ dialogueQuotes: [] })]
  const anchor = {
    id: 'anchor-1',
    text: '一些 AI 凭空编造但可被 excerpt 包含的原文片段',
    mode: 'original',
    sourceChapterId: 'chapter-99',
    sourceQuote: '林昭走出大唐城门',
    notes: ''
  }
  const result = validateOriginalDialogueAnchors([anchor], evidence)
  assert.equal(result.valid.length, 1)
  assert.equal(result.downgraded.length, 0)
})

test('不匹配则降级为 adapted 并清 sourceQuote', () => {
  const evidence = [buildEvidence({})]
  const anchor = {
    id: 'anchor-1',
    text: 'AI 编造的对白',
    mode: 'original',
    sourceChapterId: 'chapter-1',
    sourceQuote: 'AI 编造的对白',
    notes: ''
  }
  const result = validateOriginalDialogueAnchors([anchor], evidence)
  assert.equal(result.valid.length, 0)
  assert.equal(result.downgraded.length, 1)
  assert.equal(result.downgraded[0].mode, 'adapted')
  assert.equal(result.downgraded[0].sourceQuote, undefined)
})

test('mode !== original 跳过校验', () => {
  const evidence = [buildEvidence({})]
  const anchor = {
    id: 'anchor-1',
    text: '改编对白',
    mode: 'adapted',
    sourceChapterId: 'chapter-1',
    sourceQuote: undefined,
    notes: ''
  }
  const result = validateOriginalDialogueAnchors([anchor], evidence)
  assert.equal(result.valid.length, 1)
  assert.equal(result.downgraded.length, 0)
})

test('undefined / null 输入安全', () => {
  const result = validateOriginalDialogueAnchors(undefined, [])
  assert.deepEqual(result, { valid: [], downgraded: [] })
})
