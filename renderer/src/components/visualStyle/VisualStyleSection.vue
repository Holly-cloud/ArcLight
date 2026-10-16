<script setup lang="ts">
// v1.27.0 C-1 角色视觉风格区块（renderMode + 调色板 + 氛围词 + 关键参照 + 预览）
// - v-model 绑 VisualStyleProfile | null；未设置时展示默认建议值但不主动落库
// - 视觉令牌硬约束：全用 --arc-* 令牌，不写硬编码色值
import { computed, ref } from 'vue'
import { NButton, NColorPicker, NDynamicTags, NFormItem, NSelect, NTooltip } from 'naive-ui'
import type { SelectOption } from 'naive-ui'
import { Eye, Plus, RotateCcw, X } from 'lucide-vue-next'
import VisualPreviewModal from '@/components/visualStyle/VisualPreviewModal.vue'
import type { VisualRenderMode, VisualStyleProfile } from '@/types/app'

const props = defineProps<{
  modelValue: VisualStyleProfile | null
  /** 可选：预览标题（角色名） */
  name?: string
  typeLabel?: string
  description?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [VisualStyleProfile | null]
}>()

const RENDER_MODE_OPTIONS: SelectOption[] = [
  { label: '写实（realistic）', value: 'realistic' },
  { label: '动漫（anime）', value: 'anime' },
  { label: '油画（oil-paint）', value: 'oil-paint' },
  { label: '水墨（ink-wash）', value: 'ink-wash' },
  { label: '低多边形（low-poly）', value: 'low-poly' },
  { label: '平面插画（flat-illustration）', value: 'flat-illustration' }
]

const DEFAULT_PROFILE: VisualStyleProfile = {
  renderMode: 'realistic',
  palette: [],
  moodWords: [],
  keyReferences: []
}

// 未设置（null）时以默认档案展示，但只有用户编辑才 emit
const current = computed<VisualStyleProfile>(() => props.modelValue ?? DEFAULT_PROFILE)

function patch(next: Partial<VisualStyleProfile>): void {
  emit('update:modelValue', { ...current.value, ...next })
}

const previewVisible = ref(false)

function updatePalette(index: number, color: string): void {
  const palette = [...current.value.palette]
  palette[index] = color
  patch({ palette })
}

function addPaletteColor(): void {
  patch({ palette: [...current.value.palette, '#ffffff'] })
}

function removePaletteColor(index: number): void {
  patch({ palette: current.value.palette.filter((_, i) => i !== index) })
}

function clearVisualStyle(): void {
  emit('update:modelValue', null)
}
</script>

<template>
  <section class="visual-style-section">
    <div class="visual-style-header">
      <span class="visual-style-title">视觉风格</span>
    </div>

    <n-form-item label="渲染方式（生图 renderMode）">
      <n-select
        :value="current.renderMode"
        :options="RENDER_MODE_OPTIONS"
        @update:value="(value: VisualRenderMode) => patch({ renderMode: value })"
      />
    </n-form-item>

    <n-form-item label="配色（调色板）">
      <div class="visual-style-palette">
        <div v-for="(color, index) in current.palette" :key="index" class="visual-style-swatch-row">
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
    </n-form-item>

    <n-form-item label="氛围词">
      <n-dynamic-tags
        :value="current.moodWords"
        @update:value="(value: string[]) => patch({ moodWords: value })"
      />
    </n-form-item>

    <n-form-item label="关键参照词（可粘贴参考图特征）">
      <n-dynamic-tags
        :value="current.keyReferences"
        @update:value="(value: string[]) => patch({ keyReferences: value })"
      />
    </n-form-item>

    <div class="visual-style-actions">
      <n-tooltip trigger="hover">
        <template #trigger>
          <n-button size="small" @click="previewVisible = true">
            <template #icon><Eye :size="13" /></template>
            预览
          </n-button>
        </template>
        预览调色板与组装后的生图 Prompt
      </n-tooltip>
      <n-button v-if="props.modelValue" size="small" quaternary @click="clearVisualStyle">
        <template #icon><RotateCcw :size="13" /></template>
        清空视觉风格
      </n-button>
    </div>

    <VisualPreviewModal
      :show="previewVisible"
      :title="props.name ?? ''"
      :render-mode="props.modelValue?.renderMode"
      :visual-style="props.modelValue"
      :type-label="props.typeLabel"
      :description="props.description"
      @update:show="previewVisible = $event"
    />
  </section>
</template>

<style scoped>
.visual-style-section {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.visual-style-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.visual-style-title {
  color: var(--arc-text-primary);
  font-size: 13px;
  font-weight: 650;
}

.visual-style-palette {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.visual-style-swatch-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.visual-style-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}
</style>
