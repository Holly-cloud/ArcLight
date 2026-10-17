/**
 * v1.33.0 GRS AI 生图协议：请求体构造与响应解析（纯函数，无 electron / fetch 依赖，便于单测）。
 *
 * 事实依据（2026-10-17 真实试调）：`POST {baseUrl}/v1/api/generate`，
 * `replyType:'json'` 同步返回最终结果；响应顶层键 `id,status,progress,results`；
 * `results[]` 每项仅 `url`（JPEG）；`status=violation|failed` 表示失败。
 */

export type GrsaiReplyType = 'json' | 'stream' | 'async'

/** GRS AI 终态：succeeded / violation / failed（`running` 为进行中） */
export type GrsaiTerminalStatus = 'succeeded' | 'violation' | 'failed'
export type GrsaiStatus = GrsaiTerminalStatus | 'running'

export interface GrsaiGenerateInput {
  model: string
  prompt: string
  /** 参考图：公网 URL 或 base64 data URL（图生图 / 一致性） */
  images?: string[]
  aspectRatio?: string
  imageSize?: string
  replyType?: GrsaiReplyType
}

export const GRSAI_DEFAULT_ASPECT_RATIO = 'auto'
export const GRSAI_DEFAULT_IMAGE_SIZE = '1K'
export const GRSAI_DEFAULT_REPLY_TYPE: GrsaiReplyType = 'json'

function trimBaseUrl(baseUrl: string): string {
  return String(baseUrl ?? '').replace(/\/+$/, '')
}

/** 生图接口地址 */
export function grsaiGenerateEndpoint(baseUrl: string): string {
  return `${trimBaseUrl(baseUrl)}/v1/api/generate`
}

/** 轮询查询结果接口地址（仅在 `replyType:'async'` 的 running 兜底路径使用） */
export function grsaiResultEndpoint(baseUrl: string, id: string): string {
  return `${trimBaseUrl(baseUrl)}/v1/api/result?id=${encodeURIComponent(id)}`
}

/** 组装请求体（images 为空时不下发该字段；所有字段强制为字符串，避免 GRS “参数数据类型错误”） */
export function buildGrsaiRequestBody(input: GrsaiGenerateInput): string {
  const images = Array.isArray(input.images)
    ? input.images.map((item) => String(item ?? '')).filter(Boolean)
    : []
  return JSON.stringify({
    model: String(input.model ?? ''),
    prompt: String(input.prompt ?? ''),
    ...(images.length ? { images } : {}),
    aspectRatio: String(input.aspectRatio || GRSAI_DEFAULT_ASPECT_RATIO),
    imageSize: String(input.imageSize || GRSAI_DEFAULT_IMAGE_SIZE),
    replyType: String(input.replyType || GRSAI_DEFAULT_REPLY_TYPE)
  })
}

export interface GrsaiParsedResponse {
  id: string
  status: GrsaiStatus
  progress: number
  /** 结果图远程 URL（未成功时为空串） */
  url: string
  /** 失败原因（成功时为空串） */
  error: string
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * 解析 GRS AI 生图响应。
 * - `status=violation|failed` → 原样保留（含 error 文案）。
 * - `succeeded` / `success` / 缺省但带 url → succeeded。
 * - `running|pending|processing` → running（若已带 url 视为 succeeded 兜底）。
 * - 成功但无 url、或未知状态无 url → failed。
 */
export function parseGrsaiResponse(payload: unknown): GrsaiParsedResponse {
  const data = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
  const id = readString(data.id)
  const rawStatus = readString(data.status).toLowerCase()
  const progress = Number.isFinite(data.progress) ? Number(data.progress) : 0
  const results = Array.isArray(data.results) ? data.results : []
  const first = (results[0] && typeof results[0] === 'object' ? results[0] : {}) as Record<string, unknown>
  const url = readString(first.url)
  const error =
    readString(data.error) ||
    readString(data.failure_reason) ||
    readString((data as { message?: unknown }).message) ||
    readString(first.error)

  let status: GrsaiStatus
  if (rawStatus === 'violation' || rawStatus === 'failed') {
    status = rawStatus
  } else if (rawStatus === 'running' || rawStatus === 'pending' || rawStatus === 'processing') {
    status = url ? 'succeeded' : 'running'
  } else if (
    rawStatus === 'succeeded' ||
    rawStatus === 'success' ||
    rawStatus === 'completed' ||
    rawStatus === 'done' ||
    rawStatus === ''
  ) {
    status = url ? 'succeeded' : 'failed'
  } else {
    status = url ? 'succeeded' : 'failed'
  }

  return { id, status, progress, url, error }
}

/** 该状态是否已到终态（running 需要继续轮询） */
export function isGrsaiTerminalStatus(status: GrsaiStatus): boolean {
  return status !== 'running'
}

/**
 * 是否应对该错误重试（仅网络错误 / 超时 / HTTP 429 / 5xx）。
 * `violation` / `failed` / 4xx 不重试（由调用方保证不进入本函数）。
 */
export function isRetryableGrsaiError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase()
  if (!message) return false
  if (message.includes('超时') || message.includes('timeout')) return true
  if (/\b429\b/.test(message)) return true
  if (/\b5\d\d\b/.test(message)) return true
  return /fetch failed|network|enotfound|econnreset|econnrefused|etimedout|socket hang up|terminated|aborted/.test(message)
}

/**
 * 把解析结果转成本地可用的 data URL：成功时用注入的 downloader 下载远程 URL；
 * 失败 / 违规 / 仍在生成时抛出可读错误。
 */
export async function grsaiResultToDataUrl(
  parsed: GrsaiParsedResponse,
  download: (url: string) => Promise<string>
): Promise<string> {
  if (parsed.status === 'violation') {
    throw new Error(parsed.error || '图片生成被判定为违规，请调整提示词后重试。')
  }
  if (parsed.status === 'failed') {
    throw new Error(parsed.error || '图片生成失败，请重试。')
  }
  if (parsed.status === 'running') {
    throw new Error('图片仍在生成中，请稍候。')
  }
  if (!parsed.url) {
    throw new Error('图片生成成功，但没有返回图片数据。')
  }
  return download(parsed.url)
}
