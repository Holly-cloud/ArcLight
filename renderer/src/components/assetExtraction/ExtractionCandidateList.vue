<script lang="ts">
// v1.28.0 小说资产提取：候选分组列表 + 勾选 + 就地编辑（只 Naive UI + lucide + --arc-* 令牌）
// 该类型同时被向导复用：drafts 由父级持有，列表通过 update:drafts 回写编辑结果。
export interface CandidateDraft {
  kind: 'character' | 'scene' | 'prop'
  /** 名称归一后的稳定 key，仅用于列表渲染 */
  key: string
  name: string
  /** 角色=定位；场景/道具=类型 */
  typeLabel: string
  description: string
  tags: string[]
  /** 是否勾选（默认勾选「未与已有实体重名」的项） */
  checked: boolean
  /** 是否与项目已有实体重名 */
  conflict: boolean
}
</script>

<script setup lang="ts">
import { computed } from 'vue'
import { NDynamicTags, NInput, NTag } from 'naive-ui'

const props = defineProps<{
  drafts: CandidateDraft[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:drafts': [CandidateDraft[]]
}>()

interface GroupItem {
  draft: CandidateDraft
  index: number
}

const GROUP_META: ReadonlyArray<{ kind: CandidateDraft['kind']; label: string; typeLabel: string }> = [
  { kind: 'character', label: '角色', typeLabel: '定位' },
  { kind: 'scene', label: '场景', typeLabel: '类型' },
  { kind: 'prop', label: '道具', typeLabel: '类型' }
]

const groups = computed(() => GROUP_META
  .map((meta) => ({
    ...meta,
    items: props.drafts
      .map((draft, index) => ({ draft, index }))
      .filter((item) => item.draft.kind === meta.kind)
  }))
  .filter((group) => group.items.length > 0)
)

const checkedCount = computed(() => props.drafts.filter((draft) => draft.checked).length)

function patch(index: number, changes: Partial<CandidateDraft>): void {
  const next = props.drafts.slice()
  const current = next[index]
  if (!current) return
  next[index] = { ...current, ...changes }
  emit('update:drafts', next)
}

function updateTag(index: number, tags: string[]): void {
  patch(index, { tags })
}
</script>

<template>
  <div class="candidate-list">
    <div v-if="props.drafts.length" class="candidate-summary">
      共 {{ props.drafts.length }} 条候选，已勾选 {{ checkedCount }} 条
    </div>

    <section v-for="group in groups" :key="group.kind" class="candidate-group">
      <header class="group-header">
        <span class="group-title">{{ group.label }}</span>
        <span class="group-count">{{ group.items.length }}</span>
      </header>

      <div class="group-items">
        <article
          v-for="item in group.items"
          :key="item.draft.key"
          class="candidate-row"
          :class="{ conflict: item.draft.conflict }"
        >
          <div class="row-head">
            <n-checkbox
              :checked="item.draft.checked"
              :disabled="props.disabled"
              @update:checked="(val: boolean) => patch(item.index, { checked: val })"
            />
            <n-input
              v-model:value="item.draft.name"
              :disabled="props.disabled"
              size="small"
              placeholder="实体名称"
              class="row-name"
              @update:value="(val: string) => patch(item.index, { name: val })"
            />
            <n-tag v-if="item.draft.conflict" size="small" type="warning" round>与已有实体重名</n-tag>
          </div>

          <div class="row-body">
            <label class="row-field">
              <span class="field-label">{{ group.typeLabel }}</span>
              <n-input
                v-model:value="item.draft.typeLabel"
                :disabled="props.disabled"
                size="small"
                placeholder="可留空"
                @update:value="(val: string) => patch(item.index, { typeLabel: val })"
              />
            </label>
            <label class="row-field">
              <span class="field-label">标签</span>
              <n-dynamic-tags
                :value="item.draft.tags"
                :disabled="props.disabled"
                size="small"
                @update:value="(tags: string[]) => updateTag(item.index, tags)"
              />
            </label>
            <label class="row-field row-field--stack">
              <span class="field-label">描述</span>
              <n-input
                v-model:value="item.draft.description"
                :disabled="props.disabled"
                type="textarea"
                :autosize="{ minRows: 2, maxRows: 5 }"
                size="small"
                placeholder="可留空"
                @update:value="(val: string) => patch(item.index, { description: val })"
              />
            </label>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.candidate-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.candidate-summary {
  color: var(--arc-text-hint);
  font-size: 12px;
}

.candidate-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.group-title {
  color: var(--arc-text-primary);
  font-size: 13px;
  font-weight: 650;
}

.group-count {
  border-radius: 999px;
  background: var(--arc-primary-soft);
  color: var(--arc-primary);
  padding: 1px 8px;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}

.group-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.candidate-row {
  border: 1px solid var(--arc-border);
  border-radius: var(--arc-radius-md);
  background: var(--arc-bg-surface);
  padding: 10px 12px;
}

.candidate-row.conflict {
  border-color: color-mix(in srgb, var(--arc-warning, var(--arc-primary)) 45%, var(--arc-border));
}

.row-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.row-name {
  flex: 1;
  min-width: 0;
}

.row-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
  padding-left: 26px;
}

.row-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.row-field--stack {
  flex-direction: column;
  align-items: stretch;
}

.field-label {
  min-width: 42px;
  color: var(--arc-text-hint);
  font-size: 12px;
}
</style>
