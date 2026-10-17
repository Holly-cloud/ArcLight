/**
 * v1.33.0 资产图库「提示词组装」纯函数模型
 * - 无 Vue 依赖、无 IO，便于 Node 单测
 * - 复用/扩展 `buildImagePrompt`（视觉字段 → 文本），项目级视觉风格统一注入前缀
 */
import type { AssetImageKind } from '@/types/app'
import { buildImagePrompt } from '@/features/visualStyle/exportAssetReference'

/** 单条资产的提示词来源（AssetEntry 的子集，旧资产缺字段一律兜底为空） */
export interface AssetImagePromptAsset {
  kind: AssetImageKind
  name: string
  /** 类型/定位展示文案：角色=role，场景/道具=type */
  typeLabel: string
  description: string
  tags: string[]
  renderMode: string
  palette: string[]
  moodWords: string[]
  keyReferences: string[]
  lightingNote: string
  seasonNote: string
  materialityNote: string
}

/** 项目级视觉风格（仅人工填写，可空） */
export interface PromptProjectVisualStyle {
  palette?: string[]
  lightingRules?: string
  seasonPalette?: string[]
  moodWords?: string[]
  /** v1.34.0 图片主风格：渲染方式（生图 renderMode 默认） */
  renderMode?: string | null
  /** v1.34.0 图片主风格：默认画幅比 */
  defaultAspectRatio?: string | null
}

export interface ComposeAssetImagePromptInput {
  asset?: AssetImagePromptAsset | null
  projectStyle?: PromptProjectVisualStyle | null
  /** 用户附加说明（可编辑文本域里追加的内容） */
  userNote?: string
}

/** 画幅比候选（GRS AI 已确认接受 16:9 / 3:4 等） */
export const ASPECT_RATIO_OPTIONS: readonly string[] = [
  'auto', '1:1', '3:4', '4:3', '16:9', '9:16', '2:3', '3:2', '5:4', '4:5', '21:9'
] as const

/** 分辨率候选 */
export const IMAGE_SIZE_OPTIONS: readonly string[] = ['1K', '2K', '4K'] as const

/** 按资产类型推荐默认画幅比（v1.34.0）：角色 / 场景 16:9、道具 1:1 */
export function recommendAspectRatio(kind: AssetImageKind | string | null | undefined): string {
  if (kind === 'character') return '16:9'
  if (kind === 'scene') return '16:9'
  return '1:1'
}

/**
 * 解析生图默认画幅比：优先取项目「图片主风格」的 defaultAspectRatio（若合法），
 * 否则回退到按资产类型的推荐值。用于「未改过生成选项」时的初始值。
 */
export function resolveDefaultAspectRatio(
  kind: AssetImageKind | string | null | undefined,
  projectStyle?: PromptProjectVisualStyle | null
): string {
  const configured = (projectStyle?.defaultAspectRatio ?? '').trim()
  if (configured && ASPECT_RATIO_OPTIONS.includes(configured)) return configured
  return recommendAspectRatio(kind)
}

function joinList(values?: string[] | null): string {
  if (!Array.isArray(values)) return ''
  return values.map((value) => String(value ?? '').trim()).filter(Boolean).join(' / ')
}

/**
 * 组装资产生图提示词：
 * 1) 项目级视觉风格前缀（配色 / 季相色板 / 光影规则 / 氛围词）
 * 2) 资产视觉字段（复用 buildImagePrompt）+ 标签
 * 3) 用户附加说明
 * 空字段一律跳过；全部为空时回退到资产名（或「资产配图」），不抛错。
 */
export function composeAssetImagePrompt(input: ComposeAssetImagePromptInput): string {
  const asset = input?.asset ?? null
  const projectStyle = input?.projectStyle ?? null
  const lines: string[] = []

  if (projectStyle) {
    const renderMode = (projectStyle.renderMode ?? '').trim()
    const palette = joinList(projectStyle.palette)
    const season = joinList(projectStyle.seasonPalette)
    const mood = joinList(projectStyle.moodWords)
    const lighting = (projectStyle.lightingRules ?? '').trim()
    if (renderMode) lines.push(`项目渲染方式：${renderMode}`)
    if (palette) lines.push(`项目配色：${palette}`)
    if (season) lines.push(`项目季相色板：${season}`)
    if (lighting) lines.push(`项目光影规则：${lighting}`)
    if (mood) lines.push(`项目氛围词：${mood}`)
  }

  if (asset) {
    const assetText = buildImagePrompt({
      name: asset.name,
      type: asset.typeLabel,
      renderMode: asset.renderMode,
      palette: asset.palette,
      moodWords: asset.moodWords,
      keyReferences: asset.keyReferences,
      lightingNote: asset.lightingNote,
      seasonNote: asset.seasonNote,
      materialityNote: asset.materialityNote,
      description: asset.description
    }).trim()
    if (assetText) lines.push(assetText)
    const tags = joinList(asset.tags)
    if (tags) lines.push(`标签：${tags}`)
  }

  const note = (input?.userNote ?? '').trim()
  if (note) lines.push(note)

  if (lines.length === 0) {
    return asset?.name?.trim() || '资产配图'
  }
  return lines.join('\n')
}
