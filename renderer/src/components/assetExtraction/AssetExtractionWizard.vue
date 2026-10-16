<script setup lang="ts">
// v1.28.0 从小说提取资产向导（三步）：
// 1) 导入/补录小说（粘贴正文 或 复用 pickContinuationNovel IPC 读取 TXT）
// 2) 运行提取（分批调 asset-extract，runTrackedAiTask 显示进度）
// 3) 结果预览 + 逐项采纳（勾选 / 就地改名改描述改标签 → 批量落当前项目）
// 仅 Naive UI + lucide + --arc-* 令牌；渲染层不直连文件系统 / AI 服务（一律经 window.characterArc.*）。
import { computed, ref, watch } from 'vue'
import { Check, FileText, RotateCcw, Sparkles, Upload } from 'lucide-vue-next'
import { NAlert, NButton, NInput, NModal, NProgress, useMessage } from 'naive-ui'
import { isCodexCliProvider } from '@shared/ai-provider-catalog'
import { useAppStore } from '@/stores/app'
import { toIpcPayload } from '@/utils/ipcPayload'
import ExtractionCandidateList, { type CandidateDraft } from '@/components/assetExtraction/ExtractionCandidateList.vue'
import { parseExtractionResult, type ExtractionCandidates } from '@/features/assetExtraction/parseExtractionResult'
import { mergeExtractionCandidates, normalizeExtractionName } from '@/features/assetExtraction/mergeExtractionCandidates'
import { appendProjectNovel, readProjectNovel } from '@/features/assetExtraction/projectNovel'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{
  'update:show': [boolean]
  applied: []
}>()

const appStore = useAppStore()
const message = useMessage()

// 分批参数：每段目标字符数 / 每批段数（参照 catalog-batch 的 targets 分批范式）
const SEGMENT_TARGET_CHARS = 2000
const SEGMENTS_PER_BATCH = 3

const step = ref<1 | 2 | 3>(1)
const novelText = ref('')
const importing = ref(false)
const running = ref(false)
const candidates = ref<ExtractionCandidates>({ characters: [], scenes: [], props: [] })
const drafts = ref<CandidateDraft[]>([])
const progress = ref({ current: 0, total: 0 })

const hasAiSettings = computed(() => {
  const settings = appStore.appSettings
  if (isCodexCliProvider(settings.provider)) return Boolean(settings.model)
  const isLocal = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(settings.baseUrl.trim())
  return Boolean(settings.model && settings.baseUrl && (settings.apiKey || settings.provider === 'ollama' || isLocal))
})

const projectNovel = computed(() => readProjectNovel(appStore))
const projectNovelChars = computed(() => projectNovel.value.replace(/\s+/g, '').length)
const projectName = computed(() => appStore.currentProject?.title || '当前项目')

const existingNames = computed(() => ({
  characters: appStore.characters.map((character) => character.name),
  scenes: appStore.sceneLocations.map((scene) => scene.name),
  props: appStore.propItems.map((prop) => prop.name)
}))

const existingNameSet = computed(() => new Set(
  [
    ...appStore.characters.map((character) => normalizeExtractionName(character.name)),
    ...appStore.sceneLocations.map((scene) => normalizeExtractionName(scene.name)),
    ...appStore.propItems.map((prop) => normalizeExtractionName(prop.name))
  ].filter(Boolean)
))

const extractTaskKey = computed(() => `asset-extract:${appStore.currentProject?.id ?? 'current'}`)
const extractRunning = computed(() => appStore.isAiTaskRunning(extractTaskKey.value))
const progressPercent = computed(() => (
  progress.value.total > 0 ? Math.round((progress.value.current / progress.value.total) * 100) : 0
))
const checkedCount = computed(() => drafts.value.filter((draft) => draft.checked).length)
const isBusy = computed(() => running.value || extractRunning.value)

watch(() => props.show, (show) => {
  if (!show) return
  step.value = 1
  novelText.value = ''
  candidates.value = { characters: [], scenes: [], props: [] }
  drafts.value = []
  progress.value = { current: 0, total: 0 }
})

function close(): void {
  emit('update:show', false)
}

/** 复用既有 IPC：读取 TXT，把 preview.chapters 拼成正文回填 textarea（0 新 IPC）。 */
async function importFromTxt(): Promise<void> {
  importing.value = true
  try {
    const result = await window.characterArc.pickContinuationNovel()
    if (result.canceled) return
    if (!result.success || !result.preview) {
      throw new Error(result.error || '读取小说文件失败')
    }
    const text = result.preview.chapters
      .map((chapter) => {
        const title = String(chapter.title ?? '').trim()
        const body = String(chapter.content ?? '')
        return title ? `${title}\n${body}` : body
      })
      .join('\n\n')
      .trim()
    novelText.value = text
    message.success(`已导入「${result.preview.fileName}」（${text.length} 字）`)
  } catch (error) {
    message.error(error instanceof Error ? error.message : '读取小说文件失败')
  } finally {
    importing.value = false
  }
}

/** 确认导入：把文本追加合并进当前项目唯一的小说原文（同一本，后续导入=补充）。 */
function confirmImport(): void {
  const text = novelText.value.trim()
  if (!text && !projectNovel.value.trim()) {
    message.warning('请粘贴正文或从 TXT 导入小说后再继续')
    return
  }
  if (text) {
    try {
      appendProjectNovel(appStore, text)
      message.success('已合并进项目小说原文')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存小说原文失败')
      return
    }
  }
  novelText.value = ''
  step.value = 2
}

function splitOversized(text: string, size: number): string[] {
  const parts: string[] = []
  for (let index = 0; index < text.length; index += size) {
    parts.push(text.slice(index, index + size))
  }
  return parts
}

/** 按段落边界把原文切成多段；超长段落做硬切保护。 */
function chunkNovel(text: string): string[] {
  const paragraphs = text.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean)
  const units: string[] = []
  for (const paragraph of paragraphs) {
    if (paragraph.length > SEGMENT_TARGET_CHARS * 2) units.push(...splitOversized(paragraph, SEGMENT_TARGET_CHARS))
    else units.push(paragraph)
  }

  const segments: string[] = []
  let buffer = ''
  for (const unit of units) {
    if (buffer && buffer.length + unit.length + 2 > SEGMENT_TARGET_CHARS) {
      segments.push(buffer)
      buffer = unit
    } else {
      buffer = buffer ? `${buffer}\n\n${unit}` : unit
    }
  }
  if (buffer) segments.push(buffer)
  return segments
}

function buildDrafts(list: ExtractionCandidates): CandidateDraft[] {
  const existing = existingNameSet.value
  const result: CandidateDraft[] = []
  const push = (
    kind: CandidateDraft['kind'],
    name: string,
    typeLabel: string,
    description: string,
    tags: string[]
  ): void => {
    const normalized = normalizeExtractionName(name)
    const conflict = existing.has(normalized)
    result.push({
      kind,
      key: `${kind}:${normalized}`,
      name,
      typeLabel,
      description,
      tags,
      checked: !conflict,
      conflict
    })
  }
  for (const candidate of list.characters) push('character', candidate.name, candidate.role, candidate.description, [...candidate.tags])
  for (const candidate of list.scenes) push('scene', candidate.name, candidate.type, candidate.description, [...candidate.tags])
  for (const candidate of list.props) push('prop', candidate.name, candidate.type, candidate.description, [...candidate.tags])
  return result
}

/** 运行提取：分段分批逐批调 asset-extract，本地按 name 去重累积。 */
async function runExtraction(): Promise<void> {
  if (isBusy.value) return
  const sourceText = projectNovel.value.trim()
  if (!sourceText) {
    message.warning('项目暂无小说原文，请先返回第一步导入')
    step.value = 1
    return
  }
  if (!hasAiSettings.value) {
    message.warning('需要先在主页设置中配置模型和 API Key')
    return
  }

  const segments = chunkNovel(sourceText)
  progress.value = { current: 0, total: segments.length }
  running.value = true
  const batches: Array<ExtractionCandidates | null> = []

  try {
    for (let start = 0; start < segments.length; start += SEGMENTS_PER_BATCH) {
      const end = Math.min(start + SEGMENTS_PER_BATCH, segments.length)
      const batchSegments = segments.slice(start, end)
      const response = await appStore.runTrackedAiTask(
        {
          key: extractTaskKey.value,
          kind: 'other',
          label: '从小说提取资产',
          description: `正在提取 ${start + 1}-${end} / ${segments.length}`,
          panel: 'asset-library'
        },
        () => window.characterArc.generateAi(toIpcPayload({
          task: 'asset-extract',
          clientKey: extractTaskKey.value,
          settings: appStore.appSettings,
          context: {
            projectId: appStore.currentProject?.id,
            novelSegments: batchSegments,
            existingNames: existingNames.value,
            projectGenre: appStore.currentProject?.genre,
            projectTitle: appStore.currentProject?.title,
            batchIndex: Math.floor(start / SEGMENTS_PER_BATCH)
          }
        }))
      )

      if (!response.success || !response.result) {
        throw new Error(response.error ?? '提取失败，请检查模型配置')
      }
      batches.push(parseExtractionResult(response.result))
      progress.value = { current: end, total: segments.length }
    }

    candidates.value = mergeExtractionCandidates(batches)
    drafts.value = buildDrafts(candidates.value)
    if (!drafts.value.length) {
      message.warning('未提取到任何候选，可补充更多原文后重试')
      return
    }
    step.value = 3
  } catch (error) {
    message.error(error instanceof Error ? error.message : '提取失败，请检查模型配置')
  } finally {
    running.value = false
  }
}

function adoptSelected(): void {
  const accepted = drafts.value.filter((draft) => draft.checked && draft.name.trim())
  if (!accepted.length) {
    message.warning('请至少勾选一条候选')
    return
  }

  for (const draft of accepted) {
    const tags = draft.tags.map((label) => ({ label }))
    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      tags
    }
    if (draft.kind === 'character') {
      appStore.createCharacter({ ...payload, role: draft.typeLabel.trim() || undefined })
    } else if (draft.kind === 'scene') {
      appStore.createSceneLocation({ ...payload, type: draft.typeLabel.trim() || undefined })
    } else {
      appStore.createPropItem({ ...payload, type: draft.typeLabel.trim() || undefined })
    }
  }

  message.success(`已采纳 ${accepted.length} 条资产`)
  emit('applied')
  close()
}
</script>

<template>
  <n-modal
    :show="props.show"
    preset="card"
    class="arc-editor-modal-wide extraction-wizard"
    :bordered="false"
    title="从小说提取资产"
    @close="close"
  >
    <div class="wizard-steps">
      <span class="wizard-step" :class="{ active: step === 1 }"><FileText :size="14" />导入小说</span>
      <span class="wizard-step" :class="{ active: step === 2 }"><Sparkles :size="14" />运行提取</span>
      <span class="wizard-step" :class="{ active: step === 3 }"><Check :size="14" />预览采纳</span>
    </div>

    <!-- 第一步：导入 / 补录小说 -->
    <section v-if="step === 1" class="wizard-body">
      <n-alert type="info" :show-icon="false" class="wizard-alert">
        项目「{{ projectName }}」当前小说原文约 {{ projectNovelChars }} 字。
        {{ projectNovelChars > 0 ? '再次导入将作为对同一本的补充（追加合并）。' : '尚未导入小说，请粘贴正文或从 TXT 导入。' }}
      </n-alert>

      <n-input
        v-model:value="novelText"
        type="textarea"
        :autosize="{ minRows: 8, maxRows: 16 }"
        placeholder="在此粘贴小说正文（支持分章），或点击下方按钮从 TXT 文件导入"
      />

      <div class="wizard-inline">
        <n-button :loading="importing" @click="importFromTxt">
          <template #icon><Upload :size="15" /></template>
          从 TXT 导入
        </n-button>
        <span class="wizard-hint">TXT 读取复用既有导入能力，导入后正文会回填到上方文本框，确认后合并进项目小说。</span>
      </div>
    </section>

    <!-- 第二步：运行提取 -->
    <section v-else-if="step === 2" class="wizard-body">
      <n-alert v-if="!hasAiSettings" type="warning" :show-icon="false" class="wizard-alert">
        需要先在主页设置中配置模型和 API Key，才能运行提取。
      </n-alert>
      <n-alert v-else type="info" :show-icon="false" class="wizard-alert">
        将按段落把原文切成多段，分批调用 AI 提取角色 / 场景 / 道具，并对已有同名实体去重。原文越长约需要的批次越多。
      </n-alert>

      <div v-if="progress.total > 0" class="wizard-progress">
        <n-progress type="line" :percentage="progressPercent" :height="8" />
        <span class="wizard-progress-text">已处理 {{ progress.current }} / {{ progress.total }} 段</span>
      </div>
    </section>

    <!-- 第三步：预览 + 逐项采纳 -->
    <section v-else class="wizard-body">
      <ExtractionCandidateList v-model:drafts="drafts" />
    </section>

    <template #footer>
      <div class="arc-modal-actions wizard-actions">
        <span v-if="step === 3" class="wizard-checked">已勾选 {{ checkedCount }} 条</span>
        <n-button round @click="close">取消</n-button>

        <template v-if="step === 1">
          <n-button type="primary" round @click="confirmImport">保存并继续</n-button>
        </template>

        <template v-else-if="step === 2">
          <n-button round @click="step = 1">上一步</n-button>
          <n-button type="primary" round :loading="isBusy" :disabled="!hasAiSettings" @click="runExtraction">
            <template #icon><Sparkles :size="14" /></template>
            开始提取
          </n-button>
        </template>

        <template v-else>
          <n-button round @click="step = 2">
            <template #icon><RotateCcw :size="14" /></template>
            重新提取
          </n-button>
          <n-button type="primary" round :disabled="checkedCount === 0" @click="adoptSelected">
            采纳选中
          </n-button>
        </template>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.wizard-steps {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.wizard-step {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--arc-border);
  border-radius: 999px;
  color: var(--arc-text-hint);
  padding: 3px 12px;
  font-size: 12px;
}

.wizard-step.active {
  border-color: var(--arc-primary);
  background: var(--arc-primary-soft);
  color: var(--arc-primary);
  font-weight: 650;
}

.wizard-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.wizard-alert {
  font-size: 12.5px;
}

.wizard-inline {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.wizard-hint {
  color: var(--arc-text-hint);
  font-size: 12px;
  line-height: 1.5;
}

.wizard-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.wizard-progress-text {
  color: var(--arc-text-hint);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.arc-modal-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.wizard-checked {
  margin-right: auto;
  color: var(--arc-text-hint);
  font-size: 12px;
}
</style>
