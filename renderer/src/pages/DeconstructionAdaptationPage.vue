<script setup lang="ts">
/**
 * 文章拆解改编页（DeconstructionAdaptationPage.vue）
 * - 4 阶段串行 + 4 子视图切换 + Sticky Toolbar（IssuesBanner + 重跑当前阶段 + 存草稿）
 * - 入口依赖 store.pendingAdaptationReferenceWorkId（来自 KnowledgeCenterPanel "新建改编 →"）
 * - URL query 在项目里通过 pinia 视图切换替代；缺 referenceWorkId 给 NEmpty 错误页
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ArrowLeft, ChevronRight, Lock, RefreshCcw, Save } from 'lucide-vue-next'
import { NButton, NCard, NEmpty, NProgress, NSpace, NSpin, NTag, useMessage } from 'naive-ui'
import { useAppStore } from '@/stores/app'
import { ADAPTATION_STAGE_LABELS, ADAPTATION_STAGE_TOKEN, ADAPTATION_STAGE_IDS } from '@/features/adaptation/types'
import type { AdaptationStageId, AdaptationRun } from '@/types/app'
import IssuesBanner from '@/features/adaptation/components/IssuesBanner.vue'
import LeadConfirmationView from '@/features/adaptation/views/LeadConfirmationView.vue'
import StageMappingView from '@/features/adaptation/views/StageMappingView.vue'
import PlotCardsView from '@/features/adaptation/views/PlotCardsView.vue'
import CharacterBibleView from '@/features/adaptation/views/CharacterBibleView.vue'
import { filterIssuesByStage, validateAdaptationRun } from '@/features/adaptation/validateAdaptationRun'

const appStore = useAppStore()
const message = useMessage()

const referenceWorkId = computed(() => appStore.pendingAdaptationReferenceWorkId)
const referenceWork = computed(() => {
  const id = referenceWorkId.value
  if (!id) return null
  return appStore.referenceWorks.find((work) => work.id === id) ?? null
})

const currentRun = computed<AdaptationRun | null>(() => {
  const id = referenceWorkId.value
  if (!id) return null
  return appStore.adaptationRunForReference(id)
})

const stageStates = computed(() => {
  const run = currentRun.value
  if (!run || !Array.isArray(run.stageStates) || run.stageStates.length === 0) return []
  return run.stageStates
})

const activeStage = computed<AdaptationStageId>(() => currentRun.value?.activeStage ?? 'lead')

const coveragePercent = computed(() => {
  const run = currentRun.value
  if (!run || !Array.isArray(run.plotCards) || run.plotCards.length === 0) return 0
  const ranges = run.plotCards
    .filter((card) => card.status !== 'rejected' && card.reuseMode !== 'omit' && card.reuseMode !== 'merge' && card.protagonistRelation !== 'side-branch')
    .map((card) => ({ start: card.sourceChapterStart, end: card.sourceChapterEnd }))
  if (ranges.length === 0) return 0
  const sorted = [...ranges].sort((left, right) => left.start - right.start)
  let covered = 0
  let cursor = sorted[0].start
  let end = sorted[0].end
  for (let i = 1; i < sorted.length; i += 1) {
    const next = sorted[i]
    if (next.start <= end + 1) {
      end = Math.max(end, next.end)
    } else {
      covered += end - cursor + 1
      cursor = next.start
      end = next.end
    }
  }
  covered += end - cursor + 1
  return Math.max(0, Math.min(100, Math.round((covered / Math.max(1, run.sourceChapterCount)) * 100)))
})

const stageIssues = computed(() => {
  const run = currentRun.value
  if (!run) return []
  const { issues } = validateAdaptationRun(run)
  return filterIssuesByStage(issues, activeStage.value)
})

const isReady = ref(false)

onMounted(() => {
  isReady.value = true
})

watch(referenceWorkId, (next) => {
  if (!next) return
  const existing = appStore.adaptationRunForReference(next)
  if (!existing) {
    appStore.createAdaptationRun({
      referenceWorkId: next,
      sourceTitle: referenceWork.value?.title ?? '未命名参考作品'
    })
  }
})

function back(): void {
  appStore.closeDeconstructionAdaptation()
}

function selectStage(stageId: AdaptationStageId): void {
  const run = currentRun.value
  if (!run) return
  // locked 阶段给提示
  const state = stageStates.value.find((s) => s.id === stageId)
  if (state && state.status === 'locked') {
    message.warning('请先完成上一步')
    return
  }
  appStore.setActiveAdaptationStage(run.id, stageId)
}

function isLocked(stageId: AdaptationStageId): boolean {
  const state = stageStates.value.find((s) => s.id === stageId)
  return state ? state.status === 'locked' : stageId !== 'lead'
}

function statusTone(stageId: AdaptationStageId): 'default' | 'success' | 'warning' | 'error' {
  const state = stageStates.value.find((s) => s.id === stageId)
  if (!state) return stageId === 'lead' ? 'success' : 'default'
  if (state.status === 'completed') return 'success'
  if (state.status === 'running') return 'warning'
  if (state.status === 'failed') return 'error'
  return 'default'
}

async function persistDraft(): Promise<void> {
  await appStore.persistWorkspace()
  message.success('当前改编草稿已保存')
}

const stageProgress = computed(() => {
  let completed = 0
  for (const state of stageStates.value) {
    if (state.status === 'completed') completed += 1
  }
  return Math.round((completed / ADAPTATION_STAGE_IDS.length) * 100)
})
</script>

<template>
  <section class="deconstruction-adaptation">
    <n-spin :show="!isReady">
      <template v-if="!referenceWorkId">
        <n-empty description="缺少 referenceWorkId。请从拆书知识库选择参考作品后再次进入本页。">
          <template #extra>
            <n-button @click="back">返回拆书知识库</n-button>
          </template>
        </n-empty>
      </template>

      <template v-else-if="!currentRun">
        <n-empty description="未找到对应改编运行，正在初始化…">
          <template #extra>
            <n-button @click="back">返回</n-button>
          </template>
        </n-empty>
      </template>

      <template v-else>
        <!-- Header -->
        <header class="deconstruction-adaptation-header">
          <div class="header-left">
            <n-button tertiary circle @click="back" aria-label="返回拆书知识库">
              <template #icon><ArrowLeft :size="16" /></template>
            </n-button>
            <div class="header-titles">
              <strong>《{{ currentRun.sourceTitle }}》文章拆解改编</strong>
              <span>
                目标集数 {{ currentRun.targetEpisodeCount }} · 模式 忠实改编
              </span>
            </div>
          </div>
          <div class="header-right">
            <n-tag :bordered="false" type="info">
              进度 {{ stageProgress }}%
            </n-tag>
            <n-tag :bordered="false" type="success">
              覆盖率 {{ coveragePercent }}%
            </n-tag>
            <n-button tertiary @click="persistDraft">
              <template #icon><Save :size="14" /></template>
              存草稿
            </n-button>
          </div>
        </header>

        <!-- 4 阶段进度条 -->
        <div class="deconstruction-adaptation-stages">
          <button
            v-for="(stageId, index) in ADAPTATION_STAGE_IDS"
            :key="stageId"
            type="button"
            class="stage-chip"
            :class="{
              'is-active': activeStage === stageId,
              'is-locked': isLocked(stageId)
            }"
            :disabled="isLocked(stageId)"
            @click="selectStage(stageId)"
          >
            <span class="stage-index">{{ index + 1 }}</span>
            <span class="stage-label">{{ ADAPTATION_STAGE_LABELS[stageId] }}</span>
            <n-tag v-if="isLocked(stageId)" :bordered="false" size="tiny" type="default">
              <Lock :size="10" /> 锁定
            </n-tag>
            <n-tag v-else :bordered="false" size="tiny" :type="statusTone(stageId)">
              <ChevronRight :size="10" />
            </n-tag>
          </button>
        </div>

        <!-- Sticky Toolbar：IssuesBanner + 重跑当前阶段 -->
        <div class="deconstruction-adaptation-toolbar">
          <IssuesBanner
            :issues="stageIssues"
            @jump-issue="(code) => message.info(`定位问题：${code}`)"
          />
          <n-button
            type="primary"
            secondary
            @click="message.info(`重跑当前阶段（${activeStage}）：已标记后续阶段 stale`)"
          >
            <template #icon><RefreshCcw :size="14" /></template>
            重跑当前阶段
          </n-button>
        </div>

        <!-- 子视图切换区 -->
        <div class="deconstruction-adaptation-body">
          <LeadConfirmationView v-if="activeStage === 'lead'" :run="currentRun" />
          <StageMappingView v-else-if="activeStage === 'stages'" :run="currentRun" />
          <PlotCardsView v-else-if="activeStage === 'plot-cards'" :run="currentRun" />
          <CharacterBibleView v-else-if="activeStage === 'characters' || activeStage === 'tone'" :run="currentRun" />
        </div>

        <!-- 状态机调试占位（开发可见） -->
        <n-card size="small" class="deconstruction-adaptation-debug" title="阶段状态机">
          <n-space size="small">
            <n-tag v-for="state in stageStates" :key="state.id" :bordered="false" :type="statusTone(state.id)">
              {{ state.id }} · {{ state.status }}
            </n-tag>
          </n-space>
          <n-progress :percentage="stageProgress" :show-indicator="false" />
        </n-card>
      </template>
    </n-spin>
  </section>
</template>

<style scoped>
.deconstruction-adaptation {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.deconstruction-adaptation-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-titles {
  display: flex;
  flex-direction: column;
}

.header-titles strong {
  color: var(--arc-text-primary);
  font-size: 15px;
}

.header-titles span {
  color: var(--arc-text-secondary);
  font-size: 12px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.deconstruction-adaptation-stages {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.stage-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: var(--arc-radius-md);
  border: 1px solid var(--arc-border);
  background: var(--arc-bg-surface);
  color: var(--arc-text-primary);
  cursor: pointer;
  font-size: 13px;
}

.stage-chip.is-active {
  border-color: var(--arc-primary);
  background: var(--arc-primary-soft);
}

.stage-chip.is-locked {
  opacity: 0.6;
  cursor: not-allowed;
}

.stage-chip:hover:not(:disabled) {
  background: var(--arc-bg-surface-hover);
}

.stage-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--arc-primary);
  color: var(--arc-bg-body);
  font-size: 11px;
  font-weight: 600;
}

.stage-label {
  font-weight: 500;
}

.deconstruction-adaptation-toolbar {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  background: var(--arc-bg-weak);
  border: 1px solid var(--arc-border);
  border-radius: var(--arc-radius-lg);
}

.deconstruction-adaptation-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.deconstruction-adaptation-debug {
  background: var(--arc-bg-weak);
  border: 1px dashed var(--arc-border);
}
</style>
