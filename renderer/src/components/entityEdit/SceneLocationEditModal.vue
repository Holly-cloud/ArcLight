<script setup lang="ts">
// 场景编辑弹窗（v1.26.0 从 ScenePropSection.vue 抽取为可复用组件）
// - 面板与资产库聚合页共用；保存时双侧镜像同步关联道具（syncSceneProps）
// - props.scene 为空 → 新建；非空 → 编辑
import { computed, reactive, watch } from 'vue'
import { NButton, NDynamicTags, NForm, NFormItem, NInput, NModal, NSelect, useMessage } from 'naive-ui'
import type { SelectOption } from 'naive-ui'
import { useAppStore } from '@/stores/app'
import { themePresets } from '@/theme/presets'
import type { CharacterTag, SceneLocation, VisualContext } from '@/types/app'
import VisualContextSection from '@/components/visualStyle/VisualContextSection.vue'

const props = defineProps<{
  show: boolean
  scene: SceneLocation | null
}>()

const emit = defineEmits<{
  'update:show': [boolean]
  saved: []
}>()

const appStore = useAppStore()
const message = useMessage()

const SCENE_TYPE_OPTIONS: SelectOption[] = ['城市', '建筑', '自然地形', '室内', '异空间'].map((type) => ({ label: type, value: type }))
const ENTITY_COLOR_OPTIONS: SelectOption[] = [
  { label: '跟随主题（默认）', value: '' },
  ...themePresets.map((preset) => ({ label: preset.label, value: preset.primary }))
]

const characterOptions = computed(() =>
  appStore.characters.map((character) => ({ label: character.name, value: character.id }))
)
const propOptions = computed(() =>
  appStore.propItems.map((prop) => ({ label: prop.name, value: prop.id }))
)

const sceneForm = reactive({
  name: '',
  type: '',
  description: '',
  tags: [] as string[],
  color: '',
  relatedCharacterIds: [] as string[],
  relatedPropIds: [] as string[],
  visualContext: null as VisualContext | null
})

watch(() => props.show, (show) => {
  if (!show) return
  const scene = props.scene
  sceneForm.name = scene?.name ?? ''
  sceneForm.type = scene?.type ?? '城市'
  sceneForm.description = scene?.description ?? ''
  sceneForm.tags = scene?.tags.map((tag) => tag.label) ?? []
  sceneForm.color = scene?.color ?? ''
  sceneForm.relatedCharacterIds = [...(scene?.relatedCharacterIds ?? [])]
  sceneForm.relatedPropIds = [...(scene?.relatedPropIds ?? [])]
  sceneForm.visualContext = scene?.visualContext ?? null
}, { immediate: true })

/** 将 NDynamicTags 的字符串标签转为 CharacterTag 结构 */
function toEntityTags(labels: string[]): CharacterTag[] {
  return labels
    .map((label) => String(label).trim())
    .filter(Boolean)
    .map((label) => ({ label }))
}

/** 保存场景时将关联道具写入对应道具的 relatedSceneIds（双侧镜像同步） */
function syncSceneProps(sceneId: string, propIds: string[]): void {
  const nextPropIds = new Set(propIds)
  appStore.propItems.forEach((prop) => {
    const linked = prop.relatedSceneIds.includes(sceneId)
    const shouldLink = nextPropIds.has(prop.id)
    if (shouldLink && !linked) {
      appStore.updatePropItem(prop.id, { relatedSceneIds: [...prop.relatedSceneIds, sceneId] })
    } else if (!shouldLink && linked) {
      appStore.updatePropItem(prop.id, { relatedSceneIds: prop.relatedSceneIds.filter((id) => id !== sceneId) })
    }
  })
}

function close(): void {
  emit('update:show', false)
}

function submitScene(): void {
  const name = sceneForm.name.trim()
  if (!name) {
    message.warning('请填写场景名称')
    return
  }

  const payload: Partial<SceneLocation> = {
    name,
    type: sceneForm.type.trim() || '城市',
    description: sceneForm.description.trim(),
    tags: toEntityTags(sceneForm.tags),
    color: sceneForm.color,
    relatedCharacterIds: sceneForm.relatedCharacterIds,
    relatedPropIds: sceneForm.relatedPropIds,
    visualContext: sceneForm.visualContext
  }

  if (props.scene) {
    appStore.updateSceneLocation(props.scene.id, payload)
    syncSceneProps(props.scene.id, sceneForm.relatedPropIds)
    message.success('场景信息已更新')
  } else {
    const sceneId = appStore.createSceneLocation(payload)
    syncSceneProps(sceneId, sceneForm.relatedPropIds)
    message.success('已新增场景')
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
    :title="props.scene ? '编辑场景' : '新建场景'"
    :bordered="false"
    @close="close"
  >
    <n-form label-placement="top">
      <div class="form-grid">
        <n-form-item label="场景名称">
          <n-input v-model:value="sceneForm.name" placeholder="例如：云顶城 / 落雪谷 / 第七码头" />
        </n-form-item>
        <n-form-item label="场景类型">
          <n-select v-model:value="sceneForm.type" filterable tag :options="SCENE_TYPE_OPTIONS" placeholder="选择或输入场景类型" />
        </n-form-item>
      </div>
      <n-form-item label="场景描述">
        <n-input
          v-model:value="sceneForm.description"
          type="textarea"
          :autosize="{ minRows: 3, maxRows: 6 }"
          placeholder="补充地理特征、氛围、势力分布与故事作用..."
        />
      </n-form-item>
      <n-form-item label="关联角色">
        <n-select v-model:value="sceneForm.relatedCharacterIds" multiple filterable :options="characterOptions" placeholder="选择出现在该场景的角色" />
      </n-form-item>
      <n-form-item label="关联道具">
        <n-select v-model:value="sceneForm.relatedPropIds" multiple filterable :options="propOptions" placeholder="选择位于该场景的重要道具" />
      </n-form-item>
      <n-form-item label="标签">
        <n-dynamic-tags v-model:value="sceneForm.tags" />
      </n-form-item>
      <n-form-item label="主色">
        <n-select v-model:value="sceneForm.color" :options="ENTITY_COLOR_OPTIONS" />
      </n-form-item>
      <VisualContextSection
        v-model="sceneForm.visualContext"
        :name="sceneForm.name"
        :type-label="sceneForm.type"
        :description="sceneForm.description"
      />
    </n-form>

    <template #footer>
      <div class="arc-modal-actions">
        <n-button round strong @click="close">取消</n-button>
        <n-button type="primary" round strong @click="submitScene">
          {{ props.scene ? '保存修改' : '创建场景' }}
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
