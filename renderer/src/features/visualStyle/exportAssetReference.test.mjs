/**
 * v1.27.0 资产参考表导出纯函数单测
 * - buildAssetReferenceRows：强制字段恒在 / 可选字段勾选 / description 截断
 * - 3 种格式：Markdown / JSON / CSV（≥4 字段组合）
 * - CSV 转义（逗号 / 引号）+ palette 分号分隔
 * - buildImagePrompt 预览 Prompt 组装
 *
 * 运行：set ELECTRON_RUN_AS_NODE=1&& electron --test renderer/src/features/visualStyle/exportAssetReference.test.mjs
 */
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      return nextResolve(new URL(`../../${specifier.slice(2)}.ts`, import.meta.url).href, context)
    }
    return nextResolve(specifier, context)
  }
})

const {
  buildAssetReferenceRows,
  formatAsMarkdown,
  formatAsJson,
  formatAsCsv,
  buildImagePrompt,
  FORCED_ASSET_REFERENCE_FIELDS
} = await import('./exportAssetReference.ts')

function entry(overrides = {}) {
  return {
    key: 'p:character:c1',
    kind: 'character',
    id: 'c1',
    projectId: 'p',
    projectName: '项目',
    name: '云澈',
    typeLabel: '主角',
    description: '一位来自云顶城的年轻剑修',
    tags: ['主角', '剑修'],
    color: '',
    relationCount: 0,
    renderMode: 'anime',
    palette: ['#1b3a5b', '#f2d9a0'],
    moodWords: ['冷峻', '坚定'],
    keyReferences: ['水墨青绿'],
    lightingNote: '',
    seasonNote: '',
    materialityNote: '',
    visualStyle: null,
    visualContext: null,
    ...overrides
  }
}

test('强制字段恒在；可选字段默认全含', () => {
  const [row] = buildAssetReferenceRows([entry()])
  for (const field of FORCED_ASSET_REFERENCE_FIELDS) {
    assert.ok(field in row, `强制字段 ${field} 必须存在`)
  }
  assert.ok('description' in row, '默认包含可选字段 description')
  assert.ok('lightingNote' in row, '默认包含可选字段 lightingNote')
})

test('可选字段勾选：fields=[] 时不含任何可选字段', () => {
  const [row] = buildAssetReferenceRows([entry()], { fields: [] })
  assert.ok('name' in row)
  assert.ok('renderMode' in row)
  assert.equal('description' in row, false, 'fields=[] 不应含 description')
  assert.equal('lightingNote' in row, false, 'fields=[] 不应含 lightingNote')
})

test('可选字段勾选：仅选 lightingNote + description', () => {
  const [row] = buildAssetReferenceRows([entry({ lightingNote: '晨光' })], {
    fields: ['lightingNote', 'description']
  })
  assert.equal(row.lightingNote, '晨光')
  assert.ok('description' in row)
  assert.equal('seasonNote' in row, false, '未勾选的 seasonNote 不应出现')
  assert.equal('materialityNote' in row, false)
})

test('description 截断到 80 字并加省略号', () => {
  const long = '甲'.repeat(120)
  const [row] = buildAssetReferenceRows([entry({ description: long })])
  assert.equal(row.description.length, 81, '80 字 + 省略号')
  assert.ok(row.description.endsWith('…'))
  const [row2] = buildAssetReferenceRows([entry({ description: long })], { descriptionLength: 10 })
  assert.equal(row2.description, `${'甲'.repeat(10)}…`)
})

test('JSON 格式保留数组字段', () => {
  const rows = buildAssetReferenceRows([entry()])
  const parsed = JSON.parse(formatAsJson(rows))
  assert.equal(parsed.length, 1)
  assert.deepEqual(parsed[0].palette, ['#1b3a5b', '#f2d9a0'])
  assert.deepEqual(parsed[0].moodWords, ['冷峻', '坚定'])
  assert.equal(parsed[0].renderMode, 'anime')
})

test('CSV：palette 用 ; 分隔，且表头为中文标签', () => {
  const rows = buildAssetReferenceRows([entry()])
  const csv = formatAsCsv(rows)
  const lines = csv.split('\n')
  assert.ok(lines[0].includes('名称'), 'CSV 表头含「名称」')
  assert.ok(lines[0].includes('渲染方式'), 'CSV 表头含「渲染方式」')
  assert.ok(lines[1].includes('#1b3a5b;#f2d9a0'), 'CSV palette 须用分号分隔')
  assert.ok(lines[1].includes('冷峻;坚定'), 'CSV 数组字段用分号分隔')
})

test('CSV：含逗号与引号的值正确转义', () => {
  const rows = buildAssetReferenceRows([entry({ name: '云澈, "主角"' })], { fields: [] })
  const csv = formatAsCsv(rows)
  const dataLine = csv.split('\n')[1]
  assert.ok(dataLine.startsWith('"云澈, ""主角"""'), `期望转义后单元格，实际：${dataLine}`)
})

test('Markdown：表格头 + 分隔行，| 转义', () => {
  const rows = buildAssetReferenceRows([entry({ name: '云澈|风' })], { fields: [] })
  const md = formatAsMarkdown(rows)
  const lines = md.split('\n')
  assert.ok(lines[0].startsWith('| 名称 | 类型 |'), `表头格式错误：${lines[0]}`)
  assert.ok(lines[1].includes('---'), '含分隔行')
  assert.ok(md.includes('云澈\\|风'), '管道符须转义')
  assert.ok(md.includes('anime'), '含 renderMode')
})

test('空行输入：Markdown / CSV 返回空串，JSON 返回 []', () => {
  assert.equal(formatAsMarkdown([]), '')
  assert.equal(formatAsCsv([]), '')
  assert.equal(formatAsJson([]), '[]')
})

test('buildImagePrompt：组装结构化 Prompt 文本', () => {
  const prompt = buildImagePrompt({
    name: '云澈',
    type: '主角',
    renderMode: 'anime',
    palette: ['#1b3a5b', '#f2d9a0'],
    moodWords: ['冷峻'],
    keyReferences: ['水墨青绿'],
    lightingNote: '晨光',
    seasonNote: '初春',
    materialityNote: '青石',
    description: '年轻剑修'
  })
  assert.ok(prompt.includes('云澈 · 主角'))
  assert.ok(prompt.includes('渲染方式：anime'))
  assert.ok(prompt.includes('配色：#1b3a5b / #f2d9a0'))
  assert.ok(prompt.includes('光影：晨光'))
  assert.ok(prompt.includes('年轻剑修'))
  assert.equal(buildImagePrompt(null), '')
})

test('旧资产缺失视觉字段兜底为空，不抛错', () => {
  const [row] = buildAssetReferenceRows([
    entry({ renderMode: undefined, palette: undefined, moodWords: undefined, keyReferences: undefined })
  ])
  assert.equal(row.renderMode, '')
  assert.deepEqual(row.palette, [])
  assert.deepEqual(row.moodWords, [])
  assert.deepEqual(row.keyReferences, [])
})
