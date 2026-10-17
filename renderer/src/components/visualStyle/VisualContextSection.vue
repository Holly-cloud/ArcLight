<script setup lang="ts">
// v1.27.0 C-3 场景/道具视觉上下文区块（colorPalette + 光影/季相/材质 + 预览）
// - v-model 绑 VisualContext | null；未设置时展示默认空档案但不主动落库
import { computed } from 'vue'
import { NButton, NColorPicker, NFormItem, NInput } from 'naive-ui'
import { Plus, RotateCcw, X } from 'lucide-vue-next'
import type { VisualContext } from '@/types/app'

const props = defineProps<{
  modelValue: VisualContext | null
}>()

const emit = defineEmits<{
  'update:modelValue': [VisualContext | null]
}>()

const DEFAULT_CONTEXT: VisualContext = {
  colorPalette: [],
  lightingNote: '',
  seasonNote: '',
  materialityNote: ''
}

const current = computed<VisualContext>(() => props.modelValue ?? DEFAULT_CONTEXT)

function patch(next: Partial<VisualContext>): void {
  emit('update:modelValue', { ...current.value, ...next })
}

function updatePalette(index: number, color: string): void {
  const colorPalette = [...current.value.colorPalette]
  colorPalette[index] = color
  patch({ colorPalette })
}

function addPaletteColor(): void {
  patch({ colorPalette: [...current.value.colorPalette, '#ffffff'] })
}

function removePaletteColor(index: number): void {
  patch({ colorPalette: current.value.colorPalette.filter((_, i) => i !== index) })
}

function clearVisualContext(): void {
  emit('update:modelValue', null)
}
</script>

<template>
  <section class="visual-context-section">
    <div class="visual-context-header">
      <span class="visual-context-title">视觉上下文</span>
    </div>

    <n-form-item label="配色（colorPalette）">
      <div class="visual-context-palette">
        <div v-for="(color, index) in current.colorPalette" :key="index" class="visual-context-swatch-row">
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

    <n-form-item label="光影说明">
      <n-input
        :value="current.lightingNote"
        placeholder="例如：晨光斜射、逆光剪影、烛火暖光"
        @update:value="(value: string) => patch({ lightingNote: value })"
      />
    </n-form-item>

    <n-form-item label="季相说明">
      <n-input
        :value="current.seasonNote"
        placeholder="例如：初春微雨、深秋落叶、严冬积雪"
        @update:value="(value: string) => patch({ seasonNote: value })"
      />
    </n-form-item>

    <n-form-item label="材质说明">
      <n-input
        :value="current.materialityNote"
        placeholder="例如：青石城墙、朽木门框、寒铁剑刃"
        @update:value="(value: string) => patch({ materialityNote: value })"
      />
    </n-form-item>

    <div class="visual-context-actions">
      <n-button v-if="props.modelValue" size="small" quaternary @click="clearVisualContext">
        <template #icon><RotateCcw :size="13" /></template>
        清空视觉上下文
      </n-button>
    </div>
  </section>
</template>

<style scoped>
.visual-context-section {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.visual-context-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.visual-context-title {
  color: var(--arc-text-primary);
  font-size: 13px;
  font-weight: 650;
}

.visual-context-palette {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.visual-context-swatch-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.visual-context-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}
</style>
