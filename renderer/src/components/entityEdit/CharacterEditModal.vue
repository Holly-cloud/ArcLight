<script setup lang="ts">
// 角色编辑弹窗（v1.26.0 从 CharactersPanel.vue 抽取为可复用组件）
// - 面板与资产库聚合页共用；含 AI 补充流程（AiEnhancePreview）
// - props.character 为空 → 新建；非空 → 编辑
import { computed, reactive, ref, watch } from 'vue'
import { NButton, NModal, useMessage } from 'naive-ui'
import { Sparkles } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import { buildProjectWritingStyleContext } from '@/features/writingStyles/presets'
import { suggestRenderMode } from '@/features/visualStyle/visualStyleTemplates'
import { toIpcPayload } from '@/utils/ipcPayload'
import type { CharacterCard, VisualStyleProfile } from '@/types/app'
import CharacterEditForm from '@/components/entityEdit/CharacterEditForm.vue'
import VisualStyleSection from '@/components/visualStyle/VisualStyleSection.vue'
import AssetGallerySection from '@/components/assetImage/AssetGallerySection.vue'
import type { AssetImagePromptAsset } from '@/features/assetImage/composeAssetImagePrompt'
import AiEnhancePreview from '@/components/AiEnhancePreview.vue'
import type { EnhanceFieldDiff } from '@/components/AiEnhancePreview.vue'

const props = defineProps<{
  show: boolean
  character: CharacterCard | null
}>()

const emit = defineEmits<{
  'update:show': [boolean]
  saved: []
}>()

const appStore = useAppStore()
const message = useMessage()
const writingStyle = computed(() => buildProjectWritingStyleContext(appStore.currentProject))

/** 组装图库生成提示词所需的资产视觉字段（随表单实时变化） */
const galleryAsset = computed<AssetImagePromptAsset>(() => ({
  kind: 'character',
  name: form.name,
  typeLabel: form.role,
  description: form.description,
  tags: form.tags,
  renderMode: form.visualStyle?.renderMode ?? '',
  palette: form.visualStyle?.palette ?? [],
  moodWords: form.visualStyle?.moodWords ?? [],
  keyReferences: form.visualStyle?.keyReferences ?? [],
  lightingNote: '',
  seasonNote: '',
  materialityNote: ''
}))

// 角色编辑表单数据
const form = reactive({
  name: '',
  role: '',
  description: '',
  tags: [] as string[],
  visualStyle: null as VisualStyleProfile | null
})

// 打开弹窗时把目标角色灌入表单（character 为 null → 重置为空白 + renderMode 模板建议）
watch(() => props.show, (show) => {
  if (!show) return
  const character = props.character
  form.name = character?.name ?? ''
  form.role = character?.role ?? ''
  form.description = character?.description ?? ''
  form.tags = character?.tags.map((tag) => tag.label) ?? []
  if (character) {
    form.visualStyle = character.visualStyle ?? null
  } else {
    // 新建：按项目 genre / premise 给出 renderMode 模板建议（仅建议，可改）
    const suggested = suggestRenderMode({
      genre: appStore.currentProject?.genre,
      premise: appStore.currentProject?.premise
    })
    form.visualStyle = suggested
      ? { renderMode: suggested, palette: [], moodWords: [], keyReferences: [] }
      : null
  }
}, { immediate: true })

function close(): void {
  emit('update:show', false)
}

// 提交角色表单：校验必填项，将标签字符串数组转为对象数组后保存
function submitCharacter(): void {
  if (!form.name.trim() || !form.description.trim()) {
    message.warning('请完整填写角色名称和角色简介')
    return
  }

  if (props.character) {
    appStore.updateCharacter(props.character.id, {
      ...form,
      tags: form.tags.map((label) => ({ label }))
    })
    message.success('角色信息已更新')
  } else {
    appStore.createCharacter({
      ...form,
      tags: form.tags.map((label) => ({ label }))
    })
    message.success('已新增角色草稿')
  }

  emit('saved')
  emit('update:show', false)
}

function buildAiWorldviewContext() {
  return appStore.worldviewEntries.slice(0, 12).map((entry) => ({
    type: entry.type,
    title: entry.title,
    content: entry.content.slice(0, 320)
  }))
}

const ENHANCE_TASK_KEY = 'character-enhance'
const enhanceLoading = computed(() => appStore.isAiTaskRunning(ENHANCE_TASK_KEY))
const enhanceVisible = ref(false)
const enhanceFields = ref<EnhanceFieldDiff[]>([])

async function handleAiEnhance(): Promise<void> {
  if (enhanceLoading.value) return

  try {
    const result = await appStore.runTrackedAiTask(
      {
        key: ENHANCE_TASK_KEY,
        kind: 'character',
        label: 'AI 补充角色',
        description: '正在根据上下文补充角色信息',
        panel: 'characters'
      },
      () =>
        window.characterArc.generateAi(toIpcPayload({
          task: 'character-enhance',
          settings: appStore.appSettings,
          context: {
            projectId: appStore.currentProject?.id,
            currentForm: { name: form.name, role: form.role, description: form.description, tags: form.tags },
            projectTitle: appStore.currentProject?.title,
            projectGenre: appStore.currentProject?.genre,
            writingStyleLabel: writingStyle.value.label,
            writingStylePrompt: writingStyle.value.prompt,
            characterNames: appStore.characters.map((c) => c.name),
            worldviewTitles: appStore.worldviewEntries.map((e) => e.title),
            worldviewEntries: buildAiWorldviewContext(),
            organizations: appStore.organizations,
            characterRelationships: appStore.characterRelationships,
            organizationMemberships: appStore.organizationMemberships,
            characters: appStore.characters.map((c) => ({ id: c.id, name: c.name, role: c.role, description: c.description }))
          }
        }))
    )

    if (!result.success || !result.result) {
      throw new Error(result.error ?? 'AI 补充失败，请检查模型配置')
    }

    const suggested = result.result as { name?: string; role?: string; description?: string; tags?: string[] }
    const suggestedTags = Array.isArray(suggested.tags) ? suggested.tags : []

    enhanceFields.value = [
      { key: 'name', label: '角色名称', type: 'text', original: form.name, suggested: suggested.name ?? '', changed: (suggested.name ?? '') !== form.name && Boolean(suggested.name?.trim()) },
      { key: 'role', label: '角色定位', type: 'text', original: form.role, suggested: suggested.role ?? '', changed: (suggested.role ?? '') !== form.role && Boolean(suggested.role?.trim()) },
      { key: 'description', label: '角色简介', type: 'textarea', original: form.description, suggested: suggested.description ?? '', changed: (suggested.description ?? '') !== form.description && Boolean(suggested.description?.trim()) },
      { key: 'tags', label: '角色标签', type: 'tags', original: form.tags, suggested: suggestedTags, changed: JSON.stringify(suggestedTags) !== JSON.stringify(form.tags) && suggestedTags.length > 0 }
    ]
    enhanceVisible.value = true
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'AI 补充失败，请检查模型配置')
  }
}

function handleEnhanceApply(accepted: Record<string, string | string[]>): void {
  if (accepted.name != null) form.name = accepted.name as string
  if (accepted.role != null) form.role = accepted.role as string
  if (accepted.description != null) form.description = accepted.description as string
  if (accepted.tags != null) form.tags = accepted.tags as string[]
  enhanceVisible.value = false
}
</script>

<template>
  <n-modal
    :show="props.show"
    preset="card"
    class="arc-editor-modal-wide"
    :title="props.character ? '编辑角色' : '新建角色'"
    :bordered="false"
    @close="close"
  >
    <CharacterEditForm :form="form" />
    <VisualStyleSection
      v-model="form.visualStyle"
      :name="form.name"
      :type-label="form.role"
      :description="form.description"
    />

    <AssetGallerySection
      v-if="props.character"
      :project-id="appStore.currentProject?.id ?? ''"
      kind="character"
      :asset-id="props.character.id"
      :asset-name="form.name"
      :asset="galleryAsset"
      :project-style="appStore.currentProject?.projectVisualStyle ?? null"
      primary-capable
    />

    <div class="arc-modal-footer">
      <div class="arc-modal-footer-left">
        <span>{{ form.description.length }} 字</span>
        <span>{{ form.tags.length }} 个标签</span>
      </div>
      <div class="arc-modal-footer-right">
        <n-button round strong @click="close">取消</n-button>
        <n-button round strong :loading="enhanceLoading" @click="handleAiEnhance">
          <template #icon><Sparkles :size="14" /></template>
          AI 补充
        </n-button>
        <n-button type="primary" round strong @click="submitCharacter">
          {{ props.character ? '保存修改' : '创建角色' }}
        </n-button>
      </div>
    </div>

    <template #footer>
      <span />
    </template>
  </n-modal>

  <AiEnhancePreview
    :show="enhanceVisible"
    :fields="enhanceFields"
    :loading="enhanceLoading"
    @apply="handleEnhanceApply"
    @close="enhanceVisible = false"
  />
</template>
