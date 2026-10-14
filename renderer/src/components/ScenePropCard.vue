<script setup lang="ts">
import { computed } from 'vue'
import { Gem, MapPin, PencilLine, Plus, Trash2, UserRoundCog } from 'lucide-vue-next'
import { NCheckbox } from 'naive-ui'
import type { CharacterTag } from '@/types/app'

/**
 * 场景 / 道具卡片的瘦展示组件：列表项 + 空态。
 * 仅负责视觉呈现，所有数据与交互通过 props / emit 与宿主面板解耦，避免关系面板持续膨胀。
 */
const props = withDefaults(defineProps<{
  kind: 'scene' | 'prop'
  /** 空态模式：不渲染卡片，仅渲染图标 + 提示 + 新建入口 */
  empty?: boolean
  name?: string
  type?: string
  description?: string
  tags?: CharacterTag[]
  /** 主色；空字符串时回退到主题令牌（场景 --arc-success / 道具 --arc-text-secondary） */
  color?: string
  /** 道具持有者名称（仅道具卡片展示） */
  ownerName?: string
  /** 关联摘要（如「关联角色：A、B」） */
  relationSummary?: string
  selected?: boolean
  selectionMode?: boolean
  emptyTitle?: string
  emptyText?: string
}>(), {
  empty: false,
  name: '',
  type: '',
  description: '',
  tags: () => [],
  color: '',
  ownerName: '',
  relationSummary: '',
  selected: false,
  selectionMode: false,
  emptyTitle: '',
  emptyText: ''
})

const emit = defineEmits<{
  edit: []
  remove: []
  toggleSelect: []
  create: []
}>()

const isScene = computed(() => props.kind === 'scene')
const iconComponent = computed(() => (isScene.value ? MapPin : Gem))
const kindClass = computed(() => (isScene.value ? 'scene-card' : 'prop-card'))
const badgeLabel = computed(() => (isScene.value ? '场景' : '道具'))
const resolvedEmptyTitle = computed(() => props.emptyTitle || (isScene.value ? '还没有场景 / 地点' : '还没有道具'))
const resolvedEmptyText = computed(() => props.emptyText || (isScene.value
  ? '把散落在正文里的地点设定沉淀下来，后面就能在图谱里看到谁在何处。'
  : '记录关键道具的归属与流转，便于追踪信物、法器与线索物。'))

const hasColor = computed(() => Boolean(props.color?.trim()))
</script>

<template>
  <div v-if="empty" class="scene-prop-empty" :class="kindClass">
    <component :is="iconComponent" :size="20" />
    <strong>{{ resolvedEmptyTitle }}</strong>
    <p>{{ resolvedEmptyText }}</p>
    <n-button type="primary" size="small" @click="emit('create')">
      <template #icon><Plus :size="14" /></template>
      {{ isScene ? '新建场景' : '新建道具' }}
    </n-button>
  </div>

  <article
    v-else
    class="scene-prop-card"
    :class="[kindClass, { selected }]"
    @click="selectionMode && emit('toggleSelect')"
  >
    <span class="scene-prop-color" :style="hasColor ? { background: color } : undefined"></span>

    <div class="scene-prop-top">
      <n-checkbox
        v-if="selectionMode"
        :checked="selected"
        @click.stop
        @update:checked="emit('toggleSelect')"
      />
      <span class="scene-prop-badge">
        <component :is="iconComponent" :size="14" />
        <span class="scene-prop-badge-text">{{ badgeLabel }}</span>
      </span>
      <div class="scene-prop-head-copy">
        <h4>{{ name }}</h4>
        <span>{{ type }}</span>
      </div>
      <div class="scene-prop-actions">
        <button class="icon-button" type="button" :title="isScene ? '编辑场景' : '编辑道具'" @click.stop="emit('edit')">
          <PencilLine :size="15" />
        </button>
        <button class="icon-button danger" type="button" :title="isScene ? '删除场景' : '删除道具'" @click.stop="emit('remove')">
          <Trash2 :size="15" />
        </button>
      </div>
    </div>

    <p v-if="description" class="scene-prop-desc">{{ description }}</p>

    <div v-if="kind === 'prop' && ownerName" class="scene-prop-owner">
      <UserRoundCog :size="13" />
      <span>持有者：{{ ownerName }}</span>
    </div>

    <div v-if="relationSummary" class="scene-prop-relations">{{ relationSummary }}</div>

    <div v-if="tags.length" class="scene-prop-tags">
      <span
        v-for="tag in tags"
        :key="tag.label"
        class="scene-prop-tag"
        :class="`tone-${tag.tone ?? 'default'}`"
      >{{ tag.label }}</span>
    </div>
  </article>
</template>

<style scoped>
.scene-prop-card {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--arc-border);
  border-radius: var(--arc-radius-md);
  background: var(--arc-bg-surface);
  padding: 14px;
  transition:
    border-color 0.16s ease,
    background 0.16s ease,
    box-shadow 0.16s ease;
}

.scene-prop-card:hover {
  border-color: color-mix(in srgb, var(--arc-primary) 20%, var(--arc-border));
  background: var(--arc-bg-surface-hover);
  box-shadow: var(--arc-shadow-sm);
}

.scene-prop-card.selected {
  border-color: var(--arc-primary);
  background: color-mix(in srgb, var(--arc-primary) 6%, var(--arc-bg-surface));
}

.scene-prop-color {
  position: absolute;
  top: 0;
  left: 0;
  width: 3px;
  height: 100%;
  background: var(--scene-prop-accent);
}

.scene-prop-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.scene-prop-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--scene-prop-accent) 12%, var(--arc-bg-mix));
  color: var(--scene-prop-accent);
  font-size: 11px;
  font-weight: 800;
  padding: 5px 10px;
}

.scene-prop-head-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 4px;
}

.scene-prop-head-copy h4 {
  margin: 0;
  overflow: hidden;
  color: var(--arc-text-primary);
  font-size: 16px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scene-prop-head-copy span {
  color: var(--arc-text-secondary);
  font-size: 12px;
}

.scene-prop-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.scene-prop-desc {
  margin: 12px 0 0;
  overflow: hidden;
  color: var(--arc-text-secondary);
  font-size: 13px;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.scene-prop-owner {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  color: var(--arc-text-hint);
  font-size: 12px;
}

.scene-prop-relations {
  margin-top: 10px;
  overflow: hidden;
  color: var(--arc-text-hint);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scene-prop-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.scene-prop-tag {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--arc-text-secondary) 10%, var(--arc-bg-mix));
  color: var(--arc-text-secondary);
  font-size: 11px;
  font-weight: 600;
  padding: 4px 9px;
}

.scene-prop-tag.tone-danger {
  background: color-mix(in srgb, var(--arc-danger) 10%, var(--arc-bg-mix));
  color: var(--arc-danger);
}

.scene-prop-tag.tone-success {
  background: color-mix(in srgb, var(--arc-success) 10%, var(--arc-bg-mix));
  color: var(--arc-success);
}

.scene-prop-tag.tone-warning {
  background: color-mix(in srgb, var(--arc-warning) 12%, var(--arc-bg-mix));
  color: var(--arc-warning);
}

.scene-prop-empty {
  display: flex;
  min-height: 220px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 1px dashed var(--arc-border);
  border-radius: var(--arc-radius-lg);
  background: var(--arc-bg-weak);
  color: var(--arc-text-hint);
  text-align: center;
  padding: 24px;
}

.scene-prop-empty strong {
  color: var(--arc-text-primary);
  font-size: 15px;
}

.scene-prop-empty p {
  max-width: 26rem;
  margin: 0;
  color: var(--arc-text-secondary);
  font-size: 13px;
  line-height: 1.7;
}
</style>
