/**
 * v1.33.0 资产图库「排序 / 过滤 / 参考图校验」单测（纯函数，无网络）
 * 运行方式：
 *   set ELECTRON_RUN_AS_NODE=1&& electron --test renderer/src/features/assetImage/assetImageModel.test.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

const {
  MAX_REFERENCE_IMAGES,
  REFERENCE_IMAGE_MAX_BYTES,
  sortAssetImages,
  filterAssetImagesByStatus,
  pickPrimaryImage,
  estimateDataUrlBytes,
  validateReferenceCount,
  validateReferenceImageSize,
  imageBadgeLabel
} = await import('./assetImageModel.ts')

function makeItem(id, overrides = {}) {
  return {
    id,
    projectId: 'p1',
    assetKind: 'character',
    assetId: 'c1',
    fileName: `${id}.png`,
    mime: 'image/png',
    prompt: '',
    revisedPrompt: '',
    provider: 'grsai',
    model: 'nano-banana-fast',
    aspectRatio: '3:4',
    imageSize: '1K',
    referenceIds: [],
    isPrimary: false,
    status: 'succeeded',
    error: '',
    createdAt: '2026-10-17T00:00:00.000Z',
    updatedAt: '2026-10-17T00:00:00.000Z',
    ...overrides
  }
}

test('sortAssetImages：基准立绘优先，其余按创建时间倒序', () => {
  const older = makeItem('old', { createdAt: '2026-10-01T00:00:00.000Z' })
  const newer = makeItem('new', { createdAt: '2026-10-10T00:00:00.000Z' })
  const primary = makeItem('a-primary', { createdAt: '2026-09-01T00:00:00.000Z', isPrimary: true })
  const sorted = sortAssetImages([older, newer, primary])
  assert.equal(sorted[0].id, 'a-primary', '基准立绘置顶')
  assert.equal(sorted[1].id, 'new', '其余新图在前')
  assert.equal(sorted[2].id, 'old')
})

test('sortAssetImages：不改动入参数组（纯函数）', () => {
  const items = [makeItem('a', { createdAt: '2026-10-01T00:00:00.000Z' }), makeItem('b', { createdAt: '2026-10-10T00:00:00.000Z' })]
  const copy = [...items]
  sortAssetImages(items)
  assert.deepEqual(items.map((i) => i.id), copy.map((i) => i.id))
})

test('sortAssetImages：空 / undefined 兜底返回空数组', () => {
  assert.deepEqual(sortAssetImages(undefined), [])
  assert.deepEqual(sortAssetImages([]), [])
})

test('filterAssetImagesByStatus：all / succeeded / failed', () => {
  const items = [makeItem('a'), makeItem('b', { status: 'failed' })]
  assert.equal(filterAssetImagesByStatus(items, 'all').length, 2)
  assert.deepEqual(filterAssetImagesByStatus(items, 'succeeded').map((i) => i.id), ['a'])
  assert.deepEqual(filterAssetImagesByStatus(items, 'failed').map((i) => i.id), ['b'])
})

test('pickPrimaryImage：命中基准立绘，否则 null', () => {
  const primary = makeItem('p', { isPrimary: true })
  assert.equal(pickPrimaryImage([makeItem('a'), primary]).id, 'p')
  assert.equal(pickPrimaryImage([makeItem('a')]), null)
  assert.equal(pickPrimaryImage(undefined), null)
})

test('estimateDataUrlBytes：base64 长度换算为字节', () => {
  // 'AAAA' → 4 个字符 → 3 字节
  assert.equal(estimateDataUrlBytes('data:image/png;base64,AAAA'), 3)
  assert.equal(estimateDataUrlBytes(''), 0)
  // 带 padding 'AA==' → 4 字符 → 1 字节
  assert.equal(estimateDataUrlBytes('data:image/png;base64,AA=='), 1)
})

test('validateReferenceCount：≤上限通过，超限报错', () => {
  assert.equal(validateReferenceCount(0).ok, true)
  assert.equal(validateReferenceCount(MAX_REFERENCE_IMAGES).ok, true)
  const over = validateReferenceCount(MAX_REFERENCE_IMAGES + 1)
  assert.equal(over.ok, false)
  assert.ok(typeof over.message === 'string')
})

test('validateReferenceImageSize：小图通过，超大图报错', () => {
  assert.equal(validateReferenceImageSize('data:image/png;base64,AAAA').ok, true)
  const huge = 'A'.repeat(Math.ceil(REFERENCE_IMAGE_MAX_BYTES * 4 / 3) + 8)
  const result = validateReferenceImageSize(`data:image/png;base64,${huge}`)
  assert.equal(result.ok, false)
  assert.ok(result.message.includes('8MB'))
})

test('imageBadgeLabel：失败优先于基准立绘', () => {
  assert.equal(imageBadgeLabel(makeItem('a', { status: 'failed', isPrimary: true })), '失败')
  assert.equal(imageBadgeLabel(makeItem('b', { isPrimary: true })), '基准立绘')
  assert.equal(imageBadgeLabel(makeItem('c')), '')
})
