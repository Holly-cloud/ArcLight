<script setup lang="ts">
// 道具编辑弹窗（「资产库」实体编辑弹窗入口；v1.26.0 抽取为可复用组件）
// - 面板与资产库聚合页共用；保存时双侧镜像同步关联场景（syncPropScenes）
// - props.prop 为空 → 新建；非空 → 编辑
import { computed, reactive, watch } from 'vue'
import { NButton, NDynamicTags, NForm, NFormItem, NInput, NModal, NSelect, useMessage } from 'naive-ui'
import type { SelectOption } from 'naive-ui'
import { useAppStore } from '@/stores/app'
import { themePresets } from '@/theme/presets'
import type { CharacterTag, PropItem, VisualContext } from '@/types/app'
import VisualContextSection from '@/components/visualStyle/VisualContextSection.vue'

const props = defineProps<{
  show: boolean
  prop: PropItem | null
}>()

const emit = defineEmits<{
  'update:show': [boolean]
  saved: []
}>()

const appStore = useAppStore()
const message = useMessage()

const PROP_TYPE_OPTIONS: SelectOption[] = ['武器', '信物', '法器', '消耗品', '线索物'].map((type) => ({ label: type, value: type }))
const ENTITY_COLOR_OPTIONS: SelectOption[] = [
  { label: '跟随主题（默认）', value: '' },
  ...themePresets.map((preset) => ({ label: preset.label, value: preset.primary }))
]

const characterOptions = computed(() =>
  appStore.characters.map((character) => ({ label: character.name, value: character.id }))
)
const sceneOptions = computed(() =>
  appStore.sceneLocations.map((scene) => ({ label: scene.name, value: scene.id }))
)

const propForm = reactive({
  name: '',
  type: '',
  description: '',
  ownerCharacterId: '',
  tags: [] as string[],
  color: '',
  relatedSceneIds: [] as string[],
  relatedCharacterIds: [] as string[],
  visualContext: null as VisualContext | null
})

watch(() => props.show, (show) => {
  if (!show) return
  const prop = props.prop
  propForm.name = prop?.name ?? ''
  propForm.type = prop?.type ?? '信物'
  propForm.description = prop?.description ?? ''
  propForm.ownerCharacterId = prop?.ownerCharacterId ?? ''
  propForm.tags = prop?.tags.map((tag) => tag.label) ?? []
  propForm.color = prop?.color ?? ''
  propForm.relatedSceneIds = [...(prop?.relatedSceneIds ?? [])]
  propForm.relatedCharacterIds = [...(prop?.relatedCharacterIds ?? [])]
  propForm.visualContext = prop?.visualContext ?? null
}, { immediate: true })

/** 将 NDynamicTags 的字符串标签转为 CharacterTag 结构 */
function toEntityTags(labels: string[]): CharacterTag[] {
  return labels
    .map((label) => String(label).trim())
    .filter(Boolean)
    .map((label) => ({ label }))
}

/** 保存道具时将关联场景写入对应场景的 relatedPropIds（双侧镜像同步） */
function syncPropScenes(propId: string, sceneIds: string[]): void {
  const nextSceneIds = new Set(sceneIds)
  appStore.sceneLocations.forEach((scene) => {
    const linked = scene.relatedPropIds.includes(propId)
    const shouldLink = nextSceneIds.has(scene.id)
    if (shouldLink && !linked) {
      appStore.updateSceneLocation(scene.id, { relatedPropIds: [...scene.relatedPropIds, propId] })
    } else if (!shouldLink && linked) {
      appStore.updateSceneLocation(scene.id, { relatedPropIds: scene.relatedPropIds.filter((id) => id !== propId) })
    }
  })
}

function close(): void {
  emit('update:show', false)
}

function submitProp(): void {
  const name = propForm.name.trim()
  if (!name) {
    message.warning('请填写道具名称')
    return
  }

  const payload: Partial<PropItem> = {
    name,
    type: propForm.type.trim() || '信物',
    description: propForm.description.trim(),
    ownerCharacterId: propForm.ownerCharacterId,
    tags: toEntityTags(propForm.tags),
    color: propForm.color,
    relatedSceneIds: propForm.relatedSceneIds,
    relatedCharacterIds: propForm.relatedCharacterIds,
    visualContext: propForm.visualContext
  }

  if (props.prop) {
    appStore.updatePropItem(props.prop.id, payload)
    syncPropScenes(props.prop.id, propForm.relatedSceneIds)
    message.success('道具信息已更新')
  } else {
    const propId = appStore.createPropItem(payload)
    syncPropScenes(propId, propForm.relatedSceneIds)
    message.success('已新增道具')
  }

  emit('saved')
  emit('update:show', false)
}
</script>

<template>
  <n-modal
    :show="props.show"
    preset="card"
    class="arc-editor-modal-wide"
    :title="props.prop ? '编辑道具' : '新建道具'"
    :bordered="false"
    @close="close"
  >
    <n-form label-placement="top">
      <div class="form-grid">
        <n-form-item label="道具名称">
          <n-input v-model:value="propForm.name" placeholder="例如：断魂剑 / 传国玉玺 / 引魂灯" />
        </n-form-item>
        <n-form-item label="道具类型">
          <n-select v-model:value="propForm.type" filterable tag :options="PROP_TYPE_OPTIONS" placeholder="选择或输入道具类型" />
        </n-form-item>
      </div>
      <n-form-item label="道具描述">
        <n-input
          v-model:value="propForm.description"
          type="textarea"
          :autosize="{ minRows: 3, maxRows: 6 }"
          placeholder="补充道具外观、用途、来源与剧情中的作用..."
        />
      </n-form-item>
      <n-form-item label="持有者">
        <n-select v-model:value="propForm.ownerCharacterId" clearable filterable :options="characterOptions" placeholder="选择主要持有者" />
      </n-form-item>
      <n-form-item label="关联场景">
        <n-select v-model:value="propForm.relatedSceneIds" multiple filterable :options="sceneOptions" placeholder="选择道具位于/出现于的场景" />
      </n-form-item>
      <n-form-item label="关联角色">
        <n-select v-model:value="propForm.relatedCharacterIds" multiple filterable :options="characterOptions" placeholder="选择其他关联角色（不含持有者）" />
      </n-form-item>
      <n-form-item label="标签">
        <n-dynamic-tags v-model:value="propForm.tags" />
      </n-form-item>
      <n-form-item label="主色">
        <n-select v-model:value="propForm.color" :options="ENTITY_COLOR_OPTIONS" />
      </n-form-item>
      <VisualContextSection
        v-model="propForm.visualContext"
        :name="propForm.name"
        :type-label="propForm.type"
        :description="propForm.description"
      />
    </n-form>

    <template #footer>
      <div class="arc-modal-actions">
        <n-button round strong @click="close">取消</n-button>
        <n-button type="primary" round strong @click="submitProp">
          {{ props.prop ? '保存修改' : '创建道具' }}
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.arc-modal-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 720px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
