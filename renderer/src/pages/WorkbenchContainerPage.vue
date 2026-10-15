<script setup lang="ts">
// v1.25 工作台顶级容器页：双 Tab + Header + AI 占位 + 空态
// - 项目内 Tab (T04)：场景 / 道具子区段（ScenePropSection）
// - 全局 Tab (T05)：参考作品库（复用 KCP）+ 改编记录（AdaptationRun 列表）
// - Header (T06)：P1 AI 占位按钮（disabled + tooltip）
// - 未选项目空态 (T06)：NEmpty + 前往项目中心 / 新建项目
import { computed, h } from 'vue'
import { ChevronLeft, LayoutGrid, Sparkles } from 'lucide-vue-next'
import {
  NAlert,
  NBadge,
  NButton,
  NEmpty,
  NList,
  NListItem,
  NPopover,
  NScrollbar,
  NTabPane,
  NTabs,
  NTag
} from 'naive-ui'
import type { SelectOption } from 'naive-ui'
import { useAppStore } from '@/stores/app'
import ScenePropSection from '@/components/ScenePropSection.vue'
import KnowledgeCenterPanel from '@/components/KnowledgeCenterPanel.vue'
import type { AdaptationRun, AdaptationStageId, AdaptationStageState, ProjectSummary } from '@/types/app'

const appStore = useAppStore()

// ── Tab 状态（双向绑定到 store） ──
const activeTab = computed({
  get: () => appStore.workbenchActiveTab,
  set: (value) => {
    appStore.workbenchActiveTab = value
  }
})

// ── 项目选择器（项目内 Tab） ──
const projectOptions = computed<SelectOption[]>(() =>
  appStore.projects.map((project) => ({
    label: project.title || '未命名作品',
    value: project.id
  }))
)
const selectedProjectId = computed({
  get: () => appStore.selectedProjectId,
  set: (value: string | null) => {
    if (value) appStore.openProject(value)
  }
})
const hasProject = computed(() => Boolean(appStore.selectedProjectId))

// ── 计数（Header 与 Badge 共用） ──
// 工作台项目内 Tab 的 Badge = 场景数 + 道具数；全局 Tab Badge = 参考作品数
const projectTabBadge = computed(() => {
  if (!hasProject.value) return 0
  return appStore.sceneLocations.length + appStore.propItems.length
})
const globalTabBadge = computed(() => appStore.referenceWorks.length)

// ── 全局 Tab：跨项目聚合 adaptationRuns ──
const STAGE_LABEL: Record<AdaptationStageId, string> = {
  'lead': '主角候选',
  'stages': '剧情阶段',
  'plot-cards': '剧情卡',
  'characters': '人物资产',
  'tone': '全书基调'
}
const STATUS_LABEL: Record<AdaptationRun['status'], { label: string; tone: 'default' | 'info' | 'success' | 'warning' | 'error' }> = {
  draft: { label: '草稿', tone: 'default' },
  running: { label: '进行中', tone: 'info' },
  completed: { label: '已完成', tone: 'success' },
  archived: { label: '已归档', tone: 'warning' }
}

interface GlobalRunRow {
  run: AdaptationRun
  project: ProjectSummary | null
  projectId: string
  projectTitle: string
}

const globalRuns = computed<GlobalRunRow[]>(() => {
  const rows: GlobalRunRow[] = []
  for (const project of appStore.projects) {
    const projectWorkspace = appStore.adaptationRunsForProject(project.id)
    for (const run of projectWorkspace) {
      if (run.status === 'archived') continue
      rows.push({ run, project, projectId: project.id, projectTitle: project.title || '未命名作品' })
    }
  }
  return rows.sort((a, b) => {
    const aTs = a.run.updatedAt || a.run.createdAt || ''
    const bTs = b.run.updatedAt || b.run.createdAt || ''
    return bTs.localeCompare(aTs)
  })
})

const runningCount = computed(() => globalRuns.value.filter((row) => row.run.status === 'running').length)
const completedCount = computed(() => globalRuns.value.filter((row) => row.run.status === 'completed').length)

function resolveActiveStageLabel(states: AdaptationStageState[]): string {
  const firstActive = states.find((state) => state.status === 'running' || state.status === 'failed' || state.status === 'stale')
  if (firstActive) return STAGE_LABEL[firstActive.id]
  return '等待中'
}

function openAdaptationRun(row: GlobalRunRow): void {
  if (row.projectId && row.projectId !== appStore.selectedProjectId) {
    appStore.openProject(row.projectId)
  }
  appStore.openDeconstructionAdaptation(row.run.referenceWorkId)
}

function openProjectCenter(): void {
  appStore.backToProjects()
}

function openWizard(): void {
  appStore.openWizard()
}

function switchProject(projectId: string): void {
  appStore.openProject(projectId)
}
</script>

<template>
  <section class="workbench-container">
    <header class="workbench-header">
      <NButton
        quaternary
        circle
        size="medium"
        :render-icon="() => h(ChevronLeft, { size: 18 })"
        aria-label="返回项目中心"
        class="workbench-back-button"
        @click="openProjectCenter"
      />
      <div class="workbench-title-block">
        <span class="workbench-kicker">跨级 AI 工具容器</span>
        <div class="workbench-title-row">
          <LayoutGrid :size="22" class="workbench-title-icon" />
          <h2 class="workbench-title">工作台</h2>
        </div>
        <p class="workbench-subtitle">在「项目内」管场景/道具，在「全局」管拆书知识库与改编记录。</p>
      </div>
      <div class="workbench-header-actions">
        <NPopover trigger="hover" placement="bottom-end">
          <template #trigger>
            <NButton
              v-if="activeTab === 'project'"
              disabled
              size="small"
              :render-icon="() => h(Sparkles, { size: 14 })"
            >
              AI 批量生成
            </NButton>
            <NButton
              v-else
              disabled
              size="small"
              :render-icon="() => h(Sparkles, { size: 14 })"
            >
              AI 重跑
            </NButton>
          </template>
          <span>将在 v1.25.1 上线 · 当前为 P1 占位</span>
        </NPopover>
      </div>
    </header>

    <NTabs
      v-model:value="activeTab"
      type="line"
      animated
      class="workbench-tabs"
    >
      <NTabPane name="project">
        <template #tab>
          <span class="workbench-tab-label">项目内</span>
          <NBadge
            v-if="hasProject"
            :value="projectTabBadge"
            :max="99"
            class="workbench-tab-badge"
          />
        </template>

        <div class="workbench-tab-body">
          <div class="workbench-toolbar">
            <div class="project-picker">
              <label class="toolbar-label">当前项目</label>
              <n-select
                v-model:value="selectedProjectId"
                :options="projectOptions"
                placeholder="选择一个项目"
                size="small"
                clearable
                filterable
                :disabled="projectOptions.length === 0"
                style="min-width: 220px;"
                @update:value="switchProject"
              />
            </div>
            <div v-if="hasProject" class="toolbar-stats">
              <NTag :bordered="false" size="small" type="info">场景 {{ appStore.sceneLocations.length }}</NTag>
              <NTag :bordered="false" size="small" type="info">道具 {{ appStore.propItems.length }}</NTag>
            </div>
          </div>

          <ScenePropSection v-if="hasProject" class="workbench-section-content" />
          <NEmpty v-else description="请先选择一个项目" class="workbench-empty">
            <template #extra>
              <NButton type="primary" @click="openProjectCenter">前往项目中心</NButton>
              <NButton @click="openWizard">新建项目</NButton>
            </template>
          </NEmpty>
        </div>
      </NTabPane>

      <NTabPane name="global">
        <template #tab>
          <span class="workbench-tab-label">全局</span>
          <NBadge :value="globalTabBadge" :max="99" class="workbench-tab-badge" />
        </template>

        <div class="workbench-tab-body workbench-tab-body--global">
          <NScrollbar class="workbench-global-scroll">
            <section class="workbench-section">
              <div class="section-title-row">
                <h3 class="section-title">参考作品库</h3>
                <div class="section-stat">
                  <NTag :bordered="false" size="small" type="info">{{ appStore.referenceWorks.length }} 部</NTag>
                </div>
              </div>
              <p class="section-hint">导入参考小说、深度拆书、风格指纹提取与「新建改编 →」入口。</p>
              <KnowledgeCenterPanel class="workbench-section-content" />
            </section>

            <section class="workbench-section">
              <div class="section-title-row">
                <h3 class="section-title">改编记录</h3>
                <div class="section-stat">
                  <NTag :bordered="false" size="small" type="info">进行中 {{ runningCount }}</NTag>
                  <NTag :bordered="false" size="small" type="success">已完成 {{ completedCount }}</NTag>
                </div>
              </div>
              <p class="section-hint">点击进入文章拆解改编页（4 阶段 AI 流水线 + 18 类质量门禁）。</p>
              <NList v-if="globalRuns.length > 0" bordered class="workbench-runs-list">
                <NListItem v-for="row in globalRuns" :key="row.run.id">
                  <div class="run-row" @click="openAdaptationRun(row)">
                    <div class="run-info">
                      <strong class="run-title">{{ row.run.sourceTitle || '未命名 run' }}</strong>
                      <span class="run-meta">
                        {{ row.projectTitle }} · {{ resolveActiveStageLabel(row.run.stageStates) }}
                      </span>
                    </div>
                    <NTag :type="STATUS_LABEL[row.run.status].tone" size="small" round :bordered="false">
                      {{ STATUS_LABEL[row.run.status].label }}
                    </NTag>
                  </div>
                </NListItem>
              </NList>
              <NEmpty v-else description="还没有改编记录。先在「参考作品库」里点「新建改编 →」。" />
            </section>

            <NAlert
              v-if="globalRuns.length === 0"
              type="info"
              :show-icon="true"
              title="从哪里开始？"
            >
              导入一部参考小说 → 等 AI 完成拆书 → 点击「新建改编 →」开始一次 run。已完成的 run 会出现在下方「改编记录」里。
            </NAlert>
          </NScrollbar>
        </div>
      </NTabPane>
    </NTabs>
  </section>
</template>

<style scoped>
.workbench-container {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--arc-primary) 8%, transparent) 0%, transparent 30%),
    var(--arc-bg-body);
  color: var(--arc-text-primary);
  overflow: hidden;
}

.workbench-header {
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  gap: 14px;
  padding:
    calc(var(--arc-titlebar-height) + 18px)
    max(20px, calc(var(--arc-window-controls-width) + 18px))
    12px
    24px;
  border-bottom: 1px solid var(--arc-border);
  background: var(--arc-bg-surface);
}

.workbench-back-button {
  flex-shrink: 0;
  margin-bottom: 6px;
}

.workbench-title-block {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.workbench-kicker {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--arc-primary) 10%, transparent);
  color: var(--arc-primary);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  padding: 4px 10px;
  text-transform: uppercase;
}

.workbench-title-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.workbench-title-icon {
  color: var(--arc-primary);
}

.workbench-title {
  margin: 0;
  color: var(--arc-text-primary);
  font-size: 24px;
  font-weight: 760;
  letter-spacing: -0.04em;
}

.workbench-subtitle {
  margin: 0;
  color: var(--arc-text-secondary);
  font-size: 13px;
}

.workbench-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  margin-left: auto;
}

.workbench-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0 24px;
}

.workbench-tabs :deep(.n-tabs-nav) {
  padding: 0;
  background: transparent;
}

.workbench-tabs :deep(.n-tabs-tab) {
  font-size: 14px;
  font-weight: 600;
  padding: 12px 4px;
}

.workbench-tabs :deep(.n-tabs-tab .workbench-tab-label) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.workbench-tab-badge {
  display: inline-flex;
}

.workbench-tab-body {
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
  flex-direction: column;
  padding: 16px 0 24px;
  gap: 14px;
  overflow: hidden;
}

.workbench-tab-body--global {
  padding: 16px 0 0;
  overflow: hidden;
}

.workbench-global-scroll {
  flex: 1;
  min-height: 0;
}

.workbench-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.project-picker {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.toolbar-label {
  color: var(--arc-text-hint);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.toolbar-stats {
  display: inline-flex;
  gap: 6px;
  flex-wrap: wrap;
}

.workbench-section-content {
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.workbench-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.workbench-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 4px 28px;
}

.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.section-title {
  margin: 0;
  color: var(--arc-text-primary);
  font-size: 18px;
  font-weight: 720;
  letter-spacing: -0.02em;
}

.section-stat {
  display: inline-flex;
  gap: 6px;
}

.section-hint {
  margin: 0;
  color: var(--arc-text-secondary);
  font-size: 13px;
}

.workbench-runs-list {
  border-radius: var(--arc-radius-lg);
  background: var(--arc-bg-surface);
}

.run-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  cursor: pointer;
  width: 100%;
}

.run-row:hover {
  color: var(--arc-primary);
}

.run-info {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.run-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--arc-text-primary);
}

.run-meta {
  color: var(--arc-text-secondary);
  font-size: 12px;
}

@media (max-width: 860px) {
  .workbench-header {
    flex-direction: column;
    align-items: flex-start;
    padding:
      calc(var(--arc-titlebar-height) + 16px)
      max(14px, calc(var(--arc-window-controls-width) + 14px))
      12px
      16px;
  }
  .workbench-tabs {
    padding: 0 16px;
  }
}
</style>
