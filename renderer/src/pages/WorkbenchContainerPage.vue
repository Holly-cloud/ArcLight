<script setup lang="ts">
// v1.25 工作台顶级容器页：占位壳（T03 阶段），详细实现见后续 T03 / T04 / T05 / T06 任务
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const activeTab = computed(() => appStore.workbenchActiveTab)
</script>

<template>
  <section class="workbench-container">
    <header class="workbench-header">
      <h2>工作台</h2>
      <p>跨级 AI 工具容器（T03 占位壳）</p>
    </header>
    <main class="workbench-body">
      <p>当前 Tab: {{ activeTab }}</p>
      <!-- T04 / T05 子视图占位 -->
    </main>
  </section>
</template>

<style scoped>
.workbench-container {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  background: var(--arc-bg-body);
  color: var(--arc-text-primary);
}
.workbench-header {
  padding:
    calc(var(--arc-titlebar-height) + 18px)
    max(20px, calc(var(--arc-window-controls-width) + 18px))
    14px
    20px;
  border-bottom: 1px solid var(--arc-border);
}
.workbench-body {
  padding: 24px;
}
</style>
