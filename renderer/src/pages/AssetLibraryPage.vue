<script setup lang="ts">
// v1.30.0 资产库聚合页：三栏（左分类 / 中卡片网格 / 右详情）
// - 只在项目内、唯一入口：仅展示**当前项目**的角色 / 场景 / 道具 / 组织（已废弃跨项目浏览）
// - 左栏只保留分类（角色 / 场景 / 道具 / 组织），默认落在「角色」，已移除「全部资产」分类
// - 当前项目资产可编辑（双击卡片打开抽取出的编辑弹窗）
import { computed, ref } from 'vue'
import { ArrowLeft, Boxes, CheckSquare, Download, RefreshCw, Search, Sparkles, Trash2 } from 'lucide-vue-next'
import { NButton, NEmpty, NInput, NPopconfirm, useMessage } from 'naive-ui'
import { useAppStore } from '@/stores/app'
import { toIpcPayload } from '@/utils/ipcPayload'
import AssetLibraryCard from '@/components/assetLibrary/AssetLibraryCard.vue'
import AssetReferenceExportDialog from '@/components/assetLibrary/AssetReferenceExportDialog.vue'
import AssetExtractionWizard from '@/components/assetExtraction/AssetExtractionWizard.vue'
import AiEnhancePreview from '@/components/AiEnhancePreview.vue'
import type { EnhanceFieldDiff } from '@/components/AiEnhancePreview.vue'
import FeatureHelp from '@/components/FeatureHelp.vue'
import CharacterEditModal from '@/components/entityEdit/CharacterEditModal.vue'
import SceneLocationEditModal from '@/components/entityEdit/SceneLocationEditModal.vue'
import PropItemEditModal from '@/components/entityEdit/PropItemEditModal.vue'
import { useBatchSelection } from '@/composables/useBatchSelection'
import {
  buildReextractSuggestions,
  type ExtractionFieldDiff,
  type ReextractKind
} from '@/features/assetExtraction/buildReextractSuggestions'
import { chapterContentToPlainText, extractEntitySnippet } from '@/features/assetExtraction/chapterText'
import { loadAllChapterContent } from '@/features/chapters/chapterExport'
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

const kind = ref<AssetKind>('character')
const query = ref('')
const selectedKey = ref('')

// 聚合当前项目资产（跨项目浏览已废弃，只保留当前项目）
const allEntries = computed(() =>
  collectAssets(appStore.projectWorkspaces, appStore.projects, appStore.selectedProjectId)
)

const currentProjectEntries = computed(() =>
  allEntries.value.filter((entry) => entry.projectId === appStore.selectedProjectId)
)

// 应用关键字后的当前项目资产（忽略类型筛选，供左栏分类计数）
const queryMatched = computed(() =>
  filterAssets(currentProjectEntries.value, { kind: 'all', query: query.value })
)

const counts = computed(() => countAssetsByKind(queryMatched.value))

const categoryItems = computed(() => ASSET_KINDS.map((assetKind) => ({
  key: assetKind,
  label: ASSET_KIND_LABELS[assetKind],
  count: counts.value[assetKind]
})))

const visibleEntries = computed(() =>
  queryMatched.value.filter((entry) => entry.kind === kind.value)
)

const selectedEntry = computed<AssetEntry | null>(
  () => currentProjectEntries.value.find((entry) => entry.key === selectedKey.value) ?? null
)

const emptyDescription = computed(() =>
  currentProjectEntries.value.length ? '当前筛选下没有匹配的资产' : '当前项目还没有资产'
)
const showCreateAction = computed(() => currentProjectEntries.value.length === 0)

// --- 编辑弹窗 ---
const characterModalVisible = ref(false)
const editingCharacter = ref<CharacterCard | null>(null)
const sceneModalVisible = ref(false)
const editingScene = ref<SceneLocation | null>(null)
const propModalVisible = ref(false)
const editingProp = ref<PropItem | null>(null)

function handleOpen(entry: AssetEntry): void {
  if (selectionMode.value) return
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
  if (selectionMode.value) {
    if (entry.kind === 'organization') {
      message.info('仅角色 / 场景 / 道具支持「再次提取」')
      return
    }
    toggleSelection(entry.key)
    return
  }
  selectedKey.value = entry.key
}

// --- 多选 + 再次提取（v1.28.0）---
const selectableKeys = computed(() => visibleEntries.value
  .filter((entry) => entry.kind !== 'organization')
  .map((entry) => entry.key))

const {
  selectionMode,
  selectedIds,
  toggleSelectionMode,
  toggleSelection,
  toggleSelectAll,
  clearSelection,
  finishSelection
} = useBatchSelection(selectableKeys)

const selectedEntries = computed(() => visibleEntries.value.filter((entry) => selectedIds.value.has(entry.key)))
const selectedCount = computed(() => selectedEntries.value.length)
const canReextract = computed(() => selectedCount.value > 0)

function toggleMultiSelect(): void {
  toggleSelectionMode()
}

// 提取向导（v1.30.0：按类别提取——角色界面提角色 / 场景界面提场景 / 道具界面提道具；组织不提供提取）
type ExtractKind = 'character' | 'scene' | 'prop'
const wizardVisible = ref(false)
const wizardKind = ref<ExtractKind>('character')

function isExtractableKind(value: AssetKind): value is ExtractKind {
  return value === 'character' || value === 'scene' || value === 'prop'
}

function openExtractWizard(): void {
  if (!isExtractableKind(kind.value)) {
    message.info('组织不提供自动提取')
    return
  }
  wizardKind.value = kind.value
  wizardVisible.value = true
}

// --- 一键清空当前项目资产（v1.29.0）---
/** 清空当前项目的角色 / 场景 / 道具（组织保留）；不可撤销，已由弹窗二次确认。 */
function handleClearAssets(): void {
  appStore.clearProjectAssets()
  clearSelection()
  selectedKey.value = ''
  message.success('已清空当前项目的角色 / 场景 / 道具（组织保留）')
}

// 再提取建议预览
interface ReextractTarget {
  kind: ReextractKind
  id: string
  name: string
  currentFields: Record<string, unknown>
}

interface ReextractSuggestion {
  kind: ReextractKind
  id: string
  fields: { name?: string; role?: string; type?: string; description?: string; tags?: string[] }
  evidence: string
}

const REEXTRACT_TASK_KEY = 'asset-reextract'
const reextractRunning = computed(() => appStore.isAiTaskRunning(REEXTRACT_TASK_KEY))
const previewVisible = ref(false)
const previewFields = ref<EnhanceFieldDiff[]>([])
let previewQueue: Array<{ target: ReextractTarget; fields: ExtractionFieldDiff[] }> = []
let previewIndex = 0
let appliedCount = 0

function buildTarget(entry: AssetEntry): ReextractTarget | null {
  if (entry.kind === 'character') {
    const character = appStore.characters.find((item) => item.id === entry.id)
    if (!character) return null
    return {
      kind: 'character',
      id: entry.id,
      name: character.name,
      currentFields: {
        name: character.name,
        role: character.role,
        description: character.description,
        tags: character.tags.map((tag) => tag.label)
      }
    }
  }
  if (entry.kind === 'scene') {
    const scene = appStore.sceneLocations.find((item) => item.id === entry.id)
    if (!scene) return null
    return {
      kind: 'scene',
      id: entry.id,
      name: scene.name,
      currentFields: {
        name: scene.name,
        type: scene.type,
        description: scene.description,
        tags: scene.tags.map((tag) => tag.label)
      }
    }
  }
  if (entry.kind === 'prop') {
    const prop = appStore.propItems.find((item) => item.id === entry.id)
    if (!prop) return null
    return {
      kind: 'prop',
      id: entry.id,
      name: prop.name,
      currentFields: {
        name: prop.name,
        type: prop.type,
        description: prop.description,
        tags: prop.tags.map((tag) => tag.label)
      }
    }
  }
  return null
}

async function handleReextract(): Promise<void> {
  if (reextractRunning.value) return
  const targets = selectedEntries.value
    .map(buildTarget)
    .filter((target): target is ReextractTarget => target !== null)
  if (!targets.length) {
    message.warning('请选择角色 / 场景 / 道具后再试')
    return
  }

  // 章节正文按需懒加载：重启后 / 长篇下 content 可能为空，必须先 ensure 加载完成再组装证据源。
  let chapterTexts: string[] = []
  try {
    const chapters = await loadAllChapterContent(appStore.chapters, (id) => appStore.ensureChapterContent(id))
    chapterTexts = chapters
      .map((chapter) => chapterContentToPlainText(chapter.content))
      .filter((text) => text.trim())
  } catch {
    message.error('章节正文加载失败，请重试后再提取')
    return
  }
  if (!chapterTexts.length) {
    message.warning('请先在「章节创作」中导入/准备小说章节')
    return
  }

  const snippet = extractEntitySnippet(chapterTexts, targets.map((target) => target.name))

  try {
    const response = await appStore.runTrackedAiTask(
      {
        key: REEXTRACT_TASK_KEY,
        kind: 'other',
        label: 'AI 再次提取资产',
        description: `正在为 ${targets.length} 张资产卡提取建议`,
        panel: 'asset-library'
      },
      () => window.characterArc.generateAi(toIpcPayload({
        task: 'asset-reextract',
        clientKey: REEXTRACT_TASK_KEY,
        settings: appStore.appSettings,
        context: {
          projectId: appStore.currentProject?.id,
          targets,
          novelSnippet: snippet,
          projectGenre: appStore.currentProject?.genre
        }
      }))
    )

    if (!response.success || !response.result) {
      throw new Error(response.error ?? '再次提取失败，请检查模型配置')
    }

    const suggestions = (response.result as { suggestions?: ReextractSuggestion[] }).suggestions ?? []
    const suggestionById = new Map(suggestions.map((suggestion) => [suggestion.id, suggestion]))
    previewQueue = targets.map((target) => ({
      target,
      fields: buildReextractSuggestions({
        kind: target.kind,
        currentFields: target.currentFields,
        suggestedFields: suggestionById.get(target.id)?.fields ?? null
      })
    }))
    previewIndex = 0
    appliedCount = 0
    openPreview(0)
  } catch (error) {
    message.error(error instanceof Error ? error.message : '再次提取失败，请检查模型配置')
  }
}

/** 逐张弹预览：用户逐项采纳后才写回（绝不自动覆盖）。 */
function openPreview(index: number): void {
  if (index >= previewQueue.length) {
    previewVisible.value = false
    if (appliedCount > 0) message.success(`已采纳 ${appliedCount} 张卡的字段建议`)
    else message.info('未采纳任何建议')
    finishSelection()
    return
  }
  previewIndex = index
  previewFields.value = previewQueue[index].fields
  previewVisible.value = true
}

function applyReextract(target: ReextractTarget, accepted: Record<string, string | string[]>): void {
  const tags = Array.isArray(accepted.tags) ? accepted.tags.map((label) => ({ label })) : undefined
  const name = typeof accepted.name === 'string' ? accepted.name : undefined
  const description = typeof accepted.description === 'string' ? accepted.description : undefined

  if (target.kind === 'character') {
    appStore.updateCharacter(target.id, {
      name,
      role: typeof accepted.role === 'string' ? accepted.role : undefined,
      description,
      tags
    })
  } else if (target.kind === 'scene') {
    appStore.updateSceneLocation(target.id, {
      name,
      type: typeof accepted.type === 'string' ? accepted.type : undefined,
      description,
      tags
    })
  } else {
    appStore.updatePropItem(target.id, {
      name,
      type: typeof accepted.type === 'string' ? accepted.type : undefined,
      description,
      tags
    })
  }
}

function handlePreviewApply(accepted: Record<string, string | string[]>): void {
  const current = previewQueue[previewIndex]
  if (current) {
    applyReextract(current.target, accepted)
    appliedCount += 1
  }
  openPreview(previewIndex + 1)
}

function handlePreviewClose(): void {
  openPreview(previewIndex + 1)
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
        <n-input v-model:value="query" class="library-search" placeholder="搜索名称、标签或描述" clearable>
          <template #prefix><Search :size="16" /></template>
        </n-input>
        <n-button v-if="kind !== 'organization'" @click="openExtractWizard">
          <template #icon><Sparkles :size="15" /></template>
          提取{{ ASSET_KIND_LABELS[kind] }}资产
        </n-button>
        <n-button v-if="!selectionMode" :disabled="selectableKeys.length === 0" @click="toggleMultiSelect">
          <template #icon><CheckSquare :size="15" /></template>
          多选
        </n-button>
        <template v-else>
          <n-button :disabled="selectableKeys.length === 0" @click="toggleSelectAll">全选</n-button>
          <n-button :disabled="selectedCount === 0" @click="clearSelection">清空</n-button>
          <n-button @click="toggleMultiSelect">退出多选</n-button>
        </template>
        <n-button
          v-if="selectionMode && canReextract"
          type="primary"
          :loading="reextractRunning"
          @click="handleReextract"
        >
          <template #icon><RefreshCw :size="15" /></template>
          再次提取（{{ selectedCount }}）
        </n-button>
        <n-button :disabled="visibleEntries.length === 0" @click="exportDialogVisible = true">
          <template #icon><Download :size="15" /></template>
          导出资产参考表
        </n-button>
        <n-popconfirm @positive-click="handleClearAssets">
          <template #trigger>
            <n-button>
              <template #icon><Trash2 :size="15" /></template>
              清空资产
            </n-button>
          </template>
          仅清空当前项目的角色 / 场景 / 道具，组织保留，不可撤销。确定继续？
        </n-popconfirm>
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
        <div v-if="selectionMode" class="selection-hint">
          <CheckSquare :size="14" />
          <span>多选模式：点击卡片切换选中（仅角色 / 场景 / 道具），已选 {{ selectedCount }} 张</span>
        </div>
        <div v-if="visibleEntries.length" class="asset-grid">
          <AssetLibraryCard
            v-for="entry in visibleEntries"
            :key="entry.key"
            :entry="entry"
            :selected="entry.key === selectedKey"
            :multi-select="selectionMode"
            :checked="selectedIds.has(entry.key)"
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
            title="编辑资产"
            @click="handleOpen(selectedEntry)"
          >
            编辑资产
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
    <AssetExtractionWizard
      :show="wizardVisible"
      mode="extract"
      :kind="wizardKind"
      @update:show="wizardVisible = $event"
    />
    <AiEnhancePreview
      :show="previewVisible"
      :fields="previewFields"
      :loading="reextractRunning"
      @apply="handlePreviewApply"
      @close="handlePreviewClose"
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

.selection-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--arc-primary);
  border-radius: var(--arc-radius-md);
  background: var(--arc-primary-soft);
  color: var(--arc-primary);
  padding: 6px 10px;
  font-size: 12px;
  margin-bottom: 10px;
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
