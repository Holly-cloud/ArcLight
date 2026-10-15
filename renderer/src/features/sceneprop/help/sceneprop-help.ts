import type { FeatureDescription } from '@/features/help/types'

/**
 * v1.23 场景与道具（v1.25.2 功能说明数据）
 * - scene-location：场景（SceneLocation）
 * - prop-item：道具（PropItem）
 * - relations-graph：关系图谱融合
 */
export const SCENEPROP_HELP: readonly FeatureDescription[] = [
  {
    id: 'scene-location',
    title: '关于「场景」',
    whyItMatters:
      '长篇小说中"地点"不再散落文本，而是与角色并列为可追踪实体。可跨章节引用、可关系化、可在图谱中作为节点呈现。',
    keyConcepts: [
      '场景实体字段：名称 / 类型 / 标签 / 相关角色与道具',
      '5 种类型：城市 / 建筑 / 自然地形 / 室内 / 异空间',
      '跨章节引用 + 关系图谱节点',
      '编辑 / 删除自动级联清理双向关联'
    ],
    docLink: {
      label: '查看完整文档',
      href: '../../../../../projects/planning/feature-help-prd.md'
    }
  },
  {
    id: 'prop-item',
    title: '关于「道具」',
    whyItMatters:
      '让"物品"成为一等公民，很多短剧改编靠关键道具（信物 / 法器 / 线索物）推动剧情。',
    keyConcepts: [
      '道具实体字段：名称 / 类型 / 持有者 / 出现场景',
      '5 种类型：武器 / 信物 / 法器 / 消耗品 / 线索物',
      '双侧镜像同步（场景 ↔ 道具关联）',
      '图谱节点：菱形外观、跨实体虚线连接'
    ],
    docLink: {
      label: '查看完整文档',
      href: '../../../../../projects/planning/feature-help-prd.md'
    }
  },
  {
    id: 'relations-graph',
    title: '关于「关系图谱融合」',
    whyItMatters:
      '角色 / 组织 / 场景 / 道具 / 关系 / 归属整合到一张图，创作者一眼看出人物 ↔ 地点 ↔ 物品的相互影响。',
    keyConcepts: [
      'cytoscape 跨实体节点与边',
      '角色 / 组织 / 场景 / 道具 四类节点形态',
      '跨实体边（虚线 + hover tooltip）',
      '点击节点直接进入对应编辑器'
    ],
    docLink: {
      label: '查看完整文档',
      href: '../../../../../projects/planning/feature-help-prd.md'
    }
  }
] as const
