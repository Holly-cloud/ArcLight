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
  imageProvider: string
  imageModel: string
  imageApiKey: string
  imageBaseUrl: string
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
}

/** 场景 / 道具视觉上下文（v1.27.0，可空） */
export interface VisualContext {
  colorPalette: string[]
  lightingNote: string
  seasonNote: string
  materialityNote: string
}

/** 项目级视觉风格（v1.27.0，可空；仅人工填写） */
export interface ProjectVisualStyle {
  palette: string[]
  lightingRules: string
  seasonPalette: string[]
  moodWords: string[]
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
  LOAD_WORKSPACE: 'characterarc:load-workspace',
  SAVE_WORKSPACE: 'characterarc:save-workspace',
  SAVE_APP_SETTINGS: 'characterarc:save-app-settings',
  SAVE_CHAPTERS: 'characterarc:save-chapters',
  SAVE_CHAPTER_ORDER: 'characterarc:save-chapter-order',
  SAVE_WORKSPACE_ENTITIES: 'characterarc:save-workspace-entities',
  BACKUP_CURRENT_DATABASE: 'characterarc:backup-current-database',
  LIST_DATABASE_BACKUPS: 'characterarc:list-database-backups',
  DELETE_DATABASE_BACKUP: 'characterarc:delete-database-backup',
  ROLLBACK_DATABASE: 'characterarc:rollback-database'
} as const

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS]
