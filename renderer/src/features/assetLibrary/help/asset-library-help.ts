import type { FeatureDescription } from '@/features/help/types'

/**
 * v1.26 资产库聚合页（v1.26.0 功能说明数据）
 * - asset-library：跨项目浏览与检索 4 类资产
 */
export const ASSET_LIBRARY_HELP: readonly FeatureDescription[] = [
  {
    id: 'asset-library',
    title: '关于「资产库」',
    whyItMatters:
      '资产库把散落在角色图鉴 / 关系组织 / 工作台里的角色、道具、场景、组织沉淀到一个聚合页，支持跨项目浏览、检索与就地编辑。',
    keyConcepts: [
      '三栏布局：左分类 / 中卡片网格 / 右详情',
      '四类资产：角色 / 道具 / 场景 / 组织',
      '「全部项目」只读；「当前项目」双击卡片即可编辑',
      '类型 + 项目范围 + 关键字三重筛选'
    ],
    docLink: {
      label: '查看完整文档',
      href: '../../../../../projects/planning/v1.26.0-asset-library-prd.md'
    }
  }
] as const
