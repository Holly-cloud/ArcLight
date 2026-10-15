<script setup lang="ts">
/**
 * PlotCardsView 子视图（PRD T16）
 * - 顶部覆盖率体检表 + 缺口列表
 * - 中部按 stageId 分组的 PlotCard 网格
 * - 每次 AI 拆解后调 validateOriginalDialogueAnchors 降级
 * - 顶部 NCheckbox 切档：chunk-pass ↔ single-pass
 */
import { computed, ref } from 'vue'
import { Sparkles, Edit3 } from 'lucide-vue-next'
import {
  NButton,
  NCard,
  NCheckbox,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NProgress,
  NSpace,
  NTag,
  useMessage
} from 'naive-ui'
import { useAppStore } from '@/stores/app'
import FeatureHelp from '@/components/FeatureHelp.vue'
import { runPlotCards } from '@/features/adaptation/services/runAdaptationAiTask'
import { parseCardBlocks } from '@/features/adaptation/parsers/adaptationTagParser'
import { validateOriginalDialogueAnchors } from '@/features/adaptation/antiHallucination/validateOriginalDialogueAnchors'
import {
  analyzeAdaptationCardCoverage
} from '@/features/adaptation/coverage/analyzeAdaptationCardCoverage'
import {
  PLOT_CARD_FUNCTION_LABELS,
  PLOT_CARD_RELATION_LABELS,
  isMainlineProtagonistCard
} from '@/features/adaptation/types'
import type { AdaptationRun, PlotCard } from '@/types/app'

interface Props { run: AdaptationRun }
const props = defineProps<Props>()

const appStore = useAppStore()
const message = useMessage()

const loading = ref(false)
const singlePass = ref(false)
const error = ref('')

const plotCards = computed(() => props.run.plotCards ?? [])

const coverage = computed(() => {
  if (plotCards.value.length === 0) {
    return { percent: 0, gaps: [], stages: [] }
  }
  return analyzeAdaptationCardCoverage(props.run)
})

const groupedCards = computed(() => {
  const grouped = new Map<string, PlotCard[]>()
  for (const card of plotCards.value) {
    const list = grouped.get(card.stageId) ?? []
    list.push(card)
    grouped.set(card.stageId, list)
  }
  return grouped
})

async function runIdentify(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const response = await runPlotCards({
      referenceWorkId: props.run.referenceWorkId,
      referenceTitle: props.run.sourceTitle,
      chapterManifest: '[]',
      sourceText: '',
      lead: props.run.leadSelection ? { name: '已选', userNote: props.run.leadSelection.userNote } : null,
      bookUnderstanding: props.run.bookUnderstanding ?? undefined,
      toneProfile: props.run.toneProfile ?? undefined,
      focusStage: null,
      coverageGaps: coverage.value.gaps,
      useSinglePass: singlePass.value
    })
    let parsedCards: PlotCard[] = []
    try {
      parsedCards = parseCardBlocks(response)
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : '剧情卡解析失败'
      message.error(error.value)
      return
    }
    // 对白防伪降级
    const downgradedAll = parsedCards.map((card) => {
      const { valid, downgraded } = validateOriginalDialogueAnchors(card.dialogueAnchors, [])
      return {
        ...card,
        dialogueAnchors: [...valid, ...downgraded]
      }
    })
    appStore.updateAdaptationRun(props.run.id, { plotCards: downgradedAll, error: '' })
    appStore.transitionAdaptationStageState(props.run.id, 'plot-cards', 'completed', '')
    appStore.recalculateAdaptationCharacterStats(props.run.id)
    message.success(`剧情卡拆解完成，共 ${downgradedAll.length} 张`)
  } catch (caughtError) {
    error.value = caughtError instanceof Error ? caughtError.message : '剧情卡拆解失败'
    message.error(error.value)
  } finally {
    loading.value = false
  }
}

function completeStage(): void {
  appStore.transitionAdaptationStageState(props.run.id, 'plot-cards', 'completed', '')
  appStore.recalculateAdaptationCharacterStats(props.run.id)
  message.success('剧情卡阶段已标记完成')
}

const editingCard = ref<PlotCard | null>(null)
const editModalOpen = ref(false)
const editTitle = ref('')
const editSynopsis = ref('')
const editFunction = ref<PlotCard['function']>('opening')
const editRelation = ref<PlotCard['protagonistRelation']>('direct-action')

function openEdit(card: PlotCard): void {
  editingCard.value = card
  editTitle.value = card.title
  editSynopsis.value = card.synopsis
  editFunction.value = card.function
  editRelation.value = card.protagonistRelation
  editModalOpen.value = true
}

function saveEdit(): void {
  if (!editingCard.value) return
  const target = editingCard.value
  const nextCards = plotCards.value.map((card) =>
    card.id === target.id
      ? {
          ...card,
          title: editTitle.value.trim() || card.title,
          synopsis: editSynopsis.value.trim() || card.synopsis,
          function: editFunction.value,
          protagonistRelation: editRelation.value
        }
      : card
  )
  appStore.updateAdaptationRun(props.run.id, { plotCards: nextCards })
  editModalOpen.value = false
  message.success('剧情卡已更新')
}
</script>

<template>
  <n-card size="small" title="剧情卡拆解">
    <template #header-extra>
      <n-space>
        <FeatureHelp feature-id="plot-card" />
        <n-checkbox v-model:checked="singlePass">强制 single-pass</n-checkbox>
        <n-button type="primary" :loading="loading" @click="runIdentify">
          <template #icon><Sparkles :size="14" /></template>
          AI 拆解剧情卡
        </n-button>
        <n-button secondary @click="completeStage">手动标完成</n-button>
      </n-space>
    </template>

    <n-alert v-if="error" type="error" :title="error" :show-icon="false" />

    <section class="coverage-block">
      <header>
        <strong>覆盖率体检表</strong>
        <span>{{ coverage.percent }}%</span>
      </header>
      <n-progress type="circle" :percentage="coverage.percent" :show-indicator="false" />
      <ul v-if="coverage.gaps.length > 0" class="gap-list">
        <li v-for="(gap, index) in coverage.gaps" :key="`gap-${index}`">
          缺口：第 {{ gap.start }}–{{ gap.end }} 章
        </li>
      </ul>
      <p v-else class="gap-empty">全部主线剧情卡已覆盖原文章节</p>
    </section>

    <n-empty v-if="plotCards.length === 0" description="尚未拆解剧情卡" />

    <div v-else class="plot-card-grid">
      <article
        v-for="card in plotCards"
        :key="card.id"
        class="plot-card"
        :class="{ 'is-mainline': isMainlineProtagonistCard(card), 'is-side': card.protagonistRelation === 'side-branch' }"
      >
        <header class="plot-card-header">
          <strong>{{ card.title }}</strong>
          <n-tag size="tiny" :bordered="false" type="info">
            第 {{ card.sourceChapterStart }}–{{ card.sourceChapterEnd }} 章
          </n-tag>
        </header>
        <p class="plot-card-meta">
          <n-tag size="tiny" :bordered="false">{{ PLOT_CARD_FUNCTION_LABELS[card.function] }}</n-tag>
          <n-tag size="tiny" :bordered="false" :type="card.protagonistRelation === 'side-branch' ? 'warning' : 'success'">
            {{ PLOT_CARD_RELATION_LABELS[card.protagonistRelation] }}
          </n-tag>
          <n-tag size="tiny" :bordered="false">{{ isMainlineProtagonistCard(card) ? '/ 主线' : '/ 支线' }}</n-tag>
        </p>
        <p class="plot-card-synopsis">{{ card.synopsis }}</p>
        <n-button size="tiny" secondary @click="openEdit(card)">
          <template #icon><Edit3 :size="12" /></template>
          编辑
        </n-button>
      </article>
    </div>

    <n-modal v-model:show="editModalOpen" preset="card" title="编辑剧情卡" style="max-width: 640px">
      <n-form label-placement="top">
        <n-form-item label="标题">
          <n-input v-model:value="editTitle" />
        </n-form-item>
        <n-form-item label="摘要">
          <n-input v-model:value="editSynopsis" type="textarea" :rows="3" />
        </n-form-item>
        <n-form-item label="功能标签">
          <n-input v-model:value="editFunction" placeholder="opening / trigger / ..." />
        </n-form-item>
        <n-form-item label="主角关系标签">
          <n-input v-model:value="editRelation" placeholder="direct-action / side-branch / ..." />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="editModalOpen = false">取消</n-button>
          <n-button type="primary" @click="saveEdit">保存</n-button>
        </n-space>
      </template>
    </n-modal>
  </n-card>
</template>

<style scoped>
.coverage-block {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px;
  border: 1px solid var(--arc-border);
  border-radius: var(--arc-radius-md);
  background: var(--arc-bg-weak);
}

.coverage-block header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.coverage-block header strong {
  color: var(--arc-text-primary);
  font-size: 13px;
}

.coverage-block header span {
  color: var(--arc-primary);
  font-weight: 600;
}

.gap-list {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  color: var(--arc-warning);
}

.gap-empty {
  margin: 0;
  font-size: 12px;
  color: var(--arc-text-hint);
}

.plot-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
}

.plot-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--arc-border);
  border-radius: var(--arc-radius-md);
  background: var(--arc-bg-surface);
}

.plot-card.is-mainline {
  border-left: 3px solid var(--arc-primary);
}

.plot-card.is-side {
  border-left: 3px solid var(--arc-warning);
}

.plot-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.plot-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0;
}

.plot-card-synopsis {
  margin: 0;
  color: var(--arc-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}
</style>
