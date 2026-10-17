<script setup lang="ts">
// v1.34.0 资产编辑页：独立页（非弹窗），三栏单一职责 —— 左同类列表 / 中「基础信息」/ 右「图库」
// - 一屏内完成：页面锁高，三栏各自内部滚动，无页面级滚动条
// - 中栏只留「基础信息」一张卡（视觉风格已上收为资产库级「图片主风格」）
// - 返回资产库自动保存；仅 Naive UI + lucide；颜色全走 --arc-* 令牌
import { computed, reactive, ref, watch } from 'vue'
import { ArrowLeft, Search } from 'lucide-vue-next'
import { NButton, NEmpty, NInput } from 'naive-ui'
import { useAppStore } from '@/stores/app'
import FeatureHelp from '@/components/FeatureHelp.vue'
import AssetGallerySection from '@/components/assetImage/AssetGallerySection.vue'
import CharacterEditForm from '@/components/entityEdit/CharacterEditForm.vue'
import SceneLocationEditForm from '@/components/entityEdit/SceneLocationEditForm.vue'
import PropItemEditForm from '@/components/entityEdit/PropItemEditForm.vue'
import {
  ASSET_KIND_LABELS,
  collectAssets,
  filterAssets,
  type AssetEntry
} from '@/features/assetLibrary/assetLibraryModel'
import type { AssetImageKind } from '@/types/app'
import type { AssetImagePromptAsset } from '@/features/assetImage/composeAssetImagePrompt'

const appStore = useAppStore()

const target = computed(() => appStore.assetEditorTarget)
const kind = computed<AssetImageKind>(() => target.value?.kind ?? 'character')
const assetId = computed(() => target.value?.id ?? '')
const kindLabel = computed(() => ASSET_KIND_LABELS[kind.value])

// ── 表单（按类型分别持有，保持各字段命名） ──
const characterForm = reactive({ name: '', role: '', description: '', tags: [] as string[] })
const sceneForm = reactive({ name: '', type: '', description: '', tags: [] as string[] })
const propForm = reactive({ name: '', type: '', description: '', tags: [] as string[] })

const currentCharacter = computed(() => appStore.characters.find((item) => item.id === assetId.value) ?? null)
const currentScene = computed(() => appStore.sceneLocations.find((item) => item.id === assetId.value) ?? null)
const currentProp = computed(() => appStore.propItems.find((item) => item.id === assetId.value) ?? null)

const assetName = computed(() => {
  if (kind.value === 'scene') return sceneForm.name
  if (kind.value === 'prop') return propForm.name
  return characterForm.name
})

/** 组装图库生成提示词所需的资产视觉字段（保留历史视觉字段，虽不再在编辑页编辑） */
const galleryAsset = computed<AssetImagePromptAsset>(() => {
  if (kind.value === 'character') {
    return {
      kind: 'character',
      name: characterForm.name,
      typeLabel: characterForm.role,
      description: characterForm.description,
      tags: characterForm.tags,
      renderMode: currentCharacter.value?.visualStyle?.renderMode ?? '',
      palette: currentCharacter.value?.visualStyle?.palette ?? [],
      moodWords: currentCharacter.value?.visualStyle?.moodWords ?? [],
      keyReferences: currentCharacter.value?.visualStyle?.keyReferences ?? [],
      lightingNote: '',
      seasonNote: '',
      materialityNote: ''
    }
  }
  if (kind.value === 'scene') {
    return {
      kind: 'scene',
      name: sceneForm.name,
      typeLabel: sceneForm.type,
      description: sceneForm.description,
      tags: sceneForm.tags,
      renderMode: '',
      palette: currentScene.value?.visualContext?.colorPalette ?? [],
      moodWords: [],
      keyReferences: [],
      lightingNote: currentScene.value?.visualContext?.lightingNote ?? '',
      seasonNote: currentScene.value?.visualContext?.seasonNote ?? '',
      materialityNote: currentScene.value?.visualContext?.materialityNote ?? ''
    }
  }
  return {
    kind: 'prop',
    name: propForm.name,
    typeLabel: propForm.type,
    description: propForm.description,
    tags: propForm.tags,
    renderMode: '',
    palette: currentProp.value?.visualContext?.colorPalette ?? [],
    moodWords: [],
    keyReferences: [],
    lightingNote: currentProp.value?.visualContext?.lightingNote ?? '',
    seasonNote: currentProp.value?.visualContext?.seasonNote ?? '',
    materialityNote: currentProp.value?.visualContext?.materialityNote ?? ''
  }
})

// ── 左栏：同类资产列表 ──
const query = ref('')

const allEntries = computed(() =>
  collectAssets(appStore.projectWorkspaces, appStore.projects, appStore.selectedProjectId)
)
const sameKindEntries = computed(() => {
  const projectEntries = allEntries.value.filter((entry) => entry.projectId === appStore.selectedProjectId)
  return filterAssets(projectEntries, { kind: kind.value, query: query.value })
})

function dotStyle(entry: AssetEntry): Record<string, string> {
  const color = (entry.color ?? '').trim()
  const base = color || 'var(--arc-primary)'
  // 用资产主色在令牌底色上做浅色调和：文字色仍走 --arc-* 令牌，避免硬编码色值
  return { background: `color-mix(in srgb, ${base} 22%, var(--arc-bg-surface))` }
}

function openEntry(entry: AssetEntry): void {
  if (entry.id === assetId.value) return
  appStore.openAssetEditor(kind.value, entry.id)
}

// ── 自动保存状态（防抖落库，返回无需确认） ──
const saveState = ref<'idle' | 'saved'>('idle')
/** 载入时的表单快照签名：与之一致则不触发保存（避免切资产时无谓回写） */
const loadedSignature = ref('')
let saveTimer: number | undefined

/** 当前表单的稳定签名（只看可持久化字段） */
function formSignature(): string {
  if (kind.value === 'character') {
    return JSON.stringify([characterForm.name, characterForm.role, characterForm.description, characterForm.tags])
  }
  if (kind.value === 'scene') {
    return JSON.stringify([sceneForm.name, sceneForm.type, sceneForm.description, sceneForm.tags])
  }
  return JSON.stringify([propForm.name, propForm.type, propForm.description, propForm.tags])
}

// ── 表单灌入：定位变化时把目标资产载入对应表单 ──
// 载入前先落库「上一张」的待保存改动（回调用新的 kind/id，但表单此刻仍是旧值）
watch(
  () => [kind.value, assetId.value] as [AssetImageKind, string],
  ([nextKind, nextId]: [AssetImageKind, string], prev: [AssetImageKind, string] | undefined) => {
    const prevKind = prev?.[0]
    const prevId = prev?.[1]
    if (saveTimer !== undefined) {
      window.clearTimeout(saveTimer)
      saveTimer = undefined
    }
    if (prevId && prevKind && (prevKind !== nextKind || prevId !== nextId)) {
      persistFor(prevKind, prevId)
    }
    if (kind.value === 'character') {
      const character = currentCharacter.value
      characterForm.name = character?.name ?? ''
      characterForm.role = character?.role ?? ''
      characterForm.description = character?.description ?? ''
      characterForm.tags = character?.tags.map((tag) => tag.label) ?? []
    } else if (kind.value === 'scene') {
      const scene = currentScene.value
      sceneForm.name = scene?.name ?? ''
      sceneForm.type = scene?.type ?? '城市'
      sceneForm.description = scene?.description ?? ''
      sceneForm.tags = scene?.tags.map((tag) => tag.label) ?? []
    } else {
      const prop = currentProp.value
      propForm.name = prop?.name ?? ''
      propForm.type = prop?.type ?? '信物'
      propForm.description = prop?.description ?? ''
      propForm.tags = prop?.tags.map((tag) => tag.label) ?? []
    }
    saveState.value = 'idle'
    loadedSignature.value = formSignature()
  },
  { immediate: true }
)

/** 把「指定资产」的当前表单内容落库；名称为空则不写（避免把资产改坏），返回是否写入 */
function persistFor(targetKind: AssetImageKind, targetId: string): boolean {
  if (!targetId) return false
  if (targetKind === 'character') {
    const name = characterForm.name.trim()
    if (!name) return false
    appStore.updateCharacter(targetId, {
      name,
      role: characterForm.role,
      description: characterForm.description,
      tags: characterForm.tags.map((label) => ({ label }))
    })
    return true
  }
  if (targetKind === 'scene') {
    const name = sceneForm.name.trim()
    if (!name) return false
    appStore.updateSceneLocation(targetId, {
      name,
      type: sceneForm.type,
      description: sceneForm.description,
      tags: sceneForm.tags.map((label) => ({ label }))
    })
    return true
  }
  const name = propForm.name.trim()
  if (!name) return false
  appStore.updatePropItem(targetId, {
    name,
    type: propForm.type,
    description: propForm.description,
    tags: propForm.tags.map((label) => ({ label }))
  })
  return true
}

function persistNow(): void {
  if (persistFor(kind.value, assetId.value)) saveState.value = 'saved'
}

function scheduleSave(): void {
  if (saveTimer !== undefined) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    saveTimer = undefined
    persistNow()
  }, 500)
}

// 只在表单内容真正变化（且不同于载入快照）时才安排保存
watch(formSignature, (next) => {
  if (next === loadedSignature.value) return
  scheduleSave()
})

function goBack(): void {
  if (saveTimer !== undefined) {
    window.clearTimeout(saveTimer)
    saveTimer = undefined
    persistNow()
  }
  appStore.backToAssetLibrary()
}
</script>

<template>
  <section class="asset-editor-page">
    <header class="editor-topbar">
      <n-button quaternary circle title="返回资产库" @click="goBack">
        <template #icon><ArrowLeft :size="18" /></template>
      </n-button>
      <span class="editor-crumb">
        资产库 / {{ kindLabel }} / <b>{{ assetName || '未命名资产' }}</b>
      </span>
      <span class="editor-autosave" :class="{ saved: saveState === 'saved' }">
        {{ saveState === 'saved' ? '✓ 已自动保存' : '改动将自动保存' }}
      </span>
      <span class="editor-spacer" />
      <FeatureHelp feature-id="asset-library" placement="bottom-end" />
    </header>

    <div class="editor-body">
      <!-- 左：同类资产列表 -->
      <aside class="editor-panel editor-list">
        <div class="list-search">
          <n-input v-model:value="query" placeholder="搜索资产…" clearable>
            <template #prefix><Search :size="15" /></template>
          </n-input>
        </div>
        <div class="list-scroll arc-scrollbar">
          <button
            v-for="entry in sameKindEntries"
            :key="entry.key"
            type="button"
            class="list-item"
            :class="{ active: entry.id === assetId }"
            @click="openEntry(entry)"
          >
            <span class="list-dot" :style="dotStyle(entry)">{{ (entry.name || '?').slice(0, 1) }}</span>
            <span class="list-text">
              <span class="list-name">{{ entry.name || '未命名资产' }}</span>
              <small class="list-sub">{{ entry.typeLabel || '未设定' }}</small>
            </span>
          </button>
          <n-empty v-if="sameKindEntries.length === 0" class="list-empty" description="没有匹配的资产" />
        </div>
      </aside>

      <!-- 中：单张「基础信息」卡 -->
      <main class="editor-panel editor-info">
        <div class="info-scroll arc-scrollbar">
          <h2 class="info-title">{{ assetName || '未命名资产' }}</h2>
          <div class="info-card">
            <h3 class="info-card-title">基础信息</h3>
            <CharacterEditForm v-if="kind === 'character'" :form="characterForm" />
            <SceneLocationEditForm v-else-if="kind === 'scene'" :form="sceneForm" />
            <PropItemEditForm v-else :form="propForm" />
          </div>
          <p class="info-note">
            视觉风格已上收为<b>资产库级「图片主风格」</b>（渲染方式 / 配色 / 氛围词 / 默认画幅比），此处不再重复。
          </p>
        </div>
      </main>

      <!-- 右：图库 -->
      <aside class="editor-panel editor-gallery">
        <AssetGallerySection
          :project-id="appStore.selectedProjectId"
          :kind="kind"
          :asset-id="assetId"
          :asset-name="assetName"
          :asset="galleryAsset"
          :project-style="appStore.currentProject?.projectVisualStyle ?? null"
          :primary-capable="kind === 'character'"
        />
      </aside>
    </div>
  </section>
</template>

<style scoped>
.asset-editor-page {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  background: var(--arc-bg-body);
}

.editor-topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 56px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--arc-border);
  background: var(--arc-bg-surface);
  padding: 0 20px;
}

.editor-crumb {
  color: var(--arc-text-hint);
  font-size: 13px;
}

.editor-crumb b {
  color: var(--arc-text-primary);
  font-weight: 600;
}

.editor-autosave {
  color: var(--arc-text-hint);
  font-size: 12px;
}

.editor-autosave.saved {
  color: var(--arc-success);
}

.editor-spacer {
  flex: 1;
}

.editor-body {
  display: grid;
  min-height: 0;
  flex: 1;
  grid-template-columns: 250px minmax(0, 1fr) 400px;
  gap: 14px;
  padding: 14px 20px;
}

.editor-panel {
  display: flex;
  min-height: 0;
  flex-direction: column;
  border: 1px solid var(--arc-border);
  border-radius: var(--arc-radius-lg);
  background: var(--arc-bg-surface);
}

/* 左栏 */
.editor-list {
  padding: 12px 10px;
}

.list-search {
  padding: 0 2px 8px;
}

.list-scroll {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
}

.list-item {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid transparent;
  border-radius: var(--arc-radius-md);
  background: transparent;
  padding: 8px 9px;
  text-align: left;
  cursor: pointer;
  transition: background 0.14s ease, border-color 0.14s ease;
}

.list-item:hover {
  background: var(--arc-bg-surface-hover);
}

.list-item.active {
  border-color: var(--arc-primary);
  background: var(--arc-primary-soft);
}

.list-dot {
  display: grid;
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 50%;
  color: var(--arc-text-primary);
  font-size: 12px;
  font-weight: 700;
}

.list-text {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.list-name {
  overflow: hidden;
  color: var(--arc-text-primary);
  font-size: 13.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list-sub {
  overflow: hidden;
  color: var(--arc-text-hint);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list-empty {
  margin-top: 24px;
}

/* 中栏 */
.editor-info {
  padding: 0;
}

.info-scroll {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 18px 20px;
}

.info-title {
  margin: 0 0 16px;
  color: var(--arc-text-primary);
  font-size: 19px;
  font-weight: 720;
}

.info-card {
  border: 1px solid var(--arc-border);
  border-radius: var(--arc-radius-md);
  padding: 18px 20px;
}

.info-card-title {
  margin: 0 0 16px;
  color: var(--arc-text-hint);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.info-note {
  margin: 14px 0 0;
  color: var(--arc-text-hint);
  font-size: 12.5px;
  line-height: 1.7;
}

.info-note b {
  color: var(--arc-text-secondary);
}

/* 右栏 */
.editor-gallery {
  padding: 16px 18px;
}

@media (max-width: 1100px) {
  .asset-editor-page {
    height: auto;
    overflow: visible;
  }

  .editor-body {
    grid-template-columns: 1fr;
    padding: 12px 14px;
  }

  .editor-panel {
    min-height: 240px;
  }

  .list-scroll,
  .info-scroll,
  .gallery-scroll {
    overflow: visible;
  }
}
</style>
