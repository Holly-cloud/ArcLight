import type { FeatureDescription } from '@/features/help/types'

/**
 * v1.30 小说导入与分类提取（v1.30.0 功能说明数据）
 * - novel-extraction：「导入小说」在「章节创作」；「提取资产」在资产库**按分类**（角色 / 场景 / 道具）
 */
export const NOVEL_EXTRACTION_HELP: readonly FeatureDescription[] = [
  {
    id: 'novel-extraction',
    title: '关于「导入小说与提取资产」',
    whyItMatters:
      '「导入小说」在「章节创作」中把小说落进项目章节；「提取资产」在资产库按分类进行——角色界面提取角色、场景界面提取场景、道具界面提取道具。资产来源与正文章节同源，写作与资产维护不再割裂。',
    keyConcepts: [
      '「导入小说」入口在「章节创作」：按第X章 / 第X话划分，同名章节自动跳过',
      '导入可选「追加」（先看新增 / 跳过预览）或「覆盖」（整本替换，二次确认）',
      '章节序数取自小说标题的「第X章 / 第X话」，不从第 1 章重排',
      '「提取资产」在资产库按分类：角色界面提取角色…只保留正文中实际登场的条目，每条附原文证据',
      '产出候选可勾选并就地改名、改描述、改标签；与项目已有同名实体自动去重',
      '资产库可一键清空当前项目的角色 / 场景 / 道具（组织保留，二次确认，不可撤销）'
    ],
    docLink: {
      label: '查看完整文档',
      href: '../../../../../projects/planning/v1.29.0-novel-chapters-and-assets-prd.md'
    }
  }
] as const
