<script setup lang="ts">
// 工作台 → 项目内 Tab 内的场景 / 道具子区段（v1.25 新增）
// - 由 v1.23 sceneprop 阶段在 RelationsPanel.vue 落地的场景/道具编辑器、列表、图谱等代码完整提取
// - 仅接受项目内场景/道具的 CRUD + 视图切换 + 跨实体图谱
// - 不再保留与角色图谱其他段（组织 / 关系 / 归属）的耦合
import { computed, reactive, ref } from 'vue'
import {
  Building2,
  ChevronDown,
  Gem,
  Link2,
  MapPin,
  Network,
  PencilLine,
  Plus,
  Rows3,
  Search,
  Trash2,
  UserRoundCog,
  Users
} from 'lucide-vue-next'
import { NButton, NCheckbox, NDropdown, NDynamicTags, NForm, NFormItem, NInput, NModal, NSelect, useDialog, useMessage } from 'naive-ui'
import type { DropdownOption, SelectOption } from 'naive-ui'
import RelationsGraphView from '@/components/RelationsGraphView.vue'
import ScenePropCard from '@/components/ScenePropCard.vue'
import { buildRelationsGraphData } from '@/features/relations/graph'
import { themePresets } from '@/theme/presets'
import { useAppStore } from '@/stores/app'
import type { CharacterTag, PropItem, SceneLocation } from '@/types/app'
import { useBatchSelection } from '@/composables/useBatchSelection'
import { useIncrementalList } from '@/composables/useIncrementalList'
import BatchSelectionBar from './BatchSelectionBar.vue'

const appStore = useAppStore()
const message = useMessage()
const dialog = useDialog()

const props = defineProps<{
  searchQuery?: string
}>()

const keyword = ref('')
const viewMode = ref<'list' | 'graph'>('list')
type ListSection = 'scenes' | 'props'
const activeListSection = ref<ListSection>('scenes')

const mergedQuery = computed(() => [props.searchQuery, keyword.value].filter(Boolean).join(' ').trim().toLowerCase())
const characterMap = computed(() => new Map(appStore.characters.map((character) => [character.id, character])))

const relationsGraph = computed(() =>
  buildRelationsGraphData({
    characters: appStore.characters,
    organizations: appStore.organizations,
    characterRelationships: appStore.characterRelationships,
    organizationMemberships: appStore.organizationMemberships,
    sceneLocations: appStore.sceneLocations,
    propItems: appStore.propItems
  })
)

const sceneOptions = computed(() =>
  appStore.sceneLocations.map((scene) => ({ label: scene.name, value: scene.id }))
)
const propOptions = computed(() =>
  appStore.propItems.map((prop) => ({ label: prop.name, value: prop.id }))
)
const sceneMap = computed(() => new Map(appStore.sceneLocations.map((scene) => [scene.id, scene])))
const propMap = computed(() => new Map(appStore.propItems.map((prop) => [prop.id, prop])))
const characterOptions = computed(() =>
  appStore.characters.map((character) => ({
    label: character.name,
    value: character.id
  }))
)

const SCENE_TYPE_OPTIONS: SelectOption[] = ['城市', '建筑', '自然地形', '室内', '异空间'].map((type) => ({ label: type, value: type }))
const PROP_TYPE_OPTIONS: SelectOption[] = ['武器', '信物', '法器', '消耗品', '线索物'].map((type) => ({ label: type, value: type }))
const ENTITY_COLOR_OPTIONS: SelectOption[] = [
  { label: '跟随主题（默认）', value: '' },
  ...themePresets.map((preset) => ({ label: preset.label, value: preset.primary }))
]

const listSections = computed(() => [
  {
    key: 'scenes',
    label: '场景',
    count: appStore.sceneLocations.length,
    icon: MapPin
  },
  {
    key: 'props',
    label: '道具',
    count: appStore.propItems.length,
    icon: Gem
  }
] as Array<{ key: ListSection; label: string; count: number; icon: typeof Building2 }>)

const filteredScenes = computed(() => {
  const query = mergedQuery.value
  const decorated = appStore.sceneLocations.map((scene) => {
    const characterNames = scene.relatedCharacterIds
      .map((id) => characterMap.value.get(id)?.name)
      .filter((name): name is string => Boolean(name))
    const propNames = scene.relatedPropIds
      .map((id) => propMap.value.get(id)?.name)
      .filter((name): name is string => Boolean(name))
    return { ...scene, characterNames, propNames }
  })

  if (!query) return decorated
  return decorated.filter((scene) =>
    `${scene.name} ${scene.type} ${scene.description} ${scene.tags.map((tag) => tag.label).join(' ')} ${scene.characterNames.join(' ')} ${scene.propNames.join(' ')}`
      .toLowerCase()
      .includes(query)
  )
})

const filteredProps = computed(() => {
  const query = mergedQuery.value
  const decorated = appStore.propItems.map((prop) => {
    const ownerName = prop.ownerCharacterId ? (characterMap.value.get(prop.ownerCharacterId)?.name ?? '') : ''
    const sceneNames = prop.relatedSceneIds
      .map((id) => sceneMap.value.get(id)?.name)
      .filter((name): name is string => Boolean(name))
    const characterNames = prop.relatedCharacterIds
      .map((id) => characterMap.value.get(id)?.name)
      .filter((name): name is string => Boolean(name))
    return { ...prop, ownerName, sceneNames, characterNames }
  })

  if (!query) return decorated
  return decorated.filter((prop) =>
    `${prop.name} ${prop.type} ${prop.description} ${prop.tags.map((tag) => tag.label).join(' ')} ${prop.ownerName} ${prop.sceneNames.join(' ')} ${prop.characterNames.join(' ')}`
      .toLowerCase()
      .includes(query)
  )
})

const currentSelectionIds = computed(() => {
  if (activeListSection.value === 'scenes') return filteredScenes.value.map((item) => item.id)
  return filteredProps.value.map((item) => item.id)
})
const relationSelection = useBatchSelection(currentSelectionIds)
const currentSelectionLabel = computed(() => (activeListSection.value === 'scenes' ? '场景' : '道具'))

const relationListResetKey = computed(() => `${mergedQuery.value}\u0000${activeListSection.value}`)
const visibleScenes = useIncrementalList(filteredScenes, relationListResetKey)
const visibleProps = useIncrementalList(filteredProps, relationListResetKey)

// --- 场景编辑器状态 ---
const sceneEditorVisible = ref(false)
const editingSceneId = ref<string | null>(null)
const sceneForm = reactive({
  name: '',
  type: '',
  description: '',
  tags: [] as string[],
  color: '',
  relatedCharacterIds: [] as string[],
  relatedPropIds: [] as string[]
})

// --- 道具编辑器状态 ---
const propEditorVisible = ref(false)
const editingPropId = ref<string | null>(null)
const propForm = reactive({
  name: '',
  type: '',
  description: '',
  ownerCharacterId: '',
  tags: [] as string[],
  color: '',
  relatedSceneIds: [] as string[],
  relatedCharacterIds: [] as string[]
})

/** 将 NDynamicTags 的字符串标签转为 CharacterTag 结构 */
function toEntityTags(labels: string[]): CharacterTag[] {
  return labels
    .map((label) => String(label).trim())
    .filter(Boolean)
    .map((label) => ({ label }))
}

/** 场景卡片的关联摘要文案 */
function sceneRelationSummary(scene: { characterNames: string[]; propNames: string[] }): string {
  const parts: string[] = []
  if (scene.characterNames.length) parts.push(`关联角色：${scene.characterNames.join('、')}`)
  if (scene.propNames.length) parts.push(`关联道具：${scene.propNames.join('、')}`)
  return parts.join(' · ')
}

/** 道具卡片的关联摘要文案 */
function propRelationSummary(prop: { sceneNames: string[]; characterNames: string[] }): string {
  const parts: string[] = []
  if (prop.sceneNames.length) parts.push(`所属场景：${prop.sceneNames.join('、')}`)
  if (prop.characterNames.length) parts.push(`关联角色：${prop.characterNames.join('、')}`)
  return parts.join(' · ')
}

/** 保存道具时将关联场景写入对应场景的 relatedPropIds（双侧镜像同步） */
function syncPropScenes(propId: string, sceneIds: string[]): void {
  const nextSceneIds = new Set(sceneIds)
  appStore.sceneLocations.forEach((scene) => {
    const linked = scene.relatedPropIds.includes(propId)
    const shouldLink = nextSceneIds.has(scene.id)
    if (shouldLink && !linked) {
      appStore.updateSceneLocation(scene.id, { relatedPropIds: [...scene.relatedPropIds, propId] })
    } else if (!shouldLink && linked) {
      appStore.updateSceneLocation(scene.id, { relatedPropIds: scene.relatedPropIds.filter((id) => id !== propId) })
    }
  })
}

/** 保存场景时将关联道具写入对应道具的 relatedSceneIds（双侧镜像同步） */
function syncSceneProps(sceneId: string, propIds: string[]): void {
  const nextPropIds = new Set(propIds)
  appStore.propItems.forEach((prop) => {
    const linked = prop.relatedSceneIds.includes(sceneId)
    const shouldLink = nextPropIds.has(prop.id)
    if (shouldLink && !linked) {
      appStore.updatePropItem(prop.id, { relatedSceneIds: [...prop.relatedSceneIds, sceneId] })
    } else if (!shouldLink && linked) {
      appStore.updatePropItem(prop.id, { relatedSceneIds: prop.relatedSceneIds.filter((id) => id !== sceneId) })
    }
  })
}

function openSceneEditor(scene?: SceneLocation): void {
  editingSceneId.value = scene?.id ?? null
  sceneForm.name = scene?.name ?? ''
  sceneForm.type = scene?.type ?? '城市'
  sceneForm.description = scene?.description ?? ''
  sceneForm.tags = scene?.tags.map((tag) => tag.label) ?? []
  sceneForm.color = scene?.color ?? ''
  sceneForm.relatedCharacterIds = [...(scene?.relatedCharacterIds ?? [])]
  sceneForm.relatedPropIds = [...(scene?.relatedPropIds ?? [])]
  sceneEditorVisible.value = true
}

function submitScene(): void {
  const name = sceneForm.name.trim()
  if (!name) {
    message.warning('请填写场景名称')
    return
  }

  const payload: Partial<SceneLocation> = {
    name,
    type: sceneForm.type.trim() || '城市',
    description: sceneForm.description.trim(),
    tags: toEntityTags(sceneForm.tags),
    color: sceneForm.color,
    relatedCharacterIds: sceneForm.relatedCharacterIds,
    relatedPropIds: sceneForm.relatedPropIds
  }

  if (editingSceneId.value) {
    appStore.updateSceneLocation(editingSceneId.value, payload)
    syncSceneProps(editingSceneId.value, sceneForm.relatedPropIds)
    message.success('场景信息已更新')
  } else {
    const sceneId = appStore.createSceneLocation(payload)
    syncSceneProps(sceneId, sceneForm.relatedPropIds)
    message.success('已新增场景')
  }

  sceneEditorVisible.value = false
}

function confirmDeleteScene(scene: { id: string; name: string }): void {
  dialog.warning({
    title: '确认删除场景',
    content: `确定要删除“${scene.name}”吗？引用该场景的道具会自动解除关联。`,
    positiveText: '确认删除',
    negativeText: '取消',
    autoFocus: false,
    closable: false,
    onPositiveClick: () => {
      appStore.deleteSceneLocation(scene.id)
      message.success('场景已删除')
    }
  })
}

function openPropEditor(prop?: PropItem): void {
  editingPropId.value = prop?.id ?? null
  propForm.name = prop?.name ?? ''
  propForm.type = prop?.type ?? '信物'
  propForm.description = prop?.description ?? ''
  propForm.ownerCharacterId = prop?.ownerCharacterId ?? ''
  propForm.tags = prop?.tags.map((tag) => tag.label) ?? []
  propForm.color = prop?.color ?? ''
  propForm.relatedSceneIds = [...(prop?.relatedSceneIds ?? [])]
  propForm.relatedCharacterIds = [...(prop?.relatedCharacterIds ?? [])]
  propEditorVisible.value = true
}

function submitProp(): void {
  const name = propForm.name.trim()
  if (!name) {
    message.warning('请填写道具名称')
    return
  }

  const payload: Partial<PropItem> = {
    name,
    type: propForm.type.trim() || '信物',
    description: propForm.description.trim(),
    ownerCharacterId: propForm.ownerCharacterId,
    tags: toEntityTags(propForm.tags),
    color: propForm.color,
    relatedSceneIds: propForm.relatedSceneIds,
    relatedCharacterIds: propForm.relatedCharacterIds
  }

  if (editingPropId.value) {
    appStore.updatePropItem(editingPropId.value, payload)
    syncPropScenes(editingPropId.value, propForm.relatedSceneIds)
    message.success('道具信息已更新')
  } else {
    const propId = appStore.createPropItem(payload)
    syncPropScenes(propId, propForm.relatedSceneIds)
    message.success('已新增道具')
  }

  propEditorVisible.value = false
}

function confirmDeleteProp(prop: { id: string; name: string }): void {
  dialog.warning({
    title: '确认删除道具',
    content: `确定要删除“${prop.name}”吗？引用该道具的场景会自动解除关联。`,
    positiveText: '确认删除',
    negativeText: '取消',
    autoFocus: false,
    closable: false,
    onPositiveClick: () => {
      appStore.deletePropItem(prop.id)
      message.success('道具已删除')
    }
  })
}

function setViewMode(mode: 'list' | 'graph'): void {
  viewMode.value = mode
}

function confirmBatchDeleteRelations(): void {
  const ids = [...relationSelection.selectedAvailableIds.value]
  if (!ids.length) return
  const section = activeListSection.value
  const cascadeNote = section === 'scenes'
    ? '，道具侧的关联场景引用也会一并清理'
    : '，场景侧的关联道具引用也会一并清理'
  dialog.warning({
    title: `批量删除${currentSelectionLabel.value}`,
    content: `确定删除选中的 ${ids.length} 条${currentSelectionLabel.value}数据吗${cascadeNote}？此操作无法撤销。`,
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: () => {
      if (section === 'scenes') ids.forEach((id) => appStore.deleteSceneLocation(id))
      else ids.forEach((id) => appStore.deletePropItem(id))
      relationSelection.finishSelection()
      message.success(`已删除 ${ids.length} 条${currentSelectionLabel.value}数据`)
    }
  })
}

function openGraphNodeEditor(payload: { kind: 'character' | 'organization' | 'scene' | 'prop'; entityId: string }): void {
  if (payload.kind === 'scene') {
    const scene = appStore.sceneLocations.find((item) => item.id === payload.entityId)
    if (scene) openSceneEditor(scene)
    return
  }
  if (payload.kind === 'prop') {
    const prop = appStore.propItems.find((item) => item.id === payload.entityId)
    if (prop) openPropEditor(prop)
    return
  }
  if (payload.kind === 'character') {
    const character = appStore.characters.find((item) => item.id === payload.entityId)
    if (character) {
      message.info('角色编辑请到「角色图鉴」面板')
    }
    return
  }
  const organization = appStore.organizations.find((item) => item.id === payload.entityId)
  if (organization) {
    message.info('组织编辑请到「关系组织 → 组织势力」面板')
  }
}
</script>

<template>
  <section class="scene-prop-section">
    <header class="section-header">
      <div class="section-tabs" role="tablist">
        <button
          v-for="item in listSections"
          :key="item.key"
          type="button"
          role="tab"
          class="section-tab"
          :class="{ active: activeListSection === item.key }"
          :aria-selected="activeListSection === item.key"
          @click="activeListSection = item.key"
        >
          <component :is="item.icon" :size="16" />
          <span>{{ item.label }}</span>
          <span class="section-tab-count">{{ item.count }}</span>
        </button>
      </div>

      <div class="section-tools">
        <n-input v-model:value="keyword" size="small" placeholder="搜索场景 / 道具" clearable class="section-search">
          <template #prefix><Search :size="14" /></template>
        </n-input>
        <n-button size="small" secondary @click="setViewMode('list')" :type="viewMode === 'list' ? 'primary' : 'default'">
          <template #icon><Rows3 :size="14" /></template>
          列表
        </n-button>
        <n-button size="small" secondary @click="setViewMode('graph')" :type="viewMode === 'graph' ? 'primary' : 'default'">
          <template #icon><Network :size="14" /></template>
          图谱
        </n-button>
        <n-button
          v-if="activeListSection === 'scenes'"
          type="primary"
          size="small"
          @click="openSceneEditor()"
        >
          <template #icon><Plus :size="14" /></template>
          新建场景
        </n-button>
        <n-button
          v-else
          type="primary"
          size="small"
          @click="openPropEditor()"
        >
          <template #icon><Plus :size="14" /></template>
          新建道具
        </n-button>
      </div>
    </header>

    <BatchSelectionBar
      :active="relationSelection.selectionMode.value"
      :selected-count="relationSelection.selectedAvailableIds.value.length"
      :total-count="currentSelectionIds.length"
      :all-selected="relationSelection.allAvailableSelected.value"
      :item-label="currentSelectionLabel"
      @toggle="relationSelection.toggleSelectionMode"
      @select-all="relationSelection.toggleSelectAll"
      @clear="relationSelection.clearSelection"
      @delete="confirmBatchDeleteRelations"
    />

    <section v-if="viewMode === 'list'" class="list-section">
      <section v-if="activeListSection === 'scenes'" class="list-section">
        <div v-if="filteredScenes.length > 0" class="relations-scene-prop-grid">
          <ScenePropCard
            v-for="scene in visibleScenes"
            :key="scene.id"
            kind="scene"
            :name="scene.name"
            :type="scene.type"
            :description="scene.description"
            :tags="scene.tags"
            :color="scene.color"
            :relation-summary="sceneRelationSummary(scene)"
            :selected="relationSelection.selectedIds.value.has(scene.id)"
            :selection-mode="relationSelection.selectionMode.value"
            @edit="openSceneEditor(scene)"
            @remove="confirmDeleteScene(scene)"
            @toggle-select="relationSelection.toggleSelection(scene.id)"
          />
        </div>
        <ScenePropCard
          v-else
          kind="scene"
          empty
          :empty-title="mergedQuery ? '没有匹配的场景' : '还没有场景 / 地点'"
          :empty-text="mergedQuery ? '换个关键词再试试，或清空搜索框查看全部场景。' : '把散落在正文里的地点设定沉淀下来，后面就能在图谱里看到谁在何处。'"
          @create="openSceneEditor()"
        />
      </section>

      <section v-else class="list-section">
        <div v-if="filteredProps.length > 0" class="relations-scene-prop-grid">
          <ScenePropCard
            v-for="prop in visibleProps"
            :key="prop.id"
            kind="prop"
            :name="prop.name"
            :type="prop.type"
            :description="prop.description"
            :tags="prop.tags"
            :color="prop.color"
            :owner-name="prop.ownerName"
            :relation-summary="propRelationSummary(prop)"
            :selected="relationSelection.selectedIds.value.has(prop.id)"
            :selection-mode="relationSelection.selectionMode.value"
            @edit="openPropEditor(prop)"
            @remove="confirmDeleteProp(prop)"
            @toggle-select="relationSelection.toggleSelection(prop.id)"
          />
        </div>
        <ScenePropCard
          v-else
          kind="prop"
          empty
          :empty-title="mergedQuery ? '没有匹配的道具' : '还没有道具'"
          :empty-text="mergedQuery ? '换个关键词再试试，或清空搜索框查看全部道具。' : '记录关键道具的归属与流转，便于追踪信物、法器与线索物。'"
          @create="openPropEditor()"
        />
      </section>
    </section>

    <section v-else class="graph-section">
      <RelationsGraphView
        :graph="relationsGraph"
        @open-node="openGraphNodeEditor"
      />
    </section>

    <n-modal
      :show="sceneEditorVisible"
      preset="card"
      class="arc-editor-modal-wide"
      :title="editingSceneId ? '编辑场景' : '新建场景'"
      :bordered="false"
      @close="sceneEditorVisible = false"
    >
      <n-form label-placement="top">
        <div class="form-grid">
          <n-form-item label="场景名称">
            <n-input v-model:value="sceneForm.name" placeholder="例如：云顶城 / 落雪谷 / 第七码头" />
          </n-form-item>
          <n-form-item label="场景类型">
            <n-select v-model:value="sceneForm.type" filterable tag :options="SCENE_TYPE_OPTIONS" placeholder="选择或输入场景类型" />
          </n-form-item>
        </div>
        <n-form-item label="场景描述">
          <n-input
            v-model:value="sceneForm.description"
            type="textarea"
            :autosize="{ minRows: 3, maxRows: 6 }"
            placeholder="补充地理特征、氛围、势力分布与故事作用..."
          />
        </n-form-item>
        <n-form-item label="关联角色">
          <n-select v-model:value="sceneForm.relatedCharacterIds" multiple filterable :options="characterOptions" placeholder="选择出现在该场景的角色" />
        </n-form-item>
        <n-form-item label="关联道具">
          <n-select v-model:value="sceneForm.relatedPropIds" multiple filterable :options="propOptions" placeholder="选择位于该场景的重要道具" />
        </n-form-item>
        <n-form-item label="标签">
          <n-dynamic-tags v-model:value="sceneForm.tags" />
        </n-form-item>
        <n-form-item label="主色">
          <n-select v-model:value="sceneForm.color" :options="ENTITY_COLOR_OPTIONS" />
        </n-form-item>
      </n-form>

      <template #footer>
        <div class="arc-modal-actions">
          <n-button round strong @click="sceneEditorVisible = false">取消</n-button>
          <n-button type="primary" round strong @click="submitScene">
            {{ editingSceneId ? '保存修改' : '创建场景' }}
          </n-button>
        </div>
      </template>
    </n-modal>

    <n-modal
      :show="propEditorVisible"
      preset="card"
      class="arc-editor-modal-wide"
      :title="editingPropId ? '编辑道具' : '新建道具'"
      :bordered="false"
      @close="propEditorVisible = false"
    >
      <n-form label-placement="top">
        <div class="form-grid">
          <n-form-item label="道具名称">
            <n-input v-model:value="propForm.name" placeholder="例如：断魂剑 / 传国玉玺 / 引魂灯" />
          </n-form-item>
          <n-form-item label="道具类型">
            <n-select v-model:value="propForm.type" filterable tag :options="PROP_TYPE_OPTIONS" placeholder="选择或输入道具类型" />
          </n-form-item>
        </div>
        <n-form-item label="道具描述">
          <n-input
            v-model:value="propForm.description"
            type="textarea"
            :autosize="{ minRows: 3, maxRows: 6 }"
            placeholder="补充道具外观、用途、来源与剧情中的作用..."
          />
        </n-form-item>
        <n-form-item label="持有者">
          <n-select v-model:value="propForm.ownerCharacterId" clearable filterable :options="characterOptions" placeholder="选择主要持有者" />
        </n-form-item>
        <n-form-item label="关联场景">
          <n-select v-model:value="propForm.relatedSceneIds" multiple filterable :options="sceneOptions" placeholder="选择道具位于/出现于的场景" />
        </n-form-item>
        <n-form-item label="关联角色">
          <n-select v-model:value="propForm.relatedCharacterIds" multiple filterable :options="characterOptions" placeholder="选择其他关联角色（不含持有者）" />
        </n-form-item>
        <n-form-item label="标签">
          <n-dynamic-tags v-model:value="propForm.tags" />
        </n-form-item>
        <n-form-item label="主色">
          <n-select v-model:value="propForm.color" :options="ENTITY_COLOR_OPTIONS" />
        </n-form-item>
      </n-form>

      <template #footer>
        <div class="arc-modal-actions">
          <n-button round strong @click="propEditorVisible = false">取消</n-button>
          <n-button type="primary" round strong @click="submitProp">
            {{ editingPropId ? '保存修改' : '创建道具' }}
          </n-button>
        </div>
      </template>
    </n-modal>
  </section>
</template>

<style scoped>
.scene-prop-section {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  gap: 14px;
}

.section-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.section-tabs {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: var(--arc-radius-md);
  background: var(--arc-bg-weak);
  padding: 3px;
}

.section-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid transparent;
  border-radius: var(--arc-radius-md);
  background: transparent;
  color: var(--arc-text-secondary);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  padding: 5px 10px;
  transition:
    background 0.14s ease,
    border-color 0.14s ease,
    color 0.14s ease;
}

.section-tab:hover {
  color: var(--arc-text-primary);
}

.section-tab.active {
  background: var(--arc-bg-surface);
  border-color: var(--arc-border);
  color: var(--arc-primary);
  font-weight: 600;
  box-shadow: var(--arc-shadow-sm);
}

.section-tab-count {
  display: inline-flex;
  min-width: 20px;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  background: var(--arc-bg-body);
  color: var(--arc-text-hint);
  font-size: 11px;
  font-weight: 600;
  padding: 2px 5px;
}

.section-tab.active .section-tab-count {
  background: color-mix(in srgb, var(--arc-primary) 10%, var(--arc-bg-mix));
  color: var(--arc-primary);
}

.section-tools {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  justify-content: flex-end;
}

.section-search {
  width: clamp(160px, 24vw, 260px);
}

.list-section {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.relations-scene-prop-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  padding: 2px;
}

.graph-section {
  flex: 1;
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--arc-border);
  border-radius: var(--arc-radius-lg);
  overflow: hidden;
  background: var(--arc-bg-surface);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.arc-modal-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 720px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
  .section-tools {
    flex-wrap: wrap;
  }
}
</style>
