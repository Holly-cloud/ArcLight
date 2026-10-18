<script setup lang="ts">
// v1.26.0 资产库资产卡片（大封面 + 类型徽标 + 名称 + 标签 chip + 描述摘要 + 关联计数）
// v1.28.0 增加多选态：multiSelect 时封面显示勾选框，选中由父级控制
import { computed, type CSSProperties } from 'vue'
import { Link2, PencilLine } from 'lucide-vue-next'
import { NButton, NCheckbox } from 'naive-ui'
import { ASSET_KIND_LABELS, type AssetEntry } from '@/features/assetLibrary/assetLibraryModel'

const props = defineProps<{
  entry: AssetEntry
  selected?: boolean
  /** 多选态：显示勾选框 */
  multiSelect?: boolean
  /** 多选态下是否已勾选 */
  checked?: boolean
  /** v1.36.0 封面图：该资产「首选图」的 arc-asset:// URL；缺省回退为渐变封面 */
  coverUrl?: string
}>()

const emit = defineEmits<{
  open: []
  select: []
  dblclick: []
}>()

const kindLabel = computed(() => ASSET_KIND_LABELS[props.entry.kind])
const activeHighlight = computed(() => (props.multiSelect ? props.checked : props.selected))
const visibleTags = computed(() => props.entry.tags.slice(0, 3))
const overflowTagCount = computed(() => Math.max(0, props.entry.tags.length - 3))
const descriptionSnippet = computed(() => {
  const text = props.entry.description.trim()
  return text.length > 80 ? `${text.slice(0, 80)}…` : text
})

/** 大封面背景：优先取资产自身 color；缺省回退 --arc-primary 渐变；已含渐变/图片值直接透传 */
function buildCover(color: string): string {
  const value = color?.trim()
  if (!value) {
    return 'linear-gradient(135deg, var(--arc-primary) 0%, color-mix(in srgb, var(--arc-primary) 52%, var(--arc-bg-surface)) 100%)'
  }
  if (value.includes('gradient') || value.includes('url(')) return value
  return `linear-gradient(135deg, ${value} 0%, color-mix(in srgb, ${value} 52%, var(--arc-bg-surface)) 100%)`
}

const coverStyle = computed<CSSProperties>(() => ({ background: buildCover(props.entry.color) }))
</script>

<template>
  <article
    class="asset-card"
    :class="{ selected: activeHighlight }"
    @click="emit('select')"
    @dblclick="emit('dblclick')"
  >
    <div class="asset-cover" :style="coverStyle">
      <!-- v1.36.0：有「首选图」时用其作封面（居中裁切），无则只剩渐变底 -->
      <img
        v-if="props.coverUrl"
        class="asset-cover-img"
        :src="props.coverUrl"
        :alt="props.entry.name || '资产封面'"
      />
      <div class="cover-left">
        <n-checkbox
          v-if="props.multiSelect"
          class="asset-check"
          :checked="Boolean(props.checked)"
          size="small"
          @click.stop="emit('select')"
        />
        <span class="asset-kind-badge">{{ kindLabel }}</span>
      </div>
      <n-button
        class="asset-edit-btn"
        quaternary
        circle
        size="small"
        title="编辑"
        @click.stop="emit('open')"
      >
        <template #icon><PencilLine :size="14" /></template>
      </n-button>
    </div>

    <div class="asset-body">
      <h3 class="asset-name">{{ props.entry.name || '未命名资产' }}</h3>
      <div v-if="props.entry.tags.length" class="asset-tags">
        <span v-for="tag in visibleTags" :key="tag" class="asset-tag">{{ tag }}</span>
        <span v-if="overflowTagCount" class="asset-tag asset-tag--more">+{{ overflowTagCount }}</span>
      </div>
      <p class="asset-desc" :class="{ empty: !descriptionSnippet }">
        {{ descriptionSnippet || '暂无描述' }}
      </p>
    </div>

    <div class="asset-footer">
      <span class="asset-project">{{ props.entry.projectName || '未命名项目' }}</span>
      <span class="asset-count" title="关联计数"><Link2 :size="12" />{{ props.entry.relationCount }}</span>
    </div>
  </article>
</template>

<style scoped>
.asset-card {
  position: relative;
  display: flex;
  min-width: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--arc-border);
  border-radius: var(--arc-radius-lg);
  background: var(--arc-bg-surface);
  cursor: pointer;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}

.asset-card:hover {
  border-color: color-mix(in srgb, var(--arc-primary) 34%, var(--arc-border));
  box-shadow: var(--arc-shadow-md);
  transform: translateY(-2px);
}

.asset-card.selected {
  border-color: var(--arc-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--arc-primary) 20%, transparent);
}

.asset-cover {
  position: relative;
  display: flex;
  height: 96px;
  align-items: flex-start;
  justify-content: space-between;
  padding: 10px 12px;
}

.cover-left {
  display: flex;
  position: relative;
  z-index: 1;
  align-items: center;
  gap: 8px;
}

/* 封面图铺满封面区，压在渐变底之上、徽标之下 */
.asset-cover-img {
  position: absolute;
  z-index: 0;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.asset-edit-btn {
  position: relative;
  z-index: 1;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.asset-check {
  --n-size: 18px;
}

.asset-check :deep(.n-checkbox-box) {
  background: var(--arc-bg-surface);
}

.asset-kind-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: var(--arc-bg-surface);
  color: var(--arc-text-primary);
  padding: 2px 10px;
  font-size: 11.5px;
  font-weight: 650;
}

.asset-edit-btn {
  opacity: 0;
  transition: opacity 0.15s ease;
}

.asset-card:hover .asset-edit-btn,
.asset-edit-btn:focus-visible {
  opacity: 1;
}

.asset-body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px 6px;
}

.asset-name {
  margin: 0;
  overflow: hidden;
  color: var(--arc-text-primary);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-card:hover .asset-name {
  color: var(--arc-primary);
}

.asset-tags {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}

.asset-tag {
  border-radius: 4px;
  background: var(--arc-bg-surface-hover);
  color: var(--arc-text-secondary);
  padding: 2px 7px;
  font-size: 11.5px;
  white-space: nowrap;
}

.asset-tag--more {
  color: var(--arc-text-hint);
}

.asset-desc {
  display: -webkit-box;
  min-height: 34px;
  margin: 0;
  overflow: hidden;
  color: var(--arc-text-secondary);
  font-size: 12.5px;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.asset-desc.empty {
  color: var(--arc-text-hint);
  font-style: italic;
}

.asset-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  border-top: 1px solid var(--arc-border);
  padding: 8px 14px;
}

.asset-project {
  overflow: hidden;
  color: var(--arc-text-hint);
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-count {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  gap: 3px;
  color: var(--arc-text-hint);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}
</style>
