/**
 * novelSplitAi 编排单测（依赖注入，用 fake callBatch 验证）
 * - 分批阈值：按 maxCandidatesPerBatch 切桶
 * - 越界 / 幻觉索引清洗
 * - 任一批返回 null → 整体 null
 * - 清洗后无 chapter → null；未就绪 / 无候选 → null
 * - 成功合并去重升序
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveNovelSplitWithAi } from './novelSplitAi.ts'

function makeCandidates(count) {
  return Array.from({ length: count }, (_, index) => ({ index, text: `第${index + 1}章` }))
}

test('分批阈值：5 个候选 / 每批 2 → 3 批', async () => {
  const candidates = makeCandidates(5)
  const batchSizes = []

  const result = await resolveNovelSplitWithAi(candidates, {
    isReady: true,
    maxCandidatesPerBatch: 2,
    callBatch: async (batch) => {
      batchSizes.push(batch.length)
      return { chapters: batch.map((candidate) => candidate.index), volumes: [] }
    }
  })

  assert.deepEqual(batchSizes, [2, 2, 1])
  assert.equal(result.batches, 3)
  assert.deepEqual(result.chapters, [0, 1, 2, 3, 4])
})

test('越界 / 幻觉索引被丢弃', async () => {
  const candidates = [{ index: 10, text: '第1章' }, { index: 20, text: '第2章' }]

  const result = await resolveNovelSplitWithAi(candidates, {
    isReady: true,
    callBatch: async () => ({ chapters: [10, 11, 999, 20], volumes: [5, 20] })
  })

  assert.deepEqual(result.chapters, [10, 20])
  assert.deepEqual(result.volumes, [20])
})

test('任一批返回 null → 整体 null', async () => {
  let calls = 0

  const result = await resolveNovelSplitWithAi(makeCandidates(4), {
    isReady: true,
    maxCandidatesPerBatch: 2,
    callBatch: async () => {
      calls += 1
      return calls === 2 ? null : { chapters: [0], volumes: [] }
    }
  })

  assert.equal(result, null)
})

test('清洗后无 chapter → null', async () => {
  const result = await resolveNovelSplitWithAi([{ index: 0, text: '第1章' }], {
    isReady: true,
    callBatch: async () => ({ chapters: [77], volumes: [] })
  })

  assert.equal(result, null)
})

test('未就绪或无候选 → null', async () => {
  const notReady = await resolveNovelSplitWithAi([{ index: 0, text: 'x' }], {
    isReady: false,
    callBatch: async () => ({ chapters: [0], volumes: [] })
  })
  assert.equal(notReady, null)

  const noCandidates = await resolveNovelSplitWithAi([], {
    isReady: true,
    callBatch: async () => ({ chapters: [0], volumes: [] })
  })
  assert.equal(noCandidates, null)
})

test('callBatch 抛异常 → 整体 null（不冒泡）', async () => {
  const result = await resolveNovelSplitWithAi([{ index: 0, text: '第1章' }], {
    isReady: true,
    callBatch: async () => { throw new Error('boom') }
  })
  assert.equal(result, null)
})

test('成功合并去重升序', async () => {
  const candidates = [{ index: 3, text: 'a' }, { index: 1, text: 'b' }, { index: 2, text: 'c' }]

  const result = await resolveNovelSplitWithAi(candidates, {
    isReady: true,
    callBatch: async () => ({ chapters: [3, 1, 1, 2], volumes: [2, 2] })
  })

  assert.deepEqual(result.chapters, [1, 2, 3])
  assert.deepEqual(result.volumes, [2])
  assert.equal(result.usedAi, true)
})
