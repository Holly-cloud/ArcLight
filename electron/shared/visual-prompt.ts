/**
 * v1.36.0「版式型视觉提示词」共享契约与模板（纯函数 / 无 IO / 零依赖）。
 *
 * 单一来源，主进程（asset-visual-prompt 任务）与渲染层（编译层 / 编辑页）共用，避免两处漂移。
 * 存储：既有 JSON blob 的 `visualPrompt` 由 `string` 放宽为 `VisualPromptValue`（0 新表 / 0 新列）。
 *
 * 版权纪律：本文档文案为**自有撰写**，只借鉴「结构」（固定版式 + 固定段序 + 负向词独立），
 * 不复制任何第三方 prompt 字面（对方许可为 SEE LICENSE IN resources/third-party）。
 */

/** 资产类型（与 AssetImageKind 结构一致，此处本地声明以免共享层产生跨模块依赖） */
export type VisualPromptKind = 'character' | 'scene' | 'prop'

/** 版式模板 id */
export type VisualPromptLayoutId =
  | 'character-base-sheet'
  | 'scene-four-view'
  | 'scene-nine-grid'
  | 'prop-white-bg'
  | 'group-sheet'
  | 'none'

/** 固定段序的段键（negative 为独立字段，不在段序内） */
export type VisualPromptSectionKey = 'spec' | 'subject' | 'costume' | 'material' | 'lighting'
export type VisualPromptMarkerKey = VisualPromptSectionKey | 'negative'

/** 固定段序内容 */
export interface VisualPromptSections {
  /** 画面规格（版式）——由版式模板确定性生成，可被用户改写 */
  spec: string
  /** 主体 */
  subject: string
  /** 服装 / 结构 */
  costume: string
  /** 材质与渲染 */
  material: string
  /** 统一光影 */
  lighting: string
}

/** 分节结构化的视觉提示词文档 */
export interface VisualPromptDocument {
  /** 契约版本（后续演进用） */
  v: 1
  /** 所用版式 */
  layout: VisualPromptLayoutId
  sections: VisualPromptSections
  /** 独立负向词字段（与正向段并列） */
  negativePrompt: string
}

/** 存储值：旧数据 = string；新数据 = 结构化对象；未填写 = null */
export type VisualPromptValue = string | VisualPromptDocument | null

/** 固定段序（画面规格 → 主体 → 服装或结构 → 材质与渲染 → 统一光影） */
export const VISUAL_PROMPT_SECTION_ORDER: readonly VisualPromptSectionKey[] = [
  'spec', 'subject', 'costume', 'material', 'lighting'
] as const

/** 段标题（单一来源，界面与渲染均取此处，避免多处硬编码漂移） */
export const VISUAL_PROMPT_SECTION_TITLES: Record<VisualPromptSectionKey, string> = {
  spec: '画面规格',
  subject: '主体',
  costume: '服装或结构',
  material: '材质与渲染',
  lighting: '统一光影'
}

/** 段标记（供 AI 输出与解析，形如 【画面规格】…） */
export const VISUAL_PROMPT_MARKERS: Record<VisualPromptMarkerKey, string> = {
  spec: '【画面规格】',
  subject: '【主体】',
  costume: '【服装或结构】',
  material: '【材质与渲染】',
  lighting: '【统一光影】',
  negative: '【负面提示词】'
}

/** 独立负向词字段在最终提示词里的标题 */
export const NEGATIVE_PROMPT_TITLE = '负面提示词'

// ────────────────────────────── 版式模板 ──────────────────────────────

export interface VisualPromptLayout {
  id: VisualPromptLayoutId
  /** 界面展示名 */
  label: string
  /** 适用的资产类型 */
  kinds: VisualPromptKind[]
  /** 「画面规格」段初值（我们自己的文案） */
  spec: string
}

const CHARACTER_BASE_SHEET_SPEC = [
  '16:9 横向角色基准资产板，纯白无缝背景（主体本身为白色或浅色时改用均匀的纯浅灰背景）。',
  '画面分三个区域且必须属于同一角色：中央＝正面大头像（完整呈现发型、额头、眉眼、鼻唇、下颌、颈部与少量肩部；正视前方、双眼自然睁开、嘴唇闭合、面无表情）；',
  '左侧＝缺头部的全身微侧（自颈部到脚，头部与面部完全不出现，手臂自然下垂，服装层次、袖型、下装与鞋履清晰完整）；',
  '右侧＝完整全身背面（自头顶到脚，含后脑轮廓与背面发型；不回头、不侧脸）。',
  '三区的年龄、肤色、身形、服装、配色、材质与身份标志完全一致；不得出现回头脸、多余头部或面部、悬浮五官、重复人物或错误肢体。',
  '本图确立该角色首次出场时的完整基础形象；后续任何换装、受伤、伪装、年龄或形态变化都只能继承并引用这一基准形象。',
  '背景均匀无渐变、无地平线、无环境元素、无道具、无文字标签、无边框、无投影。'
].join('')

const SCENE_FOUR_VIEW_SPEC = [
  '16:9 横向四宫格场景参考板，无人出现的空场景。',
  '四格等大、同一空间、同一时间天气、同一光照方向、同一空间中心点与布局连续；格与格之间以清晰分割线分开，不得出现分割线以外的额外黑框、黑边或大块间隔。',
  '四格只改变机位与景别、不改变空间事实：左上＝平视全景；右上＝俯视视角；左下＝反向平视；右下＝鸟瞰总览。',
  '四格共用同一套地面与材质、同一相机高度与焦距，纵深、门窗关系与走位路径连续。'
].join('')

const SCENE_NINE_GRID_SPEC = [
  '16:9 横向三行三列九宫格场景参考板，无人出现的空场景。',
  '九格等大、同一场景、同一主题、同一光影。',
  '九格只用固定镜头与固定顺序：1 全景定场；2 中景叙事；3 特写氛围；4 环境细节；5 固定陈设；6 光影氛围；7 鸟瞰布局；8 跟拍路径；9 中景反打。',
  '九格共享同一场景描述与同一视觉规则，只改变机位、景别与取景重点，不逐格添加剧情动作或不同物件。'
].join('')

const PROP_WHITE_BG_SPEC = [
  '单件道具置于画面正中，使用纯白或均匀浅灰无缝背景，无人物、无环境、无其他道具。',
  '以能同时交代正面与侧面的角度呈现；材质、工艺、纹样与使用痕迹清晰可辨，边缘干净、无投影。'
].join('')

const GROUP_SHEET_SPEC = [
  '16:9 横向群像资产板，6–12 人，纯白或均匀浅灰无缝背景，无环境元素。',
  '人物按前后两排错落分层，比例统一、朝向自然，同一配色与光照；不得出现重复人物、悬浮五官或错误肢体。'
].join('')

/** 版式模板表（key 为 id） */
export const VISUAL_PROMPT_LAYOUTS: Record<VisualPromptLayoutId, VisualPromptLayout> = {
  'character-base-sheet': {
    id: 'character-base-sheet',
    label: '角色三视图资产板',
    kinds: ['character'],
    spec: CHARACTER_BASE_SHEET_SPEC
  },
  'scene-four-view': {
    id: 'scene-four-view',
    label: '场景四宫格',
    kinds: ['scene'],
    spec: SCENE_FOUR_VIEW_SPEC
  },
  'scene-nine-grid': {
    id: 'scene-nine-grid',
    label: '场景九宫格',
    kinds: ['scene'],
    spec: SCENE_NINE_GRID_SPEC
  },
  'prop-white-bg': {
    id: 'prop-white-bg',
    label: '道具白底单件',
    kinds: ['prop'],
    spec: PROP_WHITE_BG_SPEC
  },
  'group-sheet': {
    id: 'group-sheet',
    label: '群像（纯色背景）',
    kinds: ['scene'],
    spec: GROUP_SHEET_SPEC
  },
  none: {
    id: 'none',
    label: '不套版式',
    kinds: ['character', 'scene', 'prop'],
    spec: ''
  }
}

/** 界面下拉的稳定顺序 */
export const VISUAL_PROMPT_LAYOUT_ORDER: readonly VisualPromptLayoutId[] = [
  'character-base-sheet', 'scene-four-view', 'scene-nine-grid', 'prop-white-bg', 'group-sheet', 'none'
] as const

/** 某资产类型可选的版式（按固定顺序） */
export function layoutsForKind(kind: VisualPromptKind | string | null | undefined): VisualPromptLayout[] {
  const normalized = normalizeKind(kind)
  return VISUAL_PROMPT_LAYOUT_ORDER
    .map((id) => VISUAL_PROMPT_LAYOUTS[id])
    .filter((layout) => layout.kinds.includes(normalized))
}

/** 某资产类型的默认版式（角色三视图 / 场景四宫格 / 道具白底） */
export function defaultLayoutForKind(kind: VisualPromptKind | string | null | undefined): VisualPromptLayoutId {
  const normalized = normalizeKind(kind)
  if (normalized === 'character') return 'character-base-sheet'
  if (normalized === 'prop') return 'prop-white-bg'
  return 'scene-four-view'
}

/** 归一化资产类型（非法值回退角色） */
export function normalizeKind(kind: VisualPromptKind | string | null | undefined): VisualPromptKind {
  const raw = String(kind ?? '').trim()
  return raw === 'scene' || raw === 'prop' ? raw : 'character'
}

/** 取某版式的「画面规格」段文案（未知 id 返回空串） */
export function layoutSpec(layout: VisualPromptLayoutId | string | null | undefined): string {
  const id = String(layout ?? '') as VisualPromptLayoutId
  return VISUAL_PROMPT_LAYOUTS[id]?.spec ?? ''
}

/** 归一化版式 id（未知值回退 none） */
export function normalizeLayoutId(layout: VisualPromptLayoutId | string | null | undefined): VisualPromptLayoutId {
  const id = String(layout ?? '').trim() as VisualPromptLayoutId
  return VISUAL_PROMPT_LAYOUTS[id] ? id : 'none'
}

// ────────────────────────────── 默认负向词 ──────────────────────────────

/** 全域恒含（A13：禁可读文字与水印类） */
export const DEFAULT_NEGATIVE_BASE = '画面不得出现可读文字、水印、Logo、签名、边框、标签。'

/** 古代题材关键词 → 禁现代元素（A9） */
const ANCIENT_GENRE_KEYWORDS = ['古装', '古代', '仙侠', '修仙', '武侠', '江湖', '宫廷', '宫斗', '历史', '玄幻', '架空', '东方奇幻', '聊斋', '封神']
/** 现代 / 未来题材关键词 → 禁古代元素（轻量反向） */
const MODERN_GENRE_KEYWORDS = ['都市', '现代', '科幻', '赛博', '未来', '末世']

const MODERN_ELEMENT_WORDS = 'T 恤、卫衣、牛仔裤、拉链夹克、运动鞋、现代眼镜、手表、塑料制品、霓虹灯、电线、汽车、现代高楼'
const ANCIENT_ELEMENT_WORDS = '古代服饰、长袍、佩剑、马车、灯笼、烛台'

/**
 * 按题材派生时代禁词（AR-3：项目当前无「时代」字段，改由 genre 派生，0 新字段）。
 * 命中古代题材 → 禁现代元素；命中现代题材 → 禁古代元素；未命中 → 空。
 */
export function genreNegativeWords(genre?: string | null): string[] {
  const raw = String(genre ?? '').trim()
  if (!raw) return []
  if (ANCIENT_GENRE_KEYWORDS.some((keyword) => raw.includes(keyword))) {
    return [`禁现代元素：${MODERN_ELEMENT_WORDS}`]
  }
  if (MODERN_GENRE_KEYWORDS.some((keyword) => raw.includes(keyword))) {
    return [`禁古代元素：${ANCIENT_ELEMENT_WORDS}`]
  }
  return []
}

/**
 * 默认负向词：A13 恒含 + A9 按题材。
 * 形参 `kind` 保留以便后续按资产类型扩展（当前不区分）。
 */
export function defaultNegativePrompt(
  _kind: VisualPromptKind | string | null | undefined,
  genre?: string | null
): string {
  const parts = [DEFAULT_NEGATIVE_BASE, ...genreNegativeWords(genre)]
  return parts.filter(Boolean).join('；')
}

// ────────────────────────────── 编译期尾巴（A3 / A4）──────────────────────────────

/** A3 风格层解耦尾巴：风格/材质层不得改写主体与构图 */
export const STYLE_DECOUPLE_TAIL = '风格层只影响质感与色彩，不改变用户指定的主体与构图。'
/** A4 媒介硬锁：与项目所选媒介冲突的媒介词作废 */
export const MEDIA_LOCK_NOTE = '媒介锁定：与项目所选渲染方式冲突的媒介词（如写实项目里的「二次元 / Q版」）不生效。'

// ────────────────────────────── 解析 / 序列化 / 归一 ──────────────────────────────

function emptySections(): VisualPromptSections {
  return { spec: '', subject: '', costume: '', material: '', lighting: '' }
}

/** 文档是否为空（五段与负向词全空） */
export function isEmptyDocument(doc: VisualPromptDocument | null | undefined): boolean {
  if (!doc) return true
  const hasSection = VISUAL_PROMPT_SECTION_ORDER.some((key) => (doc.sections[key] ?? '').trim())
  return !hasSection && !doc.negativePrompt.trim()
}

/**
 * 归一化存储值：
 * - 结构化对象 → 规范化文档（补全缺字段）；内容全空 → null
 * - 字符串 → trim 后空串记 null，否则原样
 * - 其他 → null
 */
export function normalizeVisualPromptValue(value: unknown): VisualPromptValue {
  if (value && typeof value === 'object') {
    const doc = coerceDocument(value as Partial<VisualPromptDocument>)
    return isEmptyDocument(doc) ? null : doc
  }
  if (typeof value === 'string') {
    const text = value.trim()
    return text ? text : null
  }
  return null
}

/** 宽松地把任意对象收敛为文档（缺字段补默认），不抛错 */
function coerceDocument(input: {
  layout?: VisualPromptLayoutId | string | null
  sections?: Partial<VisualPromptSections> | null
  negativePrompt?: string | null
}): VisualPromptDocument {
  const rawSections = (input.sections && typeof input.sections === 'object' ? input.sections : {}) as Partial<VisualPromptSections>
  const sections = emptySections()
  for (const key of VISUAL_PROMPT_SECTION_ORDER) {
    sections[key] = String(rawSections[key] ?? '').trim()
  }
  return {
    v: 1,
    layout: normalizeLayoutId(input.layout),
    sections,
    negativePrompt: String(input.negativePrompt ?? '').trim()
  }
}

/**
 * 把存储值转为文档（供编辑页分段展示/编辑）：
 * - 已是对象 → 收敛为文档
 * - 旧字符串 → 整段落入「主体」段，「画面规格」取给定版式模板（旧数据兼容不丢）
 * - 空 → null
 */
export function toVisualPromptDocument(
  value: VisualPromptValue,
  layout?: VisualPromptLayoutId | string | null,
  genre?: string | null
): VisualPromptDocument | null {
  if (value && typeof value === 'object') return coerceDocument(value)
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return null
    const doc = coerceDocument({ layout: layout ?? 'none' })
    doc.sections.spec = layoutSpec(doc.layout)
    doc.sections.subject = text
    doc.negativePrompt = defaultNegativePrompt('character', genre)
    return doc
  }
  return null
}

/** 用版式模板生成一份空白文档（画面规格已填，负向词为默认） */
export function createDocumentForLayout(
  layout: VisualPromptLayoutId | string | null | undefined,
  kind: VisualPromptKind | string | null | undefined,
  genre?: string | null
): VisualPromptDocument {
  const doc = coerceDocument({ layout })
  doc.sections.spec = layoutSpec(doc.layout)
  doc.negativePrompt = defaultNegativePrompt(kind, genre)
  return doc
}

/**
 * 解析 AI 输出的分段文本 → 文档。
 * - 命中标记：各段填入对应 section；
 * - 未命中任何标记（旧格式或模型未服从）：整段落入「主体」，不丢内容；
 * - 「画面规格」恒取版式模板（不由模型生成）；
 * - 负向词 = 模型给出的补充 ∪ 默认负向词。
 */
export function parseVisualPromptText(
  text: string,
  layout: VisualPromptLayoutId | string | null | undefined,
  kind: VisualPromptKind | string | null | undefined,
  genre?: string | null
): VisualPromptDocument {
  const raw = String(text ?? '')
  const doc = coerceDocument({ layout })
  doc.sections.spec = layoutSpec(doc.layout)

  const sectionKeys: VisualPromptSectionKey[] = ['subject', 'costume', 'material', 'lighting']
  const markerList: Array<{ key: VisualPromptSectionKey | 'negative'; marker: string }> = [
    ...sectionKeys.map((key) => ({ key, marker: VISUAL_PROMPT_MARKERS[key] })),
    { key: 'negative' as const, marker: VISUAL_PROMPT_MARKERS.negative }
  ]

  // 记录每个标记首次出现的位置
  const hits = markerList
    .map(({ key, marker }) => ({ key, marker, index: raw.indexOf(marker) }))
    .filter((hit) => hit.index >= 0)
    .sort((a, b) => a.index - b.index)

  if (hits.length === 0) {
    doc.sections.subject = raw.trim()
  } else {
    for (let i = 0; i < hits.length; i += 1) {
      const start = hits[i].index + hits[i].marker.length
      const end = i + 1 < hits.length ? hits[i + 1].index : raw.length
      const content = raw.slice(start, end).trim()
      if (hits[i].key === 'negative') doc.negativePrompt = content
      else doc.sections[hits[i].key as VisualPromptSectionKey] = content
    }
  }

  const defaults = defaultNegativePrompt(kind, genre)
  doc.negativePrompt = [doc.negativePrompt, defaults].filter(Boolean).join('；')
  // 去掉可能的重复前缀（例如模型也写了默认那句）
  return doc
}

/** 文档 → 生图正文（按固定段序带标记输出；空段跳过） */
export function renderVisualPromptDocument(doc: VisualPromptDocument | null | undefined): string {
  if (!doc) return ''
  const lines: string[] = []
  for (const key of VISUAL_PROMPT_SECTION_ORDER) {
    const text = (doc.sections[key] ?? '').trim()
    if (text) lines.push(`${VISUAL_PROMPT_MARKERS[key]}${text}`)
  }
  return lines.join('\n')
}
