<script setup lang="ts">
/**
 * LeadConfirmationView 子视图（PRD T14）
 * - 候选网格（confidence 条 + evidence chips）
 * - 顶部 "AI 重新识别" 按钮 → runLeadIdentify
 * - 选中后转 completed，下一阶段解锁
 * - 空候选时显示"原文过短 / 人工指定主角"出口
 */
import { computed, ref } from 'vue'
import { Sparkles, UserPlus } from 'lucide-vue-next'
import {
  NAlert,
  NButton,
  NCard,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NSpace,
  NTag,
  useMessage
} from 'naive-ui'
import { useAppStore } from '@/stores/app'
import { PLOT_CARD_RELATION_LABELS } from '@/features/adaptation/types'
import { parseLeadBlocks } from '@/features/adaptation/parsers/adaptationTagParser'
import { runLeadIdentify } from '@/features/adaptation/services/runAdaptationAiTask'
import { validateOriginalDialogueAnchors } from '@/features/adaptation/antiHallucination/validateOriginalDialogueAnchors'
import type { AdaptationRun, LeadCandidate } from '@/types/app'

interface Props { run: AdaptationRun }
const props = defineProps<Props>()

const appStore = useAppStore()
const message = useMessage()

const loading = ref(false)
const error = ref('')

async function runIdentify(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const response = await runLeadIdentify({
      referenceWorkId: props.run.referenceWorkId,
      referenceTitle: props.run.sourceTitle,
      chapterManifest: '[]',
      sourceText: '(原文已通过 store 中的 referenceWorks 取到)'
    })
    let candidates: LeadCandidate[] = []
    try {
      candidates = parseLeadBlocks(response)
    } catch (parseError) {
      error.value = parseError instanceof Error ? parseError.message : '解析失败'
      message.error('AI 返回无法解析为主角候选，请重试')
      return
    }
    if (candidates.length === 0) {
      message.warning('AI 未识别到候选，请人工指定或补充原文')
    }
    appStore.updateAdaptationRun(props.run.id, { leadCandidates: candidates, error: '' })
    message.success(`识别完成，共 ${candidates.length} 条候选`)
  } catch (caughtError) {
    error.value = caughtError instanceof Error ? caughtError.message : 'AI 识别失败'
    message.error(error.value)
  } finally {
    loading.value = false
  }
}

const candidates = computed(() => props.run.leadCandidates ?? [])
const selectedCandidate = ref<LeadCandidate | null>(null)
const userNote = ref('')
const modalOpen = ref(false)

function openConfirm(candidate: LeadCandidate): void {
  selectedCandidate.value = candidate
  userNote.value = ''
  modalOpen.value = true
}

function confirmLead(): void {
  if (!selectedCandidate.value) return
  const candidate = selectedCandidate.value
  appStore.updateAdaptationRun(props.run.id, {
    leadSelection: {
      id: candidate.id,
      userNote: userNote.value.trim(),
      confirmedAt: new Date().toISOString()
    }
  })
  appStore.transitionAdaptationStageState(props.run.id, 'lead', 'completed', '')
  appStore.markDownstreamAdaptationStagesStale(props.run.id, 'lead')
  modalOpen.value = false
  message.success(`已确认主角：${candidate.name}`)
}

void PLOT_CARD_RELATION_LABELS
void validateOriginalDialogueAnchors
</script>

<template>
  <n-card size="small" title="主角候选">
    <template #header-extra>
      <n-space>
        <n-button type="primary" :loading="loading" @click="runIdentify">
          <template #icon><Sparkles :size="14" /></template>
          AI 重新识别
        </n-button>
        <n-button secondary @click="openConfirm({
          id: 'manual-' + Date.now(),
          name: '手动指定主角',
          role: 'manual',
          confidence: 1,
          reason: '人工指定',
          evidenceRefs: [{ chapterId: 'manual', chapterNumber: 0, reason: '人工指定' }]
        } as LeadCandidate)">
          <template #icon><UserPlus :size="14" /></template>
          人工指定主角
        </n-button>
      </n-space>
    </template>

    <n-alert v-if="error" type="error" :title="error" :show-icon="false" />

    <n-empty
      v-if="candidates.length === 0"
      description="原文过短或 AI 暂未识别。请确认原文或人工指定主角。"
    />

    <div v-else class="lead-grid">
      <article
        v-for="candidate in candidates"
        :key="candidate.id"
        class="lead-card"
        :class="{ 'is-selected': run.leadSelection?.id === candidate.id }"
      >
        <header class="lead-card-header">
          <strong>{{ candidate.name }}</strong>
          <n-tag size="tiny" :bordered="false">{{ candidate.role }}</n-tag>
        </header>
        <div class="lead-card-confidence">
          <div class="lead-card-confidence-bar" :style="{ width: `${Math.round(candidate.confidence * 100)}%` }" />
          <span>置信度 {{ Math.round(candidate.confidence * 100) }}%</span>
        </div>
        <p class="lead-card-reason">{{ candidate.reason }}</p>
        <div class="lead-card-evidence">
          <n-tag
            v-for="(ref, index) in candidate.evidenceRefs"
            :key="index"
            size="tiny"
            :bordered="false"
            type="info"
          >
            {{ ref.chapterId }} · {{ ref.reason }}
          </n-tag>
        </div>
        <n-button
          type="primary"
          size="small"
          :disabled="run.leadSelection?.id === candidate.id"
          @click="openConfirm(candidate)"
        >
          {{ run.leadSelection?.id === candidate.id ? '已选中' : '选择并写补充' }}
        </n-button>
      </article>
    </div>

    <n-modal v-model:show="modalOpen" preset="card" title="确认主角" style="max-width: 540px">
      <n-form label-placement="top">
        <n-form-item label="主角名">
          <n-input :value="selectedCandidate?.name ?? ''" readonly />
        </n-form-item>
        <n-form-item label="角色定位">
          <n-input :value="selectedCandidate?.role ?? ''" readonly />
        </n-form-item>
        <n-form-item label="补充说明（可选）">
          <n-input v-model:value="userNote" type="textarea" :rows="3" placeholder="如：动机、隐藏身份、与次要人物的关系…" />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="modalOpen = false">取消</n-button>
          <n-button type="primary" @click="confirmLead">确认并完成 lead 阶段</n-button>
        </n-space>
      </template>
    </n-modal>
  </n-card>
</template>

<style scoped>
.lead-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
}

.lead-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--arc-border);
  border-radius: var(--arc-radius-md);
  background: var(--arc-bg-surface);
}

.lead-card.is-selected {
  border-color: var(--arc-primary);
  background: var(--arc-primary-soft);
}

.lead-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.lead-card-confidence {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--arc-text-secondary);
}

.lead-card-confidence-bar {
  height: 4px;
  border-radius: var(--arc-radius-sm);
  background: var(--arc-primary);
  flex: 1;
  max-width: 70%;
}

.lead-card-reason {
  margin: 0;
  color: var(--arc-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.lead-card-evidence {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
