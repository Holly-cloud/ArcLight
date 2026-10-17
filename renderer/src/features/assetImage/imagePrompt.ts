/**
 * v1.34.0 资产生图「结构化提示词」纯函数（自 visualStyle/exportAssetReference 迁入并保留）
 * - 无 Vue 依赖、无 IO，便于 Node 单测
 * - 把资产视觉字段拼成可直接粘贴到外部生图工具的多行 Prompt 文本
 */

/** 组装提示词所需的资产视觉字段（可空，缺字段一律跳过） */
export interface ImagePromptInput {
  name?: string
  type?: string
  renderMode?: string
  palette?: string[]
  moodWords?: string[]
  keyReferences?: string[]
  lightingNote?: string
  seasonNote?: string
  materialityNote?: string
  description?: string
}

/** 组装一条可直接粘贴到外部生图工具的 Prompt 文本；输入为空时返回空串 */
export function buildImagePrompt(input: ImagePromptInput | null | undefined): string {
  if (!input) return ''
  const lines: string[] = []
  const title = [input.name, input.type].filter(Boolean).join(' · ')
  if (title) lines.push(title)
  if (input.renderMode) lines.push(`渲染方式：${input.renderMode}`)
  if (input.palette?.length) lines.push(`配色：${input.palette.join(' / ')}`)
  if (input.moodWords?.length) lines.push(`氛围词：${input.moodWords.join(' / ')}`)
  if (input.keyReferences?.length) lines.push(`关键参照：${input.keyReferences.join(' / ')}`)
  if (input.lightingNote) lines.push(`光影：${input.lightingNote}`)
  if (input.seasonNote) lines.push(`季相：${input.seasonNote}`)
  if (input.materialityNote) lines.push(`材质：${input.materialityNote}`)
  if (input.description) lines.push(input.description)
  return lines.join('\n')
}
