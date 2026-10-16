/**
 * v1.26.0 资产库聚合页 · 纯函数模型单测
 * - collectAssets：4 类聚合 / key 防冲突 / 关系计数 / 组织只读 color / 缺字段兜底
 * - filterAssets：类型 + 关键字筛选（v1.30.0 取消 scope 维度）
 *
 * 运行方式：
 *   $env:ELECTRON_RUN_AS_NODE=1; corepack pnpm exec electron --test renderer/src/features/assetLibrary/assetLibraryModel.test.mjs
 */

import assert from 'node:assert/strict'
import test from 'node:test'

const { collectAssets, filterAssets, countAssetsByKind, ASSET_KIND_LABELS } = await import('./assetLibraryModel.ts')

const projects = [
  { id: 'p1', title: '项目一' },
  { id: 'p2', title: '项目二' }
]

const workspaces = {
  p1: {
    characters: [
      { id: 'c1', name: '李雷', role: '男主', description: '主角设定', avatar: 'linear-gradient(#000,#111)', tags: [{ label: '热血' }] }
    ],
    organizations: [
      { id: 'o1', name: '反抗军', type: '势力', description: '地下组织', color: '#112233', tags: [] }
    ],
    sceneLocations: [
      { id: 's1', name: '云顶城', type: '城市', description: '高空之城', tags: [{ label: '浮空' }], color: '#223344', relatedCharacterIds: ['c1'], relatedPropIds: ['pr1'] }
    ],
    propItems: [
      { id: 'pr1', name: '断魂剑', type: '武器', description: '主角佩剑', color: '#334455', tags: [{ label: '神器' }], relatedSceneIds: ['s1'], relatedCharacterIds: ['c1'] }
    ],
    characterRelationships: [
      { id: 'r1', fromCharacterId: 'c1', toCharacterId: 'c1' }
    ],
    organizationMemberships: [
      { id: 'm1', characterId: 'c1', organizationId: 'o1' }
    ]
  },
  p2: {
    // 故意与 p1 同名 id，验证 key 含 projectId 不冲突
    characters: [{ id: 'c1', name: '同名角色', role: '', description: '', avatar: '', tags: [] }]
  }
}

test('collectAssets 聚合 4 类资产（同名 id 跨项目不冲突）', () => {
  const entries = collectAssets(workspaces, projects, 'p1')
  assert.equal(entries.length, 5, 'p1 四类各 1 + p2 角色 1 = 5')
  assert.equal(new Set(entries.map((e) => e.key)).size, entries.length, 'key 必须全局唯一')
  assert.ok(entries.some((e) => e.key === 'p1:character:c1'))
  assert.ok(entries.some((e) => e.key === 'p2:character:c1'))
})

test('collectAssets 关系计数：角色=涉及关系条数（自环计 1）、场景/道具=关联实体数、组织=成员数', () => {
  const entries = collectAssets(workspaces, projects, 'p1')
  const byKey = new Map(entries.map((e) => [e.key, e]))
  assert.equal(byKey.get('p1:character:c1').relationCount, 1, '角色自环关系计 1 条')
  assert.equal(byKey.get('p1:scene:s1').relationCount, 2, '场景关联 1 角色 + 1 道具')
  assert.equal(byKey.get('p1:prop:pr1').relationCount, 2, '道具关联 1 场景 + 1 角色')
  assert.equal(byKey.get('p1:organization:o1').relationCount, 1, '组织成员 1 人')
})

test('collectAssets 字段映射：typeLabel / tags / color / projectName', () => {
  const entries = collectAssets(workspaces, projects, 'p1')
  const character = entries.find((e) => e.key === 'p1:character:c1')
  assert.equal(character.kind, 'character')
  assert.equal(character.typeLabel, '男主', '角色 typeLabel = role')
  assert.deepEqual(character.tags, ['热血'])
  assert.equal(character.projectName, '项目一')

  const organization = entries.find((e) => e.key === 'p1:organization:o1')
  assert.equal(organization.typeLabel, '势力')
  assert.equal(organization.color, '#112233')
  assert.deepEqual(organization.tags, [], '组织无标签，恒为空数组')
})

test('collectAssets 兜底：projects 中登记但 workspaces 缺该项目的快照不抛错', () => {
  const entries = collectAssets({ p1: workspaces.p1 }, projects, 'p1')
  assert.equal(entries.length, 4, '仅 p1 贡献 4 条，p2 无快照则跳过')
})

test('collectAssets workspaces 中未登记的项目也会被聚合（title 兜底空串）', () => {
  const entries = collectAssets({ p1: workspaces.p1, pz: workspaces.p2 }, projects, 'p1')
  const extra = entries.find((e) => e.projectId === 'pz')
  assert.ok(extra, '未登记项目 pz 的资产应被聚合')
  assert.equal(extra.projectName, '')
})

test('filterAssets 按类型筛选（v1.30.0 取消 scope 维度）', () => {
  const entries = collectAssets(workspaces, projects, 'p1')
  assert.equal(filterAssets(entries, { kind: 'all', query: '' }).length, 5)
  assert.equal(filterAssets(entries, { kind: 'character', query: '' }).length, 2)
  assert.equal(filterAssets(entries, { kind: 'scene', query: '' }).length, 1)
  assert.equal(filterAssets(entries, { kind: 'organization', query: '' }).length, 1)
})

test('filterAssets 关键字命中 name / typeLabel / description / tags（大小写不敏感）', () => {
  const entries = collectAssets(workspaces, projects, 'p1')
  assert.equal(filterAssets(entries, { kind: 'all', query: '云顶' }).length, 1)
  assert.equal(filterAssets(entries, { kind: 'all', query: '武器' }).length, 1, '命中 typeLabel')
  assert.equal(filterAssets(entries, { kind: 'all', query: '热血' }).length, 1, '命中 tags')
  assert.equal(filterAssets(entries, { kind: 'all', query: '神器' }).length, 1, '命中 tags')
})

test('filterAssets 组合：类型 + 关键字', () => {
  const entries = collectAssets(workspaces, projects, 'p1')
  const result = filterAssets(entries, { kind: 'scene', query: '城市' })
  assert.equal(result.length, 1)
  assert.equal(result[0].key, 'p1:scene:s1')
  assert.equal(filterAssets(entries, { kind: 'scene', query: '不存在' }).length, 0)
})

test('countAssetsByKind 分类计数 + ASSET_KIND_LABELS 4 类齐全', () => {
  const entries = collectAssets(workspaces, projects, 'p1')
  const counts = countAssetsByKind(entries)
  assert.equal(counts.all, 5)
  assert.equal(counts.character, 2)
  assert.equal(counts.prop, 1)
  assert.equal(counts.scene, 1)
  assert.equal(counts.organization, 1)
  assert.equal(Object.keys(ASSET_KIND_LABELS).length, 4)
})
