/**
 * v1.37.0 生图渠道配置（可多条，全局生效）。
 *
 * 放在 electron/shared 是因为三方都要用同一份定义：
 * 主进程持久化与 schema 4→5 迁移、渲染层顶栏切换器与配置弹窗、以及各自的单测。
 */

import { isGrsaiChannel } from './image-channel.ts'

/** 生图线协议：GRS 独立协议，或 OpenAI 兼容 /images/generations */
export type ImageProfileProtocol = 'grsai' | 'openai-images'

export interface ImageProfile {
  id: string
  name: string
  protocol: ImageProfileProtocol
  baseUrl: string
  apiKey: string
  model: string
}

/** 全局可保存的生图渠道条数上限 */
export const IMAGE_PROFILE_LIMIT = 8

/** 旧四列归一出来的那条配置固定用这个 id，升级后仍能认出它 */
export const LEGACY_IMAGE_PROFILE_ID = 'legacy-image-profile'

const IMAGE_PROFILE_PROTOCOLS: string[] = ['grsai', 'openai-images']

/**
 * transport 层仍按四字段读取渠道（`electron/main/ai/transport/images.ts`），
 * 调用前把一条配置摊平成它的形状——这样 v1.36.2 的档位映射与渠道判定零改动。
 */
export interface ImageRequestSettings {
  imageProvider: string
  imageModel: string
  imageApiKey: string
  imageBaseUrl: string
}

export function toImageRequestSettings(profile: ImageProfile | null | undefined): ImageRequestSettings {
  return {
    imageProvider: profile?.protocol ?? 'openai-images',
    imageModel: profile?.model ?? '',
    imageApiKey: profile?.apiKey ?? '',
    imageBaseUrl: profile?.baseUrl ?? ''
  }
}

/** 取当前生效的配置；activeId 落空时退回第一条，全空时返回 null */
export function resolveActiveImageProfile(
  profiles: ImageProfile[] | null | undefined,
  activeId: string | null | undefined
): ImageProfile | null {
  const list = Array.isArray(profiles) ? profiles : []
  const id = String(activeId ?? '').trim()
  return list.find((item) => item?.id === id) ?? list[0] ?? null
}

/**
 * 旧版工作区 JSON / schema ≤4 的库里可能仍带着这四个字段，
 * 而 AppSettings 类型上已经没有它们了，所以入口按 unknown 收。
 */
export type LegacyImageSettingsInput = {
  imageProvider?: unknown
  imageModel?: unknown
  imageApiKey?: unknown
  imageBaseUrl?: unknown
}

/**
 * 把 schema ≤4 的 image_provider / image_model / image_api_key / image_base_url 收成一条配置。
 * DB 迁移与旧版工作区导入共用这一份，避免两侧对「走哪条协议」的判断分叉。
 * 四字段全空时返回 null（表示本来就没配过）。
 *
 * 刻意不回退到文本模型的 base_url：transport 从来只读 imageBaseUrl，
 * 一旦回填，升级后生图会静默打到语言模型端点上去。
 */
export function legacyImageColumnsToProfile(legacy: LegacyImageSettingsInput | null): ImageProfile | null {
  const provider = String(legacy?.imageProvider ?? '').trim()
  const model = String(legacy?.imageModel ?? '').trim()
  const apiKey = String(legacy?.imageApiKey ?? '').trim()
  const baseUrl = String(legacy?.imageBaseUrl ?? '').trim()
  if (!provider && !model && !apiKey && !baseUrl) return null
  return {
    id: LEGACY_IMAGE_PROFILE_ID,
    name: '迁移自旧配置',
    protocol: isGrsaiChannel({ imageProvider: provider, imageBaseUrl: baseUrl }) ? 'grsai' : 'openai-images',
    baseUrl,
    apiKey,
    model
  }
}

/** 清洗外部来的配置数组：去空 id、trim、协议缺失时按主机名推断、截断到上限 */
export function normalizeImageProfiles(value: unknown): ImageProfile[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item): ImageProfile => {
      const baseUrl = String(item.baseUrl ?? '').trim()
      const protocol = typeof item.protocol === 'string' && IMAGE_PROFILE_PROTOCOLS.includes(item.protocol)
        ? (item.protocol as ImageProfileProtocol)
        : isGrsaiChannel({ imageBaseUrl: baseUrl })
          ? 'grsai'
          : 'openai-images'
      return {
        id: String(item.id ?? '').trim(),
        name: String(item.name ?? '').trim(),
        protocol,
        baseUrl,
        apiKey: String(item.apiKey ?? '').trim(),
        model: String(item.model ?? '').trim()
      }
    })
    .filter((item) => item.id)
    .slice(0, IMAGE_PROFILE_LIMIT)
}
