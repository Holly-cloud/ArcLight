<script setup lang="ts">
// v1.30.0 章节创作：顶部工具栏新增「导入小说」（打开向导 mode='import'，只负责导入落章节）
// 与「清空小说」（清空当前项目章节 / 小说正文，二次确认，破坏性）。
import { ref } from 'vue'
import { Trash2, Upload } from 'lucide-vue-next'
import { NButton, NPopconfirm, useMessage } from 'naive-ui'
import ChapterWorkspace from '@/components/chapterWorkspace/ChapterWorkspace.vue'
import AssetExtractionWizard from '@/components/assetExtraction/AssetExtractionWizard.vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const message = useMessage()

const importVisible = ref(false)

function openImport(): void {
  importVisible.value = true
}

/** 清空当前项目的章节 / 小说正文（保留角色 / 场景 / 道具等资产）；已由弹窗二次确认。 */
function handleClearNovel(): void {
  appStore.clearProjectNovelChapters()
  message.success('已清空当前项目的章节 / 小说正文')
}
</script>

<template>
  <section class="chapter-studio-page">
    <header class="chapter-studio-toolbar">
      <span class="toolbar-title">{{ appStore.currentProject?.title || '未命名项目' }} · 章节创作</span>
      <div class="toolbar-actions">
        <n-button @click="openImport">
          <template #icon><Upload :size="15" /></template>
          导入小说
        </n-button>
        <n-popconfirm @positive-click="handleClearNovel">
          <template #trigger>
            <n-button>
              <template #icon><Trash2 :size="15" /></template>
              清空小说
            </n-button>
          </template>
          仅清空当前项目的章节 / 小说正文，不可撤销。确定继续？
        </n-popconfirm>
      </div>
    </header>

    <ChapterWorkspace class="chapter-studio-workspace" />

    <AssetExtractionWizard
      :show="importVisible"
      mode="import"
      @update:show="importVisible = $event"
    />
  </section>
</template>

<style scoped>
.chapter-studio-page {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.chapter-studio-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--arc-border);
  background: var(--arc-bg-weak);
  flex: 0 0 auto;
}

.toolbar-title {
  min-width: 0;
  overflow: hidden;
  color: var(--arc-text-primary);
  font-size: 14px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.chapter-studio-workspace {
  flex: 1 1 0;
  min-height: 0;
}
</style>
