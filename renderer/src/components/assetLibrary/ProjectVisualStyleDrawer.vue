<script setup lang="ts">
// v1.34.0 资产库「图片主风格」抽屉（项目级）
// - 设置项：渲染方式 / 主配色 / 氛围词 / 默认画幅比
// - 范围：当前项目（每本书一套）；进入任一资产编辑页生图时默认套用
// - 复用既有 projects.project_visual_style_json（JSON blob 扩展字段，0 新表 / 0 迁移）
// - 仅 Naive UI + lucide；颜色全走 --arc-* 令牌
import { reactive, ref, watch } from 'vue'
import { NButton, NColorPicker, NDrawer, NDrawerContent, NDynamicTags, NSelect } from 'naive-ui'
import type { SelectOption } from 'naive-ui'
import { Plus, X } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import type { VisualRenderMode } from '@/types/app'
import { ASPECT_RATIO_OPTIONS } from '@/features/assetImage/composeAssetImagePrompt'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ 'update:show': [boolean] }>()

const appStore = useAppStore()

const RENDER_MODE_OPTIONS: SelectOption[] = [
  { label: '未设置（按资产默认）', value: '' },
  { label: '写实（realistic）', value: 'realistic' },
  { label: '动漫（anime）', value: 'anime' },
  { label: '油画（oil-paint）', value: 'oil-paint' },
  { label: '水墨（ink-wash）', value: 'ink-wash' },
  { label: '低多边形（low-poly）', value: 'low-poly' },
  { label: '平面插画（flat-illustration）', value: 'flat-illustration' }
]

const ASPECT_OPTIONS: SelectOption[] = [
  { label: '按资产类型推荐（角色/场景 16:9、道具 1:1）', value: '' },
  ...ASPECT_RATIO_OPTIONS.map((value) => ({ label: value, value }))
]

const draft = reactive({
  renderMode: '' as VisualRenderMode | '',
  palette: [] as string[],
  moodWords: [] as string[],
  defaultAspectRatio: '' as string,
  lightingRules: '',
  seasonPalette: [] as string[]
})

/** 载入草稿快照：与之一致则不落库（避免打开抽屉即把 null 回写成空对象） */
const loadedSignature = ref('')

function draftSignature(): string {
  return JSON.stringify([
    draft.renderMode,
    draft.palette,
    draft.moodWords,
    draft.defaultAspectRatio,
    draft.lightingRules,
    draft.seasonPalette
  ])
}

watch(() => props.show, (show) => {
  if (!show) return
  const current = appStore.currentProject?.projectVisualStyle ?? null
  draft.renderMode = current?.renderMode ?? ''
  draft.palette = [...(current?.palette ?? [])]
  draft.moodWords = [...(current?.moodWords ?? [])]
  draft.defaultAspectRatio = current?.defaultAspectRatio ?? ''
  draft.lightingRules = current?.lightingRules ?? ''
  draft.seasonPalette = [...(current?.seasonPalette ?? [])]
  loadedSignature.value = draftSignature()
}, { immediate: true })

function persist(): void {
  appStore.updateProjectVisualStyle({
    palette: [...draft.palette],
    lightingRules: draft.lightingRules,
    seasonPalette: [...draft.seasonPalette],
    moodWords: [...draft.moodWords],
    renderMode: draft.renderMode || null,
    defaultAspectRatio: draft.defaultAspectRatio || null
  })
}

// 只在草稿内容真正变化（且不同于载入快照）时才落库
watch(draftSignature, (next) => {
  if (next === loadedSignature.value) return
  persist()
})

function addPaletteColor(): void {
  draft.palette = [...draft.palette, '#ffffff']
}

function updatePalette(index: number, color: string): void {
  const palette = [...draft.palette]
  palette[index] = color
  draft.palette = palette
}

function removePaletteColor(index: number): void {
  draft.palette = draft.palette.filter((_, i) => i !== index)
}

function close(): void {
  emit('update:show', false)
}
</script>

<template>
  <n-drawer :show="props.show" :width="392" placement="right" @update:show="emit('update:show', $event)">
    <n-drawer-content closable @close="close">
      <template #header>
        <div class="pvs-header">
          <b>图片主风格</b>
          <small>本项目资产库统一设置 · 所有资产生图默认沿用</small>
        </div>
      </template>

      <div class="pvs-body">
        <div class="pvs-field">
          <label class="pvs-label">渲染方式（renderMode）</label>
          <n-select v-model:value="draft.renderMode" :options="RENDER_MODE_OPTIONS" />
        </div>

        <div class="pvs-field">
          <label class="pvs-label">主配色（调色板）</label>
          <div class="pvs-palette">
            <div v-for="(color, index) in draft.palette" :key="index" class="pvs-swatch-row">
              <n-color-picker
                :value="color"
                size="small"
                :modes="['hex']"
                :show-alpha="false"
                @update:value="(value: string) => updatePalette(index, value)"
              />
              <n-button quaternary circle size="tiny" title="移除" @click="removePaletteColor(index)">
                <template #icon><X :size="13" /></template>
              </n-button>
            </div>
            <n-button dashed size="small" @click="addPaletteColor">
              <template #icon><Plus :size="13" /></template>
              添加颜色
            </n-button>
          </div>
        </div>

        <div class="pvs-field">
          <label class="pvs-label">氛围词</label>
          <n-dynamic-tags v-model:value="draft.moodWords" />
        </div>

        <div class="pvs-field">
          <label class="pvs-label">默认画幅比</label>
          <n-select v-model:value="draft.defaultAspectRatio" :options="ASPECT_OPTIONS" />
        </div>

        <p class="pvs-note">
          此设置写入<b>项目级</b>（当前项目的资产库），进入任一资产编辑页生图时默认套用；如需单次改动，可在编辑页的「生成选项」浮层里临时覆盖。
        </p>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<style scoped>
.pvs-header {
  display: flex;
  flex-direction: column;
}

.pvs-header b {
  color: var(--arc-text-primary);
  font-size: 15px;
  font-weight: 700;
}

.pvs-header small {
  margin-top: 3px;
  color: var(--arc-text-hint);
  font-size: 12px;
  font-weight: 400;
}

.pvs-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.pvs-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pvs-label {
  color: var(--arc-text-secondary);
  font-size: 13px;
}

.pvs-palette {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.pvs-swatch-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.pvs-note {
  margin: 0;
  color: var(--arc-text-hint);
  font-size: 12px;
  line-height: 1.7;
}

.pvs-note b {
  color: var(--arc-text-secondary);
}
</style>
