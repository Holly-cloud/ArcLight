/**
 * AI 调用封装服务（PRD T9）
 * - 5 函数：runLeadIdentify / runStageMap / runPlotCards / runCharacterBible / runToneProfile
 * - 统一走 appStore.runTrackedAiTask({ key, kind, label, panel }, executor)
 * - chunk-pass / single-pass 切档：内部读 useSinglePassMode ref（> 30000 字默认 chunk-pass）
 * - runPlotCards 支持 focusStage / gapInstruction 注入
 * - 失败响应统一抛 AdaptationAiError（UI 用 useMessage 显示）
 */
import { useAppStore } from '@/stores/app'
import { toIpcPayload } from '@/utils/ipcPayload'
import type { AdaptationStage, AdaptationStageId } from '@/types/app'

const DEFAULT_CHUNK_THRESHOLD = 30000

export class AdaptationAiError extends Error {
  readonly code: string
  constructor(message: string, code: string) {
    super(message)
    this.code = code
    this.name = 'AdaptationAiError'
  }
}

export interface AdaptationTaskContext {
  /** 当前 AdaptationRun id（仅用于日志 / 关联） */
  runId?: string
  /** 参考作品 ID */
  referenceWorkId: string
  /** 参考作品标题 */
  referenceTitle: string
  /** 章节索引 JSON 字符串 */
  chapterManifest?: string
  /** 原文文本 */
  sourceText: string
  /** 用户已确认主角 */
  lead?: { name?: string; userNote?: string } | null
  /** 全书理解记忆（聚合阶段产出） */
  bookUnderstanding?: unknown
  /** 全书基调记忆 */
  toneProfile?: unknown
}

export interface PlotCardsContext extends AdaptationTaskContext {
  /** 聚焦单阶段 */
  focusStage?: { id: string; index: number; title: string; start: number; end: number } | null
  /** 缺口补拆列表（基于 analyzeAdaptationCardCoverage） */
  coverageGaps?: Array<{ start: number; end: number }>
  /** 强制 single-pass；默认依据原文长度自动切档 */
  useSinglePass?: boolean
}

/**
 * 是否走 single-pass 模式
 * - 默认 > 30000 字自动 chunk-pass；用户可手动切 single-pass
 */
function shouldUseSinglePass(textLength: number, useSinglePass?: boolean): boolean {
  if (useSinglePass !== undefined) return useSinglePass
  return textLength <= DEFAULT_CHUNK_THRESHOLD
}

/** 计算分块：粗略按 20000 字一块 */
function chunkSourceText(sourceText: string, singlePass: boolean): Array<{ index: number; total: number; text: string }> {
  if (singlePass) return [{ index: 1, total: 1, text: sourceText }]
  const chunkSize = 20000
  const chunks: Array<{ index: number; total: number; text: string }> = []
  let cursor = 0
  let index = 1
  while (cursor < sourceText.length) {
    const text = sourceText.slice(cursor, cursor + chunkSize)
    chunks.push({ index, total: 0, text })
    cursor += chunkSize
    index += 1
  }
  for (const chunk of chunks) chunk.total = chunks.length
  return chunks
}

function ensureAppStore() {
  return useAppStore()
}

interface AiCallResult {
  success: boolean
  response?: string
  error?: string
}

/**
 * Lead Identify：返回 AI 输出原文（含 <LEAD> 块）；UI 层用 parseLeadBlocks 解析
 */
export async function runLeadIdentify(ctx: AdaptationTaskContext): Promise<string> {
  const appStore = ensureAppStore()
  const taskKey = 'adaptation-lead-identify'
  const result = await appStore.runTrackedAiTask(
    {
      key: taskKey,
      kind: 'adaptation',
      label: `AI 识别《${ctx.referenceTitle}》的主角候选`,
      panel: 'adaptation'
    },
    () => window.characterArc.generateAi(toIpcPayload({
      task: 'adaptation-lead-identify',
      clientKey: taskKey,
      settings: appStore.appSettings,
      context: {
        referenceTitle: ctx.referenceTitle,
        chapterManifest: ctx.chapterManifest ?? '[]',
        sourceText: ctx.sourceText
      }
    }))
  )
  const aiResult = result as unknown as AiCallResult
  if (!aiResult.success || !aiResult.response) {
    throw new AdaptationAiError(aiResult.error ?? '主角识别 AI 调用失败', 'LEAD_IDENTIFY_FAILED')
  }
  return String(aiResult.response)
}

/**
 * Stage Map：阶段划分 + TONE + BOOK_UNDERSTANDING 聚合块
 * - 当 sourceText > 30000 字时按 20000 字分块多轮调用，每轮标记 adaptationChunkPass
 * - 最后聚合一次（adaptationSynthesis: true）合并结果
 */
export async function runStageMap(ctx: AdaptationTaskContext): Promise<string> {
  const appStore = ensureAppStore()
  const singlePass = shouldUseSinglePass(ctx.sourceText.length, undefined)
  const chunks = chunkSourceText(ctx.sourceText, singlePass)
  const responses: string[] = []
  for (const chunk of chunks) {
    const taskKey = `adaptation-stage-map:${chunk.index}/${chunk.total}`
    const result = await appStore.runTrackedAiTask(
      {
        key: taskKey,
        kind: 'adaptation',
        label: `AI 阶段划分（分块 ${chunk.index}/${chunk.total}）`,
        panel: 'adaptation'
      },
      () => window.characterArc.generateAi(toIpcPayload({
        task: 'adaptation-stage-map',
        clientKey: taskKey,
        settings: appStore.appSettings,
        context: {
          referenceTitle: ctx.referenceTitle,
          chapterManifest: ctx.chapterManifest ?? '[]',
          sourceText: chunk.text,
          leadName: ctx.lead?.name ?? '',
          adaptationChunkPass: chunks.length > 1,
          adaptationChunkIndex: chunk.index,
          adaptationChunkTotal: chunk.total,
          adaptationSynthesis: false
        }
      }))
    )
    const aiResult = result as unknown as AiCallResult
    if (!aiResult.success || !aiResult.response) {
      throw new AdaptationAiError(aiResult.error ?? '阶段划分 AI 调用失败', 'STAGE_MAP_FAILED')
    }
    responses.push(String(aiResult.response))
  }
  if (chunks.length === 1) return responses[0]
  const taskKey = 'adaptation-stage-map:aggregate'
  const aggregate = await appStore.runTrackedAiTask(
    {
      key: taskKey,
      kind: 'adaptation',
      label: 'AI 阶段划分（聚合）',
      panel: 'adaptation'
    },
    () => window.characterArc.generateAi(toIpcPayload({
      task: 'adaptation-stage-map',
      clientKey: taskKey,
      settings: appStore.appSettings,
      context: {
        referenceTitle: ctx.referenceTitle,
        chapterManifest: ctx.chapterManifest ?? '[]',
        sourceText: ctx.sourceText,
        leadName: ctx.lead?.name ?? '',
        adaptationSynthesis: true,
        adaptationChunkPass: false
      }
    }))
  )
  const aggregateResult = aggregate as unknown as AiCallResult
  if (!aggregateResult.success || !aggregateResult.response) {
    throw new AdaptationAiError(aggregateResult.error ?? '阶段划分聚合失败', 'STAGE_MAP_AGGREGATE_FAILED')
  }
  return String(aggregateResult.response)
}

/**
 * Plot Cards：剧情卡拆解；支持 focusStage / gapInstruction / useSinglePass 切档
 */
export async function runPlotCards(ctx: PlotCardsContext): Promise<string> {
  const appStore = ensureAppStore()
  const singlePass = shouldUseSinglePass(ctx.sourceText.length, ctx.useSinglePass)
  const chunks = chunkSourceText(ctx.sourceText, singlePass)
  const responses: string[] = []
  for (const chunk of chunks) {
    const taskKey = `adaptation-plot-cards:${chunk.index}/${chunk.total}`
    const result = await appStore.runTrackedAiTask(
      {
        key: taskKey,
        kind: 'adaptation',
        label: `AI 剧情卡拆解（分块 ${chunk.index}/${chunk.total}）`,
        panel: 'adaptation'
      },
      () => window.characterArc.generateAi(toIpcPayload({
        task: 'adaptation-plot-cards',
        clientKey: taskKey,
        settings: appStore.appSettings,
        context: {
          referenceTitle: ctx.referenceTitle,
          chapterManifest: ctx.chapterManifest ?? '[]',
          sourceText: chunk.text,
          lead: ctx.lead ?? null,
          bookUnderstanding: ctx.bookUnderstanding ?? null,
          toneProfile: ctx.toneProfile ?? null,
          focusStage: ctx.focusStage ?? null,
          coverageGaps: ctx.coverageGaps ?? [],
          adaptationChunkPass: chunks.length > 1,
          adaptationChunkIndex: chunk.index,
          adaptationChunkTotal: chunk.total,
          adaptationSynthesis: false
        }
      }))
    )
    const aiResult = result as unknown as AiCallResult
    if (!aiResult.success || !aiResult.response) {
      throw new AdaptationAiError(aiResult.error ?? '剧情卡拆解 AI 调用失败', 'PLOT_CARDS_FAILED')
    }
    responses.push(String(aiResult.response))
  }
  if (chunks.length === 1) return responses[0]
  const taskKey = 'adaptation-plot-cards:aggregate'
  const aggregate = await appStore.runTrackedAiTask(
    {
      key: taskKey,
      kind: 'adaptation',
      label: 'AI 剧情卡拆解（聚合）',
      panel: 'adaptation'
    },
    () => window.characterArc.generateAi(toIpcPayload({
      task: 'adaptation-plot-cards',
      clientKey: taskKey,
      settings: appStore.appSettings,
      context: {
        referenceTitle: ctx.referenceTitle,
        chapterManifest: ctx.chapterManifest ?? '[]',
        sourceText: ctx.sourceText,
        lead: ctx.lead ?? null,
        bookUnderstanding: ctx.bookUnderstanding ?? null,
        toneProfile: ctx.toneProfile ?? null,
        focusStage: ctx.focusStage ?? null,
        coverageGaps: ctx.coverageGaps ?? [],
        adaptationSynthesis: true,
        adaptationChunkPass: false
      }
    }))
  )
  const aggregateResult = aggregate as unknown as AiCallResult
  if (!aggregateResult.success || !aggregateResult.response) {
    throw new AdaptationAiError(aggregateResult.error ?? '剧情卡聚合失败', 'PLOT_CARDS_AGGREGATE_FAILED')
  }
  return String(aggregateResult.response)
}

/**
 * Character Bible：人物 + 合并建议（4 模式：chunkPass / assetSynthesis / synthesis / singlePass）
 */
export async function runCharacterBible(
  ctx: AdaptationTaskContext & { assetSynthesis?: boolean }
): Promise<string> {
  const appStore = ensureAppStore()
  const assetSynthesis = ctx.assetSynthesis === true
  const taskKey = `adaptation-character-bible:${assetSynthesis ? 'asset' : 'full'}`
  const result = await appStore.runTrackedAiTask(
    {
      key: taskKey,
      kind: 'adaptation',
      label: assetSynthesis ? 'AI 人物资产合成（基于剧情卡）' : 'AI 人物全字段扫描',
      panel: 'adaptation'
    },
    () => window.characterArc.generateAi(toIpcPayload({
      task: 'adaptation-character-bible',
      clientKey: taskKey,
      settings: appStore.appSettings,
      context: {
        referenceTitle: ctx.referenceTitle,
        chapterManifest: ctx.chapterManifest ?? '[]',
        sourceText: ctx.sourceText,
        lead: ctx.lead ?? null,
        adaptationAssetSynthesis: assetSynthesis,
        adaptationChunkPass: false,
        adaptationSynthesis: false
      }
    }))
  )
  const aiResult = result as unknown as AiCallResult
  if (!aiResult.success || !aiResult.response) {
    throw new AdaptationAiError(aiResult.error ?? '人物资产 AI 调用失败', 'CHARACTER_BIBLE_FAILED')
  }
  return String(aiResult.response)
}

/**
 * Tone Profile：全书基调（三刻度 + 约束规则）
 */
export async function runToneProfile(ctx: AdaptationTaskContext): Promise<string> {
  const appStore = ensureAppStore()
  const taskKey = 'adaptation-tone-profile'
  const result = await appStore.runTrackedAiTask(
    {
      key: taskKey,
      kind: 'adaptation',
      label: `AI 提取《${ctx.referenceTitle}》的全书基调`,
      panel: 'adaptation'
    },
    () => window.characterArc.generateAi(toIpcPayload({
      task: 'adaptation-tone-profile',
      clientKey: taskKey,
      settings: appStore.appSettings,
      context: {
        referenceTitle: ctx.referenceTitle,
        chapterManifest: ctx.chapterManifest ?? '[]',
        sourceText: ctx.sourceText,
        lead: ctx.lead ?? null
      }
    }))
  )
  const aiResult = result as unknown as AiCallResult
  if (!aiResult.success || !aiResult.response) {
    throw new AdaptationAiError(aiResult.error ?? '全书基调 AI 调用失败', 'TONE_PROFILE_FAILED')
  }
  return String(aiResult.response)
}

/**
 * 重跑当前阶段（标记 stale + 重新跑对应 handler）
 */
export async function rerunStage(
  runId: string,
  stageId: AdaptationStageId,
  ctx: AdaptationTaskContext
): Promise<string> {
  const appStore = ensureAppStore()
  appStore.markDownstreamAdaptationStagesStale(runId, stageId)
  if (stageId === 'lead') {
    return runLeadIdentify(ctx)
  }
  if (stageId === 'stages') {
    return runStageMap(ctx)
  }
  if (stageId === 'plot-cards') {
    return runPlotCards({
      ...ctx,
      focusStage: null,
      coverageGaps: []
    })
  }
  if (stageId === 'characters') {
    return runCharacterBible({ ...ctx, assetSynthesis: false })
  }
  if (stageId === 'tone') {
    return runToneProfile(ctx)
  }
  throw new AdaptationAiError(`未知的阶段标识：${stageId}`, 'UNKNOWN_STAGE')
}

/** 工具：从阶段列表取得聚焦阶段 */
export function getFocusStage(stages: AdaptationStage[], stageId: string): AdaptationStage | null {
  return stages.find((stage) => stage.id === stageId) ?? null
}
