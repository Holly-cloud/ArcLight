import type { FeatureDescription } from '@/features/help/types'

/**
 * v1.27 视觉一致性元数据（v1.27.0 功能说明数据）
 * - visual-consistency：为角色/场景/道具沉淀结构化视觉字段并导出资产参考表
 */
export const VISUAL_CONSISTENCY_HELP: readonly FeatureDescription[] = [
  {
    id: 'visual-consistency',
    title: '关于「视觉一致性」',
    whyItMatters:
      '把配色 / 渲染方式 / 光影 / 季相 / 材质等结构化视觉字段沉淀到角色、场景、道具上，导出资产参考表，让外部生图工具能按字段精准消费，保证同一部作品视觉不跑偏。',
    keyConcepts: [
      '角色填渲染方式 + 调色板 + 氛围词 + 关键参照词',
      '场景/道具填配色 + 光影 / 季相 / 材质说明',
      '新建角色时按项目体裁给出渲染方式建议（可改）',
      '资产库可导出 Markdown / JSON / CSV 参考表',
      '「预览」生成可直接粘贴的生图 Prompt（不呼叫外部服务）'
    ],
    docLink: {
      label: '查看完整文档',
      href: '../../../../../projects/planning/v1.27.0-visual-consistency-prd.md'
    }
  }
] as const
