import type { VisualPromptValue } from './visual-prompt.ts'
import type { ImageProfile } from './image-profile.ts'

export interface IpcResult<T = void> {
  success: boolean
  error?: string
  result?: T
}

export interface IpcPayloadResult<T = unknown> {
  success: boolean
  error?: string
  payload?: T
}

export interface AppSettingsPayload {
  provider: string
  model: string
  apiKey: string
  baseUrl: string
  apiProtocol?: 'auto' | 'openai-responses' | 'openai-chat' | 'anthropic'
  codexCliPath?: string
  codexReasoningEffort?: 'default' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra'
  proxyUrl: string
  temperature?: number
  topP?: number
  presencePenalty?: number
  frequencyPenalty?: number
  aiProfiles: Array<{ id: string; name: string; provider: string; baseUrl: string; apiKey: string; model: string; apiProtocol?: 'auto' | 'openai-responses' | 'openai-chat' | 'anthropic'; codexCliPath?: string; codexReasoningEffort?: 'default' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra'; temperature?: number; topP?: number; presencePenalty?: number; frequencyPenalty?: number }>
  activeAiProfileId: string
  /** 已保存的生图渠道配置列表（v1.37.0 起取代单套 imageProvider/Model/ApiKey/BaseUrl） */
  imageProfiles: ImageProfile[]
  /** 当前激活的生图渠道配置 ID */
  activeImageProfileId: string
  autoSaveInterval: string
  uiScale: number
  workspaceMenuOrder: string[]
  /** 侧栏隐藏的创作模块 ID 列表（全局设置） */
  hiddenWorkbenchModules?: string[]
  darkMode: boolean
  darkModeStyle: string
}

export interface SaveAppSettingsRequest {
  theme: string
  selectedProjectId: string
  appSettings: AppSettingsPayload
}

export interface PersistedChapterRecord {
  id: string
  outlineItemId: string
  volumeId: string
  sortOrder?: number
  title: string
  summary: string
  status: 'draft' | 'review' | 'polish' | 'final'
  wordTarget: string
  content: string
  contentLoaded?: boolean
  contentLength?: number
  contentPreview?: string
  contentEnding?: string
}

export interface SaveChaptersRequest {
  projectId: string
  projectWordCount: string
  chapters: PersistedChapterRecord[]
}

export interface ChapterOrderRecord {
  id: string
  volumeId: string
  sortOrder: number
}

export interface SaveChapterOrderRequest {
  projectId: string
  chapters: ChapterOrderRecord[]
}

export interface PersistedWorldviewEntryRecord {
  id: string
  type: string
  title: string
  content: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/** 生图渲染方式（v1.27.0 视觉一致性元数据，可空） */
export type VisualRenderMode =
  | 'realistic'
  | 'anime'
  | 'oil-paint'
  | 'ink-wash'
  | 'low-poly'
  | 'flat-illustration'

/** 角色视觉风格档案（v1.27.0，可空） */
export interface VisualStyleProfile {
  renderMode: VisualRenderMode
  palette: string[]
  moodWords: string[]
  keyReferences: string[]
  /**
   * 视觉提示词：v1.34.3 为纯文本；v1.36.0 起可存分节结构化文档。
   * 旧数据缺省读为 null；旧纯文本按「整段」读取，不丢内容。
   */
  visualPrompt?: VisualPromptValue
}

/** 场景 / 道具视觉上下文（v1.27.0，可空） */
export interface VisualContext {
  colorPalette: string[]
  lightingNote: string
  seasonNote: string
  materialityNote: string
  /**
   * 视觉提示词：v1.34.3 为纯文本；v1.36.0 起可存分节结构化文档。
   * 旧数据缺省读为 null；旧纯文本按「整段」读取，不丢内容。
   */
  visualPrompt?: VisualPromptValue
}

/** 项目级视觉风格（v1.27.0，可空；仅人工填写） */
export interface ProjectVisualStyle {
  palette: string[]
  lightingRules: string
  seasonPalette: string[]
  moodWords: string[]
  /** v1.34.0 图片主风格：生图默认渲染方式；旧数据缺省读为 null */
  renderMode?: VisualRenderMode | null
  /** v1.34.0 图片主风格：默认画幅比（角色 / 场景默认 16:9，道具 1:1）；旧数据缺省读为 null */
  defaultAspectRatio?: string | null
}

/** 资产图库支持的资产类型（v1.33.0） */
export type AssetImageKind = 'character' | 'scene' | 'prop'

/** 资产图库条目元数据（v1.33.0）；渲染层不持有图片字节，显示走 arc-asset:// 或 IPC 读取通道 */
export interface AssetImageItem {
  /** 图库条目唯一标识 */
  id: string
  /** 所属项目 ID */
  projectId: string
  /** 资产类型 */
  assetKind: AssetImageKind
  /** 所属资产 ID */
  assetId: string
  /** 图像文件名（相对项目图像目录，如 `<id>.png`） */
  fileName: string
  /** 图像 MIME 类型 */
  mime: string
  /** 生成时使用的原始提示词 */
  prompt: string
  /** 服务端回写的修订提示词 */
  revisedPrompt: string
  /** 生图渠道标识，如 'grsai' */
  provider: string
  /** 生图模型名称 */
  model: string
  /** 画幅比，如 '3:4' */
  aspectRatio: string
  /** 分辨率，如 '1K' */
  imageSize: string
  /** 参考图来源（图库 id 列表） */
  referenceIds: string[]
  /** 是否为该资产的首选图（仅影响图库排序与左栏头像，不参与生图方向）；每资产至多 1 张 */
  isPrimary: boolean
  /** 生成状态 */
  status: 'succeeded' | 'failed'
  /** 失败原因（status='failed' 时非空） */
  error: string
  /** 创建时间 ISO 时间戳 */
  createdAt: string
  /** 最后更新时间 ISO 时间戳 */
  updatedAt: string
}

export interface PersistedCharacterRecord {
  id: string
  name: string
  role: string
  description: string
  avatar: string
  tags: Array<{
    label: string
    tone?: 'default' | 'danger' | 'success' | 'warning'
  }>
  /** 角色视觉风格档案；旧数据缺省为 null（v1.27.0） */
  visualStyle?: VisualStyleProfile | null
}

/** 项目内某资产「首选图」的引用（v1.36.0：资产库卡片封面用） */
export interface AssetPrimaryImageRef {
  /** 资产类型（组织无图库，不会出现） */
  assetKind: AssetImageKind
  /** 资产 ID */
  assetId: string
  /** 首选图 ID（显示走 arc-asset://<imageId>） */
  imageId: string
}

export interface PersistedInspirationEntryRecord {
  id: string
  type: string
  title: string
  content: string
  tags: string[]
  source: 'ai' | 'manual'
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface PersistedSceneLocationRecord {
  id: string
  name: string
  type: string
  description: string
  tags: Array<{ label: string; tone?: 'default' | 'danger' | 'success' | 'warning' }>
  color: string
  sortOrder: number
  relatedCharacterIds: string[]
  relatedPropIds: string[]
  createdAt: string
  updatedAt: string
  /** 场景视觉上下文；旧数据缺省为 null（v1.27.0） */
  visualContext?: VisualContext | null
}

export interface PersistedPropRecord {
  id: string
  name: string
  type: string
  description: string
  ownerCharacterId: string
  tags: Array<{ label: string; tone?: 'default' | 'danger' | 'success' | 'warning' }>
  color: string
  sortOrder: number
  relatedSceneIds: string[]
  relatedCharacterIds: string[]
  createdAt: string
  updatedAt: string
  /** 道具视觉上下文；旧数据缺省为 null（v1.27.0） */
  visualContext?: VisualContext | null
}

/** Prompt 中心（v1.35.0）：左侧任务目录条目 */
export interface AiPromptCatalogEntry {
  /** 任务名（与 `AiTaskName` 一致） */
  task: string
  /** AI 返回格式 */
  outputType: 'json' | 'text'
  /** 本任务默认启用的功能模块（capability）id 列表 */
  capabilities: string[]
  /** 与 capabilities 对应的中文展示标签（供界面直接渲染，避免渲染层重复维护映射） */
  capabilityLabels: string[]
  /** 是否参与项目 skills 匹配 */
  useSkills: boolean
  /** 是否走 Agent 运行时（含工具调用 / 追加系统层） */
  agentRuntime: boolean
}

/** Prompt 中心：prompt 预览请求 */
export interface AiPromptPreviewRequest {
  /** 任务名 */
  task: string
  /** 可选上下文：省略＝基础骨架；传入＝用该上下文试拼 */
  context?: Record<string, unknown>
}

/** Prompt 中心：prompt 预览结果（只读展示用，不含任何密钥） */
export interface AiPromptPreviewResult {
  /** 任务名 */
  task: string
  /** system 段全文 */
  system: string
  /** user 段全文 */
  user: string
  /** 本任务默认启用的功能模块 id 列表 */
  capabilities: string[]
  /** 是否走 Agent 运行时 */
  agentRuntime: boolean
  /** 展示用提示（如「另有 Agent 系统层」），可为空 */
  notes: string[]
}

/** 单表 JSON blob：顶层冗余字段便于查询，其余内嵌字段统一存入 payloadJson */
export interface SaveWorkspaceEntitiesRequest {
  projectId: string
  worldviewEntries?: PersistedWorldviewEntryRecord[]
  characters?: PersistedCharacterRecord[]
  inspirationEntries?: PersistedInspirationEntryRecord[]
  sceneLocations?: PersistedSceneLocationRecord[]
  propItems?: PersistedPropRecord[]
}

export interface DatabaseBackupSummary {
  id: string
  createdAt: string
  appVersion: string
  schemaVersion: number
  type: 'pre-upgrade' | 'pre-rollback' | 'manual'
  size: number
}

export type ChapterMutationEvent =
  | ({ kind: 'upsert' } & SaveChaptersRequest)
  | ({ kind: 'reorder' } & SaveChapterOrderRequest)

export const IPC_CHANNELS = {
  LOAD_WORKSPACE: 'clytie:load-workspace',
  SAVE_WORKSPACE: 'clytie:save-workspace',
  SAVE_APP_SETTINGS: 'clytie:save-app-settings',
  SAVE_CHAPTERS: 'clytie:save-chapters',
  SAVE_CHAPTER_ORDER: 'clytie:save-chapter-order',
  SAVE_WORKSPACE_ENTITIES: 'clytie:save-workspace-entities',
  BACKUP_CURRENT_DATABASE: 'clytie:backup-current-database',
  LIST_DATABASE_BACKUPS: 'clytie:list-database-backups',
  DELETE_DATABASE_BACKUP: 'clytie:delete-database-backup',
  ROLLBACK_DATABASE: 'clytie:rollback-database',
  // ── 资产图库（v1.33.0）──
  LIST_ASSET_IMAGES: 'clytie:list-asset-images',
  /** 列出项目内各资产的「首选图」引用（v1.36.0：资产库卡片封面用，单次查询避免 N+1） */
  LIST_PRIMARY_ASSET_IMAGES: 'clytie:list-primary-asset-images',
  DELETE_ASSET_IMAGE: 'clytie:delete-asset-image',
  SET_PRIMARY_IMAGE: 'clytie:set-primary-image',
  EXPORT_ASSET_IMAGE: 'clytie:export-asset-image',
  PICK_REFERENCE_IMAGE: 'clytie:pick-reference-image',
  READ_ASSET_IMAGE: 'clytie:read-asset-image',
  PRUNE_ASSET_IMAGES: 'clytie:prune-asset-images',
  // ── Prompt 中心（v1.35.0）──
  LIST_AI_PROMPT_CATALOG: 'clytie:ai-prompt-catalog',
  RENDER_AI_PROMPT_PREVIEW: 'clytie:ai-prompt-preview'
} as const

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS]
