<script setup lang="ts">
// v1.37.0 顶栏生图渠道切换器：与 TitlebarModelSwitcher 同构
// 图片: [渠道下拉] | [模型下拉] [刷新] [配置]
import { computed, ref } from 'vue'
import { NSelect } from 'naive-ui'
import { RefreshCw, Settings } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import { toIpcPayload } from '@/utils/ipcPayload'
import ImageProfileConfigModal from './ImageProfileConfigModal.vue'

const appStore = useAppStore()
const isFetchingModels = ref(false)
const fetchedModels = ref<Array<{ id: string }>>([])
const configVisible = ref(false)

const hasProfiles = computed(() => appStore.appSettings.imageProfiles.length > 0)

const profileOptions = computed(() =>
  appStore.appSettings.imageProfiles.map((profile) => ({ label: profile.name, value: profile.id }))
)

const modelOptions = computed(() => {
  if (fetchedModels.value.length > 0) {
    return fetchedModels.value.map((model) => ({ label: model.id, value: model.id }))
  }
  const current = appStore.activeImageProfile?.model ?? ''
  return current ? [{ label: current, value: current }] : []
})

// 读「实际生效」那条的 id，而不是可能已经失效的 activeImageProfileId，否则下拉会显示空白
const activeProfileId = computed({
  get: () => appStore.activeImageProfile?.id ?? '',
  set: (id: string) => appStore.switchImageProfile(id)
})

const activeModel = computed({
  get: () => appStore.activeImageProfile?.model ?? '',
  set: (model: string) => appStore.updateActiveImageProfileModel(model)
})

async function handleFetchModels(): Promise<void> {
  if (isFetchingModels.value) return
  isFetchingModels.value = true
  try {
    const result = await window.clytie.fetchImageModels(toIpcPayload(appStore.buildImageRequestSettings()))
    if (result.success && result.result) {
      fetchedModels.value = result.result
    }
  } catch {
    // 拉取失败时保持手输模型名可用，不打断顶栏
  } finally {
    isFetchingModels.value = false
  }
}
</script>

<template>
  <div class="titlebar-switcher">
    <span class="switcher-label">图片:</span>
    <template v-if="hasProfiles">
      <n-select
        :value="activeProfileId"
        :options="profileOptions"
        size="tiny"
        class="switcher-profile"
        :consistent-menu-width="false"
        @update:value="(v: string) => { activeProfileId = v; fetchedModels = [] }"
      />
      <span class="switcher-sep" />
      <n-select
        :value="activeModel"
        :options="modelOptions"
        size="tiny"
        class="switcher-model"
        filterable
        tag
        :consistent-menu-width="false"
        @update:value="(v: string) => { activeModel = v }"
      />
      <button
        class="switcher-refresh"
        type="button"
        title="刷新图片模型列表"
        :disabled="isFetchingModels"
        @click="handleFetchModels"
      >
        <RefreshCw :size="13" :class="{ spinning: isFetchingModels }" />
      </button>
    </template>
    <span v-else class="switcher-empty">未配置</span>
    <button
      class="switcher-config"
      type="button"
      title="管理生图渠道"
      @click="configVisible = true"
    >
      <Settings :size="13" />
      <span>配置</span>
    </button>
  </div>

  <ImageProfileConfigModal
    v-if="configVisible"
    :show="configVisible"
    @update:show="(value: boolean) => { configVisible = value }"
  />
</template>

<style scoped>
.titlebar-switcher {
  display: flex;
  align-items: center;
  gap: 6px;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

.switcher-label {
  color: var(--arc-text-hint);
  font-size: 11px;
  font-weight: 600;
  margin-right: 2px;
  user-select: none;
}

.switcher-profile {
  width: 110px;
}

.switcher-model {
  width: 140px;
}

.switcher-empty {
  color: var(--arc-text-hint);
  font-size: 11px;
}

.switcher-sep {
  width: 1px;
  height: 16px;
  background: var(--arc-border);
  margin: 0 2px;
}

.switcher-refresh,
.switcher-config {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 26px;
  border: 1px solid var(--arc-border);
  border-radius: 6px;
  background: var(--arc-bg-surface);
  color: var(--arc-text-hint);
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

.switcher-refresh {
  width: 26px;
}

.switcher-config {
  gap: 6px;
  padding: 0 10px;
  font-size: 11px;
  font-weight: 600;
}

.switcher-refresh:hover,
.switcher-config:hover {
  border-color: var(--arc-border-strong);
  color: var(--arc-text-primary);
  background: var(--arc-bg-weak);
}

.switcher-refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
