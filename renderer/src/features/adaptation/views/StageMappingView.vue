<script setup lang="ts">
/**
 * StageMappingView 子视图（PRD T15）
 * - 4-5 张阶段卡（含 TRANSITION_HOOK）；副带 BOOK_UNDERSTANDING 摘要卡 + TONE 卡
 * - 门禁实时显示 stage-count issue
 * - 完成后调 transitionStageState('stages', 'completed')
 */
import { computed, ref } from 'vue'
import { Sparkles, ArrowRight } from 'lucide-vue-next'
import { NButton, NCard, NEmpty, NGrid, NGridItem, NSpace, NTag, useMessage } from 'naive-ui'
import { useAppStore } from '@/stores/app'
import FeatureHelp from '@/components/FeatureHelp.vue'
import { runStageMap } from '@/features/adaptation/services/runAdaptationAiTask'
import {
  parseBookUnderstandingBlocks,
  parseStageBlocks,
  parseToneBlocks
} from '@/features/adaptation/parsers/adaptationTagParser'
import type { AdaptationRun, AdaptationStage, BookUnderstanding, ToneProfile } from '@/types/app'

interface Props { run: AdaptationRun }
const props = defineProps<Props>()

const appStore = useAppStore()
const message = useMessage()

const loading = ref(false)
const error = ref('')

const stages = computed(() => props.run.stages ?? [])
const bookUnderstanding = computed(() => props.run.bookUnderstanding)
const toneProfile = computed(() => props.run.toneProfile)

const stageCountError = computed(() => {
  const n = stages.value.length
  return n < 4 || n > 5
})

async function runIdentify(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const response = await runStageMap({
      referenceWorkId: props.run.referenceWorkId,
      referenceTitle: props.run.sourceTitle,
      chapterManifest: '[]',
      sourceText: '',
      lead: props.run.leadSelection
        ? {
            name: '（已选主角，参见 run.leadSelection.name）',
            userNote: props.run.leadSelection.userNote
          }
        : null,
      bookUnderstanding: props.run.bookUnderstanding ?? undefined,
      toneProfile: props.run.toneProfile ?? undefined
    })
    let parsedStages: AdaptationStage[] = []
    let parsedTone: ToneProfile | null = null
    let parsedBook: BookUnderstanding | null = null
    try {
      parsedStages = parseStageBlocks(response)
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : '阶段解析失败'
    }
    try {
      parsedTone = parseToneBlocks(response)
    } catch {
      parsedTone = null
    }
    try {
      parsedBook = parseBookUnderstandingBlocks(response)
    } catch {
      parsedBook = null
    }
    appStore.updateAdaptationRun(props.run.id, {
      stages: parsedStages,
      toneProfile: parsedTone,
      bookUnderstanding: parsedBook,
      error: ''
    })
    if (parsedStages.length >= 4 && parsedStages.length <= 5) {
      appStore.transitionAdaptationStageState(props.run.id, 'stages', 'completed', '')
      message.success(`阶段划分完成（${parsedStages.length} 个阶段）`)
    } else {
      appStore.transitionAdaptationStageState(
        props.run.id,
        'stages',
        'failed',
        `阶段数 ${parsedStages.length} 不在 4-5 之间`
      )
      message.warning(`阶段数 ${parsedStages.length} 不在 4-5 之间，请重跑或人工调整`)
    }
  } catch (caughtError) {
    error.value = caughtError instanceof Error ? caughtError.message : '阶段划分失败'
    message.error(error.value)
  } finally {
    loading.value = false
  }
}

function completeStage(): void {
  if (stages.value.length >= 4 && stages.value.length <= 5) {
    appStore.transitionAdaptationStageState(props.run.id, 'stages', 'completed', '')
    message.success('阶段已标记完成')
  } else {
    message.warning('阶段数应在 4-5 之间')
  }
}
</script>

<template>
  <n-card size="small" title="阶段划分">
    <template #header-extra>
      <n-space>
        <FeatureHelp feature-id="stage-mapping" />
        <n-button type="primary" :loading="loading" @click="runIdentify">
          <template #icon><Sparkles :size="14" /></template>
          AI 划分阶段
        </n-button>
        <n-button secondary @click="completeStage">手动标完成</n-button>
      </n-space>
    </template>

    <n-alert v-if="error" type="error" :title="error" :show-icon="false" />
    <n-alert
      v-if="stageCountError"
      type="warning"
      title="阶段数应在 4-5 之间"
      :show-icon="false"
    />

    <n-empty v-if="stages.length === 0" description="尚未划分阶段，请点击 AI 划分阶段" />

    <n-grid v-else :cols="2" :x-gap="10" :y-gap="10" responsive="screen">
      <n-grid-item v-for="(stage, index) in stages" :key="stage.id" span="1 m:1 l:1">
        <article class="stage-card">
          <header class="stage-card-header">
            <strong>{{ index + 1 }}. {{ stage.title }}</strong>
            <n-tag size="tiny" :bordered="false">
              第 {{ stage.sourceChapterStart }}–{{ stage.sourceChapterEnd }} 章
            </n-tag>
          </header>
          <p class="stage-card-section"><strong>起势：</strong>{{ stage.startState }}</p>
          <p class="stage-card-section"><strong>终势：</strong>{{ stage.endState }}</p>
          <p class="stage-card-section"><strong>目标：</strong>{{ stage.goal }}</p>
          <p class="stage-card-section"><strong>转折：</strong>{{ stage.turningPoint }}</p>
          <p class="stage-card-section"><strong>主角事件：</strong></p>
          <ul class="stage-card-list">
            <li v-for="(event, i) in stage.protagonistEvents" :key="i">{{ event }}</li>
          </ul>
          <p v-if="stage.transitionHook" class="stage-card-hook">
            <ArrowRight :size="12" /> {{ stage.transitionHook }}
          </p>
        </article>
      </n-grid-item>
    </n-grid>

    <n-grid :cols="2" :x-gap="10" :y-gap="10" responsive="screen" class="stage-aggregates">
      <n-grid-item span="1 m:1 l:1">
        <article class="aggregate-card">
          <strong>BOOK_UNDERSTANDING</strong>
          <p v-if="!bookUnderstanding" class="empty-hint">聚合阶段未产出</p>
          <p v-else class="aggregate-line"><strong>全书摘要：</strong>{{ bookUnderstanding.wholeBookSummary }}</p>
          <p v-if="bookUnderstanding" class="aggregate-line">
            <strong>主角弧线：</strong>{{ bookUnderstanding.protagonistArc }}
          </p>
        </article>
      </n-grid-item>
      <n-grid-item span="1 m:1 l:1">
        <article class="aggregate-card">
          <strong>TONE（全书基调）</strong>
          <p v-if="!toneProfile" class="empty-hint">聚合阶段未产出</p>
          <div v-else class="tone-line">
            <span>幽默 {{ toneProfile.humorLevel }}</span>
            <span>浪漫 {{ toneProfile.romanceLevel }}</span>
            <span>黑暗 {{ toneProfile.darknessLevel }}</span>
          </div>
          <p v-if="toneProfile" class="aggregate-line">
            <strong>核心基调：</strong>{{ toneProfile.coreTone }}
          </p>
        </article>
      </n-grid-item>
    </n-grid>
  </n-card>
</template>

<style scoped>
.stage-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--arc-border);
  border-radius: var(--arc-radius-md);
  background: var(--arc-bg-surface);
}

.stage-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.stage-card-section {
  margin: 0;
  font-size: 12px;
  color: var(--arc-text-secondary);
  line-height: 1.6;
}

.stage-card-list {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  color: var(--arc-text-secondary);
}

.stage-card-hook {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--arc-primary);
  font-size: 12px;
}

.stage-aggregates {
  margin-top: 10px;
}

.aggregate-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border: 1px dashed var(--arc-border);
  border-radius: var(--arc-radius-md);
  background: var(--arc-bg-weak);
}

.aggregate-card strong {
  font-size: 12px;
  color: var(--arc-text-primary);
}

.aggregate-line {
  margin: 0;
  font-size: 12px;
  color: var(--arc-text-secondary);
  line-height: 1.6;
}

.empty-hint {
  margin: 0;
  color: var(--arc-text-hint);
  font-size: 12px;
}

.tone-line {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--arc-text-secondary);
}
</style>
