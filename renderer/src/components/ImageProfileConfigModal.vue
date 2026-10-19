<script setup lang="ts">
// v1.37.0 生图渠道配置弹窗（从顶栏「图片」进入）
// - 渠道可存多条（上限 IMAGE_PROFILE_LIMIT），全局生效
// - 改动即时写入 store 并落盘，不再有草稿/保存二段式
// - 新建时可套用通用模板预填协议 / 模型 / Base URL
// - 仅 Naive UI + lucide；颜色全走 --arc-* 令牌
import { computed, ref } from 'vue'
import { NButton, NFormItem, NInput, NModal, NSelect, useMessage } from 'naive-ui'
import type { SelectOption } from 'naive-ui'
import { Check, Copy, Download, Plus, RefreshCw, Trash2 } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import { toIpcPayload } from '@/utils/ipcPayload'
import { IMAGE_PROFILE_LIMIT } from '@shared/image-profile'
import type { ImageProfile, ImageProfileProtocol } from '@/types/app'
import {
  getImageProfileTemplate,
  imageProfileTemplateOptions
} from '@/features/settings/imageProfileTemplates'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
}>()

const appStore = useAppStore()
const message = useMessage()

const profiles = computed(() => appStore.appSettings.imageProfiles)
const editingProfileId = ref(appStore.activeImageProfile?.id ?? '')
const editingProfile = computed<ImageProfile | undefined>(() =>
  profiles.value.find((profile) => profile.id === editingProfileId.value)
)
const isEditingActiveProfile = computed(() => Boolean(editingProfile.value) && editingProfile.value?.id === appStore.activeImageProfile?.id)
const reachedLimit = computed(() => profiles.value.length >= IMAGE_PROFILE_LIMIT)

const isFetchingModels = ref(false)
const fetchedModels = ref<Array<{ id: string; ownedBy: string | null }>>([])
const modelSelectOptions = computed<SelectOption[]>(() =>
  fetchedModels.value.map((model) => ({ label: model.id, value: model.id }))
)

const protocolOptions: SelectOption[] = [
  { label: 'OpenAI 兼容（/images/generations）', value: 'openai-images' },
  { label: 'GRS AI（/v1/api/generate，支持参考图）', value: 'grsai' }
]

function selectProfile(profileId: string): void {
  editingProfileId.value = profileId
  fetchedModels.value = []
}

function updateEditingProfile(updates: Partial<ImageProfile>): void {
  const profile = editingProfile.value
  if (!profile) return
  appStore.updateImageProfile(profile.id, updates)
  if (updates.baseUrl !== undefined) fetchedModels.value = []
}

/** 套用通用模板：覆盖名称/协议/模型/Base URL，不动 API Key */
function applyTemplate(templateId: string): void {
  if (!templateId || !editingProfile.value) return
  const template = getImageProfileTemplate(templateId)
  updateEditingProfile({
    name: template.label,
    protocol: template.protocol,
    model: template.model,
    baseUrl: template.baseUrl
  })
}

function handleAddProfile(): void {
  if (reachedLimit.value) {
    message.warning(`最多保存 ${IMAGE_PROFILE_LIMIT} 条生图渠道，请先删除不再使用的。`)
    return
  }
  const template = getImageProfileTemplate('custom-openai-compatible')
  const profile: ImageProfile = {
    id: `image-profile-${Date.now()}`,
    name: `渠道 ${profiles.value.length + 1}`,
    protocol: template.protocol,
    baseUrl: template.baseUrl,
    apiKey: '',
    model: template.model
  }
  appStore.addImageProfile(profile)
  selectProfile(profile.id)
}

function handleCopyProfile(): void {
  const source = editingProfile.value
  if (!source) return
  if (reachedLimit.value) {
    message.warning(`最多保存 ${IMAGE_PROFILE_LIMIT} 条生图渠道，请先删除不再使用的。`)
    return
  }
  const profile: ImageProfile = { ...source, id: `image-profile-${Date.now()}`, name: `${source.name} 副本` }
  appStore.addImageProfile(profile)
  selectProfile(profile.id)
}

function handleDeleteProfile(): void {
  const profile = editingProfile.value
  if (!profile) return
  appStore.deleteImageProfile(profile.id)
  const remaining = appStore.appSettings.imageProfiles
  editingProfileId.value = remaining[0]?.id ?? ''
  fetchedModels.value = []
  message.success(`已删除「${profile.name}」。`)
}

function handleSetActive(): void {
  const profile = editingProfile.value
  if (!profile) return
  appStore.switchImageProfile(profile.id)
  message.success(`已切换到「${profile.name}」。`)
}

async function handleFetchModels(): Promise<void> {
  const profile = editingProfile.value
  if (!profile || isFetchingModels.value) return
  if (!profile.baseUrl.trim()) {
    message.warning('请先填写 Base URL。')
    return
  }
  isFetchingModels.value = true
  try {
    const result = await window.characterArc.fetchImageModels(
      toIpcPayload(appStore.buildImageRequestSettings(profile.id))
    )
    if (!result.success) throw new Error(result.error ?? '获取图片模型列表失败')
    fetchedModels.value = result.result ?? []
    if (fetchedModels.value.length === 0) {
      message.warning('该接口未返回任何可用图片模型，请手动输入模型名称。')
    } else {
      message.success(`获取到 ${fetchedModels.value.length} 个可用模型`)
    }
  } catch (error) {
    fetchedModels.value = []
    message.error(error instanceof Error ? error.message : '获取图片模型列表失败')
  } finally {
    isFetchingModels.value = false
  }
}

function close(): void {
  emit('update:show', false)
}
</script>

<template>
  <n-modal
    :show="props.show"
    preset="card"
    class="image-profile-modal"
    :bordered="false"
    :style="{ width: 'min(720px, calc(100vw - 24px))' }"
    @close="close"
  >
    <div class="image-profile-modal__summary">
      <div>
        <strong>生图渠道配置</strong>
        <p>最多 {{ IMAGE_PROFILE_LIMIT }} 条，全局生效；改动即时保存，可在顶栏快速切换。</p>
      </div>
      <n-button size="tiny" @click="close">完成</n-button>
    </div>

    <div v-if="!profiles.length" class="image-profile-empty">
      还没有任何生图渠道。点右上角「新建渠道」，可从通用模板快速填充。
    </div>

    <template v-else>
      <div class="profile-tabs">
        <div class="profile-tab-list arc-scrollbar">
          <button
            v-for="profile in profiles"
            :key="profile.id"
            type="button"
            class="profile-tab"
            :class="{
              active: editingProfileId === profile.id,
              'is-active-profile': profile.id === appStore.activeImageProfile?.id
            }"
            @click="selectProfile(profile.id)"
          >
            <span class="profile-tab-name">{{ profile.name }}</span>
            <span v-if="profile.id === appStore.activeImageProfile?.id" class="profile-tab-badge">当前</span>
          </button>
        </div>
        <div class="profile-tab-actions">
          <button class="profile-action-btn" type="button" title="新建渠道" :disabled="reachedLimit" @click="handleAddProfile">
            <Plus :size="14" />
          </button>
          <button class="profile-action-btn" type="button" title="复制当前渠道" :disabled="!editingProfile || reachedLimit" @click="handleCopyProfile">
            <Copy :size="14" />
          </button>
          <button
            class="profile-action-btn profile-action-btn--danger"
            type="button"
            title="删除当前渠道"
            :disabled="!editingProfile"
            @click="handleDeleteProfile"
          >
            <Trash2 :size="14" />
          </button>
        </div>
      </div>

      <div v-if="editingProfile" class="profile-editor arc-scrollbar">
        <div class="settings-grid">
          <n-form-item label="渠道名称">
            <n-input
              :value="editingProfile.name"
              placeholder="给这条渠道起个名字"
              @update:value="(value: string) => updateEditingProfile({ name: value })"
            />
          </n-form-item>
          <n-form-item label="通用模板">
            <div class="preset-field">
              <n-select
                :value="null"
                :options="imageProfileTemplateOptions"
                placeholder="选一个模板快速填充"
                @update:value="(value: string) => applyTemplate(value ?? '')"
              />
              <span class="preset-hint">套用模板会覆盖名称 / 协议 / 模型 / Base URL，不会动 API Key。</span>
            </div>
          </n-form-item>
        </div>

        <div class="settings-grid">
          <n-form-item label="接口协议">
            <n-select
              :value="editingProfile.protocol"
              :options="protocolOptions"
              @update:value="(value: ImageProfileProtocol) => updateEditingProfile({ protocol: value })"
            />
          </n-form-item>
          <n-form-item label="API Key">
            <n-input
              type="password"
              show-password-on="click"
              :value="editingProfile.apiKey"
              placeholder="该渠道专用的 API Key"
              @update:value="(value: string) => updateEditingProfile({ apiKey: value })"
            />
          </n-form-item>
        </div>

        <n-form-item label="Base URL">
          <n-input
            :value="editingProfile.baseUrl"
            placeholder="例如：https://api.openai.com/v1"
            @update:value="(value: string) => updateEditingProfile({ baseUrl: value })"
          />
        </n-form-item>

        <n-form-item label="模型名称">
          <div class="model-input-row">
            <n-select
              v-if="fetchedModels.length > 0"
              :value="editingProfile.model"
              :options="modelSelectOptions"
              filterable
              tag
              placeholder="选择或输入图片模型名称"
              @update:value="(value: string) => updateEditingProfile({ model: value })"
            />
            <n-input
              v-else
              :value="editingProfile.model"
              placeholder="例如：gpt-image-1 / nano-banana-fast"
              @update:value="(value: string) => updateEditingProfile({ model: value })"
            />
            <n-button
              quaternary
              class="model-fetch-btn"
              :disabled="isFetchingModels || !editingProfile.baseUrl.trim()"
              @click="handleFetchModels"
            >
              <template #icon>
                <RefreshCw v-if="fetchedModels.length > 0" :size="16" :class="{ 'spin-icon': isFetchingModels }" />
                <Download v-else :size="16" :class="{ 'spin-icon': isFetchingModels }" />
              </template>
            </n-button>
          </div>
        </n-form-item>

        <p class="profile-note">
          模型名称需与服务端一致（例如火山引擎要填带版本后缀的完整 Model ID），否则会返回模型不存在。
        </p>

        <div class="profile-footer">
          <n-button
            size="small"
            :disabled="isEditingActiveProfile"
            @click="handleSetActive"
          >
            <template #icon><Check :size="14" /></template>
            {{ isEditingActiveProfile ? '当前渠道' : '设为当前渠道' }}
          </n-button>
        </div>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.image-profile-modal :deep(.n-card) {
  border-radius: 18px;
  overflow: hidden;
  background: linear-gradient(180deg, color-mix(in srgb, var(--arc-bg-surface) 96%, white 4%) 0%, var(--arc-bg-surface) 100%);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.22);
}

.image-profile-modal :deep(.n-card-header) {
  display: none;
}

.image-profile-modal :deep(.n-card__content) {
  padding: 18px;
}

.image-profile-modal__summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.image-profile-modal__summary strong {
  color: var(--arc-text-primary);
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.image-profile-modal__summary p {
  margin: 4px 0 0;
  color: var(--arc-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.image-profile-empty {
  padding: 28px 18px;
  border: 1px dashed color-mix(in srgb, var(--arc-primary) 18%, var(--arc-border));
  border-radius: 14px;
  background: var(--arc-bg-weak);
  color: var(--arc-text-hint);
  text-align: center;
  font-size: 13px;
}

.profile-tabs {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 14px;
}

.profile-tab-list {
  display: flex;
  flex: 1 1 auto;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.profile-tab {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--arc-border);
  border-radius: 999px;
  background: var(--arc-bg-surface);
  color: var(--arc-text-secondary);
  cursor: pointer;
  font-size: 12px;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

.profile-tab:hover {
  border-color: var(--arc-border-strong);
  color: var(--arc-text-primary);
}

.profile-tab.active {
  border-color: var(--arc-primary);
  background: color-mix(in srgb, var(--arc-primary) 10%, var(--arc-bg-surface));
  color: var(--arc-text-primary);
  font-weight: 650;
}

.profile-tab-badge {
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--arc-primary);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
}

.profile-tab-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
}

.profile-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--arc-border);
  border-radius: 8px;
  background: var(--arc-bg-surface);
  color: var(--arc-text-hint);
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

.profile-action-btn:hover:not(:disabled) {
  border-color: var(--arc-border-strong);
  color: var(--arc-text-primary);
  background: var(--arc-bg-weak);
}

.profile-action-btn--danger:hover:not(:disabled) {
  border-color: #ef4444;
  color: #b91c1c;
}

.profile-action-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.profile-editor {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: min(56vh, 520px);
  overflow-y: auto;
  padding-right: 4px;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 14px;
}

.preset-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}

.preset-hint {
  color: var(--arc-text-hint);
  font-size: 11.5px;
  line-height: 1.5;
}

.model-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.model-input-row :deep(.n-input),
.model-input-row :deep(.n-select) {
  flex: 1 1 auto;
}

.model-fetch-btn {
  flex: 0 0 auto;
}

.profile-note {
  margin: 0;
  padding: 8px 10px;
  border: 1px dashed var(--arc-border-strong);
  border-radius: var(--arc-radius-md);
  color: var(--arc-text-hint);
  font-size: 12px;
  line-height: 1.65;
}

.profile-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 4px;
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (max-width: 640px) {
  .settings-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .image-profile-modal__summary {
    flex-direction: column;
    gap: 8px;
  }
}
</style>
