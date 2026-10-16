import type { AssetEntry } from '@/features/assetLibrary/assetLibraryModel'

/**
 * v1.27.0 资产库「导出资产参考表」纯函数模型
 * - 无 Vue 依赖、无 IO，便于 Node 单测
 * - 输出三种格式：Markdown / JSON / CSV（CSV 的 palette 用 `;` 分隔）
 */

/** 资产参考表字段 */
export type AssetReferenceField =
  | 'name'
  | 'type'
  | 'renderMode'
  | 'palette'
  | 'moodWords'
  | 'keyReferences'
  | 'tags'
  | 'lightingNote'
  | 'seasonNote'
  | 'materialityNote'
  | 'description'

/** 强制包含字段（不可取消勾选） */
export const FORCED_ASSET_REFERENCE_FIELDS: readonly AssetReferenceField[] = [
  'name',
  'type',
  'renderMode',
  'palette',
  'moodWords',
  'keyReferences',
  'tags'
] as const

/** 可选字段（弹窗勾选） */
export const OPTIONAL_ASSET_REFERENCE_FIELDS: readonly AssetReferenceField[] = [
  'lightingNote',
  'seasonNote',
  'materialityNote',
  'description'
] as const

/** 固定列顺序（导出表头按此顺序） */
export const ASSET_REFERENCE_FIELD_ORDER: readonly AssetReferenceField[] = [
  'name',
  'type',
  'renderMode',
  'palette',
  'moodWords',
  'keyReferences',
  'tags',
  'lightingNote',
  'seasonNote',
  'materialityNote',
  'description'
] as const

export const ASSET_REFERENCE_FIELD_LABELS: Record<AssetReferenceField, string> = {
  name: '名称',
  type: '类型',
  renderMode: '渲染方式',
  palette: '配色',
  moodWords: '氛围词',
  keyReferences: '关键参照',
  tags: '标签',
  lightingNote: '光影',
  seasonNote: '季相',
  materialityNote: '材质',
  description: '描述'
}

/** 数组型字段（Markdown/CSV 渲染时 join；JSON 保留数组） */
const ARRAY_FIELDS: ReadonlySet<AssetReferenceField> = new Set(['palette', 'moodWords', 'keyReferences', 'tags'])

/** 一行导出数据（按字段顺序存储已选字段；数组字段在 JSON 中保留为数组） */
export type AssetReferenceRow = Partial<Record<AssetReferenceField, string | string[]>>

export interface BuildAssetReferenceRowsOptions {
  /** 勾选的可选字段；缺省为全部可选字段。强制字段始终包含。 */
  fields?: AssetReferenceField[]
  /** description 截断长度（默认 80，对应 PRD「前 80 字」） */
  descriptionLength?: number
}

function truncate(text: string, length: number): string {
  const value = String(text ?? '')
  return value.length > length ? `${value.slice(0, length)}…` : value
}

/**
 * 把资产聚合条目映射为导出用行（仅包含已选字段）。
 * - 强制字段恒在；可选字段按 options.fields 勾选。
 * - 旧资产缺失视觉字段一律兜底为空串 / 空数组，不抛错。
 */
export function buildAssetReferenceRows(
  entries: AssetEntry[],
  options: BuildAssetReferenceRowsOptions = {}
): AssetReferenceRow[] {
  const selectedOptional = (options.fields ?? [...OPTIONAL_ASSET_REFERENCE_FIELDS]).filter((field) =>
    (OPTIONAL_ASSET_REFERENCE_FIELDS as readonly AssetReferenceField[]).includes(field)
  )
  const included = new Set<AssetReferenceField>([...FORCED_ASSET_REFERENCE_FIELDS, ...selectedOptional])
  const descriptionLength = Number.isFinite(options.descriptionLength)
    ? Math.max(0, Number(options.descriptionLength))
    : 80

  return (entries ?? []).map((entry) => {
    const row: AssetReferenceRow = {}
    for (const field of ASSET_REFERENCE_FIELD_ORDER) {
      if (!included.has(field)) continue
      switch (field) {
        case 'name':
          row.name = entry.name ?? ''
          break
        case 'type':
          row.type = entry.typeLabel ?? ''
          break
        case 'renderMode':
          row.renderMode = entry.renderMode ?? ''
          break
        case 'palette':
          row.palette = [...(entry.palette ?? [])]
          break
        case 'moodWords':
          row.moodWords = [...(entry.moodWords ?? [])]
          break
        case 'keyReferences':
          row.keyReferences = [...(entry.keyReferences ?? [])]
          break
        case 'tags':
          row.tags = [...(entry.tags ?? [])]
          break
        case 'lightingNote':
          row.lightingNote = entry.lightingNote ?? ''
          break
        case 'seasonNote':
          row.seasonNote = entry.seasonNote ?? ''
          break
        case 'materialityNote':
          row.materialityNote = entry.materialityNote ?? ''
          break
        case 'description':
          row.description = truncate(entry.description ?? '', descriptionLength)
          break
      }
    }
    return row
  })
}

/** 行的字段顺序（取第一行自己的键，按固定列顺序排列） */
function rowFields(row: AssetReferenceRow | undefined): AssetReferenceField[] {
  if (!row) return []
  return ASSET_REFERENCE_FIELD_ORDER.filter((field) => field in row)
}

/** 单元格文本：数组字段用分隔符 join */
function cellText(value: string | string[] | undefined, separator: string): string {
  if (Array.isArray(value)) return value.join(separator)
  return value == null ? '' : String(value)
}

/** Markdown 表格（`|` 转义） */
export function formatAsMarkdown(rows: AssetReferenceRow[]): string {
  const fields = rowFields(rows[0])
  if (fields.length === 0) return ''
  const escape = (text: string): string => text.replace(/\|/g, '\\|').replace(/\n/g, ' ')
  const header = `| ${fields.map((field) => ASSET_REFERENCE_FIELD_LABELS[field]).join(' | ')} |`
  const divider = `| ${fields.map(() => '---').join(' | ')} |`
  const body = rows.map((row) => `| ${fields.map((field) => escape(cellText(row[field], ', '))).join(' | ')} |`)
  return [header, divider, ...body].join('\n')
}

/** JSON（数组字段保留为数组），2 空格缩进 */
export function formatAsJson(rows: AssetReferenceRow[]): string {
  return JSON.stringify(rows, null, 2)
}

/** 单格 CSV 转义：含 , " \n \r 时用双引号包裹并把内部 " 翻倍 */
function escapeCsvCell(text: string): string {
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

/** CSV：palette 等数组字段用 `;` 分隔（PRD C-4） */
export function formatAsCsv(rows: AssetReferenceRow[]): string {
  const fields = rowFields(rows[0])
  if (fields.length === 0) return ''
  const header = fields.map((field) => escapeCsvCell(ASSET_REFERENCE_FIELD_LABELS[field])).join(',')
  const body = rows.map((row) => fields.map((field) => escapeCsvCell(cellText(row[field], ';'))).join(','))
  return [header, ...body].join('\n')
}

/** 供 C-5 视觉预览弹窗：组装一条可直接粘贴到外部生图工具的 Prompt 文本 */
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
