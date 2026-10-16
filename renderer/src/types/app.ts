import type { SkillUsePolicy } from '@shared/assistant-runtime'

export type { SkillUsePolicy } from '@shared/assistant-runtime'

/** v1.27.0 视觉一致性元数据类型（沿用 @shared/ipc-types 契约，单一定义源） */
export type {
  VisualRenderMode,
  VisualStyleProfile,
  VisualContext,
  ProjectVisualStyle
} from '@shared/ipc-types'
import type { ProjectVisualStyle, VisualContext, VisualStyleProfile } from '@shared/ipc-types'

/** 主题名称，决定应用的视觉色调 */
export type ThemeName = 'ocean' | 'jade' | 'amber' | 'rose'

/** 深色模式风格预设 */
export type DarkModeStyle = 'nord'

/** 工作台面板名称 */
export type PanelName = 'workflow' | 'overview' | 'deconstruction' | 'project-knowledge' | 'world' | 'characters' | 'relations' | 'inspiration' | 'outline' | 'threads' | 'chapters' | 'settings' | 'global-assistant' | 'global-assistant-v2'

/** 小说流程阶段标识 */
export type NovelWorkflowStageId = 'reference' | 'premise' | 'setting' | 'outline' | 'draft'

/** 小说流程阶段状态 */
export type NovelWorkflowStageStatus = 'todo' | 'doing' | 'done'

/** 项目级小说流程阶段 */
export interface NovelWorkflowStageState {
  /** 阶段唯一标识 */
  id: NovelWorkflowStageId
  /** 当前阶段状态 */
  status: NovelWorkflowStageStatus
}

/** 固定创作记忆键 */
export type WorkflowDocumentKey =
  | 'task_plan'
  | 'findings'
  | 'progress'
  | 'current_status'
  | 'novel_setting'
  | 'character_relationships'
  | 'pending_hooks'
  | 'resource_ledger'

/** 项目级创作记忆 */
export interface WorkflowDocument {
  /** 记忆键 */
  key: WorkflowDocumentKey
  /** 展示标题 */
  title: string
  /** 记忆正文 */
  content: string
  /** 最后更新时间 */
  updatedAt: string
}

/** 助手写作动作类型 */
export type AssistantCommandType =
  | 'insert-into-chapter'
  | 'update-chapter-title'
  | 'update-chapter-summary'
  | 'create-outline-item'
  | 'append-workflow-document-entry'
  | 'update-workflow-document'
  | 'save-knowledge-document'

/** 助手动作来源：直接执行命令 / 待确认 proposal */
export type AssistantCommandKind = 'direct-command' | 'proposal'

/** 助手动作目标 */
export type AssistantCommandTarget =
  | 'chapter-content'
  | 'chapter-title'
  | 'chapter-summary'
  | 'outline-item'
  | 'workflow-document'
  | 'knowledge-document'

/** Agent proposal 预览 */
export interface AgentProposalPreview {
  /** 预览标题 */
  title: string
  /** 简短摘要 */
  summary: string
  /** 可选的原内容摘要 */
  before?: string
  /** 可选的新内容摘要 */
  after?: string
}

/** Agent proposal 的确认状态 */
export interface AgentConfirmationState {
  /** 是否需要确认 */
  required: boolean
  /** 确认时间 */
  confirmedAt?: string
  /** 拒绝时间 */
  rejectedAt?: string
}

/** Agent proposal 当前阶段 */
export type AgentExecutionStep = 'idle' | 'proposed' | 'applying'

/** Agent 对用户意图的归类 */
export type AgentIntentKind = 'chat' | 'command' | 'proposal'

/** AI 返回的助理意图结果 */
export interface AssistantIntentResult {
  /** 本轮更适合普通聊天还是动作提议 */
  intent: 'chat' | 'proposal'
  /** 给用户的简短理由 */
  reason: string
}

/** AI 返回的结构化动作提议结果 */
export interface AssistantActionProposalResult {
  /** 对应动作类型 */
  commandType: AssistantCommandType
  /** 目标对象 */
  target: AssistantCommandTarget
  /** 动作说明 */
  reason: string
  /** 预览标题 */
  title: string
  /** 预览摘要 */
  summary: string
  /** 原内容摘要 */
  before?: string
  /** 新内容摘要 */
  after?: string
  /** 是否属于破坏性写入 */
  destructive: boolean
  /** 是否需要确认 */
  requiresConfirmation: boolean
  /** 原始执行载荷 */
  payload: Record<string, unknown>
}

/** 单次 Agent proposal */
export interface AgentProposal {
  /** proposal 唯一标识 */
  id: string
  /** 对应动作类型 */
  commandType: AssistantCommandType
  /** 目标对象 */
  target: AssistantCommandTarget
  /** 动作说明 */
  reason: string
  /** 预览数据 */
  preview: AgentProposalPreview
  /** 是否属于破坏性写入 */
  destructive: boolean
  /** 是否需要确认 */
  requiresConfirmation: boolean
  /** 当前状态 */
  status: 'pending' | 'approved' | 'rejected' | 'applied'
  /** 原始 payload 归档 */
  payload: Record<string, unknown>
  /** 创建时间 */
  createdAt: string
}

/** 项目级 skill 条目 */
export interface ProjectSkillItem {
  /** skill 唯一标识 */
  id: string
  /** 展示名称 */
  name: string
  /** skill 版本号 */
  version?: string
  /** 相对技能存储区路径 */
  path: string
  /** 来源范围：软件内置 / 项目导入 */
  scope?: 'builtin' | 'project'
  /** 描述 */
  description: string
  /** 技能分类 */
  category?: 'market' | 'analysis' | 'writing' | 'polish' | 'cover' | 'tool'
  /** 当前项目内的兼容度 */
  compatibility?: 'native' | 'partial' | 'external-only'
  /** 兼容性说明 */
  compatibilityNote?: string
  /** 来源仓库或包名 */
  source?: string
  /** references/ 下的资料文件数量 */
  referencesCount?: number
  /** 是否启用 */
  enabled: boolean
  /** 适用阶段 */
  stageIds: NovelWorkflowStageId[]
}

/** 项目参考作品条目 */
export interface ReferenceStyleMetric {
  /** 指标名称 */
  label: string
  /** 指标值 */
  value: string
}

/** 项目参考作品拆书结果 */
export interface ReferenceStyleAnalysis {
  /** 拆书时间 */
  createdAt: string
  /** 来源文件名 */
  fileName: string
  /** 来源文件类型 */
  fileType: 'txt' | 'md' | 'docx'
  /** 参考作品字数 */
  characterCount: number
  /** 章节估计数 */
  chapterCount: number
  /** 开篇摘录 */
  excerpt: string
  /** 关键词 */
  topKeywords: string[]
  /** 局部统计指标 */
  metrics: ReferenceStyleMetric[]
  /** 风格骨架总述 */
  overview: string
  /** 句式与叙述密度 */
  sentenceStyle: string
  /** 对话比例与职责 */
  dialogueRatio: string
  /** 节奏控制方式 */
  pacingControl: string
  /** 情绪表达方式 */
  emotionExpression: string
  /** 叙事视角方式 */
  narrativePerspective: string
  /** 可复用风格规则 */
  styleRules: string[]
  /** 去具体化剧情骨架 */
  plotOutline: string
  /** 可复用仿写模板 */
  reusableStylePrompt: string
  /** 避免照搬的约束 */
  avoidRules: string[]
}

export interface ReferenceWorkItem {
  /** 唯一标识 */
  id: string
  /** 作品标题 */
  title: string
  /** 作品来源，如番茄 / 飞卢 / 起点 */
  source: string
  /** 备注 */
  notes: string
  /** 来源文件名 */
  fileName?: string
  /** 拆书分析结果 */
  analysis?: ReferenceStyleAnalysis
}

export interface CoverGenerationHistoryItem {
  /** 历史记录唯一标识 */
  id: string
  /** 生成时间 */
  createdAt: string
  /** 封面图 URL 或 data URL */
  cover: string
  /** 对应提示词标题 */
  promptTitle: string
  /** 完整提示词 */
  prompt: string
  /** 简短摘要 */
  summary: string
  /** 关键词 */
  keywords: string[]
  /** 本次项目题材快照 */
  genre: string
  /** 本次目标平台快照 */
  targetPlatform: string
  /** 作者署名 */
  authorName: string
  /** 额外备注 */
  extraNotes: string
}

/** 章节 AI 模板分组 */
export type ChapterAssistantTemplateGroup = 'write' | 'rewrite' | 'planning' | 'reference'

/** 章节 AI 回复模式 */
export type ChapterAssistantResponseMode = 'freeform' | 'polish' | 'continue' | 'suggest' | 'reference'

/** 章节 AI 回复长度 */
export type ChapterAssistantResponseLength = 'short' | 'medium' | 'long'

/** 章节 AI 模板任务类型 */
export type ChapterAssistantTemplateTask = 'chat' | 'outline-draft'

/** 项目级章节 AI Prompt 模板 */
export interface ChapterAssistantPromptTemplate {
  /** 模板唯一标识，对应内置动作 ID */
  id: string
  /** 模板显示名称 */
  label: string
  /** 所属分组 */
  group: ChapterAssistantTemplateGroup
  /** 实际提示词 */
  prompt: string
  /** 回复模式 */
  mode: ChapterAssistantResponseMode
  /** 回复长度 */
  length: ChapterAssistantResponseLength
  /** 任务类型 */
  task: ChapterAssistantTemplateTask
  /** 是否要求先选中文本 */
  requiresSelection: boolean
}

/** 小说长度分类 */
export type NovelLength = 'short' | 'long'

/** 项目摘要信息，用于项目列表页展示 */
export interface ProjectSummary {
  /** 项目唯一标识 */
  id: string
  /** 作品标题 */
  title: string
  /** 小说简介；旧项目未存独立字段时兼容读取首卷摘要 */
  premise?: string
  /** 题材分类，如"科幻"、"仙侠" */
  genre: string
  /** 小说长度分类：长篇 / 短篇 */
  novelLength: NovelLength
  /** 由章节正文自动汇总出的项目累计字数展示 */
  wordCount: string
  /** 最后编辑时间的人类可读文本 */
  lastEdited: string
  /** 封面图 URL 或 CSS 渐变色值 */
  cover: string
  /** 写作风格预设 ID */
  writingStylePresetId: string
  /** 自定义写作风格提示词 */
  writingStylePrompt: string
  /** 项目级章节 AI 模板覆盖 */
  chapterAssistantTemplates: ChapterAssistantPromptTemplate[]
  /** 小说流程阶段状态 */
  novelWorkflowStages: NovelWorkflowStageState[]
  /** 项目级 skills 启用状态 */
  projectSkills: ProjectSkillItem[]
  /** AI 对话默认使用的 Skill 策略 */
  skillPolicy: SkillUsePolicy
  /** 项目目标平台 */
  targetPlatform: string
  /** 本次用于生成创作记忆的参考作品 ID 列表（指向全局拆书库），可为空 */
  selectedReferenceWorkIds: string[]
  /** 封面生成历史记录 */
  coverHistory: CoverGenerationHistoryItem[]
  /** 项目级视觉风格；仅人工填写，缺省为 null（v1.27.0） */
  projectVisualStyle?: ProjectVisualStyle | null
}

/** 世界观设定条目 */
export interface WorldviewEntry {
  /** 条目唯一标识 */
  id: string
  /** 分类：地理 / 法则 / 物种 / 势力 / 历史 */
  type: string
  /** 条目标题 */
  title: string
  /** 条目正文描述 */
  content: string
  /** 排序权重，数值越小越靠前 */
  sortOrder: number
  /** 创建时间 ISO 时间戳 */
  createdAt: string
  /** 最后更新时间 ISO 时间戳 */
  updatedAt: string
}

/** 角色标签，用于角色卡的视觉标记 */
export interface CharacterTag {
  /** 标签文本 */
  label: string
  /** 标签色调，默认为灰色；danger=红，success=绿，warning=橙 */
  tone?: 'default' | 'danger' | 'success' | 'warning'
}

/** 角色卡数据结构 */
export interface CharacterCard {
  /** 角色唯一标识 */
  id: string
  /** 角色姓名 */
  name: string
  /** 角色定位短语，如"叛逆黑客 / 小队领袖" */
  role: string
  /** 角色详细描述 */
  description: string
  /** 头像 URL 或 CSS 渐变色值 */
  avatar: string
  /** 角色标签列表 */
  tags: CharacterTag[]
  /** 角色视觉风格档案；缺省为 null（v1.27.0） */
  visualStyle?: VisualStyleProfile | null
}

/** 组织/势力条目 */
export interface OrganizationEntry {
  /** 组织唯一标识 */
  id: string
  /** 组织名称 */
  name: string
  /** 组织类型，如"中立势力"、"反抗军" */
  type: string
  /** 组织定位和功能描述 */
  description: string
  /** 组织信条/口号 */
  motto: string
  /** 组织主色调，CSS 渐变色值 */
  color: string
  /** 排序权重 */
  sortOrder: number
  /** 创建时间 */
  createdAt: string
  /** 最后更新时间 */
  updatedAt: string
}

/** 场景/地点条目（结构化实体） */
export interface SceneLocation {
  /** 场景唯一标识（id 前缀 scene-） */
  id: string
  /** 场景名称（必填） */
  name: string
  /** 场景类型：城市 / 建筑 / 自然地形 / 室内 / 异空间 */
  type: string
  /** 场景详细描述 */
  description: string
  /** 场景标签列表，复用角色标签结构（含 tone 色调） */
  tags: CharacterTag[]
  /** 主色，取自主题预设色板；缺省为空字符串，渲染时回退到主题令牌 */
  color: string
  /** 排序权重，数值越小越靠前 */
  sortOrder: number
  /** 关联角色 ID 列表（内嵌 id 数组，沿用 OutlineItem 范式） */
  relatedCharacterIds: string[]
  /** 关联道具 ID 列表 */
  relatedPropIds: string[]
  /** 创建时间 ISO 时间戳 */
  createdAt: string
  /** 最后更新时间 ISO 时间戳 */
  updatedAt: string
  /** 场景视觉上下文；缺省为 null（v1.27.0） */
  visualContext?: VisualContext | null
}

/** 道具条目（结构化实体） */
export interface PropItem {
  /** 道具唯一标识（id 前缀 prop-） */
  id: string
  /** 道具名称（必填） */
  name: string
  /** 道具类型：武器 / 信物 / 法器 / 消耗品 / 线索物 */
  type: string
  /** 道具详细描述 */
  description: string
  /** 主要持有者角色 ID（单值，最简建模；缺省为空字符串） */
  ownerCharacterId: string
  /** 道具标签列表，复用角色标签结构 */
  tags: CharacterTag[]
  /** 主色，取自主题预设色板；缺省为空字符串，渲染时回退到主题令牌 */
  color: string
  /** 排序权重，数值越小越靠前 */
  sortOrder: number
  /** 关联场景 ID 列表（道具位于/出现于哪些场景） */
  relatedSceneIds: string[]
  /** 其他关联角色 ID 列表（不含 ownerCharacterId） */
  relatedCharacterIds: string[]
  /** 创建时间 ISO 时间戳 */
  createdAt: string
  /** 最后更新时间 ISO 时间戳 */
  updatedAt: string
  /** 道具视觉上下文；缺省为 null（v1.27.0） */
  visualContext?: VisualContext | null
}

/** 角色之间的关系条目 */
export interface CharacterRelationship {
  /** 关系唯一标识 */
  id: string
  /** 关系发起方角色 ID */
  fromCharacterId: string
  /** 关系接收方角色 ID */
  toCharacterId: string
  /** 关系类型，如"战友"、"宿敌"、"暗恋" */
  type: string
  /** 关系描述 */
  description: string
  /** 关系强度 0-100，数值越大关系越紧密/激烈 */
  intensity: number
  /** 创建时间 */
  createdAt: string
  /** 最后更新时间 */
  updatedAt: string
}

/** 角色在组织中的成员归属关系 */
export interface OrganizationMembership {
  /** 归属关系唯一标识 */
  id: string
  /** 角色 ID */
  characterId: string
  /** 组织 ID */
  organizationId: string
  /** 在组织中的身份/职位 */
  role: string
  /** 额外备注说明 */
  notes: string
  /** 创建时间 */
  createdAt: string
  /** 最后更新时间 */
  updatedAt: string
}

/** 灵感卡片条目 */
export interface InspirationEntry {
  /** 灵感唯一标识 */
  id: string
  /** 灵感类型：标题灵感 / 开篇钩子 / 场景火花 / 剧情转折 / 设定补完 / 人物动机 */
  type: string
  /** 灵感标题 */
  title: string
  /** 灵感正文描述 */
  content: string
  /** 筛选标签列表 */
  tags: string[]
  /** 来源：ai=AI 生成，manual=用户手动创建 */
  source: 'ai' | 'manual'
  /** 排序权重 */
  sortOrder: number
  /** 创建时间 */
  createdAt: string
  /** 最后更新时间 */
  updatedAt: string
}

/** 大纲分卷，用于将大纲节点和章节按卷分组 */
export interface OutlineVolume {
  /** 分卷唯一标识 */
  id: string
  /** 分卷标题，如"第一卷：开端" */
  title: string
  /** 分卷目标字数，仅存纯数字字符串 */
  wordTarget: string
  /** 分卷整体剧情摘要 */
  summary: string
  /** 分卷级创作记忆，每卷独立维护一套 */
  workflowDocuments?: WorkflowDocument[]
}

/** 大纲剧情节点 */
export type OutlineItemStatus = 'idea' | 'planned' | 'drafting' | 'done'

export interface OutlineItem {
  /** 节点唯一标识 */
  id: string
  /** 所属分卷 ID */
  volumeId: string
  /** 章节标题 */
  title: string
  /** 预估字数描述 */
  wordTarget: string
  /** 一句话核心冲突描述 */
  conflict: string
  /** 剧情推进摘要 */
  summary: string
  /** 相关角色 ID 列表 */
  relatedCharacterIds?: string[]
  /** 相关组织 ID 列表 */
  relatedOrganizationIds?: string[]
  /** 相关世界观设定 ID 列表 */
  relatedWorldviewIds?: string[]
  /** 节点推进状态：点子 / 已规划 / 写作中 / 已完成 */
  status: OutlineItemStatus
  /** 排序权重 */
  sortOrder: number
}

export type OutlineImportAction = 'add' | 'overwrite'
export type OutlineImportPosition = 'keep' | 'start' | 'end' | 'before' | 'after'

export interface OutlineImportNewVolume {
  key: string
  title: string
  wordTarget?: string
  summary?: string
}

export interface OutlineImportVolumeUpdate {
  volumeId: string
  title?: string
  wordTarget?: string
  summary?: string
}

export interface OutlineImportPlanEntry {
  sourceRow: number
  action: OutlineImportAction
  matchOutlineId?: string
  targetVolumeKey: string
  position: OutlineImportPosition
  anchorOutlineId?: string
  order: number
  item: {
    title: string
    wordTarget?: string
    conflict?: string
    summary?: string
    relatedCharacterIds?: string[]
    relatedOrganizationIds?: string[]
    relatedWorldviewIds?: string[]
    status?: OutlineItemStatus
  }
}

export interface OutlineImportApplyResult {
  added: number
  overwritten: number
  createdVolumes: number
}

/** AI 助手聊天消息 */
export interface AssistantToolCall {
  toolUseId: string
  toolName: string
  args: Record<string, unknown>
  status: 'running' | 'done' | 'error'
  result?: string
  isError?: boolean
  durationMs?: number
}

export interface AssistantEditEvent {
  chapterId: string
  editType: string
  preview: string
  versionId: string
}

export interface ChapterEditProposal {
  proposalId: string
  chapterId: string
  editType: string
  preview: string
  oldContent: string
  newContent: string
}

export interface AssistantTurn {
  text: string
  toolCalls: AssistantToolCall[]
  editEvents: AssistantEditEvent[]
}

export interface ChatMessage {
  /** 消息唯一标识 */
  id: string
  /** 消息角色：用户 或 助手 */
  role: 'user' | 'assistant'
  /** 消息正文内容 */
  content: string
  /** 消息创建时间；旧项目中的历史消息可能没有该字段。 */
  createdAt?: string
  toolCalls?: AssistantToolCall[]
  editEvents?: AssistantEditEvent[]
  turns?: AssistantTurn[]
  isError?: boolean
  isCanceled?: boolean
}

/** 项目知识文档来源类型 */
export type KnowledgeDocumentSourceType =
  | 'reference-summary'
  | 'reference-chunk'
  | 'workflow-document'
  | 'canon-fact'
  | 'chapter-summary'

/** 知识文档；参考资料为全局作用域，项目知识通过 projectId 隔离 */
export interface KnowledgeDocument {
  /** 文档唯一标识 */
  id: string
  /** 所属项目；全局参考资料为空 */
  projectId?: string
  /** 展示标题 */
  title: string
  /** 来源类型 */
  sourceType: KnowledgeDocumentSourceType
  /** 来源标签，如文件名或分块名 */
  sourceLabel: string
  /** 文档正文 */
  content: string
  /** 简要摘要 */
  summary: string
  /** 关键词 */
  keywords: string[]
  /** 扩展元数据 */
  metadata: Record<string, unknown>
  /** 创建时间 */
  createdAt: string
  /** 最后更新时间 */
  updatedAt: string
}

/** 某次 AI 调用实际使用的知识项 */
export interface AiRunKnowledgeItem {
  /** 命中的知识文档 ID */
  documentId: string
  /** 文档标题 */
  title: string
  /** 文档来源类型 */
  sourceType: KnowledgeDocumentSourceType
  /** 来源标签 */
  sourceLabel: string
  /** 给用户展示的命中片段 */
  snippet: string
  /** 命中关键词 */
  keywords: string[]
}

/** AI 运行状态 */
export type AiRunStatus = 'running' | 'success' | 'error' | 'canceled'

/** AI 运行 token 用量 */
export interface AiRunUsage {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  reasoningTokens?: number
  cachedInputTokens?: number
}

/** AI 调用运行记录 */
export interface AiRunRecord {
  /** 运行记录唯一标识 */
  id: string
  /** 可选关联项目 ID；空字符串表示全局调用，不影响日志记录与生命周期 */
  projectId: string
  /** 关联章节 ID */
  chapterId?: string
  /** 前端任务注册表 key（如 `worldview-entry`），用于关联进度面板 */
  clientKey?: string
  /** 任务类型 */
  task: string
  /** AI 供应商 */
  provider: string
  /** 模型名称 */
  model: string
  /** 运行状态 */
  status: AiRunStatus
  /** 开始时间 */
  startedAt: string
  /** 结束时间 */
  finishedAt?: string
  /** 总耗时（毫秒） */
  durationMs?: number
  /** 本次运行的 token 用量 */
  usage?: AiRunUsage
  /** 本次使用的知识项 */
  usedKnowledge: AiRunKnowledgeItem[]
  /** agent 模式下的工具调用轨迹 */
  toolCalls?: Array<{
    tool: string
    args: Record<string, unknown>
    durationMs: number
    status: 'ok' | 'error'
    error?: string
  }>
  /** 是否触发结构化修复 */
  repairTriggered: boolean
  /** 错误摘要 */
  error: string
  /** 响应预览 */
  responsePreview: string
}

/** 主窗口向助手窗口发送的提示词请求 */
export interface AssistantPromptRequest {
  /** 请求唯一标识，用于消费确认（避免重复处理） */
  id: string
  /** 用户输入的提示词文本 */
  prompt: string
  /** 可选的快捷动作标识，如"润色选中"、"章节标题" */
  quickAction?: string
}

/** 章节正文插入模式 */
export type ChapterInsertionMode = 'cursor' | 'append' | 'replace-selection'

/** 将 AI 生成的内容插入章节正文的请求 */
export interface ChapterInsertionRequest {
  /** 请求唯一标识 */
  id: string
  /** 目标章节 ID */
  chapterId: string
  /** 要插入的文本内容 */
  content: string
  /** 插入模式：光标处 / 追加末尾 / 替换选区 */
  mode: ChapterInsertionMode
}

/** 编辑器中用户当前选中的文本状态 */
export interface ChapterSelectionState {
  /** 选中文本所在的章节 ID */
  chapterId: string
  /** 用户选中的文本内容 */
  text: string
}

/** 剧情线索 / 伏笔追踪条目 */
export interface PlotThread {
  /** 唯一标识 */
  id: string
  /** 伏笔标题，如"林莫的穿越遗物" */
  title: string
  /** 详细描述 */
  description: string
  /** 在哪章埋下（章节 ID） */
  openedInChapterId: string
  /** 状态：活跃（未收尾）/ 已收尾 */
  status: 'open' | 'resolved'
  /** 在哪章收尾（章节 ID，resolved 时填写） */
  closedInChapterId?: string
  /** 关联标签（角色名、地点等） */
  tags: string[]
  /** 创建时间 */
  createdAt: string
  /** 最后更新时间 */
  updatedAt: string
}

/** 章节稿件数据结构 */
export interface ChapterDraft {
  /** 章节唯一标识 */
  id: string
  /** 来源大纲节点 ID，可为空 */
  outlineItemId: string
  /** 所属分卷 ID */
  volumeId: string
  /** 数据库中的稀疏排序值。 */
  sortOrder?: number
  /** 章节标题 */
  title: string
  /** 章节摘要 */
  summary: string
  /** 章节状态：草稿 / 审阅 / 润色 / 定稿 */
  status: 'draft' | 'review' | 'polish' | 'final'
  /** 预估字数描述 */
  wordTarget: string
  /** 章节正文 HTML 内容 */
  content: string
  /** 正文是否已完整加载；false 时 content 仅为短预览。 */
  contentLoaded?: boolean
  /** 未加载时用于列表字数和批量操作判断。 */
  contentLength?: number
  /** 正文开头的短预览。 */
  contentPreview?: string
  /** 正文结尾的短预览。 */
  contentEnding?: string
}

/** 章节历史版本快照，用于版本回溯 */
export interface ChapterVersion {
  /** 版本唯一标识 */
  id: string
  /** 关联的章节 ID */
  chapterId: string
  /** 快照时的章节标题 */
  title: string
  /** 快照时的章节摘要 */
  summary: string
  /** 快照时的章节状态 */
  status: ChapterDraft['status']
  /** 快照时的预估字数 */
  wordTarget: string
  /** 快照时的章节正文内容 */
  content: string
  /** 历史正文是否已完整加载。 */
  contentLoaded?: boolean
  /** 历史正文长度。 */
  contentLength?: number
  /** 版本创建时间 */
  createdAt: string
}

/** 单个项目的工作区完整数据，包含所有业务实体 */
export interface ProjectWorkspaceData {
  /** 世界观设定列表 */
  worldviewEntries: WorldviewEntry[]
  /** 角色卡列表 */
  characters: CharacterCard[]
  /** 组织列表 */
  organizations: OrganizationEntry[]
  /** 场景/地点列表 */
  sceneLocations: SceneLocation[]
  /** 道具列表 */
  propItems: PropItem[]
  /** 角色关系列表 */
  characterRelationships: CharacterRelationship[]
  /** 组织成员归属列表 */
  organizationMemberships: OrganizationMembership[]
  /** 灵感卡片列表 */
  inspirationEntries: InspirationEntry[]
  /** 大纲分卷列表 */
  outlineVolumes: OutlineVolume[]
  /** 大纲节点列表 */
  outlineItems: OutlineItem[]
  /** 章节稿件列表 */
  chapters: ChapterDraft[]
  /** 章节历史版本列表 */
  chapterVersions: ChapterVersion[]
  /** AI 聊天消息列表 */
  messages: ChatMessage[]
  globalAssistantSessions: GlobalAssistantSession[]
  activeGlobalAssistantSessionId: string
  /** AI 运行记录列表 */
  aiRuns: AiRunRecord[]
  /** 项目固定创作记忆 */
  workflowDocuments: WorkflowDocument[]
  /** 剧情线索 / 伏笔追踪列表 */
  plotThreads: PlotThread[]
  /** 文章拆解改编运行列表（4 阶段 AI 拆解；旧项目无此字段读取默认空数组） */
  adaptationRuns?: AdaptationRun[]
}

/** 导入/导出的模块类型标识 */
export type ImportExportModuleType = 'project' | 'characters' | 'outline' | 'inspiration' | 'relations' | 'chapters' | 'adaptationRuns'

/** 导入冲突解决模式 */
export type ImportConflictMode = 'overwrite' | 'copy'

/** 项目导入数据载荷，所有字段均可选 */
export interface ProjectImportPayload {
  /** 项目基础信息 */
  project?: Partial<ProjectSummary>
  worldviewEntries?: WorldviewEntry[]
  characters?: CharacterCard[]
  organizations?: OrganizationEntry[]
  sceneLocations?: SceneLocation[]
  propItems?: PropItem[]
  characterRelationships?: CharacterRelationship[]
  organizationMemberships?: OrganizationMembership[]
  inspirationEntries?: InspirationEntry[]
  outlineVolumes?: OutlineVolume[]
  outlineItems?: OutlineItem[]
  chapters?: ChapterDraft[]
  chapterVersions?: ChapterVersion[]
  adaptationRuns?: AdaptationRun[]
}

/** CharacterArc 导出文件的标准信封格式 */
export interface CharacterArcExportEnvelope {
  /** 应用标识，固定为 'CharacterArc' */
  app: 'CharacterArc'
  /** 导出文件的 schema 版本号 */
  schemaVersion: string
  /** 导出的模块类型 */
  moduleType: ImportExportModuleType
  /** 兼容性说明文案 */
  compatibilityNote: string
  /** 导出时间 ISO 时间戳 */
  exportedAt: string
  /** 导出的实际数据载荷 */
  data: ProjectImportPayload
}

/** 应用全局设置 */
export interface AiProfile {
  id: string
  name: string
  provider: string
  baseUrl: string
  apiKey: string
  model: string
  apiProtocol?: 'auto' | 'openai-responses' | 'openai-chat' | 'anthropic'
  codexCliPath?: string
  codexReasoningEffort?: 'default' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra'
  temperature?: number
  topP?: number
  presencePenalty?: number
  frequencyPenalty?: number
}

export type EditorFont = 'clear-mono' | 'modern-sans' | 'classic-serif' | 'relaxed-kai' | 'system'

export interface AppSettings {
  /** AI 供应商标识 */
  provider: string
  /** AI 模型名称 */
  model: string
  /** API 鉴权密钥 */
  apiKey: string
  /** API 基础地址 */
  baseUrl: string
  /** API 线协议；auto 时按供应商和模型目录解析 */
  apiProtocol?: 'auto' | 'openai-responses' | 'openai-chat' | 'anthropic'
  /** Codex CLI 可执行文件或所在目录 */
  codexCliPath: string
  /** Codex CLI 推理强度 */
  codexReasoningEffort: 'default' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra'
  /** AI 网络请求使用的 HTTP/HTTPS 代理地址 */
  proxyUrl: string
  /** 可选：模型采样温度，留空时使用服务端默认值 */
  temperature?: number
  /** 可选：模型 nucleus sampling 参数，留空时使用服务端默认值 */
  topP?: number
  /** 可选：降低已出现主题的复用，留空时使用服务端默认值 */
  presencePenalty?: number
  /** 可选：降低高频词语和句式的复用，留空时使用服务端默认值 */
  frequencyPenalty?: number
  /** 已保存的 AI 接口配置列表 */
  aiProfiles: AiProfile[]
  /** 当前激活的 AI 接口配置 ID */
  activeAiProfileId: string
  /** 图片服务预设标识 */
  imageProvider: string
  /** 图片生成模型名称 */
  imageModel: string
  /** 图片生成接口鉴权密钥 */
  imageApiKey: string
  /** 图片生成接口基础地址 */
  imageBaseUrl: string
  /** 自动保存间隔选项值，如 '5m'、'live' */
  autoSaveInterval: string
  /** 写作区正文字体 */
  editorFont: EditorFont
  /** UI 缩放比例，范围 0.75-1.75 */
  uiScale: number
  /** 工作台创作模块的全局菜单顺序，使用稳定菜单 ID */
  workspaceMenuOrder: string[]
  /**
   * 工作台 Tab 状态（v1.25 新增）
   * - 持久化到 appSettings（走 scheduleSettingsPersist）
   * - 切换项目不重置（用户偏好优先）
   * - 默认 'project'（缺省时由 store watch 兜底）
   */
  workbenchActiveTab?: 'project' | 'global'
  /** 是否启用深色模式 */
  darkMode: boolean
  /** 深色模式风格预设 */
  darkModeStyle: DarkModeStyle
  /** 旧数据兼容字段；AI 请求不再按时长自动取消。 */
  aiTimeoutSeconds: number
}

/** 封面工作台独立生图历史条目 */
export interface CoverWorkbenchHistoryItem {
  id: string
  createdAt: string
  cover: string
  promptTitle: string
  prompt: string
  summary: string
  keywords: string[]
  genre: string
  targetPlatform: string
  authorName: string
  extraNotes: string
}

export interface GlobalAssistantSession {
  id: string
  title: string
  messages: ChatMessage[]
  proposal?: GlobalAssistantProposal | null
  lastProposalPrompt?: string
  lastAssistantReply?: string
  createdAt: string
  updatedAt: string
}

export interface GlobalAssistantProposal {
  summary: string
  constraintCreates: Array<{
    title: string
    content: string
    scope: string
    weight?: 'core' | 'important' | 'supporting'
    locked?: boolean
    reason: string
    keywords: string[]
  }>
  worldviewCreates: Array<{
    type: string
    title: string
    content: string
  }>
  worldviewUpdates: Array<{
    matchTitle: string
    reason: string
    type?: string
    title?: string
    content?: string
  }>
  characterCreates: Array<{
    name: string
    role: string
    description: string
    tags: string[]
  }>
  characterUpdates: Array<{
    matchName: string
    reason: string
    name?: string
    role?: string
    description?: string
    tags?: string[]
  }>
  organizationCreates: Array<{
    name: string
    type: string
    description: string
    motto?: string
  }>
  organizationUpdates: Array<{
    matchName: string
    reason: string
    name?: string
    type?: string
    description?: string
    motto?: string
  }>
  outlineCreates: Array<{
    volumeId: string
    title: string
    wordTarget: string
    conflict: string
    summary: string
    relatedCharacterIds?: string[]
    relatedOrganizationIds?: string[]
    relatedWorldviewIds?: string[]
  }>
  outlineUpdates: Array<{
    matchTitle: string
    reason: string
    title?: string
    wordTarget?: string
    conflict?: string
    summary?: string
    volumeId?: string
    relatedCharacterIds?: string[]
    relatedOrganizationIds?: string[]
    relatedWorldviewIds?: string[]
  }>
  notes: string[]
}

/* =========================================================
 * 文章拆解改编页（DeconstructionAdaptationPage）领域类型
 * - 4 阶段 AI 拆解：主角 → 阶段 → 剧情卡 → 人物 + 基调
 * - 单表 JSON blob：所有实体作为内嵌数组存于 AdaptationRun
 * ========================================================= */

/** 4 阶段串行 + 重跑级联：进度条与门禁共用的阶段标识 */
export type AdaptationStageId =
  | 'lead'
  | 'stages'
  | 'plot-cards'
  | 'characters'
  | 'tone'

/** 质量门禁 18 类 issue 编码（PRD §3.2 P0-7） */
export type AdaptationIssueCode =
  | 'lead-missing'
  | 'stage-count'
  | 'cards-empty'
  | 'characters-empty'
  | 'tone-missing'
  | 'tone-stale'
  | 'card-stage-missing'
  | 'card-source-range'
  | 'card-evidence-missing'
  | 'card-protagonist-causality-weak'
  | 'card-characters-missing'
  | 'final-choice-card-without-active-character'
  | 'dependency-missing'

/** 阶段状态机状态：locked / running / completed / failed / stale */
export type AdaptationStageStatus = 'locked' | 'running' | 'completed' | 'failed' | 'stale'

/** 阶段状态机单元（与 AdaptationRun 平级，便于 UI 进度条渲染） */
export interface AdaptationStageState {
  /** 阶段唯一标识 */
  id: AdaptationStageId
  /** 当前状态 */
  status: AdaptationStageStatus
  /** 错误信息（status === 'failed' 时填写） */
  error: string
  /** 状态最近更新时间 ISO 时间戳 */
  updatedAt: string
}

/** AI 拆解任务主表（一次拆解 = 一个 run） */
export interface AdaptationRun {
  /** 唯一标识（id 前缀 adapt-run-） */
  id: string
  /** 引用项目内 ReferenceWorkItem.id（删除时仅 archive） */
  referenceWorkId: string
  /** 用户可改的来源作品标题 */
  sourceTitle: string
  /** 原文内容哈希（溯源 / 去重 / 缓存键） */
  sourceContentHash: string
  /** 原文章节总数（脚本统计） */
  sourceChapterCount: number
  /** 目标集数；clamp(10,200)，默认 80 */
  targetEpisodeCount: number
  /** 固定 novel-to-short-drama */
  requestedWorkKind: 'novel-to-short-drama'
  /** 固定 faithful-adaptation */
  adaptationMode: 'faithful-adaptation'
  /** 顶层 status：draft / running / completed / archived */
  status: 'draft' | 'running' | 'completed' | 'archived'
  /** 当前激活阶段 */
  activeStage: AdaptationStageId
  /** 候选主角列表 */
  leadCandidates: LeadCandidate[]
  /** 用户选中的主角（确认后填写） */
  leadSelection: LeadSelection | null
  /** 4-5 个阶段卡 */
  stages: AdaptationStage[]
  /** 主线 + 副线剧情卡 */
  plotCards: PlotCard[]
  /** 人物资产列表 */
  characters: AdaptationCharacter[]
  /** 关系列表（≤ 20 条核心关系） */
  relationships: CharacterRelationship[]
  /** 人物合并台账（用户手动接受） */
  characterMergeLedger: CharacterMergeEntry[]
  /** 全书基调（含 status: 'stale'） */
  toneProfile: ToneProfile | null
  /** 全书理解记忆（聚合阶段产出） */
  bookUnderstanding: BookUnderstanding | null
  /** 进入改编的剧情卡 ID 列表 */
  selectedCardIds: string[]
  /** 4 阶段状态机 */
  stageStates: AdaptationStageState[]
  /** 留位 Fusion（本期不做影视化） */
  fusionImport: null
  /** 主循环错误信息 */
  error: string
  /** 创建时间 ISO 时间戳 */
  createdAt: string
  /** 最后更新时间 ISO 时间戳 */
  updatedAt: string
}

/** 主角候选条目 */
export interface LeadCandidate {
  /** 唯一标识 */
  id: string
  /** 候选角色名 */
  name: string
  /** 角色定位（male-lead / female-lead / supporting / ...） */
  role: string
  /** 置信度 0-1 */
  confidence: number
  /** 判断理由 */
  reason: string
  /** 原文证据引用（必填 ≥ 1 条） */
  evidenceRefs: AdaptationEvidenceRef[]
}

/** 用户确认主角选择 */
export interface LeadSelection {
  /** 选中的候选 ID */
  id: string
  /** 用户手写补充 */
  userNote: string
  /** 确认时间 ISO 时间戳 */
  confirmedAt: string
}

/** 单条原文证据引用 */
export interface AdaptationEvidenceRef {
  /** 章节 ID（指向 ChapterSegment.id） */
  chapterId: string
  /** 章节序号（兼容展示） */
  chapterNumber: number
  /** 引用原因 */
  reason: string
}

/** 阶段卡（4-5 个） */
export interface AdaptationStage {
  /** 唯一标识 */
  id: string
  /** 阶段顺序（0-based） */
  index: number
  /** 阶段标题 */
  title: string
  /** 原文阶段章节范围 */
  sourceChapterStart: number
  sourceChapterEnd: number
  /** 目标集数范围 */
  targetEpisodeStart: number
  targetEpisodeEnd: number
  /** 起势 / 终势 */
  startState: string
  endState: string
  /** 目标 / 阻力 */
  goal: string
  obstacle: string
  /** 性格 / 情感需求 */
  personality: string
  emotionalNeed: string
  /** 转折点 / 阶段兑现 */
  turningPoint: string
  stagePayoff: string
  /** 承接钩子（下一阶段入口） */
  transitionHook: string
  /** 主角事件 1-3 条 */
  protagonistEvents: string[]
  /** 原文证据引用 */
  evidenceRefs: AdaptationEvidenceRef[]
}

/** 剧情卡功能标签（9 类叙事模板） */
export type PlotCardFunction =
  | 'opening'
  | 'trigger'
  | 'escalation'
  | 'reversal'
  | 'reveal'
  | 'relationship'
  | 'emotional-reward'
  | 'payoff'
  | 'transition'

/** 主角关系标签（5 类） */
export type PlotCardProtagonistRelation =
  | 'direct-action'
  | 'external-pressure'
  | 'relationship-change'
  | 'information-reveal'
  | 'side-branch'

/** 剧情卡状态 */
export type PlotCardStatus = 'active' | 'rejected'

/** 剧情卡重用模式 */
export type PlotCardReuseMode = 'keep' | 'omit' | 'merge'

/** 对白锚点模式（反幻觉底座） */
export type DialogueAnchorMode = 'original' | 'adapted'

/** 单条对白锚点 */
export interface DialogueAnchor {
  /** 唯一标识 */
  id: string
  /** 引用对白文本 */
  text: string
  /** 锚点模式：original 表示原文对白，adapted 表示改编对白 */
  mode: DialogueAnchorMode
  /** 所在章节 ID（仅 mode === 'original' 时使用） */
  sourceChapterId: string
  /** 原文摘录（仅 mode === 'original' 时使用） */
  sourceQuote: string | undefined
  /** 备注 */
  notes: string
}

/** 剧情卡 */
export interface PlotCard {
  /** 唯一标识 */
  id: string
  /** 所属阶段 ID（指向 AdaptationStage.id） */
  stageId: string
  /** 标题（如"初临大唐，崭露头角"） */
  title: string
  /** 9 类功能标签 */
  function: PlotCardFunction
  /** 5 类主角关系标签 */
  protagonistRelation: PlotCardProtagonistRelation
  /** 摘要 */
  synopsis: string
  /** 故事节拍 2-5 条 */
  storyBeats: string[]
  /** 主角五要素（goal/action/obstacle/choice/result/stateChange） */
  protagonistGoal: string
  protagonistAction: string
  protagonistObstacle: string
  protagonistChoice: string
  protagonistResult: string
  protagonistStateChange: string
  /** 下一集钩子 / 冲突 / 结果 / 情绪效果 */
  nextHook: string
  conflict: string
  result: string
  emotionalEffect: string
  /** 原文章节范围 */
  sourceChapterStart: number
  sourceChapterEnd: number
  /** 原文证据（必填） */
  sourceRefs: AdaptationEvidenceRef[]
  /** 参与人物 ID 列表 */
  participatingCharacterIds: string[]
  /** 前置卡依赖 */
  dependencies: string[]
  /** 状态：active / rejected */
  status: PlotCardStatus
  /** 重用模式：keep / omit / merge */
  reuseMode: PlotCardReuseMode
  /** 对白锚点（防伪逐条执行） */
  dialogueAnchors: DialogueAnchor[]
}

/** 人物资产 */
export interface AdaptationCharacter {
  /** 唯一标识 */
  id: string
  /** 姓名 */
  name: string
  /** 别名 */
  aliases: string[]
  /** 身份描述 */
  identity: string
  /** 性别 */
  gender: string
  /** 年龄 */
  age: string
  /** 社会身份 */
  socialStatus: string
  /** 背景 */
  background: string
  /** 性格 */
  personality: string
  /** 目标 */
  goal: string
  /** 恐惧或弱点 */
  fearOrWeakness: string
  /** 首次 / 末次出场章节序号 */
  firstAppearanceChapter: number
  lastAppearanceChapter: number
  /** 涉及阶段 ID 列表 */
  stageIds: string[]
  /** 戏剧功能 */
  dramaticFunction: string
  /** 对主角的影响 */
  protagonistImpact: string
  /** 合并候选列表 */
  mergeCandidates: string[]
  /** 合并理由 */
  mergeReason: string
  /** 合并置信度 0-1 */
  mergeConfidence: number
  /** 参与剧情卡次数（脚本统计） */
  participationCount: number
  /** 主线剧情卡次数（脚本统计） */
  mainlineCardCount: number
  /** 原文证据引用 */
  evidenceRefs: AdaptationEvidenceRef[]
}

/** 人物关系（≤ 20 条核心关系） */
export interface CharacterRelationship {
  /** 唯一标识 */
  id: string
  /** 起点人物 ID */
  fromCharacterId: string
  /** 终点人物 ID */
  toCharacterId: string
  /** 关系类型（如"战友"、"宿敌"） */
  type: string
  /** 关系描述 */
  description: string
  /** 关系强度 0-100 */
  intensity: number
  /** 涉及剧情卡 ID（脚本计算） */
  participatingCardIds: string[]
}

/** 人物合并台账条目 */
export interface CharacterMergeEntry {
  /** 唯一标识 */
  id: string
  /** 保留哪一方 */
  keepCharacterId: string
  /** 合并入哪一方 */
  mergeIntoCharacterId: string
  /** 影响剧情段（剧情卡 ID 列表） */
  affectedPlotCardIds: string[]
  /** 合并后损失与风险描述 */
  mergeLossesAndRisks: string
  /** 用户手动确认时间 */
  confirmedAt: string | null
}

/** 全书基调 */
export interface ToneProfile {
  /** 核心基调 */
  coreTone: string
  /** 类型承诺 */
  genrePromise: string
  /** 观众承诺 */
  audiencePromise: string
  /** 情绪色板 */
  emotionalPalette: string[]
  /** 叙事声音 */
  narrativeVoice: string
  /** 节奏 */
  pacing: string
  /** 冲突温度 */
  conflictTemperature: string
  /** 对白风格 */
  dialogueStyle: string
  /** 幽默浓度 0-100 */
  humorLevel: number
  /** 浪漫浓度 0-100 */
  romanceLevel: number
  /** 黑暗浓度 0-100 */
  darknessLevel: number
  /** 正向约束 */
  mustKeepRules: string[]
  /** 负向约束 */
  avoidRules: string[]
  /** 偏离警告 */
  deviationWarnings: string[]
  /** 状态：fresh / stale */
  status: 'fresh' | 'stale'
  /** 提取时间 ISO 时间戳 */
  extractedAt: string
}

/** 全书理解记忆（聚合阶段产出，作为后续任务的"上下文记忆"） */
export interface BookUnderstanding {
  /** 全文摘要 */
  wholeBookSummary: string
  /** 主要故事线 */
  majorStoryLines: string[]
  /** 关键转折点 */
  keyTurningPoints: string[]
  /** 主角弧线 */
  protagonistArc: string
  /** 覆盖范围说明 */
  coverageNote: string
  /** 原文证据引用 */
  evidenceRefs: AdaptationEvidenceRef[]
}

/** 章节级原文证据（AI 中间产物，不持久化；注入后续任务） */
export interface AdaptationSourceEvidence {
  /** 章节 ID */
  chapterId: string
  /** 章节序号 */
  chapterNumber: number
  /** 章节标题 */
  chapterTitle: string
  /** 章节摘录（≤ 24000 字） */
  excerpt: string
  /** 对白引用（含精确 sourceOffset） */
  dialogueQuotes: Array<{
    speaker: string
    text: string
    sourceOffset: number
  }>
  /** 抽取目的说明 */
  purpose: string
}
