<script setup lang="ts">
// v1.34.0 角色「基础信息」表单块：名称 / 定位 / 标签 / 简介
// - 资产编辑页中栏与角色编辑弹窗共用同一份实现（横向排布、宽松密度）
// - 直接读写传入的表单对象（弹窗可在此基础上追加视觉风格等扩展字段）
import { computed } from 'vue'
import { NDynamicTags, NFormItem, NInput } from 'naive-ui'

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
</script>

<template>
  <n-form class="entity-base-form" label-placement="left" label-width="56" :show-feedback="false">
    <n-form-item label="名称">
      <n-input v-model:value="props.form.name" placeholder="例如：李雷 / 艾达" />
    </n-form-item>
    <n-form-item label="定位">
      <n-input v-model:value="props.form.role" placeholder="例如：男主 / 情报中间人" />
    </n-form-item>
    <n-form-item label="标签">
      <n-dynamic-tags v-model:value="props.form.tags" />
    </n-form-item>
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

.entity-base-form__description :deep(.n-input) {
  min-height: 220px;
}

.entity-base-form__foot {
  margin: 8px 0 0;
  color: var(--arc-text-hint);
  font-size: 12.5px;
}
</style>
