import type { FeatureDescription } from '@/features/help/types'

/**
 * v1.28 小说资产提取（v1.28.0 功能说明数据）
 * - novel-extraction：从上传的小说原文提取 / 再提取角色、场景、道具
 */
export const NOVEL_EXTRACTION_HELP: readonly FeatureDescription[] = [
  {
    id: 'novel-extraction',
    title: '关于「从小说提取资产」',
    whyItMatters:
      '把资产库的数据来源从手动建卡扩展为「上传小说 → AI 提取」，让长篇设定一次导入即可批量沉淀角色、场景与道具，再按需针对单卡或多卡做再提取补全。',
    keyConcepts: [
      '一项目一本小说：再次导入作为对同一本的补充（追加合并）',
      '粘贴正文或从 TXT 导入；长文自动分段分批提取并可查看进度',
      '产出角色 / 场景 / 道具三类候选，可勾选并就地改名、改描述、改标签',
      '与项目已有同名实体自动去重，重名项默认不勾选',
      '卡片可多选「再次提取」：结果为建议，逐项采纳后才写回，不自动覆盖'
    ],
    docLink: {
      label: '查看完整文档',
      href: '../../../../../projects/planning/v1.28.0-novel-asset-extraction-prd.md'
    }
  }
] as const
