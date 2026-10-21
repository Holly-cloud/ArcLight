<script setup lang="ts">
// v1.35.0 Prompt 中心：一屏两栏（左「任务目录」/ 右「prompt 全文」），只读、可复制
// - 任务目录与 prompt 全部来自主进程真实注册表与真实组装链路（代码一改，这里立刻是新的）
// - 顶栏「◈ 用当前项目试拼」一键用当前项目通用上下文拼一次；再点恢复骨架
// - 不调用模型、不发网络、不花钱；仅 Naive UI + lucide；颜色全走 --arc-* 令牌
import { computed, onMounted, ref, watch } from 'vue'
import { ArrowLeft, Copy, Search, Sparkles } from 'lucide-vue-next'
import { NButton, NEmpty, NInput, NSpin, useMessage } from 'naive-ui'
import { useAppStore } from '@/stores/app'
import { buildProjectWritingStyleContext } from '@/features/writingStyles/presets'
import type { AiPromptCatalogEntry, AiPromptPreviewResult } from '@shared/ipc-types'
import {
  PREVIEW_SCOPE_NOTE,
  buildCatalogItems,
  buildCatalogMetaLine,
  filterCatalogItems
} from '@/features/promptCenter/promptCenterModel'
import { buildProjectPreviewContext } from '@/features/promptCenter/previewContext'

const appStore = useAppStore()
const message = useMessage()

// ── 任务目录 ──
const entries = ref<AiPromptCatalogEntry[]>([])
const catalogLoading = ref(false)
const catalogError = ref('')
const query = ref('')
const selectedTask = ref('')

const items = computed(() => buildCatalogItems(entries.value))
const visibleItems = computed(() => filterCatalogItems(items.value, query.value))
const selectedItem = computed(() => items.value.find((item) => item.task === selectedTask.value) ?? null)
const metaLine = computed(() => (selectedItem.value ? buildCatalogMetaLine(selectedItem.value) : ''))

// ── prompt 预览 ──
const preview = ref<AiPromptPreviewResult | null>(null)
const previewLoading = ref(false)
const previewError = ref('')
/** 是否处于「用当前项目试拼」模式 */
const projectPreview = ref(false)

async function loadCatalog(): Promise<void> {
  catalogLoading.value = true
  catalogError.value = ''
  try {
    const response = await window.clytie.listAiPromptCatalog()
    if (!response.success || !response.entries) {
      throw new Error(response.error ?? '读取任务目录失败')
    }
    entries.value = response.entries
    if (!selectedTask.value && response.entries.length) {
      selectedTask.value = response.entries[0].task
    }
  } catch (error) {
    catalogError.value = error instanceof Error ? error.message : '读取任务目录失败'
  } finally {
    catalogLoading.value = false
  }
}

/** 组装「当前项目」的通用试拼上下文（不拉章节正文，避免副作用与卡顿） */
function buildCurrentProjectContext(): Record<string, unknown> {
  const project = appStore.currentProject
  const style = buildProjectWritingStyleContext(project)
  return buildProjectPreviewContext({
    projectId: project?.id,
    projectTitle: project?.title,
    projectGenre: project?.genre,
    writingStyleLabel: style?.label,
    writingStylePrompt: style?.prompt,
    characters: appStore.characters,
    organizations: appStore.organizations,
    characterRelationships: appStore.characterRelationships,
    organizationMemberships: appStore.organizationMemberships,
    worldviewEntries: appStore.worldviewEntries,
    outlineItems: appStore.outlineItems,
    inspirationEntries: appStore.inspirationEntries,
    chapters: appStore.chapters
  })
}

async function renderPreview(): Promise<void> {
  const task = selectedTask.value
  if (!task) return
  previewLoading.value = true
  previewError.value = ''
  try {
    const payload: { task: string; context?: Record<string, unknown> } = { task }
    if (projectPreview.value) payload.context = buildCurrentProjectContext()
    const response = await window.clytie.renderAiPromptPreview(payload)
    if (!response.success || !response.preview) {
      throw new Error(response.error ?? '拼装 prompt 失败')
    }
    preview.value = response.preview
  } catch (error) {
    preview.value = null
    previewError.value = error instanceof Error ? error.message : '拼装 prompt 失败'
  } finally {
    previewLoading.value = false
  }
}

async function toggleProjectPreview(): Promise<void> {
  projectPreview.value = !projectPreview.value
  await renderPreview()
}

async function copyText(text: string, label: string): Promise<void> {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    message.success(`${label} 已复制`)
  } catch {
    message.error('复制失败，请手动选择文本复制')
  }
}

watch(selectedTask, () => {
  void renderPreview()
})

onMounted(async () => {
  await loadCatalog()
  // 目录为空（例如加载失败）时也要给出反馈，避免右侧空白
  if (selectedTask.value) void renderPreview()
})
</script>

<template>
  <section class="prompt-center-page">
    <header class="pc-topbar">
      <n-button quaternary circle title="返回工作台" @click="appStore.backToWorkbench()">
        <template #icon><ArrowLeft :size="18" /></template>
      </n-button>
      <span class="pc-title">Prompt 中心</span>
      <span class="pc-subtitle">只读查看各功能发给模型的 prompt（不调用模型、不花钱）</span>
      <span class="pc-spacer" />
      <n-input v-model:value="query" class="pc-search" placeholder="搜索任务…" clearable>
        <template #prefix><Search :size="15" /></template>
      </n-input>
      <n-button
        size="small"
        :type="projectPreview ? 'primary' : 'default'"
        :loading="previewLoading"
        @click="toggleProjectPreview"
      >
        <template #icon><Sparkles :size="14" /></template>
        {{ projectPreview ? '恢复骨架' : '用当前项目试拼' }}
      </n-button>
    </header>

    <div class="pc-body">
      <!-- 左：任务目录 -->
      <aside class="pc-panel pc-list">
        <div class="pc-list-scroll arc-scrollbar">
          <button
            v-for="item in visibleItems"
            :key="item.task"
            type="button"
            class="pc-list-item"
            :class="{ active: item.task === selectedTask }"
            @click="selectedTask = item.task"
          >
            <span class="pc-list-name">{{ item.label }}</span>
            <small class="pc-list-sub">{{ item.task }}</small>
          </button>
          <n-empty v-if="!catalogLoading && visibleItems.length === 0" class="pc-list-empty" description="没有匹配的任务" />
        </div>
      </aside>

      <!-- 右：prompt 全文 -->
      <main class="pc-panel pc-detail">
        <div class="pc-detail-scroll arc-scrollbar">
          <p v-if="catalogError" class="pc-error">{{ catalogError }}</p>
          <n-spin v-else-if="catalogLoading && !preview" size="small" />
          <template v-else>
            <p class="pc-meta">{{ metaLine }}</p>
            <p v-if="previewError" class="pc-error">{{ previewError }}</p>
            <template v-else-if="preview">
              <section class="pc-block">
                <div class="pc-block__head">
                  <span class="pc-block__label">SYSTEM</span>
                  <n-button size="tiny" @click="copyText(preview.system, 'SYSTEM')">
                    <template #icon><Copy :size="12" /></template>
                    复制
                  </n-button>
                </div>
                <pre class="pc-block__text">{{ preview.system }}</pre>
              </section>
              <p v-for="note in preview.notes" :key="note" class="pc-note">{{ note }}</p>

              <section class="pc-block">
                <div class="pc-block__head">
                  <span class="pc-block__label">USER</span>
                  <n-button size="tiny" @click="copyText(preview.user, 'USER')">
                    <template #icon><Copy :size="12" /></template>
                    复制
                  </n-button>
                </div>
                <pre class="pc-block__text">{{ preview.user }}</pre>
              </section>
            </template>
            <p v-else class="pc-empty">请选择左侧任务</p>
          </template>
          <p class="pc-foot">{{ PREVIEW_SCOPE_NOTE }}</p>
        </div>
      </main>
    </div>
  </section>
</template>

<style scoped>
.prompt-center-page {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  background: var(--arc-bg-body);
}

.pc-topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 56px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--arc-border);
  background: var(--arc-bg-surface);
  padding: 0 20px;
}

.pc-title {
  color: var(--arc-text-primary);
  font-size: 15px;
  font-weight: 680;
}

.pc-subtitle {
  color: var(--arc-text-hint);
  font-size: 12.5px;
}

.pc-spacer {
  flex: 1;
}

.pc-search {
  width: 220px;
}

.pc-body {
  display: grid;
  min-height: 0;
  flex: 1;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 14px;
  padding: 14px 20px;
}

.pc-panel {
  display: flex;
  min-height: 0;
  flex-direction: column;
  border: 1px solid var(--arc-border);
  border-radius: var(--arc-radius-lg);
  background: var(--arc-bg-surface);
}

.pc-list {
  padding: 10px 8px;
}

.pc-list-scroll {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}

.pc-list-item {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  border: 1px solid transparent;
  border-radius: var(--arc-radius-md);
  background: transparent;
  padding: 7px 9px;
  text-align: left;
  cursor: pointer;
  transition: background 0.14s ease, border-color 0.14s ease;
}

.pc-list-item:hover {
  background: var(--arc-bg-surface-hover);
}

.pc-list-item.active {
  border-color: var(--arc-primary);
  background: var(--arc-primary-soft);
}

.pc-list-name {
  overflow: hidden;
  color: var(--arc-text-primary);
  font-size: 13.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pc-list-sub {
  overflow: hidden;
  max-width: 100%;
  color: var(--arc-text-hint);
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pc-list-empty {
  margin-top: 20px;
}

.pc-detail {
  padding: 0;
}

.pc-detail-scroll {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 16px 18px;
}

.pc-meta {
  margin: 0 0 12px;
  color: var(--arc-text-hint);
  font-size: 12.5px;
}

.pc-block {
  border: 1px solid var(--arc-border);
  border-radius: var(--arc-radius-md);
  margin-bottom: 12px;
}

.pc-block__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px solid var(--arc-border);
  padding: 6px 10px;
}

.pc-block__label {
  color: var(--arc-text-secondary);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.08em;
}

.pc-block__text {
  margin: 0;
  max-height: 40vh;
  overflow: auto;
  color: var(--arc-text-primary);
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1.7;
  padding: 10px 12px;
  white-space: pre-wrap;
  word-break: break-word;
}

.pc-note {
  margin: -4px 0 12px;
  color: var(--arc-text-hint);
  font-size: 12px;
}

.pc-error {
  margin: 0 0 12px;
  color: var(--arc-danger);
  font-size: 12.5px;
}

.pc-empty {
  color: var(--arc-text-hint);
  font-size: 13px;
}

.pc-foot {
  margin: 10px 0 0;
  color: var(--arc-text-hint);
  font-size: 12px;
  line-height: 1.7;
}

@media (max-width: 1100px) {
  .prompt-center-page {
    height: auto;
    overflow: visible;
  }

  .pc-body {
    grid-template-columns: 1fr;
    padding: 12px 14px;
  }

  .pc-panel {
    min-height: 240px;
  }

  .pc-list-scroll,
  .pc-detail-scroll {
    overflow: visible;
  }
}
</style>
