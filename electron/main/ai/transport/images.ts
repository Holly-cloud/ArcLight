import type { AppSettings, AiRunUsage } from '../shared-types'
import { resolveOpenAiCompatibleSize } from '../../../shared/image-size.ts'
import { isGrsaiChannel } from '../../../shared/image-channel.ts'
import { performAiRequest } from './http.ts'
import { createProxyFetch } from '../proxy-fetch.ts'
import {
  buildGrsaiRequestBody,
  grsaiGenerateEndpoint,
  grsaiResultEndpoint,
  grsaiResultToDataUrl,
  isGrsaiTerminalStatus,
  isRetryableGrsaiError,
  parseGrsaiResponse,
  type GrsaiParsedResponse,
  type GrsaiReplyType
} from './grsai.ts'

/** 图片生成接口的返回结果 */
export type GeneratedImageResult = {
  dataUrl: string
  revisedPrompt?: string
  /** 部分图片模型（如 gpt-image-1）会返回 token 用量 */
  usage?: AiRunUsage
}

/** 图片生成的可选参数（v1.33.0：参考图 / 画幅比 / 分辨率 / 返回方式） */
export type GenerateImageOptions = {
  /** 参考图：dataURL 或远程 URL（图生图 / 一致性） */
  images?: string[]
  /** 画幅比，如 'auto' | '1:1' | '16:9' | '3:4' */
  aspectRatio?: string
  /** 分辨率，如 '1K' | '2K' | '4K' */
  imageSize?: string
  /** 返回方式；GRS AI 默认 'json'（同步返回最终结果） */
  replyType?: GrsaiReplyType
  /** 取消信号；超时 / 用户取消时中断请求 */
  signal?: AbortSignal
}

/** 把图片生成相关的配置项（imageModel、imageApiKey、imageBaseUrl）提取到通用字段中 */
function normalizeImageSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    model: settings.imageModel?.trim() || '',
    apiKey: settings.imageApiKey?.trim() || '',
    baseUrl: settings.imageBaseUrl?.trim() || '',
    provider: settings.imageProvider?.trim() || ''
  }
}

/** 根据 base64 数据的头部特征推断图片 MIME 类型 */
function inferMimeType(base64: string): string {
  if (base64.startsWith('/9j/')) {
    return 'image/jpeg'
  }

  if (base64.startsWith('UklGR')) {
    return 'image/webp'
  }

  return 'image/png'
}

/** 判断错误是否为「provider 不支持 response_format 参数」，用于决定是否去掉该参数重试。 */
function isUnsupportedResponseFormatError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase()
  return message.includes('response_format') && (
    message.includes('not supported')
    || message.includes('unsupportedparams')
    || message.includes('unsupported')
    || message.includes('drop_params')
  )
}

/**
 * 调用图片生成接口，返回 data URL 格式的图片。
 *
 * @param settings - 应用配置（需包含 imageModel、imageBaseUrl、imageApiKey）
 * @param prompt - 图片生成提示词
 * @returns 包含 dataUrl 和可选 revisedPrompt 的结果
 */
export async function generateImage(settings: AppSettings, prompt: string, options?: GenerateImageOptions): Promise<GeneratedImageResult> {
  const normalized = normalizeImageSettings(settings)
  if (!normalized.model.trim()) {
    throw new Error('请先在顶栏「图片 → 配置」里填写生图模型（不会自动回退到文本模型）。')
  }
  if (!normalized.baseUrl.trim()) {
    throw new Error('请先在顶栏「图片 → 配置」里填写该渠道的 Base URL。')
  }
  if (!normalized.apiKey.trim()) {
    throw new Error('请先在顶栏「图片 → 配置」里填写该渠道的 API Key。')
  }

  // v1.33.0：按渠道分支；GRS AI 走独立协议（按预设或主机识别），其它/缺省保持 OpenAI 兼容逻辑不变（封面零回归）。
  if (isGrsaiChannel(settings)) {
    return generateImageViaGrsai(normalized, prompt, options)
  }

  const url = `${normalized.baseUrl.replace(/\/$/, '')}/images/generations`
  const requestFetch = createProxyFetch(settings.proxyUrl)
  // v1.36.2：本分支此前丢弃画幅比（size 硬编码），改为就近取档位；未带画幅比时回落旧值，封面等旧调用行为不变。
  const resolvedSize = resolveOpenAiCompatibleSize(options?.aspectRatio, options?.imageSize)

  // 默认请求 b64_json 以获得可本地保存的自包含图片；部分 provider（如 gpt-image-1、
  // 经 litellm 代理的 agnes 等）不支持 response_format，命中后去掉该参数重试一次。
  const buildBody = (includeResponseFormat: boolean): string => JSON.stringify({
    model: normalized.model,
    prompt,
    size: resolvedSize.size,
    ...(includeResponseFormat ? { response_format: 'b64_json' } : {})
  })

  const requestOnce = (includeResponseFormat: boolean): Promise<Response> => performAiRequest({
    url,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${normalized.apiKey}`
      },
      body: buildBody(includeResponseFormat)
    },
    providerLabel: '图片生成接口',
    requestFetch
  })

  let response: Response
  try {
    response = await requestOnce(true)
  } catch (error) {
    if (!isUnsupportedResponseFormatError(error)) {
      throw error
    }
    response = await requestOnce(false)
  }

  const data = (await response.json()) as {
    data?: Array<{
      b64_json?: string
      revised_prompt?: string
      url?: string
    }>
    usage?: {
      input_tokens?: number
      output_tokens?: number
      total_tokens?: number
      prompt_tokens?: number
      completion_tokens?: number
    }
  }
  const first = data.data?.[0]
  if (!first) {
    throw new Error('图片生成成功，但没有返回图片数据。')
  }

  const rawUsage = data.usage
  const usage: AiRunUsage | undefined = rawUsage
    ? {
        promptTokens: Number.isFinite(rawUsage.input_tokens) ? rawUsage.input_tokens : (Number.isFinite(rawUsage.prompt_tokens) ? rawUsage.prompt_tokens : undefined),
        completionTokens: Number.isFinite(rawUsage.output_tokens) ? rawUsage.output_tokens : (Number.isFinite(rawUsage.completion_tokens) ? rawUsage.completion_tokens : undefined),
        totalTokens: Number.isFinite(rawUsage.total_tokens) ? rawUsage.total_tokens : undefined
      }
    : undefined

  if (first.b64_json?.trim()) {
    const base64 = first.b64_json.trim()
    return {
      dataUrl: `data:${inferMimeType(base64)};base64,${base64}`,
      revisedPrompt: first.revised_prompt?.trim() || undefined,
      usage
    }
  }

  if (first.url?.trim()) {
    // 部分 provider 返回远程 URL；本地保存功能只接受 data URL，这里下载并转 base64 兜底。
    const dataUrl = await remoteImageToDataUrl(first.url.trim(), requestFetch)
    return {
      dataUrl,
      revisedPrompt: first.revised_prompt?.trim() || undefined,
      usage
    }
  }

  throw new Error('图片生成成功，但返回结果中没有可用图片。')
}

/** 下载远程图片并转成 base64 data URL；失败时回退为原始 URL。 */
async function remoteImageToDataUrl(url: string, requestFetch: typeof fetch): Promise<string> {
  try {
    const response = await performAiRequest({
      url,
      init: { method: 'GET' },
      providerLabel: '图片下载',
      requestFetch
    })
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || ''
    const base64 = Buffer.from(await response.arrayBuffer()).toString('base64')
    const mimeType = contentType.startsWith('image/') ? contentType : `image/${inferMimeType(base64).replace('image/', '')}`
    return `data:${mimeType};base64,${base64}`
  } catch {
    return url
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 单次请求超时（GRS 出图较慢，默认 180s） */
const GRSAI_REQUEST_TIMEOUT_MS = 180_000
/** 失败重试上限（仅网络错误 / 超时 / 429 / 5xx） */
const GRSAI_MAX_RETRIES = 2
/** 重试间隔 */
const GRSAI_RETRY_DELAY_MS = 1500
/** running 轮询上限（仅异步 replyType 场景） */
const GRSAI_POLL_TIMEOUT_MS = 120_000
const GRSAI_POLL_INTERVAL_MS = 1000

/** 发起 GRS 生图请求，对网络错误 / 超时 / 429 / 5xx 有限次重试 */
async function requestGrsaiWithRetry(opts: {
  endpoint: string
  apiKey: string
  body: string
  requestFetch: typeof fetch
  signal?: AbortSignal
}): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt <= GRSAI_MAX_RETRIES; attempt += 1) {
    if (opts.signal?.aborted) throw new Error('任务已被取消。')
    try {
      return await performAiRequest({
        url: opts.endpoint,
        init: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${opts.apiKey}`
          },
          body: opts.body
        },
        providerLabel: 'GRS AI 图片生成接口',
        requestFetch: opts.requestFetch,
        externalSignal: opts.signal,
        timeoutMs: GRSAI_REQUEST_TIMEOUT_MS
      })
    } catch (error) {
      lastError = error
      if (opts.signal?.aborted || !isRetryableGrsaiError(error) || attempt === GRSAI_MAX_RETRIES) {
        throw error
      }
      await delay(GRSAI_RETRY_DELAY_MS)
    }
  }
  throw lastError
}

/** 轮询 running 状态直到终态（正常 json 路径无需轮询） */
async function pollGrsaiResult(
  opts: { baseUrl: string; apiKey: string; requestFetch: typeof fetch; signal?: AbortSignal },
  initial: GrsaiParsedResponse
): Promise<GrsaiParsedResponse> {
  const startedAt = Date.now()
  let parsed = initial
  while (!isGrsaiTerminalStatus(parsed.status)) {
    if (opts.signal?.aborted) throw new Error('任务已被取消。')
    if (Date.now() - startedAt > GRSAI_POLL_TIMEOUT_MS) {
      throw new Error('图片生成超时，请稍后重试。')
    }
    await delay(GRSAI_POLL_INTERVAL_MS)
    const response = await performAiRequest({
      url: grsaiResultEndpoint(opts.baseUrl, parsed.id),
      init: {
        method: 'GET',
        headers: { Authorization: `Bearer ${opts.apiKey}` }
      },
      providerLabel: 'GRS AI 图片结果查询接口',
      requestFetch: opts.requestFetch,
      externalSignal: opts.signal
    })
    parsed = parseGrsaiResponse(await response.json())
  }
  return parsed
}

/**
 * GRS AI 生图链路：`POST {baseUrl}/v1/api/generate`（replyType='json' 同步返回），
 * 失败 / 违规抛可读错误，结果 URL 复用 {@link remoteImageToDataUrl} 下载为 data URL。
 */
async function generateImageViaGrsai(
  settings: AppSettings,
  prompt: string,
  options?: GenerateImageOptions
): Promise<GeneratedImageResult> {
  const requestFetch = createProxyFetch(settings.proxyUrl)
  const body = buildGrsaiRequestBody({
    model: settings.model,
    prompt,
    images: options?.images,
    aspectRatio: options?.aspectRatio,
    imageSize: options?.imageSize,
    replyType: options?.replyType
  })
  const response = await requestGrsaiWithRetry({
    endpoint: grsaiGenerateEndpoint(settings.baseUrl),
    apiKey: settings.apiKey,
    body,
    requestFetch,
    signal: options?.signal
  })
  let parsed = parseGrsaiResponse(await response.json())
  if (parsed.status === 'running' && parsed.id) {
    parsed = await pollGrsaiResult(
      { baseUrl: settings.baseUrl, apiKey: settings.apiKey, requestFetch, signal: options?.signal },
      parsed
    )
  }
  const dataUrl = await grsaiResultToDataUrl(parsed, (url) => remoteImageToDataUrl(url, requestFetch))
  return { dataUrl }
}
