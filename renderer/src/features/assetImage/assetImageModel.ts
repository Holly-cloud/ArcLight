/**
 * v1.33.0 资产图库「排序 / 过滤 / 参考图校验」纯函数模型
 * - 无 Vue 依赖、无 IO，便于 Node 单测
 */
import type { AssetImageItem } from '@/types/app'

/** 参考图数量上限（图库选 + 本地上传合计） */
export const MAX_REFERENCE_IMAGES = 4

/** 单张参考图体积上限（字节，与主进程 pickReferenceImage 一致） */
export const REFERENCE_IMAGE_MAX_BYTES = 8 * 1024 * 1024

/** 图库状态过滤维度 */
export type AssetImageStatusFilter = 'all' | 'succeeded' | 'failed'

/** 排序：首选图优先，其次按创建时间倒序（新图在前）；不改动入参 */
export function sortAssetImages(items: AssetImageItem[] | null | undefined): AssetImageItem[] {
  return [...(items ?? [])].sort((left, right) => {
    if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1
    const leftTime = Date.parse(left.createdAt) || 0
    const rightTime = Date.parse(right.createdAt) || 0
    if (leftTime !== rightTime) return rightTime - leftTime
    return String(right.id).localeCompare(String(left.id))
  })
}

/** 按生成状态过滤 */
export function filterAssetImagesByStatus(
  items: AssetImageItem[] | null | undefined,
  status: AssetImageStatusFilter
): AssetImageItem[] {
  const list = items ?? []
  if (status === 'all') return [...list]
  return list.filter((item) => item.status === status)
}

/** 取该资产的首选图（无则 null） */
export function pickPrimaryImage(items: AssetImageItem[] | null | undefined): AssetImageItem | null {
  return (items ?? []).find((item) => item.isPrimary) ?? null
}

/** 估计 data URL 承载的字节数（base64 → 原始字节） */
export function estimateDataUrlBytes(dataUrl: string): number {
  const value = String(dataUrl ?? '')
  const comma = value.indexOf(',')
  const base64 = value.startsWith('data:') && comma >= 0 ? value.slice(comma + 1) : value
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding)
}

export interface ValidationResult {
  ok: boolean
  message?: string
}

/** 校验参考图数量是否超限 */
export function validateReferenceCount(count: number): ValidationResult {
  const total = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0
  if (total > MAX_REFERENCE_IMAGES) {
    return { ok: false, message: `参考图最多 ${MAX_REFERENCE_IMAGES} 张，请先移除多余参考图。` }
  }
  return { ok: true }
}

/** 校验参考图体积是否超限 */
export function validateReferenceImageSize(dataUrl: string): ValidationResult {
  const bytes = estimateDataUrlBytes(dataUrl)
  if (bytes > REFERENCE_IMAGE_MAX_BYTES) {
    return { ok: false, message: '参考图体积过大，请选择小于 8MB 的图片。' }
  }
  return { ok: true }
}

/** 图库角标文案：首选图 / 失败（v1.34.3 起统一，适配角色 / 场景 / 道具；v1.36.0 由「基准图」更名） */
export function imageBadgeLabel(item: AssetImageItem): string {
  if (item.status === 'failed') return '失败'
  if (item.isPrimary) return '首选图'
  return ''
}
