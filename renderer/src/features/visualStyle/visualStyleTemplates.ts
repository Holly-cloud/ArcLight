// v1.27.0 视觉一致性元数据：renderMode 模板建议（纯规则，Q5=A）
// 设计原则：纯字符串匹配，不调用 LLM、不联网；无 Vue 依赖，便于 Node 单测。
import type { VisualRenderMode } from '@/types/app'

/** 模板匹配输入：项目题材 / 标签 / 简介（缺省一律兜底为空） */
export interface VisualTemplateInput {
  genre?: string | null
  tags?: string[] | null
  premise?: string | null
}

/** 单条固定规则：命中任一关键词即建议该渲染方式 */
export interface VisualStyleTemplateRule {
  /** 规则标识（便于单测穷举） */
  id: string
  /** 关键词列表（小写匹配，含中英） */
  keywords: string[]
  /** 建议的渲染方式 */
  mode: VisualRenderMode
}

/**
 * 8 条固定模板规则（顺序即优先级：越靠前越先匹配）。
 * 覆盖常见体裁：
 * 1. 玄幻/仙侠/修真 → anime
 * 2-3. 都市言情/甜宠 与 科幻/赛博 → realistic
 * 4. 水墨/古风 → ink-wash
 * 5. 低多边形/像素 → low-poly
 * 6. 油画/文艺 → oil-paint
 * 7. 平面插画/绘本 → flat-illustration
 * 8. 悬疑/恐怖 → realistic
 */
export const VISUAL_STYLE_TEMPLATES: readonly VisualStyleTemplateRule[] = [
  {
    id: 'fantasy-anime',
    keywords: ['玄幻', '仙侠', '修真', '修仙', '武侠', '奇幻', '东方玄幻'],
    mode: 'anime'
  },
  {
    id: 'urban-realistic',
    keywords: ['都市言情', '都市情感', '甜宠', '言情', '总裁', '现代言情', '都市'],
    mode: 'realistic'
  },
  {
    id: 'scifi-realistic',
    keywords: ['科幻', '未来', '赛博', '赛博朋克', '机甲', '太空', '星际'],
    mode: 'realistic'
  },
  {
    id: 'chinese-ink',
    keywords: ['水墨', '古风', '国风', '山水', '写意', '宫廷'],
    mode: 'ink-wash'
  },
  {
    id: 'low-poly',
    keywords: ['低多边形', '低模', '像素', '像素风', '体素', '沙盒', '8bit', '8-bit'],
    mode: 'low-poly'
  },
  {
    id: 'oil-paint',
    keywords: ['油画', '文艺', '古典', '印象派', '重彩'],
    mode: 'oil-paint'
  },
  {
    id: 'flat-illustration',
    keywords: ['平面插画', '插画', '绘本', '儿童', '童话', '卡通'],
    mode: 'flat-illustration'
  },
  {
    id: 'suspense-realistic',
    keywords: ['悬疑', '恐怖', '惊悚', '推理', '犯罪', '暗黑'],
    mode: 'realistic'
  }
] as const

/** 把输入拼成小写检索串（genre + premise + tags） */
function buildHaystack(input: VisualTemplateInput | null | undefined): string {
  if (!input) return ''
  const genre = typeof input.genre === 'string' ? input.genre : ''
  const premise = typeof input.premise === 'string' ? input.premise : ''
  const tags = Array.isArray(input.tags) ? input.tags.map((tag) => String(tag ?? '')) : []
  return [genre, premise, ...tags].join(' ').toLowerCase()
}

/**
 * 按项目 genre / tags / premise 匹配 8 条固定模板，返回建议的 renderMode。
 * - 命中第一条规则即返回其 mode；全部不匹配返回 null（由调用方决定是否预填）。
 * - 纯字符串匹配，不区分大小写；不调用 LLM、不联网。
 */
export function suggestRenderMode(input: VisualTemplateInput | null | undefined): VisualRenderMode | null {
  const haystack = buildHaystack(input)
  if (!haystack.trim()) return null
  for (const rule of VISUAL_STYLE_TEMPLATES) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) {
      return rule.mode
    }
  }
  return null
}
