import type { FeatureDescription } from '@/features/help/types'

/**
 * v1.29 小说资产提取（v1.29.0 功能说明数据）
 * - novel-extraction：从导入「章节创作」的小说正文提取 / 再提取角色、场景、道具
 */
export const NOVEL_EXTRACTION_HELP: readonly FeatureDescription[] = [
  {
    id: 'novel-extraction',
    title: '关于「从小说提取资产」',
    whyItMatters:
      '把导入的小说落进项目「章节创作」，再据此用 AI 批量沉淀实际登场的角色、场景与道具；资产来源与正文章节同源，写作与资产维护不再割裂。',
    keyConcepts: [
      '导入的小说会存进「章节创作」（按第X章 / 第X话划分，同名章节自动跳过）',
      '粘贴正文或从 TXT 导入；长文自动分段分批提取并可查看进度',
      '只保留在正文中实际登场的角色 / 场景 / 道具，每条附带原文证据',
      '产出候选可勾选并就地改名、改描述、改标签；与项目已有同名实体自动去重',
      '资产库可一键清空当前项目的角色 / 场景 / 道具（组织保留，二次确认，不可撤销）',
      '卡片可多选「再次提取」：以相关章节片段为证据，结果为建议，逐项采纳后才写回'
    ],
    docLink: {
      label: '查看完整文档',
      href: '../../../../../projects/planning/v1.29.0-novel-chapters-and-assets-prd.md'
    }
  }
] as const
