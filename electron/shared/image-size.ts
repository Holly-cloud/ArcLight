/**
 * v1.36.2 OpenAI 兼容生图渠道的尺寸档位映射（纯函数，主进程与渲染层共用，无 IO / 无网络）。
 */

export const OPENAI_COMPATIBLE_AUTO_SIZE = 'auto'

/** 缺参数时沿用 1.36.1 之前传输层的硬编码值，保证封面等旧调用零行为变化 */
export const OPENAI_COMPATIBLE_FALLBACK_SIZE = '1024x1536'

export interface OpenAiSizeTier {
  size: string
  width: number
  height: number
  ratio: string
}

export const OPENAI_COMPATIBLE_SIZE_TIERS: readonly OpenAiSizeTier[] = [
  { size: '1024x1024', width: 1024, height: 1024, ratio: '1:1' },
  { size: '1536x1024', width: 1536, height: 1024, ratio: '3:2' },
  { size: '1024x1536', width: 1024, height: 1536, ratio: '2:3' }
]

export interface ResolvedOpenAiImageSize {
  /** 最终发给渠道的 size 值 */
  size: string
  /** 实际档位比例；auto 或未带比例时为空 */
  tierRatio: string
  /** 所选比例正好等于档位比例 */
  exact: boolean
  /** 是否透传了 auto */
  auto: boolean
  /** 本次映射是否由调用方给出的画幅比驱动 */
  applied: boolean
  /** 分辨率参数在本协议下无法翻译（非 1K） */
  sizeIgnored: boolean
  /** 供界面展示的一句话；未带画幅比时为空串 */
  note: string
}

const RATIO_PATTERN = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/

function parseRatio(value: string | null | undefined): number | null {
  const match = RATIO_PATTERN.exec(String(value ?? '').trim())
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  return width / height
}

/** 畸变程度随倍率而非差值变化，因此按对数距离取最近档 */
function nearestTier(wanted: number): OpenAiSizeTier {
  let best = OPENAI_COMPATIBLE_SIZE_TIERS[0]
  let bestDistance = Math.abs(Math.log(wanted / (best.width / best.height)))
  for (const tier of OPENAI_COMPATIBLE_SIZE_TIERS.slice(1)) {
    const distance = Math.abs(Math.log(wanted / (tier.width / tier.height)))
    if (distance < bestDistance) {
      best = tier
      bestDistance = distance
    }
  }
  return best
}

function isSameRatio(wanted: number, tier: OpenAiSizeTier): boolean {
  return Math.abs(Math.log(wanted / (tier.width / tier.height))) < 1e-9
}

function normalizeToken(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase()
}

export function resolveOpenAiCompatibleSize(
  aspectRatio?: string | null,
  imageSize?: string | null
): ResolvedOpenAiImageSize {
  const ratioToken = String(aspectRatio ?? '').trim()
  const sizeToken = String(imageSize ?? '').trim()
  const sizeIgnored = Boolean(sizeToken) && normalizeToken(sizeToken) !== '1k'

  if (normalizeToken(ratioToken) === 'auto') {
    return {
      size: OPENAI_COMPATIBLE_AUTO_SIZE,
      tierRatio: 'auto',
      exact: true,
      auto: true,
      applied: true,
      sizeIgnored,
      note: `该渠道按 auto 请求尺寸，实际画幅由服务端决定。${sizeIgnored ? ` ${sizeToken} 分辨率在该协议下不生效（尺寸由档位决定）。` : ''}`
    }
  }

  const wanted = parseRatio(ratioToken)
  if (wanted === null) {
    return {
      size: OPENAI_COMPATIBLE_FALLBACK_SIZE,
      tierRatio: '',
      exact: false,
      auto: false,
      applied: false,
      sizeIgnored,
      note: ''
    }
  }

  const tier = nearestTier(wanted)
  const exact = isSameRatio(wanted, tier)
  const detail = exact
    ? `该档位比例与所选一致。`
    : `OpenAI 兼容档位没有 ${ratioToken}，已就近取 ${tier.ratio}。`
  return {
    size: tier.size,
    tierRatio: tier.ratio,
    exact,
    auto: false,
    applied: true,
    sizeIgnored,
    note: `此渠道按 ${tier.size}（${tier.ratio}）出图。${detail}${sizeIgnored ? ` ${sizeToken} 分辨率在该协议下不生效（尺寸由档位决定）。` : ''}`
  }
}
