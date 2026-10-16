<script setup lang="ts">
// v1.26.0 资产库聚合页：三栏（左分类 / 中卡片网格 / 右详情）
// - 跨项目浏览 4 类资产（角色 / 道具 / 场景 / 组织）
// - 「当前项目」可编辑（双击卡片打开抽取出的编辑弹窗）；其余范围只读
import { computed, ref } from 'vue'
import { ArrowLeft, Boxes, Download, Search } from 'lucide-vue-next'
import { NButton, NEmpty, NInput, NSelect, useMessage } from 'naive-ui'
import { useAppStore } from '@/stores/app'
import AssetLibraryCard from '@/components/assetLibrary/AssetLibraryCard.vue'
import AssetReferenceExportDialog from '@/components/assetLibrary/AssetReferenceExportDialog.vue'
import FeatureHelp from '@/components/FeatureHelp.vue'
import CharacterEditModal from '@/components/entityEdit/CharacterEditModal.vue'
import SceneLocationEditModal from '@/components/entityEdit/SceneLocationEditModal.vue'
import PropItemEditModal from '@/components/entityEdit/PropItemEditModal.vue'
import {
  ASSET_KINDS,
  ASSET_KIND_LABELS,
  collectAssets,
  countAssetsByKind,
  filterAssets,
  type AssetEntry,
  type AssetKind
} from '@/features/assetLibrary/assetLibraryModel'
import type { CharacterCard, PropItem, SceneLocation } from '@/types/app'

const appStore = useAppStore()
const message = useMessage()

const kind = ref<AssetKind | 'all'>('all')
const scope = ref<string>(appStore.selectedProjectId ? 'current' : 'all')
const query = ref('')
const selectedKey = ref('')

const allEntries = computed(() =>
  collectAssets(appStore.projectWorkspaces, appStore.projects, appStore.selectedProjectId)
)

const projectOptions = computed(() => [
  { label: '全部项目', value: 'all' },
  { label: '当前项目', value: 'current' },
  ...appStore.projects.map((project) => ({ label: project.title, value: project.id }))
])

// 当前项目范围下的全部资产（用于空态判断）
const currentProjectAssets = computed(() =>
  allEntries.value.filter((entry) => entry.projectId === appStore.selectedProjectId)
)

// 应用项目范围 + 关键字后的资产（忽略类型筛选，供左栏分类计数）
const scopedEntries = computed(() =>
  filterAssets(allEntries.value, { kind: 'all', scope: scope.value, query: query.value }, appStore.selectedProjectId)
)

const counts = computed(() => countAssetsByKind(scopedEntries.value))

const categoryItems = computed(() => [
  { key: 'all' as const, label: '全部资产', count: counts.value.all },
  ...ASSET_KINDS.map((assetKind) => ({
    key: assetKind,
    label: ASSET_KIND_LABELS[assetKind],
    count: counts.value[assetKind]
  }))
])

const visibleEntries = computed(() =>
  kind.value === 'all'
    ? scopedEntries.value
    : scopedEntries.value.filter((entry) => entry.kind === kind.value)
)

const selectedEntry = computed<AssetEntry | null>(
  () => allEntries.value.find((entry) => entry.key === selectedKey.value) ?? null
)

const readOnly = computed(() => scope.value !== 'current')
const canEdit = computed(() => !readOnly.value)

const hasAnyAssets = computed(() => allEntries.value.length > 0)
const emptyDescription = computed(() =>
  hasAnyAssets.value ? '当前筛选下没有匹配的资产' : '还没有可浏览的资产'
)
const showCreateAction = computed(() => scope.value === 'current' && currentProjectAssets.value.length === 0)

// --- 编辑弹窗 ---
const characterModalVisible = ref(false)
const editingCharacter = ref<CharacterCard | null>(null)
const sceneModalVisible = ref(false)
const editingScene = ref<SceneLocation | null>(null)
const propModalVisible = ref(false)
const editingProp = ref<PropItem | null>(null)

function canEditEntry(entry: AssetEntry): boolean {
  return !readOnly.value && entry.projectId === appStore.selectedProjectId
}

function handleOpen(entry: AssetEntry): void {
  if (!canEditEntry(entry)) {
    message.info('只读模式：切换到「当前项目」后可编辑')
    return
  }
  if (entry.kind === 'character') {
    const character = appStore.characters.find((item) => item.id === entry.id)
    if (!character) return
    editingCharacter.value = character
    characterModalVisible.value = true
  } else if (entry.kind === 'scene') {
    const scene = appStore.sceneLocations.find((item) => item.id === entry.id)
    if (!scene) return
    editingScene.value = scene
    sceneModalVisible.value = true
  } else if (entry.kind === 'prop') {
    const prop = appStore.propItems.find((item) => item.id === entry.id)
    if (!prop) return
    editingProp.value = prop
    propModalVisible.value = true
  } else {
    message.info('组织编辑请到「关系组织 → 组织势力」面板')
  }
}

function handleSelect(entry: AssetEntry): void {
  selectedKey.value = entry.key
}

// --- 导出资产参考表 ---
const exportDialogVisible = ref(false)
</script>

<template>
  <section class="asset-library-page arc-scrollbar">
    <header class="library-header">
      <div class="header-left">
        <n-button quaternary circle title="返回" @click="appStore.backToProjects()">
          <template #icon><ArrowLeft :size="18" /></template>
        </n-button>
        <h1 class="header-title"><Boxes :size="22" />资产库</h1>
      </div>
      <div class="header-tools">
        <n-select v-model:value="scope" class="scope-select" :options="projectOptions" />
        <n-input v-model:value="query" class="library-search" placeholder="搜索名称、标签或描述" clearable>
          <template #prefix><Search :size="16" /></template>
        </n-input>
        <n-button :disabled="visibleEntries.length === 0" @click="exportDialogVisible = true">
          <template #icon><Download :size="15" /></template>
          导出资产参考表
        </n-button>
        <FeatureHelp feature-id="asset-library" placement="bottom-end" />
      </div>
    </header>

    <div class="library-body">
      <aside class="library-sidebar">
        <nav class="category-list" aria-label="资产分类">
          <button
            v-for="item in categoryItems"
            :key="item.key"
            type="button"
            class="category-item"
            :class="{ active: kind === item.key }"
            @click="kind = item.key"
          >
            <span class="category-label">{{ item.label }}</span>
            <span class="category-count">{{ item.count }}</span>
          </button>
        </nav>
      </aside>

      <main class="library-grid-wrapper">
        <div v-if="visibleEntries.length" class="asset-grid">
          <AssetLibraryCard
            v-for="entry in visibleEntries"
            :key="entry.key"
            :entry="entry"
            :selected="entry.key === selectedKey"
            :readonly="readOnly"
            @select="handleSelect(entry)"
            @open="handleOpen(entry)"
            @dblclick="handleOpen(entry)"
          />
        </div>
        <div v-else class="library-empty">
          <n-empty :description="emptyDescription">
            <template #extra>
              <n-button v-if="showCreateAction" type="primary" @click="appStore.openWorkbench()">
                前往工作台新建第一个资产
              </n-button>
            </template>
          </n-empty>
        </div>
      </main>

      <aside class="library-detail">
        <template v-if="selectedEntry">
          <div class="detail-kind">{{ ASSET_KIND_LABELS[selectedEntry.kind] }}</div>
          <h2 class="detail-name">{{ selectedEntry.name || '未命名资产' }}</h2>
          <dl class="detail-fields">
            <div class="detail-row">
              <dt>分类</dt>
              <dd>{{ ASSET_KIND_LABELS[selectedEntry.kind] }}</dd>
            </div>
            <div v-if="selectedEntry.typeLabel" class="detail-row">
              <dt>{{ selectedEntry.kind === 'character' ? '定位' : '类型' }}</dt>
              <dd>{{ selectedEntry.typeLabel }}</dd>
            </div>
            <div class="detail-row">
              <dt>所属项目</dt>
              <dd>{{ selectedEntry.projectName || '未命名项目' }}</dd>
            </div>
            <div class="detail-row">
              <dt>关联计数</dt>
              <dd>{{ selectedEntry.relationCount }}</dd>
            </div>
            <div class="detail-row detail-row--stack">
              <dt>标签</dt>
              <dd>
                <span v-if="selectedEntry.tags.length" class="detail-tags">
                  <span v-for="tag in selectedEntry.tags" :key="tag" class="detail-tag">{{ tag }}</span>
                </span>
                <span v-else class="detail-muted">无</span>
              </dd>
            </div>
            <div class="detail-row detail-row--stack">
              <dt>描述</dt>
              <dd class="detail-description">{{ selectedEntry.description || '暂无描述' }}</dd>
            </div>
          </dl>
          <n-button
            class="detail-edit-btn"
            type="primary"
            block
            :disabled="!canEdit"
            :title="canEdit ? '编辑资产' : '只读模式'"
            @click="handleOpen(selectedEntry)"
          >
            {{ canEdit ? '编辑资产' : '只读模式' }}
          </n-button>
        </template>
        <div v-else class="detail-empty">
          <n-empty description="请选择资产" />
        </div>
      </aside>
    </div>

    <CharacterEditModal
      :show="characterModalVisible"
      :character="editingCharacter"
      @update:show="characterModalVisible = $event"
    />
    <SceneLocationEditModal
      :show="sceneModalVisible"
      :scene="editingScene"
      @update:show="sceneModalVisible = $event"
    />
    <PropItemEditModal
      :show="propModalVisible"
      :prop="editingProp"
      @update:show="propModalVisible = $event"
    />
    <AssetReferenceExportDialog
      :show="exportDialogVisible"
      :entries="visibleEntries"
      @update:show="exportDialogVisible = $event"
    />
  </section>
</template>

<style scoped>
.asset-library-page {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  padding: 20px 24px;
  gap: 16px;
}

.library-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--arc-text-primary);
  font-size: 20px;
  font-weight: 720;
}

.header-tools {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.scope-select {
  width: 180px;
}

.library-search {
  width: min(300px, 40vw);
}

.library-body {
  display: grid;
  min-height: 0;
  flex: 1;
  grid-template-columns: 176px minmax(0, 1fr) 300px;
  gap: 16px;
}

.library-sidebar {
  min-height: 0;
  overflow-y: auto;
}

.category-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.category-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid transparent;
  border-radius: var(--arc-radius-md);
  background: transparent;
  color: var(--arc-text-secondary);
  padding: 8px 12px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.14s ease, color 0.14s ease, border-color 0.14s ease;
}

.category-item:hover {
  background: var(--arc-bg-surface-hover);
  color: var(--arc-text-primary);
}

.category-item.active {
  border-color: var(--arc-primary);
  background: var(--arc-primary-soft);
  color: var(--arc-primary);
  font-weight: 600;
}

.category-count {
  color: var(--arc-text-hint);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}

.category-item.active .category-count {
  color: var(--arc-primary);
}

.library-grid-wrapper {
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}

.library-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
}

.library-detail {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  border: 1px solid var(--arc-border);
  border-radius: var(--arc-radius-lg);
  background: var(--arc-bg-mix);
  padding: 16px;
}

.detail-kind {
  display: inline-flex;
  align-self: flex-start;
  border-radius: 999px;
  background: var(--arc-primary-soft);
  color: var(--arc-primary);
  padding: 2px 10px;
  font-size: 11.5px;
  font-weight: 650;
}

.detail-name {
  margin: 0;
  color: var(--arc-text-primary);
  font-size: 17px;
  font-weight: 700;
}

.detail-fields {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 4px 0 0;
}

.detail-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.detail-row--stack {
  flex-direction: column;
  gap: 4px;
}

.detail-row dt {
  min-width: 62px;
  color: var(--arc-text-hint);
  font-size: 12px;
}

.detail-row dd {
  margin: 0;
  color: var(--arc-text-primary);
  font-size: 13px;
  word-break: break-word;
}

.detail-tags {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.detail-tag {
  border-radius: 4px;
  background: var(--arc-bg-surface-hover);
  color: var(--arc-text-secondary);
  padding: 2px 7px;
  font-size: 11.5px;
}

.detail-muted {
  color: var(--arc-text-hint);
  font-style: italic;
}

.detail-description {
  color: var(--arc-text-secondary);
  line-height: 1.6;
  white-space: pre-wrap;
}

.detail-edit-btn {
  margin-top: auto;
}

.detail-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
}

@media (max-width: 1080px) {
  .library-body {
    grid-template-columns: 1fr;
  }
  .library-detail {
    order: 3;
  }
}
</style>
