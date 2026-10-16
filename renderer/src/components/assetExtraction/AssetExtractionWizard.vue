<script setup lang="ts">
// v1.30.0 双模式向导：
// - mode='import'（章节创作「导入小说」）：只走第 1 步——粘贴 / TXT 导入 → 解析出「追加 / 覆盖」预览 → 确认落「章节创作」，完成后关闭，不做提取。
// - mode='extract'（资产库分类「提取资产」，带 kind）：跳过第 1 步，直接从「运行提取」开始，**只提取 kind 指定那一类**。
// 仅 Naive UI + lucide + --arc-* 令牌；渲染层不直连文件系统 / AI 服务（一律经 window.characterArc.*）。
import { computed, ref, watch } from 'vue'
import { Check, FileText, RotateCcw, Sparkles, Upload } from 'lucide-vue-next'
import { NAlert, NButton, NInput, NModal, NPopconfirm, NProgress, NRadioButton, NRadioGroup, useMessage } from 'naive-ui'
import { isCodexCliProvider } from '@shared/ai-provider-catalog'
import { parseContinuationNovelText, type ContinuationNovelFilePreview } from '@shared/continuation-import'
import { useAppStore } from '@/stores/app'
import { toIpcPayload } from '@/utils/ipcPayload'
import FeatureHelp from '@/components/FeatureHelp.vue'
import ExtractionCandidateList, { type CandidateDraft } from '@/components/assetExtraction/ExtractionCandidateList.vue'
import { parseExtractionResult, type ExtractionCandidates } from '@/features/assetExtraction/parseExtractionResult'
import { mergeExtractionCandidates, normalizeExtractionName } from '@/features/assetExtraction/mergeExtractionCandidates'
import { chapterContentToPlainText } from '@/features/assetExtraction/chapterText'
import { loadAllChapterContent } from '@/features/chapters/chapterExport'
import { buildNovelChapters, type NovelSourceInput } from '@/features/assetExtraction/novelToChapters'
import { buildImportPlan, type ImportMode, type ImportPlan, type ImportPlanRange } from '@/features/assetExtraction/novelImportPlan'

/** 提取类别（资产库分类入口传入） */
type ExtractKind = 'character' | 'scene' | 'prop'
const EXTRACT_KIND_LABELS: Record<ExtractKind, string> = { character: '角色', scene: '场景', prop: '道具' }

const props = defineProps<{
  show: boolean
  /** 向导模式：import=仅导入小说；extract=仅提取指定类别资产 */
  mode?: 'import' | 'extract'
  /** extract 模式必填：只提取该类别 */
  kind?: ExtractKind
}>()
const emit = defineEmits<{
  'update:show': [boolean]
  applied: []
}>()

const appStore = useAppStore()
const message = useMessage()

// 分批参数：每段目标字符数 / 每批段数（参照 catalog-batch 的 targets 分批范式）
const SEGMENT_TARGET_CHARS = 2000
const SEGMENTS_PER_BATCH = 3

const isImportMode = computed(() => (props.mode ?? 'extract') === 'import')
const extractKind = computed<ExtractKind | undefined>(() => props.kind)
const extractKindLabel = computed(() => (extractKind.value ? EXTRACT_KIND_LABELS[extractKind.value] : ''))
const modalTitle = computed(() => (isImportMode.value ? '导入小说' : `提取${extractKindLabel.value}资产`))

/** 生成基于时间戳 + 自增序号的唯一 ID（与续写导入页的构建范式一致）。 */
let idCounter = 0
function createId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now()}-${idCounter}`
}

const step = ref<1 | 2 | 3>(1)
const novelText = ref('')
const importedPreview = ref<ContinuationNovelFilePreview | null>(null)
const importedSnapshot = ref('')
const importing = ref(false)
const running = ref(false)
const candidates = ref<ExtractionCandidates>({ characters: [], scenes: [], props: [] })
const drafts = ref<CandidateDraft[]>([])
const progress = ref({ current: 0, total: 0 })

// import 模式：解析后先出预览（append/overwrite），再确认写入。
const parsedNovel = ref<NovelSourceInput | null>(null)
const importMode = ref<ImportMode>('append')

const hasAiSettings = computed(() => {
  const settings = appStore.appSettings
  if (isCodexCliProvider(settings.provider)) return Boolean(settings.model)
  const isLocal = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(settings.baseUrl.trim())
  return Boolean(settings.model && settings.baseUrl && (settings.apiKey || settings.provider === 'ollama' || isLocal))
})

const projectName = computed(() => appStore.currentProject?.title || '当前项目')
// 章节正文为按需懒加载，未加载时直接统计字数会得到错误的 0 字，故这里只展示始终准确的章节数。
const projectChapterCount = computed(() => appStore.chapters.length)

// import 模式的追加 / 覆盖预览：由 novelImportPlan 纯函数产出「新增 / 跳过 / 区间」。
const existingChapterTitles = computed(() => appStore.chapters.map((chapter) => chapter.title))
const importPlan = computed<ImportPlan | null>(() => (
  parsedNovel.value
    ? buildImportPlan({
        novel: parsedNovel.value,
        existingChapterTitles: existingChapterTitles.value,
        mode: importMode.value
      })
    : null
))
const totalChapterCount = computed(() => appStore.chapters.length)
const importRangeText = computed(() => (importPlan.value ? formatImportRange(importPlan.value.range) : ''))
const skippedTitlesText = computed(() => (importPlan.value?.skipped ?? []).map((chapter) => chapter.title).join('、'))

/** 序数区间展示：有有效序数时用「第X章~第Y章」，否则回退「共 N 章」。 */
function formatImportRange(range: ImportPlanRange): string {
  if (range.from === null || range.to === null) return `共 ${range.count} 章`
  return `第${range.from}章~第${range.to}章（${range.count} 章）`
}

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
  // import 模式只走第 1 步；extract 模式跳过第 1 步，直接从「运行提取」开始。
  step.value = isImportMode.value ? 1 : 2
  novelText.value = ''
  importedPreview.value = null
  importedSnapshot.value = ''
  candidates.value = { characters: [], scenes: [], props: [] }
  drafts.value = []
  progress.value = { current: 0, total: 0 }
  parsedNovel.value = null
  importMode.value = 'append'
})

// 手动改动文本框即视为放弃 TXT 解析结果，改为按粘贴文本重新解析。
watch(novelText, (value) => {
  if (importedPreview.value && value !== importedSnapshot.value) {
    importedPreview.value = null
  }
})

function close(): void {
  emit('update:show', false)
}

/** 复用既有 IPC：读取 TXT，拿到解析好的 preview（含卷 / 章节），并把正文回填到文本框。 */
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
    importedPreview.value = result.preview
    importedSnapshot.value = text
    novelText.value = text
    message.success(`已导入「${result.preview.fileName}」（识别 ${result.preview.chapterCount} 章）`)
  } catch (error) {
    message.error(error instanceof Error ? error.message : '读取小说文件失败')
  } finally {
    importing.value = false
  }
}

/** 解析正文（或 TXT 解析结果）并进入追加 / 覆盖预览阶段（不写入）。 */
function buildImportPreview(): void {
  const text = novelText.value.trim()
  if (!importedPreview.value && !text) {
    message.warning('请粘贴正文或从 TXT 导入小说后再继续')
    return
  }

  const fallbackTitle = appStore.currentProject?.title || '未命名作品'
  parsedNovel.value = importedPreview.value
    ? { title: importedPreview.value.title, chapters: importedPreview.value.chapters }
    : { title: fallbackTitle, chapters: parseContinuationNovelText(text, fallbackTitle).chapters }
  importMode.value = 'append'
}

/** 回到导入输入阶段（放弃预览解析结果）。 */
function backToImportInput(): void {
  parsedNovel.value = null
}

/** 追加写入：只新增未存在的章，序数沿用小说标题解析结果（不重排）。 */
function doAppendImport(): void {
  const novel = parsedNovel.value
  if (!novel) return
  const result = buildNovelChapters({ novel, existingChapterTitles: existingChapterTitles.value, createId })
  if (!result.chapters.length) {
    message.info(`没有可新增的章节（共 ${novel.chapters.length} 章，均已存在于「章节创作」）`)
    close()
    return
  }
  const { addedChapters } = appStore.importNovelIntoChapters(result)
  const skipped = importPlan.value?.skipped.length ?? (novel.chapters.length - addedChapters)
  message.success(`已追加 ${addedChapters} 章，跳过 ${skipped} 章`)
  emit('applied')
  close()
}

/** 覆盖写入（整本替换）：单次原子替换当前项目章节，避免残留空分卷；已由弹窗二次确认。 */
function doOverwriteImport(): void {
  const novel = parsedNovel.value
  if (!novel) return
  const result = buildNovelChapters({ novel, existingChapterTitles: [], createId })
  appStore.replaceProjectNovelChapters(result)
  message.success(`已替换为 ${result.chapters.length} 章`)
  emit('applied')
  close()
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
  const targetKind = extractKind.value
  const result: CandidateDraft[] = []
  const push = (
    kind: CandidateDraft['kind'],
    name: string,
    typeLabel: string,
    description: string,
    tags: string[],
    evidence: string
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
      evidence,
      checked: !conflict,
      conflict
    })
  }
  // extract 模式只产出 kind 指定那一类；未指定时（向后兼容）三类都产出。
  if (!targetKind || targetKind === 'character') {
    for (const candidate of list.characters) push('character', candidate.name, candidate.role, candidate.description, [...candidate.tags], candidate.evidence ?? '')
  }
  if (!targetKind || targetKind === 'scene') {
    for (const candidate of list.scenes) push('scene', candidate.name, candidate.type, candidate.description, [...candidate.tags], candidate.evidence ?? '')
  }
  if (!targetKind || targetKind === 'prop') {
    for (const candidate of list.props) push('prop', candidate.name, candidate.type, candidate.description, [...candidate.tags], candidate.evidence ?? '')
  }
  return result
}

/** 组装提取源：先把所有章节正文 ensure 加载完成（懒加载），再拼成纯文本。加载失败返回 null。 */
async function loadExtractionSource(): Promise<string | null> {
  try {
    const chapters = await loadAllChapterContent(appStore.chapters, (id) => appStore.ensureChapterContent(id))
    return chapters
      .map((chapter) => chapterContentToPlainText(chapter.content).trim())
      .filter(Boolean)
      .join('\n\n')
  } catch {
    message.error('章节正文加载失败，请重试后再提取')
    return null
  }
}

/** 运行提取：把当前项目章节正文合并后分段分批调 asset-extract，本地按 name 去重累积。 */
async function runExtraction(): Promise<void> {
  if (isBusy.value) return
  // 章节正文按需懒加载：重启后 / 长篇下 content 可能为空（contentLoaded:false），
  // 必须先把所有章节正文 ensure 加载完成，再组装提取源，否则会拿到空正文导致提取失效。
  const sourceText = await loadExtractionSource()
  if (sourceText === null) return
  if (!sourceText) {
    message.warning('当前项目「章节创作」暂无正文，请先在「章节创作」中导入小说')
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
          label: `从小说提取${extractKindLabel.value || '资产'}`,
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
            targetKind: extractKind.value,
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
      message.warning(`未提取到任何${extractKindLabel.value || '资产'}候选，可补充更多原文后重试`)
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
    :title="modalTitle"
    @close="close"
  >
    <template #header-extra>
      <FeatureHelp feature-id="novel-extraction" />
    </template>

    <div class="wizard-steps">
      <template v-if="isImportMode">
        <span class="wizard-step active"><FileText :size="14" />导入小说</span>
      </template>
      <template v-else>
        <span class="wizard-step" :class="{ active: step === 2 }"><Sparkles :size="14" />运行提取</span>
        <span class="wizard-step" :class="{ active: step === 3 }"><Check :size="14" />预览采纳</span>
      </template>
    </div>

    <!-- 第一步：导入 / 补录小说（仅 import 模式）：输入 → 预览（追加 / 覆盖） -->
    <section v-if="step === 1" class="wizard-body">
      <template v-if="!parsedNovel">
        <n-alert type="info" :show-icon="false" class="wizard-alert">
          项目「{{ projectName }}」当前「章节创作」共 {{ projectChapterCount }} 章。
          {{ projectChapterCount > 0 ? '点击「解析并预览」后可选择追加或覆盖。' : '尚未导入章节，请粘贴正文或从 TXT 导入。' }}
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
          <span class="wizard-hint">TXT 读取复用既有导入能力，导入后正文会回填到上方文本框，确认后解析并写入「章节创作」。</span>
        </div>
      </template>

      <template v-else>
        <n-alert type="info" :show-icon="false" class="wizard-alert">
          项目「{{ projectName }}」当前「章节创作」共 {{ totalChapterCount }} 章。
          「追加」只新增未存在的章、「覆盖」将整本替换。章节序数取自小说标题，不从第 1 章重排。
        </n-alert>

        <n-radio-group v-model:value="importMode" size="small">
          <n-radio-button value="append">追加</n-radio-button>
          <n-radio-button value="overwrite">覆盖</n-radio-button>
        </n-radio-group>

        <n-alert v-if="importMode === 'append'" type="info" :show-icon="false" class="wizard-alert">
          本次新增：{{ importRangeText }}<template v-if="skippedTitlesText">；跳过（已存在）：{{ skippedTitlesText }}</template>
        </n-alert>
        <n-alert v-else type="warning" :show-icon="false" class="wizard-alert">
          将替换当前项目全部章节（共 {{ totalChapterCount }} 章），不可撤销。
        </n-alert>
      </template>
    </section>

    <!-- 第二步：运行提取（仅 extract 模式） -->
    <section v-else-if="step === 2" class="wizard-body">
      <n-alert v-if="!hasAiSettings" type="warning" :show-icon="false" class="wizard-alert">
        需要先在主页设置中配置模型和 API Key，才能运行提取。
      </n-alert>
      <n-alert v-else type="info" :show-icon="false" class="wizard-alert">
        将从当前项目「章节创作」的章节正文中，按段落分批调用 AI 提取「{{ extractKindLabel }}」，并对已有同名实体去重。原文越长约需要的批次越多。
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
          <template v-if="!parsedNovel">
            <n-button type="primary" round @click="buildImportPreview">解析并预览</n-button>
          </template>
          <template v-else>
            <n-button round @click="backToImportInput">上一步</n-button>
            <n-popconfirm v-if="importMode === 'overwrite'" @positive-click="doOverwriteImport">
              <template #trigger>
                <n-button type="primary" round>覆盖导入</n-button>
              </template>
              将替换当前项目全部章节，不可撤销。确定继续？
            </n-popconfirm>
            <n-button v-else type="primary" round @click="doAppendImport">确认追加</n-button>
          </template>
        </template>

        <template v-else-if="step === 2">
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
