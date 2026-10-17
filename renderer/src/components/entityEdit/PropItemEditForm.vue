<script setup lang="ts">
// v1.34.0 道具「信息」表单块：名称 / 类型 / 标签
// - v1.34.3：中栏拆为「信息 / 简介 / 视觉」三块后，本组件只负责「信息」块（三项折叠收纳，点标题才展开编辑）
// - 直接读写传入的表单对象；「简介」由外部（AssetEditorPage）单独成块渲染，故接口保留 description 但本组件不渲染
import { computed } from 'vue'
import { NCollapse, NCollapseItem, NDynamicTags, NFormItem, NInput, NSelect } from 'naive-ui'
import type { SelectOption } from 'naive-ui'

/** 道具基础信息字段 */
export interface PropBaseForm {
  name: string
  type: string
  description: string
  tags: string[]
}

const PROP_TYPE_OPTIONS: SelectOption[] = ['武器', '信物', '法器', '消耗品', '线索物'].map((type) => ({ label: type, value: type }))

const props = defineProps<{ form: PropBaseForm }>()

/** 折叠项标题右侧的一行摘要：折叠状态下也能一眼看到名称 / 类型 / 标签数 */
const basicsSummary = computed(() => {
  const parts: string[] = []
  if (props.form.name.trim()) parts.push(props.form.name.trim())
  if (props.form.type.trim()) parts.push(props.form.type.trim())
  if (props.form.tags.length) parts.push(`${props.form.tags.length} 个标签`)
  return parts.join(' · ')
})
</script>

<template>
  <n-form class="entity-base-form" label-placement="left" label-width="56" :show-feedback="false">
    <n-collapse class="entity-base-form__extra" :default-expanded-names="[]">
      <n-collapse-item name="basics">
        <template #header>
          <span class="entity-base-form__extra-title">名称 / 类型 / 标签</span>
          <span v-if="basicsSummary" class="entity-base-form__extra-summary">{{ basicsSummary }}</span>
        </template>
        <n-form-item label="名称">
          <n-input v-model:value="props.form.name" placeholder="例如：断魂剑 / 传国玉玺 / 引魂灯" />
        </n-form-item>
        <n-form-item label="类型">
          <n-select v-model:value="props.form.type" filterable tag :options="PROP_TYPE_OPTIONS" placeholder="选择或输入道具类型" />
        </n-form-item>
        <n-form-item label="标签">
          <n-dynamic-tags v-model:value="props.form.tags" />
        </n-form-item>
      </n-collapse-item>
    </n-collapse>
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

/* 折叠收纳「名称 / 类型 / 标签」：默认收起，只在需要编辑时展开 */
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
</style>
