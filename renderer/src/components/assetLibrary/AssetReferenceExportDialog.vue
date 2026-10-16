<script setup lang="ts">
// v1.27.0 C-4 资产参考表导出弹窗
// - 可选字段勾选（强制字段恒在）+ 格式 Markdown / JSON / CSV + 预览前 3 条 + Blob 下载
// - 纯前端，无外部服务；CSV 的 palette 用 ; 分隔（由纯函数处理）
import { computed, ref, watch } from 'vue'
import { NButton, NCheckbox, NCheckboxGroup, NModal, NRadioButton, NRadioGroup, useMessage } from 'naive-ui'
import { Download } from 'lucide-vue-next'
import {
  ASSET_REFERENCE_FIELD_LABELS,
  OPTIONAL_ASSET_REFERENCE_FIELDS,
  buildAssetReferenceRows,
  formatAsCsv,
  formatAsJson,
  formatAsMarkdown,
  type AssetReferenceField
} from '@/features/visualStyle/exportAssetReference'
import type { AssetEntry } from '@/features/assetLibrary/assetLibraryModel'

const props = defineProps<{
  show: boolean
  entries: AssetEntry[]
}>()

const emit = defineEmits<{
  'update:show': [boolean]
}>()

const message = useMessage()

type ExportFormat = 'markdown' | 'json' | 'csv'

const selectedOptional = ref<AssetReferenceField[]>([...OPTIONAL_ASSET_REFERENCE_FIELDS])
const format = ref<ExportFormat>('markdown')

const optionalOptions = OPTIONAL_ASSET_REFERENCE_FIELDS.map((field) => ({
  label: ASSET_REFERENCE_FIELD_LABELS[field],
  value: field
}))

const fullRows = computed(() =>
  buildAssetReferenceRows(props.entries, { fields: selectedOptional.value })
)

const previewText = computed(() =>
  formatRows(fullRows.value.slice(0, 3), format.value)
)

const downloadText = computed(() => formatRows(fullRows.value, format.value))

function formatRows(rows: ReturnType<typeof buildAssetReferenceRows>, target: ExportFormat): string {
  if (target === 'json') return formatAsJson(rows)
  if (target === 'csv') return formatAsCsv(rows)
  return formatAsMarkdown(rows)
}

function close(): void {
  emit('update:show', false)
}

function buildFileName(): string {
  const stamp = new Date().toISOString().slice(0, 10)
  const ext = format.value === 'json' ? 'json' : format.value === 'csv' ? 'csv' : 'md'
  return `资产参考表-${stamp}.${ext}`
}

function mimeType(): string {
  if (format.value === 'json') return 'application/json;charset=utf-8'
  if (format.value === 'csv') return 'text/csv;charset=utf-8'
  return 'text/markdown;charset=utf-8'
}

function handleDownload(): void {
  if (props.entries.length === 0) {
    message.warning('当前没有可导出的资产')
    return
  }
  const blob = new Blob([downloadText.value], { type: mimeType() })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = buildFileName()
  anchor.click()
  URL.revokeObjectURL(url)
  message.success(`已导出 ${props.entries.length} 条资产（${format.value.toUpperCase()}）`)
}

watch(() => props.show, (show) => {
  if (show) format.value = 'markdown'
})
</script>

<template>
  <n-modal
    :show="props.show"
    preset="card"
    class="arc-editor-modal-wide"
    title="导出资产参考表"
    :bordered="false"
    @close="close"
  >
    <div class="export-dialog">
      <section class="export-block">
        <div class="export-block-label">可选字段（名称 / 类型 / 渲染方式 / 配色 / 氛围词 / 关键参照 / 标签恒含）</div>
        <n-checkbox-group v-model:value="selectedOptional">
          <div class="export-checkboxes">
            <n-checkbox v-for="option in optionalOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </n-checkbox>
          </div>
        </n-checkbox-group>
      </section>

      <section class="export-block">
        <div class="export-block-label">导出格式</div>
        <n-radio-group v-model:value="format">
          <n-radio-button value="markdown">Markdown</n-radio-button>
          <n-radio-button value="json">JSON</n-radio-button>
          <n-radio-button value="csv">CSV</n-radio-button>
        </n-radio-group>
      </section>

      <section class="export-block">
        <div class="export-block-label">预览（前 3 条 / 共 {{ fullRows.length }} 条）</div>
        <pre class="export-preview arc-scrollbar">{{ previewText || '（暂无可导出数据）' }}</pre>
      </section>
    </div>

    <template #footer>
      <div class="arc-modal-actions">
        <n-button round strong @click="close">取消</n-button>
        <n-button type="primary" round strong @click="handleDownload">
          <template #icon><Download :size="14" /></template>
          下载
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.export-dialog {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.export-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.export-block-label {
  color: var(--arc-text-hint);
  font-size: 12px;
}

.export-checkboxes {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.export-preview {
  max-height: 220px;
  overflow: auto;
  margin: 0;
  border: 1px solid var(--arc-border);
  border-radius: var(--arc-radius-md);
  background: var(--arc-bg-surface-hover);
  color: var(--arc-text-primary);
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.arc-modal-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}
</style>
