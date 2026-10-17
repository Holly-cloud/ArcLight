<script setup lang="ts">
// v1.34.0 场景「基础信息」表单块：名称 / 类型 / 标签 / 简介
// - 资产编辑页中栏与场景编辑弹窗共用同一份实现（横向排布、宽松密度）
// - 直接读写传入的表单对象（弹窗可在此基础上追加关联角色/道具等扩展字段）
import { computed } from 'vue'
import { NDynamicTags, NFormItem, NInput, NSelect } from 'naive-ui'
import type { SelectOption } from 'naive-ui'

/** 场景基础信息字段 */
export interface SceneBaseForm {
  name: string
  type: string
  description: string
  tags: string[]
}

const SCENE_TYPE_OPTIONS: SelectOption[] = ['城市', '建筑', '自然地形', '室内', '异空间'].map((type) => ({ label: type, value: type }))

const props = defineProps<{ form: SceneBaseForm }>()

const descriptionLength = computed(() => props.form.description.length)
const tagCount = computed(() => props.form.tags.length)
</script>

<template>
  <n-form class="entity-base-form" label-placement="left" label-width="56" :show-feedback="false">
    <n-form-item label="名称">
      <n-input v-model:value="props.form.name" placeholder="例如：云顶城 / 落雪谷 / 第七码头" />
    </n-form-item>
    <n-form-item label="类型">
      <n-select v-model:value="props.form.type" filterable tag :options="SCENE_TYPE_OPTIONS" placeholder="选择或输入场景类型" />
    </n-form-item>
    <n-form-item label="标签">
      <n-dynamic-tags v-model:value="props.form.tags" />
    </n-form-item>
    <n-form-item label="简介" class="entity-base-form__description">
      <n-input
        v-model:value="props.form.description"
        type="textarea"
        placeholder="补充地理特征、氛围、势力分布与故事作用..."
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

.entity-base-form__description :deep(.n-input) {
  min-height: 200px;
}

.entity-base-form__foot {
  margin: 8px 0 0;
  color: var(--arc-text-hint);
  font-size: 12.5px;
}
</style>
