import assert from 'node:assert/strict'
import test from 'node:test'

const {
  buildRelationsGraphData,
  buildRelationsCytoscapeElements,
  filterRelationsGraph,
  buildCharacterNodeId,
  buildSceneNodeId,
  buildPropNodeId,
  resolveArcTokenColor
} = await import('./graph.ts')

function createCharacter(id, name) {
  return { id, name, role: '角色', description: '', avatar: '', tags: [] }
}

function createScene(id, name, extra = {}) {
  return {
    id,
    name,
    type: '城市',
    description: '',
    tags: [],
    color: '',
    sortOrder: 0,
    relatedCharacterIds: [],
    relatedPropIds: [],
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01',
    ...extra
  }
}

function createProp(id, name, extra = {}) {
  return {
    id,
    name,
    type: '武器',
    description: '',
    ownerCharacterId: '',
    tags: [],
    color: '',
    sortOrder: 0,
    relatedSceneIds: [],
    relatedCharacterIds: [],
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01',
    ...extra
  }
}

const basePayload = () => ({
  characters: [],
  organizations: [],
  characterRelationships: [],
  organizationMemberships: [],
  sceneLocations: [],
  propItems: []
})

test('节点 id 构造器使用 scene-/prop- 前缀', () => {
  assert.equal(buildSceneNodeId('scene-1'), 'scene-scene-1')
  assert.equal(buildPropNodeId('prop-1'), 'prop-prop-1')
  assert.equal(buildCharacterNodeId('char-1'), 'character-char-1')
})

test('resolveArcTokenColor 在非 DOM 环境下回退到内置色板', () => {
  assert.equal(resolveArcTokenColor('--arc-success'), '#15803d')
  assert.equal(resolveArcTokenColor('--arc-text-secondary'), '#52525b')
  assert.equal(resolveArcTokenColor('--arc-unknown', '#123456'), '#123456')
})

test('buildRelationsGraphData 生成场景/道具节点与跨实体边', () => {
  const graph = buildRelationsGraphData({
    ...basePayload(),
    characters: [createCharacter('char-1', '林渡')],
    sceneLocations: [createScene('scene-1', '云顶城', { relatedCharacterIds: ['char-1'] })],
    propItems: [createProp('prop-1', '断魂剑', {
      ownerCharacterId: 'char-1',
      relatedSceneIds: ['scene-1'],
      relatedCharacterIds: ['char-1']
    })]
  })

  const sceneNode = graph.nodes.find((node) => node.id === 'scene-scene-1')
  const propNode = graph.nodes.find((node) => node.id === 'prop-prop-1')
  assert.ok(sceneNode)
  assert.equal(sceneNode.kind, 'scene')
  assert.equal(propNode.kind, 'prop')

  const sceneLink = graph.edges.find((edge) => edge.kind === 'scene-link')
  assert.equal(sceneLink.source, 'scene-scene-1')
  assert.equal(sceneLink.target, 'character-char-1')

  const propSceneLink = graph.edges.find((edge) => edge.kind === 'prop-link' && edge.target === 'scene-scene-1')
  assert.ok(propSceneLink)
  // 持有者边：owner 只产出一条，relatedCharacterIds 中的重复 id 被去重
  const ownerEdges = graph.edges.filter((edge) => edge.kind === 'prop-link' && edge.target === 'character-char-1')
  assert.equal(ownerEdges.length, 1)
  assert.equal(ownerEdges[0].label, '持有者')
})

test('buildRelationsGraphData 不会为悬空引用产出边', () => {
  const graph = buildRelationsGraphData({
    ...basePayload(),
    characters: [createCharacter('char-1', '林渡')],
    sceneLocations: [createScene('scene-1', '云顶城', { relatedCharacterIds: ['char-missing'] })],
    propItems: [createProp('prop-1', '断魂剑', { relatedSceneIds: ['scene-missing'], ownerCharacterId: 'char-missing' })]
  })

  assert.equal(graph.edges.length, 0)
})

test('filterRelationsGraph 放行场景/道具节点与跨实体边，仍排除组织归属', () => {
  const graph = buildRelationsGraphData({
    ...basePayload(),
    characters: [createCharacter('char-1', '林渡')],
    organizations: [{ id: 'org-1', name: '夜枭会', type: '势力', description: '', motto: '', color: '', sortOrder: 0, createdAt: '', updatedAt: '' }],
    organizationMemberships: [{ id: 'mem-1', characterId: 'char-1', organizationId: 'org-1', role: '成员', notes: '', createdAt: '', updatedAt: '' }],
    sceneLocations: [createScene('scene-1', '云顶城', { relatedCharacterIds: ['char-1'] })],
    propItems: [createProp('prop-1', '断魂剑', { relatedSceneIds: ['scene-1'] })]
  })

  const filtered = filterRelationsGraph(graph, { query: '', highIntensityOnly: false })
  assert.deepEqual(
    filtered.nodes.map((node) => node.kind).sort(),
    ['character', 'prop', 'scene']
  )
  assert.ok(filtered.edges.some((edge) => edge.kind === 'scene-link'))
  assert.ok(filtered.edges.some((edge) => edge.kind === 'prop-link'))
  assert.equal(filtered.edges.some((edge) => edge.kind === 'membership'), false)
})

test('搜索关键词命中场景名时该场景节点与其边进入可见集', () => {
  const graph = buildRelationsGraphData({
    ...basePayload(),
    characters: [createCharacter('char-1', '林渡'), createCharacter('char-2', '宴川')],
    sceneLocations: [createScene('scene-1', '云顶城', { relatedCharacterIds: ['char-1'] })]
  })

  const filtered = filterRelationsGraph(graph, { query: '云顶城', highIntensityOnly: false })
  assert.deepEqual(filtered.nodes.map((node) => node.id).sort(), ['character-char-1', 'scene-scene-1'])
  assert.equal(filtered.edges.length, 1)
  assert.equal(filtered.matchedNodeIds.has('scene-scene-1'), true)
})

test('buildRelationsCytoscapeElements 为跨实体边标注 kind class', () => {
  const graph = buildRelationsGraphData({
    ...basePayload(),
    characters: [createCharacter('char-1', '林渡')],
    sceneLocations: [createScene('scene-1', '云顶城', { relatedCharacterIds: ['char-1'] })]
  })
  const filtered = filterRelationsGraph(graph, { query: '', highIntensityOnly: false })
  const elements = buildRelationsCytoscapeElements(filtered)

  const sceneNode = elements.find((element) => element.data.id === 'scene-scene-1')
  assert.ok(sceneNode.classes.includes('scene'))

  const sceneEdge = elements.find((element) => element.data.kind === 'scene-link')
  assert.equal(sceneEdge.classes, 'scene-link')
  assert.equal(typeof sceneEdge.data.color, 'string')
})
