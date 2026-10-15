import type { FeatureDescription } from '@/features/help/types'

/**
 * v1.25 工作台容器（v1.25.2 功能说明数据）
 * - workbench：工作台（跨级 AI 工具容器）
 * - p1-placeholder：P1 占位（AI 批量生成 / AI 重跑）
 */
export const WORKBENCH_HELP: readonly FeatureDescription[] = [
  {
    id: 'workbench',
    title: '关于「工作台」',
    whyItMatters:
      '工作台是 v1.25 新增的"跨级 AI 工具容器"，内部分"项目内"与"全局"双 Tab：项目内管场景 / 道具，全局管拆书 / 改编。',
    keyConcepts: [
      '项目内 Tab = v1.23 场景 / 道具（ScenePropSection）',
      '全局 Tab = v1.24 拆书 / 改编记录',
      'P1 占位：AI 批量生成 / AI 重跑',
      'Tab 选择持久化（重启保持偏好）'
    ],
    docLink: {
      label: '查看完整文档',
      href: '../../../../../projects/planning/feature-help-prd.md'
    }
  },
  {
    id: 'p1-placeholder',
    title: '关于「P1 占位（AI 批量生成 / AI 重跑）」',
    whyItMatters:
      '工作台 Header 的两个灰色禁用按钮（项目内 Tab = AI 批量生成，全局 Tab = AI 重跑），预留接口，等 v1.25.x 实现真正批量操作。',
    keyConcepts: [
      '项目内 Tab：AI 批量生成（场景 / 道具）',
      '全局 Tab：AI 重跑（整 run / 单阶段）',
      '触发时机：后续版本上线',
      '当前为占位按钮（disabled + hover tooltip）'
    ],
    docLink: {
      label: '查看完整文档',
      href: '../../../../../projects/planning/feature-help-prd.md'
    }
  }
] as const
