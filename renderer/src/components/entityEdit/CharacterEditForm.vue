<script setup lang="ts">
// v1.34.0 角色「基础信息」表单块：名称 / 定位 / 标签 / 简介
// - v1.34.3：默认只展示「简介」；名称 / 定位 / 标签 折叠收纳（点标题才展开编辑）
// - 直接读写传入的表单对象（字段值与折叠与否无关，不会丢值）
import { computed } from 'vue'
import { NCollapse, NCollapseItem, NDynamicTags, NFormItem, NInput } from 'naive-ui'

/** 角色基础信息字段（编辑页与弹窗的最小公共集） */
export interface CharacterBaseForm {
  name: string
  role: string
  description: string
  tags: string[]
}

const props = defineProps<{ form: CharacterBaseForm }>()

const descriptionLength = computed(() => props.form.description.length)
const tagCount = computed(() => props.form.tags.length)

/** 折叠项标题右侧的一行摘要：折叠状态下也能一眼看到名称 / 定位 / 标签数 */
const basicsSummary = computed(() => {
  const parts: string[] = []
  if (props.form.name.trim()) parts.push(props.form.name.trim())
  if (props.form.role.trim()) parts.push(props.form.role.trim())
  if (props.form.tags.length) parts.push(`${props.form.tags.length} 个标签`)
  return parts.join(' · ')
})
</script>

<template>
  <n-form class="entity-base-form" label-placement="left" label-width="56" :show-feedback="false">
    <n-collapse class="entity-base-form__extra" :default-expanded-names="[]">
      <n-collapse-item name="basics">
        <template #header>
          <span class="entity-base-form__extra-title">名称 / 定位 / 标签</span>
          <span v-if="basicsSummary" class="entity-base-form__extra-summary">{{ basicsSummary }}</span>
        </template>
        <n-form-item label="名称">
          <n-input v-model:value="props.form.name" placeholder="例如：李雷 / 艾达" />
        </n-form-item>
        <n-form-item label="定位">
          <n-input v-model:value="props.form.role" placeholder="例如：男主 / 情报中间人" />
        </n-form-item>
        <n-form-item label="标签">
          <n-dynamic-tags v-model:value="props.form.tags" />
        </n-form-item>
      </n-collapse-item>
    </n-collapse>
    <n-form-item label="简介" class="entity-base-form__description">
      <n-input
        v-model:value="props.form.description"
        type="textarea"
        placeholder="补充角色背景、动机和冲突..."
      />
    </n-form-item>
    <p class="entity-base-form__foot">{{ descriptionLength }} 字 · {{ tagCount }} 个标签</p>
  </n-form>
</template>

<style scoped>
.entity-base-form {
  display: flex;
  flex-direction: column;
}

.entity-base-form :deep(.n-form-item-label) {
  color: var(--arc-text-secondary);
  font-size: 13px;
}

/* 折叠收纳「名称 / 定位 / 标签」：默认收起，只在需要编辑时展开 */
.entity-base-form__extra {
  margin-bottom: 4px;
}

.entity-base-form__extra :deep(.n-collapse-item__header) {
  padding-left: 0;
}

.entity-base-form__extra :deep(.n-collapse-item__content-inner) {
  padding-left: 0;
}

.entity-base-form__extra-title {
  color: var(--arc-text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.entity-base-form__extra-summary {
  margin-left: 8px;
  overflow: hidden;
  color: var(--arc-text-hint);
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entity-base-form__description :deep(.n-input) {
  min-height: 140px;
}

.entity-base-form__foot {
  margin: 8px 0 0;
  color: var(--arc-text-hint);
  font-size: 12.5px;
}
</style>
