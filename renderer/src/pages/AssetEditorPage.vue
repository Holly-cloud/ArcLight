<script setup lang="ts">
// v1.34.0 资产编辑页：独立页（非弹窗），三栏单一职责 —— 左同类列表 / 中「基础信息」/ 右「图库」
// - 一屏内完成：页面锁高，三栏各自内部滚动，无页面级滚动条
// - 中栏只留「基础信息」一张卡（视觉风格已上收为资产库级「图片主风格」）
// - v1.34.1：顶栏新增角色「AI 补充」（自「角色图鉴」弹窗迁入）
// - 返回资产库自动保存；仅 Naive UI + lucide；颜色全走 --arc-* 令牌
import { computed, reactive, ref, watch } from 'vue'
import { ArrowLeft, Search, Sparkles } from 'lucide-vue-next'
import { NButton, NEmpty, NInput, useMessage } from 'naive-ui'
import { useAppStore } from '@/stores/app'
import { toIpcPayload } from '@/utils/ipcPayload'
import { buildProjectWritingStyleContext } from '@/features/writingStyles/presets'
import FeatureHelp from '@/components/FeatureHelp.vue'
import AssetGallerySection from '@/components/assetImage/AssetGallerySection.vue'
import AiEnhancePreview from '@/components/AiEnhancePreview.vue'
import type { EnhanceFieldDiff } from '@/components/AiEnhancePreview.vue'
import CharacterEditForm from '@/components/entityEdit/CharacterEditForm.vue'
import SceneLocationEditForm from '@/components/entityEdit/SceneLocationEditForm.vue'
import PropItemEditForm from '@/components/entityEdit/PropItemEditForm.vue'
import {
  ASSET_KIND_LABELS,
  collectAssets,
  filterAssets,
  type AssetEntry
} from '@/features/assetLibrary/assetLibraryModel'
import { pickPrimaryImage } from '@/features/assetImage/assetImageModel'
import { loadAllChapterContent } from '@/features/chapters/chapterExport'
import { chapterContentToPlainText, extractEntitySnippet } from '@/features/assetExtraction/chapterText'
import type { AssetImageKind, VisualContext, VisualStyleProfile } from '@/types/app'
import type { AssetImagePromptAsset } from '@/features/assetImage/composeAssetImagePrompt'

const appStore = useAppStore()
const message = useMessage()

const target = computed(() => appStore.assetEditorTarget)
const kind = computed<AssetImageKind>(() => target.value?.kind ?? 'character')
const assetId = computed(() => target.value?.id ?? '')
const kindLabel = computed(() => ASSET_KIND_LABELS[kind.value])

// ── 表单（按类型分别持有，保持各字段命名） ──
const characterForm = reactive({ name: '', role: '', description: '', tags: [] as string[], visualPrompt: '' })
const sceneForm = reactive({ name: '', type: '', description: '', tags: [] as string[], visualPrompt: '' })
const propForm = reactive({ name: '', type: '', description: '', tags: [] as string[], visualPrompt: '' })

const currentCharacter = computed(() => appStore.characters.find((item) => item.id === assetId.value) ?? null)
const currentScene = computed(() => appStore.sceneLocations.find((item) => item.id === assetId.value) ?? null)
const currentProp = computed(() => appStore.propItems.find((item) => item.id === assetId.value) ?? null)

const assetName = computed(() => {
  if (kind.value === 'scene') return sceneForm.name
  if (kind.value === 'prop') return propForm.name
  return characterForm.name
})

/** 当前资产的「视觉提示词」（可读写，直接映射到活动表单） */
const currentVisualPrompt = computed({
  get(): string {
    if (kind.value === 'scene') return sceneForm.visualPrompt
    if (kind.value === 'prop') return propForm.visualPrompt
    return characterForm.visualPrompt
  },
  set(value: string) {
    if (kind.value === 'scene') sceneForm.visualPrompt = value
    else if (kind.value === 'prop') propForm.visualPrompt = value
    else characterForm.visualPrompt = value
  }
})

/** 当前资产的「简介」（可读写，直接映射到活动表单） */
const currentDescription = computed({
  get(): string {
    if (kind.value === 'scene') return sceneForm.description
    if (kind.value === 'prop') return propForm.description
    return characterForm.description
  },
  set(value: string) {
    if (kind.value === 'scene') sceneForm.description = value
    else if (kind.value === 'prop') propForm.description = value
    else characterForm.description = value
  }
})
const currentDescriptionLength = computed(() => currentDescription.value.length)
const descriptionPlaceholder = computed(() => {
  if (kind.value === 'scene') return '补充地理特征、氛围、势力分布与故事作用...'
  if (kind.value === 'prop') return '补充道具外观、用途、来源与剧情中的作用...'
  return '补充角色背景、动机和冲突...'
})

/** 视觉提示词的生成依据：当前资产的定位 / 标签 */
const currentTypeLabel = computed(() => {
  if (kind.value === 'scene') return sceneForm.type
  if (kind.value === 'prop') return propForm.type
  return characterForm.role
})
const currentTags = computed(() => {
  if (kind.value === 'scene') return sceneForm.tags
  if (kind.value === 'prop') return propForm.tags
  return characterForm.tags
})

/** 读取指定资产已存的视觉档案（角色 visualStyle / 场景·道具 visualContext），用于整对象写回时保留旧字段 */
function readAssetVisual(targetKind: AssetImageKind, targetId: string): VisualStyleProfile | VisualContext | null {
  if (targetKind === 'character') return appStore.characters.find((item) => item.id === targetId)?.visualStyle ?? null
  if (targetKind === 'scene') return appStore.sceneLocations.find((item) => item.id === targetId)?.visualContext ?? null
  return appStore.propItems.find((item) => item.id === targetId)?.visualContext ?? null
}

/** 角色 visualStyle：保留旧字段，仅覆盖 visualPrompt（整对象写回）。无旧档案且提示词为空则维持 null */
function buildCharacterVisualStyle(existing: VisualStyleProfile | null, visualPrompt: string): VisualStyleProfile | null {
  const prompt = visualPrompt.trim()
  if (!existing && !prompt) return null
  const base: VisualStyleProfile = existing ?? { renderMode: 'realistic', palette: [], moodWords: [], keyReferences: [] }
  return { ...base, visualPrompt: prompt || null }
}

/** 场景 / 道具 visualContext：保留旧字段，仅覆盖 visualPrompt（整对象写回） */
function buildVisualContext(existing: VisualContext | null, visualPrompt: string): VisualContext | null {
  const prompt = visualPrompt.trim()
  if (!existing && !prompt) return null
  const base: VisualContext = existing ?? { colorPalette: [], lightingNote: '', seasonNote: '', materialityNote: '' }
  return { ...base, visualPrompt: prompt || null }
}

/** 把视觉提示词直接写回「指定资产」（不经过共享表单），用于生成期间用户已切换资产的场景 */
function persistVisualPromptFor(targetKind: AssetImageKind, targetId: string, visualPrompt: string): void {
  if (targetKind === 'character') {
    appStore.updateCharacter(targetId, {
      visualStyle: buildCharacterVisualStyle(readAssetVisual('character', targetId) as VisualStyleProfile | null, visualPrompt)
    })
    return
  }
  const visualContext = buildVisualContext(readAssetVisual(targetKind, targetId) as VisualContext | null, visualPrompt)
  if (targetKind === 'scene') appStore.updateSceneLocation(targetId, { visualContext })
  else appStore.updatePropItem(targetId, { visualContext })
}

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
      materialityNote: '',
      visualPrompt: characterForm.visualPrompt
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
      materialityNote: currentScene.value?.visualContext?.materialityNote ?? '',
      visualPrompt: sceneForm.visualPrompt
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
    materialityNote: currentProp.value?.visualContext?.materialityNote ?? '',
    visualPrompt: propForm.visualPrompt
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

/** 左栏头像：优先显示该资产的「基准图片」（arc-asset:// 居中裁切），无则回退字母头像 */
function primaryThumb(entry: AssetEntry): string {
  const primary = pickPrimaryImage(appStore.getAssetImages(appStore.selectedProjectId, kind.value, entry.id))
  return primary ? `arc-asset://${primary.id}` : ''
}

/** 已尝试加载过图库的资产（避免重复 IPC 拉取） */
const thumbAttempted = new Set<string>()

/** 为左栏列表逐个懒加载图库元数据，用于显示各自「基准图片」头像 */
async function ensureListThumbs(): Promise<void> {
  const projectId = appStore.selectedProjectId
  if (!projectId) return
  const targetKind = kind.value
  await Promise.all(sameKindEntries.value.map(async (entry) => {
    const key = `${projectId}:${targetKind}:${entry.id}`
    if (thumbAttempted.has(key)) return
    thumbAttempted.add(key)
    try {
      await appStore.loadAssetImages(projectId, targetKind, entry.id)
    } catch {
      /* 单个资产图库读取失败不影响列表渲染 */
    }
  }))
}

watch(
  () => [appStore.selectedProjectId, kind.value, sameKindEntries.value.map((entry) => entry.id).join(',')],
  () => {
    void ensureListThumbs()
  },
  { immediate: true }
)

// ── 自动保存状态（防抖落库，返回无需确认） ──
const saveState = ref<'idle' | 'saved'>('idle')
/** 载入时的表单快照签名：与之一致则不触发保存（避免切资产时无谓回写） */
const loadedSignature = ref('')
let saveTimer: number | undefined

/** 当前表单的稳定签名（只看可持久化字段） */
function formSignature(): string {
  if (kind.value === 'character') {
    return JSON.stringify([characterForm.name, characterForm.role, characterForm.description, characterForm.tags, characterForm.visualPrompt])
  }
  if (kind.value === 'scene') {
    return JSON.stringify([sceneForm.name, sceneForm.type, sceneForm.description, sceneForm.tags, sceneForm.visualPrompt])
  }
  return JSON.stringify([propForm.name, propForm.type, propForm.description, propForm.tags, propForm.visualPrompt])
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
      characterForm.visualPrompt = character?.visualStyle?.visualPrompt ?? ''
    } else if (kind.value === 'scene') {
      const scene = currentScene.value
      sceneForm.name = scene?.name ?? ''
      sceneForm.type = scene?.type ?? '城市'
      sceneForm.description = scene?.description ?? ''
      sceneForm.tags = scene?.tags.map((tag) => tag.label) ?? []
      sceneForm.visualPrompt = scene?.visualContext?.visualPrompt ?? ''
    } else {
      const prop = currentProp.value
      propForm.name = prop?.name ?? ''
      propForm.type = prop?.type ?? '信物'
      propForm.description = prop?.description ?? ''
      propForm.tags = prop?.tags.map((tag) => tag.label) ?? []
      propForm.visualPrompt = prop?.visualContext?.visualPrompt ?? ''
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
      tags: characterForm.tags.map((label) => ({ label })),
      visualStyle: buildCharacterVisualStyle(readAssetVisual('character', targetId) as VisualStyleProfile | null, characterForm.visualPrompt)
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
      tags: sceneForm.tags.map((label) => ({ label })),
      visualContext: buildVisualContext(readAssetVisual('scene', targetId) as VisualContext | null, sceneForm.visualPrompt)
    })
    return true
  }
  const name = propForm.name.trim()
  if (!name) return false
  appStore.updatePropItem(targetId, {
    name,
    type: propForm.type,
    description: propForm.description,
    tags: propForm.tags.map((label) => ({ label })),
    visualContext: buildVisualContext(readAssetVisual('prop', targetId) as VisualContext | null, propForm.visualPrompt)
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

// ── 角色「AI 补充」（v1.34.1：自「角色图鉴」面板的编辑弹窗迁入；仅角色可用） ──
const writingStyle = computed(() => buildProjectWritingStyleContext(appStore.currentProject))
const ENHANCE_TASK_KEY = 'character-enhance'
const enhanceLoading = computed(() => appStore.isAiTaskRunning(ENHANCE_TASK_KEY))
const enhanceVisible = ref(false)
const enhanceFields = ref<EnhanceFieldDiff[]>([])

function buildAiWorldviewContext() {
  return appStore.worldviewEntries.slice(0, 12).map((entry) => ({
    type: entry.type,
    title: entry.title,
    content: entry.content.slice(0, 320)
  }))
}

async function handleAiEnhance(): Promise<void> {
  if (kind.value !== 'character' || enhanceLoading.value) return
  if (!assetId.value) {
    message.warning('请先保存角色后再使用 AI 补充')
    return
  }

  try {
    const result = await appStore.runTrackedAiTask(
      {
        key: ENHANCE_TASK_KEY,
        kind: 'character',
        label: 'AI 补充角色',
        description: '正在根据上下文补充角色信息',
        panel: 'asset-library'
      },
      () =>
        window.characterArc.generateAi(toIpcPayload({
          task: 'character-enhance',
          settings: appStore.appSettings,
          context: {
            projectId: appStore.currentProject?.id,
            currentForm: {
              name: characterForm.name,
              role: characterForm.role,
              description: characterForm.description,
              tags: characterForm.tags
            },
            projectTitle: appStore.currentProject?.title,
            projectGenre: appStore.currentProject?.genre,
            writingStyleLabel: writingStyle.value.label,
            writingStylePrompt: writingStyle.value.prompt,
            characterNames: appStore.characters.map((c) => c.name),
            worldviewTitles: appStore.worldviewEntries.map((e) => e.title),
            worldviewEntries: buildAiWorldviewContext(),
            organizations: appStore.organizations,
            characterRelationships: appStore.characterRelationships,
            organizationMemberships: appStore.organizationMemberships,
            characters: appStore.characters.map((c) => ({ id: c.id, name: c.name, role: c.role, description: c.description }))
          }
        }))
    )

    if (!result.success || !result.result) {
      throw new Error(result.error ?? 'AI 补充失败，请检查模型配置')
    }

    const suggested = result.result as { name?: string; role?: string; description?: string; tags?: string[] }
    const suggestedTags = Array.isArray(suggested.tags) ? suggested.tags : []

    enhanceFields.value = [
      { key: 'name', label: '角色名称', type: 'text', original: characterForm.name, suggested: suggested.name ?? '', changed: (suggested.name ?? '') !== characterForm.name && Boolean(suggested.name?.trim()) },
      { key: 'role', label: '角色定位', type: 'text', original: characterForm.role, suggested: suggested.role ?? '', changed: (suggested.role ?? '') !== characterForm.role && Boolean(suggested.role?.trim()) },
      { key: 'description', label: '角色简介', type: 'textarea', original: characterForm.description, suggested: suggested.description ?? '', changed: (suggested.description ?? '') !== characterForm.description && Boolean(suggested.description?.trim()) },
      { key: 'tags', label: '角色标签', type: 'tags', original: characterForm.tags, suggested: suggestedTags, changed: JSON.stringify(suggestedTags) !== JSON.stringify(characterForm.tags) && suggestedTags.length > 0 }
    ]
    enhanceVisible.value = true
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'AI 补充失败，请检查模型配置')
  }
}

function handleEnhanceApply(accepted: Record<string, string | string[]>): void {
  if (accepted.name != null) characterForm.name = accepted.name as string
  if (accepted.role != null) characterForm.role = accepted.role as string
  if (accepted.description != null) characterForm.description = accepted.description as string
  if (accepted.tags != null) characterForm.tags = accepted.tags as string[]
  enhanceVisible.value = false
}

// ── 视觉提示词（v1.34.3）：以简介为核心依据，并读取小说原文片段保证与小说描述一致 ──
const VISUAL_PROMPT_TASK_KEY = 'asset-visual-prompt'
const visualPromptLoading = computed(() => appStore.isAiTaskRunning(VISUAL_PROMPT_TASK_KEY))

async function handleGenerateVisualPrompt(): Promise<void> {
  if (visualPromptLoading.value) return
  if (!assetId.value) {
    message.warning('请先保存资产后再生成视觉提示词')
    return
  }
  if (!currentDescription.value.trim()) {
    message.warning('请先填写「简介」——视觉提示词以简介为核心依据')
    return
  }

  // 记录发起时的资产：用户中途切换资产时，结果仍写回原资产，避免落到新资产
  const requestKind = kind.value
  const requestId = assetId.value
  const requestName = assetName.value

  // 章节正文按需懒加载，抽取包含该资产名的原文片段作为一致性依据（读取失败不阻断，仅依据简介生成）
  let snippet = ''
  try {
    const chapters = await loadAllChapterContent(appStore.chapters, (id) => appStore.ensureChapterContent(id))
    const texts = chapters
      .map((chapter) => chapterContentToPlainText(chapter.content))
      .filter((text) => text.trim())
    if (texts.length) snippet = extractEntitySnippet(texts, [requestName])
  } catch {
    /* 原文片段读取失败时退化为仅依据简介生成 */
  }

  try {
    const response = await appStore.runTrackedAiTask(
      {
        key: VISUAL_PROMPT_TASK_KEY,
        kind: requestKind === 'character' ? 'character' : 'other',
        label: 'AI 生成视觉提示词',
        description: `正在为「${requestName || '未命名资产'}」生成视觉提示词`,
        panel: 'asset-library'
      },
      () => window.characterArc.generateAi(toIpcPayload({
        task: 'asset-visual-prompt',
        clientKey: VISUAL_PROMPT_TASK_KEY,
        settings: appStore.appSettings,
        context: {
          projectId: appStore.currentProject?.id,
          kind: requestKind,
          name: requestName,
          typeLabel: currentTypeLabel.value,
          tags: currentTags.value,
          description: currentDescription.value,
          projectStyle: {
            renderMode: appStore.currentProject?.projectVisualStyle?.renderMode ?? '',
            palette: appStore.currentProject?.projectVisualStyle?.palette ?? [],
            moodWords: appStore.currentProject?.projectVisualStyle?.moodWords ?? []
          },
          novelSnippet: snippet,
          projectGenre: appStore.currentProject?.genre
        }
      }))
    )

    if (!response.success || !response.result) {
      throw new Error(response.error ?? '生成视觉提示词失败，请检查模型配置')
    }
    const content = ((response.result as { content?: string }).content ?? '').trim()
    if (!content) throw new Error('模型未返回有效提示词，请重试')
    if (kind.value === requestKind && assetId.value === requestId) {
      // 仍在同一资产：写回表单（签名变化会触发自动保存）
      currentVisualPrompt.value = content
    } else {
      // 已切换资产：直接写回发起时的资产，避免把结果落到新资产
      persistVisualPromptFor(requestKind, requestId, content)
    }
    message.success(`已为「${requestName || '未命名资产'}」生成视觉提示词，生图默认取用本段`)
  } catch (error) {
    message.error(error instanceof Error ? error.message : '生成视觉提示词失败，请检查模型配置')
  }
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
      <n-button v-if="kind === 'character'" size="small" :loading="enhanceLoading" @click="handleAiEnhance">
        <template #icon><Sparkles :size="14" /></template>
        AI 补充
      </n-button>
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
            <span class="list-dot" :style="dotStyle(entry)">
              <img v-if="primaryThumb(entry)" class="list-dot-img" :src="primaryThumb(entry)" :alt="entry.name" />
              <template v-else>{{ (entry.name || '?').slice(0, 1) }}</template>
            </span>
            <span class="list-text">
              <span class="list-name">{{ entry.name || '未命名资产' }}</span>
              <small class="list-sub">{{ entry.typeLabel || '未设定' }}</small>
            </span>
          </button>
          <n-empty v-if="sameKindEntries.length === 0" class="list-empty" description="没有匹配的资产" />
        </div>
      </aside>

      <!-- 中：信息 / 简介 / 视觉 三块（v1.34.3） -->
      <main class="editor-panel editor-info">
        <div class="info-scroll arc-scrollbar">
          <!-- ① 信息 -->
          <section class="info-block">
            <h3 class="info-block__title">信息</h3>
            <CharacterEditForm v-if="kind === 'character'" :form="characterForm" />
            <SceneLocationEditForm v-else-if="kind === 'scene'" :form="sceneForm" />
            <PropItemEditForm v-else :form="propForm" />
          </section>

          <!-- ② 简介 -->
          <section class="info-block">
            <h3 class="info-block__title">简介</h3>
            <n-input
              v-model:value="currentDescription"
              type="textarea"
              :autosize="{ minRows: 4, maxRows: 12 }"
              :placeholder="descriptionPlaceholder"
            />
            <p class="info-block__foot">{{ currentDescriptionLength }} 字</p>
          </section>

          <!-- ③ 视觉 -->
          <section class="info-block">
            <div class="info-block__head">
              <h3 class="info-block__title">视觉</h3>
              <n-button size="tiny" :loading="visualPromptLoading" @click="handleGenerateVisualPrompt">
                <template #icon><Sparkles :size="13" /></template>
                AI 生成
              </n-button>
            </div>
            <n-input
              v-model:value="currentVisualPrompt"
              type="textarea"
              :autosize="{ minRows: 3, maxRows: 8 }"
              placeholder="以「简介」为核心依据生成的生图提示词；生图默认取用本段，留空则按资产字段自动拼装"
            />
            <p class="info-block__foot">
              以「简介」为核心生成依据，并读取该资产在小说章节中的原文片段，确保画面与小说的描述一致。
            </p>
          </section>
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

    <AiEnhancePreview
      :show="enhanceVisible"
      :fields="enhanceFields"
      :loading="enhanceLoading"
      @apply="handleEnhanceApply"
      @close="enhanceVisible = false"
    />
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
  grid-template-columns: 300px minmax(0, 1fr) 400px;
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
  width: 36px;
  height: 36px;
  place-items: center;
  overflow: hidden;
  border-radius: 50%;
  color: var(--arc-text-primary);
  font-size: 13px;
  font-weight: 700;
}

/* 头像位显示该资产的「基准图片」：居中裁切铺满圆形 */
.list-dot-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
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

/* 中栏三块：信息 / 简介 / 视觉（v1.34.3） */
.info-block {
  border: 1px solid var(--arc-border);
  border-radius: var(--arc-radius-md);
  padding: 16px 18px;
}

.info-block + .info-block {
  margin-top: 12px;
}

.info-block__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.info-block__title {
  margin: 0 0 10px;
  color: var(--arc-text-secondary);
  font-size: 13px;
  font-weight: 650;
}

.info-block__head .info-block__title {
  margin-bottom: 0;
}

.info-block__foot {
  margin: 8px 0 0;
  color: var(--arc-text-hint);
  font-size: 12px;
  line-height: 1.65;
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
