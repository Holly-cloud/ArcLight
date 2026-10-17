import type { FeatureDescription } from '@/features/help/types'

/**
 * v1.30 资产库（v1.34.0 文案更新）
 * - asset-library：资产库在项目内、按分类（角色 / 场景 / 道具 / 组织）浏览；
 *   单击卡片进入独立「资产编辑页」；工具栏「图片主风格」设置项目级生图风格；
 *   已移除跨项目「全部项目」与「全部资产」聚合视图，入口唯一＝项目工作区侧栏「资产库」。
 */
export const ASSET_LIBRARY_HELP: readonly FeatureDescription[] = [
  {
    id: 'asset-library',
    title: '关于「资产库」',
    whyItMatters:
      '资产库只属于当前项目：把散落在角色图鉴 / 关系组织 / 工作台里的角色、道具、场景、组织收敛到项目内一个页面，按分类直接浏览，单击卡片进入独立的「资产编辑页」。',
    keyConcepts: [
      '两栏布局：左分类 / 中卡片网格',
      '单击卡片进入「资产编辑页」（同类列表 / 基础信息 / 图库）',
      '工具栏「图片主风格」：项目级渲染方式 / 配色 / 氛围词 / 默认画幅比',
      '资产库在项目内、入口唯一（项目工作区侧栏「资产库」）',
      '已移除跨项目「全部项目」与「全部资产」聚合视图'
    ],
    docLink: {
      label: '查看完整文档',
      href: '../../../../../projects/planning/v1.26.0-asset-library-prd.md'
    }
  }
] as const
