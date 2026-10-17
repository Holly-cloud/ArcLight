/** 从错误响应体中提取可读的错误信息 */
async function readErrorMessage(response: Response, fallbackLabel: string): Promise<string> {
  const fallback = `${fallbackLabel} 请求失败：${response.status} ${response.statusText}`
  let text = ''
  try {
    text = await response.text()
  } catch {
    return fallback
  }
  const trimmed = text.trim()
  if (!trimmed) return fallback
  try {
    const data = JSON.parse(trimmed) as Record<string, unknown>
    // 兼容多种错误体：{error:string}（如 GRS AI）/ {error:{message}} / {message} / {detail}
    const candidate = data.error ?? data.message ?? data.detail
    if (typeof candidate === 'string' && candidate.trim()) {
      return `${fallbackLabel} 请求失败：${candidate.trim()}`
    }
    if (candidate && typeof candidate === 'object') {
      const nested = (candidate as { message?: unknown }).message
      if (typeof nested === 'string' && nested.trim()) {
        return `${fallbackLabel} 请求失败：${nested.trim()}`
      }
    }
    // 结构化但无可用字段：原样回传截断后的响应体，避免把真实原因吞掉
    return `${fallbackLabel} 请求失败：${trimmed.slice(0, 300)}`
  } catch {
    return `${fallbackLabel} 请求失败：${trimmed.slice(0, 300)}`
  }
}

export interface PerformAiRequestOptions {
  url: string
  init: RequestInit
  providerLabel: string
  externalSignal?: AbortSignal
  timeoutMs?: number
  requestFetch?: typeof fetch
}

async function performAiRequest(
  urlOrOpts: string | PerformAiRequestOptions,
  init?: RequestInit,
  providerLabel?: string,
  externalSignal?: AbortSignal
): Promise<Response> {
  let url: string
  let reqInit: RequestInit
  let label: string
  let signal: AbortSignal | undefined
  let timeoutMs: number | undefined
  let requestFetch: typeof fetch

  if (typeof urlOrOpts === 'object') {
    url = urlOrOpts.url
    reqInit = urlOrOpts.init
    label = urlOrOpts.providerLabel
    signal = urlOrOpts.externalSignal
    timeoutMs = urlOrOpts.timeoutMs
    requestFetch = urlOrOpts.requestFetch ?? globalThis.fetch
  } else {
    url = urlOrOpts
    reqInit = init!
    label = providerLabel!
    signal = externalSignal
    timeoutMs = undefined
    requestFetch = globalThis.fetch
  }

  const timeoutCtl = timeoutMs && timeoutMs > 0 ? new AbortController() : undefined
  const timer = timeoutCtl ? setTimeout(() => timeoutCtl.abort(), timeoutMs) : undefined
  const combinedSignal = timeoutCtl
    ? signal
      ? AbortSignal.any([signal, timeoutCtl.signal])
      : timeoutCtl.signal
    : signal
  try {
    const response = await requestFetch(url, { ...reqInit, signal: combinedSignal })
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, label))
    }
    return response
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      if (signal?.aborted) throw error
      if (timeoutCtl?.signal.aborted) {
        throw new Error(`${label} 请求超时，请检查网络、代理或模型服务状态。`)
      }
    }
    throw error
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export { performAiRequest, readErrorMessage }
