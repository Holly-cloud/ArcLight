/**
 * v1.36.2 生图渠道协议判定（纯函数）。
 *
 * 主进程与渲染层必须共用这一份：此前渲染层只看 `imageProvider === 'grsai'`，
 * 而主进程还按主机名识别，导致「自定义 OpenAI 兼容预设里手填 GRS 主机」时
 * 两侧对同一条渠道的结论不一致。
 */

const GRSAI_HOSTS = ['grsai.dakka.com.cn', 'grsaiapi.com'] as const

export interface GrsaiChannelProbe {
  imageProvider?: string | null
  imageBaseUrl?: string | null
  baseUrl?: string | null
}

function isGrsaiHost(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase()
    return GRSAI_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
  } catch {
    return false
  }
}

/** 该渠道是否应走 GRS 协议（显式预设，或图片 Base URL / 通用 Base URL 指向 GRS 主机） */
export function isGrsaiChannel(settings: GrsaiChannelProbe | null | undefined): boolean {
  if (String(settings?.imageProvider ?? '').trim().toLowerCase() === 'grsai') return true
  const url = String(settings?.imageBaseUrl ?? '').trim() || String(settings?.baseUrl ?? '').trim()
  return url ? isGrsaiHost(url) : false
}
