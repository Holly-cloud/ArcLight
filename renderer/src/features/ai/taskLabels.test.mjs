/**
 * 任务中文名映射单测（v1.35.0 从 TitlebarModelSwitcher 抽出为单一来源）
 */
import assert from 'node:assert/strict'
import test from 'node:test'

const { TASK_LABEL_MAP, resolveTaskLabel } = await import('./taskLabels.ts')

test('resolveTaskLabel：优先 clientKey，其次任务名，都没有则回退任务名', () => {
  assert.equal(resolveTaskLabel('chapter-first-draft'), '章节初稿')
  assert.equal(resolveTaskLabel('catalog-batch', 'catalog-batch:worldview'), '世界观批量生成', 'clientKey 子类优先')
  assert.equal(resolveTaskLabel('catalog-batch', 'unknown-key'), '图鉴批量生成', '未知 clientKey 回退任务名映射')
  assert.equal(resolveTaskLabel('not-registered'), 'not-registered', '完全未收录时原样返回')
})

test('TASK_LABEL_MAP：关键任务名均已收录（避免回退成英文任务名）', () => {
  const required = [
    'worldview-entry', 'character-card', 'outline-batch', 'chapter-first-draft', 'global-assistant',
    'asset-extract', 'asset-reextract', 'asset-visual-prompt', 'novel-split-locate',
    'continuation-import-chunk', 'continuation-import-aggregate'
  ]
  for (const task of required) {
    assert.ok(TASK_LABEL_MAP[task], `缺少中文名：${task}`)
  }
})
