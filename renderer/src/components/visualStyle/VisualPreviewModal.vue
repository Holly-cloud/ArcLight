<script setup lang="ts">
// v1.27.0 C-5 视觉预览弹窗（Q4=B：应用内 HTML 预览）
// - 调色板色块 + 结构化字段 + 组装后的生图 Prompt 文本（一键复制）
// - 纯前端渲染，不呼叫任何外部服务，不使用 <webview>
import { computed, ref, watch } from 'vue'
import { NButton, NModal, useMessage } from 'naive-ui'
import { Copy, Palette } from 'lucide-vue-next'
import { buildImagePrompt } from '@/features/visualStyle/exportAssetReference'
import type { VisualContext, VisualStyleProfile } from '@/types/app'

const props = defineProps<{
  show: boolean
  title: string
  renderMode?: string
  visualStyle?: VisualStyleProfile | null
  visualContext?: VisualContext | null
  typeLabel?: string
  description?: string
}>()

const emit = defineEmits<{
  'update:show': [boolean]
}>()

const message = useMessage()
const prompt = ref('')

const palette = computed<string[]>(() => {
  const stylePalette = props.visualStyle?.palette
  if (Array.isArray(stylePalette) && stylePalette.length) return stylePalette
  const contextPalette = props.visualContext?.colorPalette
  return Array.isArray(contextPalette) ? contextPalette : []
})

const moodWords = computed<string[]>(() => props.visualStyle?.moodWords ?? [])
const keyReferences = computed<string[]>(() => props.visualStyle?.keyReferences ?? [])

const structuredFields = computed(() => {
  const fields: Array<{ label: string; value: string }> = []
  const renderMode = props.renderMode || props.visualStyle?.renderMode || ''
  if (renderMode) fields.push({ label: '渲染方式', value: renderMode })
  if (moodWords.value.length) fields.push({ label: '氛围词', value: moodWords.value.join(' / ') })
  if (keyReferences.value.length) fields.push({ label: '关键参照', value: keyReferences.value.join(' / ') })
  if (props.visualContext?.lightingNote) fields.push({ label: '光影', value: props.visualContext.lightingNote })
  if (props.visualContext?.seasonNote) fields.push({ label: '季相', value: props.visualContext.seasonNote })
  if (props.visualContext?.materialityNote) fields.push({ label: '材质', value: props.visualContext.materialityNote })
  return fields
})

watch(() => props.show, (show) => {
  if (!show) return
  prompt.value = buildImagePrompt({
    name: props.title,
    type: props.typeLabel ?? '',
    renderMode: props.renderMode || props.visualStyle?.renderMode || '',
    palette: palette.value,
    moodWords: moodWords.value,
    keyReferences: keyReferences.value,
    lightingNote: props.visualContext?.lightingNote ?? '',
    seasonNote: props.visualContext?.seasonNote ?? '',
    materialityNote: props.visualContext?.materialityNote ?? '',
    description: props.description ?? ''
  })
})

function close(): void {
  emit('update:show', false)
}

async function copyPrompt(): Promise<void> {
  try {
    await navigator.clipboard.writeText(prompt.value)
    message.success('已复制生图 Prompt')
  } catch {
    message.warning('复制失败，请手动选择文本复制')
  }
}
</script>

<template>
  <n-modal
    :show="props.show"
    preset="card"
    class="arc-editor-modal-wide"
    title="视觉预览"
    :bordered="false"
    @close="close"
  >
    <div class="visual-preview">
      <div class="visual-preview-header">
        <Palette :size="16" class="visual-preview-icon" />
        <span class="visual-preview-title">{{ props.title || '未命名资产' }}</span>
      </div>

      <section class="visual-preview-block">
        <div class="visual-preview-label">调色板</div>
        <div v-if="palette.length" class="visual-preview-swatches">
          <span
            v-for="(color, index) in palette"
            :key="`${color}-${index}`"
            class="visual-preview-swatch"
            :style="{ background: color }"
            :title="color"
          />
        </div>
        <span v-else class="visual-preview-empty">尚未设置配色</span>
      </section>

      <section v-if="structuredFields.length" class="visual-preview-block">
        <div class="visual-preview-label">结构化字段</div>
        <ul class="visual-preview-fields">
          <li v-for="field in structuredFields" :key="field.label" class="visual-preview-field">
            <span class="visual-preview-field-label">{{ field.label }}</span>
            <span class="visual-preview-field-value">{{ field.value }}</span>
          </li>
        </ul>
      </section>

      <section class="visual-preview-block">
        <div class="visual-preview-label">生图 Prompt</div>
        <textarea class="visual-preview-prompt arc-scrollbar" readonly :value="prompt" />
      </section>

      <p class="visual-preview-hint">复制以上 Prompt，粘贴到外部生图工具（MJ / SD / 即梦 Web）即可使用。</p>
    </div>

    <template #footer>
      <div class="arc-modal-actions">
        <n-button round strong @click="close">关闭</n-button>
        <n-button type="primary" round strong @click="copyPrompt">
          <template #icon><Copy :size="14" /></template>
          复制 Prompt
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.visual-preview {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.visual-preview-header {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--arc-text-primary);
}

.visual-preview-icon {
  color: var(--arc-primary);
}

.visual-preview-title {
  font-size: 15px;
  font-weight: 650;
}

.visual-preview-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.visual-preview-label {
  color: var(--arc-text-hint);
  font-size: 12px;
}

.visual-preview-swatches {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.visual-preview-swatch {
  width: 28px;
  height: 28px;
  border: 1px solid var(--arc-border);
  border-radius: var(--arc-radius-md);
}

.visual-preview-empty {
  color: var(--arc-text-hint);
  font-size: 13px;
  font-style: italic;
}

.visual-preview-fields {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.visual-preview-field {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 13px;
}

.visual-preview-field-label {
  min-width: 62px;
  color: var(--arc-text-hint);
}

.visual-preview-field-value {
  color: var(--arc-text-primary);
  word-break: break-word;
}

.visual-preview-prompt {
  min-height: 132px;
  width: 100%;
  resize: vertical;
  border: 1px solid var(--arc-border);
  border-radius: var(--arc-radius-md);
  background: var(--arc-bg-surface-hover);
  color: var(--arc-text-primary);
  padding: 10px 12px;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.6;
}

.visual-preview-hint {
  margin: 0;
  color: var(--arc-text-hint);
  font-size: 12px;
}

.arc-modal-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}
</style>
