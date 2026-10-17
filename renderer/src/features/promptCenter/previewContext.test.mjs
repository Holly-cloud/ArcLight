/**
 * Prompt 中心：「用当前项目试拼」上下文组装单测（纯函数）
 */
import assert from 'node:assert/strict'
import test from 'node:test'

const { buildProjectPreviewContext } = await import('./previewContext.ts')

test('组装通用项目上下文：常用键给全，名称/标题列表同步生成', () => {
  const ctx = buildProjectPreviewContext({
    projectId: 'p1',
    projectTitle: '临川纪',
    projectGenre: '都市异能',
    writingStyleLabel: '冷峻',
    writingStylePrompt: '短句为主',
    characters: [{ id: 'c1', name: '林昭', role: '男主', description: '少年剑修' }],
    worldviewEntries: [{ type: '势力', title: '临川城', content: '边陲城池' }],
    outlineItems: [{ title: '第一卷', summary: '开端', conflict: '入城' }],
    chapters: [{ id: 'ch1', title: '第一章', summary: '出场' }]
  })

  assert.equal(ctx.projectTitle, '临川纪')
  assert.deepEqual(ctx.characterNames, ['林昭'])
  assert.deepEqual(ctx.worldviewTitles, ['临川城'])
  assert.deepEqual(ctx.outlineTitles, ['第一卷'])
  assert.equal(ctx.chapters[0].id, 'ch1')
  assert.equal(ctx.characters[0].role, '男主')
})

test('空值一律剔除，避免让上下文档位被误判为已提供', () => {
  const ctx = buildProjectPreviewContext({ projectTitle: '   ', characters: [], chapters: [] })
  assert.deepEqual(ctx, {}, '全空输入应得到空对象')
})

test('章节只取 id/title/summary —— 不携带正文（避免副作用与卡顿）', () => {
  const ctx = buildProjectPreviewContext({
    chapters: [{ id: 'ch1', title: '第一章', content: '<p>很长的正文</p>', summary: '摘要' }]
  })
  assert.deepEqual(ctx.chapters, [{ id: 'ch1', title: '第一章', summary: '摘要' }])
  assert.equal('content' in ctx.chapters[0], false)
})

test('集合限流与文本截断生效', () => {
  const characters = Array.from({ length: 50 }, (_, index) => ({
    id: `c${index}`,
    name: `角色${index}`,
    description: 'x'.repeat(600)
  }))
  const ctx = buildProjectPreviewContext({ characters })
  assert.equal(ctx.characters.length, 40, '角色最多 40 个')
  assert.equal(ctx.characters[0].description.length, 400, '单字段文本截断到 400 字')

  const ctx2 = buildProjectPreviewContext({ worldviewEntries: [{ title: '   ', content: 'x' }] })
  assert.equal(ctx2.worldviewEntries, undefined, '无标题的世界观条目应被剔除')
})
