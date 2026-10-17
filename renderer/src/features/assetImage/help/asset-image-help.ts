import type { FeatureDescription } from '@/features/help/types'

/**
 * v1.33.0 资产图库（生图）功能说明数据
 * - asset-image：资产卡「图库」区——为角色 / 场景 / 道具生图，结果入库落盘，可查看 / 删除 / 导出；
 *   支持参考图（图生图）与角色「基准立绘」一致性。
 */
export const ASSET_IMAGE_HELP: readonly FeatureDescription[] = [
  {
    id: 'asset-image',
    title: '关于「资产图库」',
    whyItMatters:
      '把资产卡从「描述沉淀」升级为「描述 + 图像沉淀」：为角色 / 场景 / 道具一键生成立绘或配图，结果入库落盘，可查看 / 删除 / 导出。',
    keyConcepts: [
      '生图走 GRS AI（nano-banana-fast），按次计费、失败返还',
      '提示词由项目视觉风格 + 资产视觉字段自动拼装，可编辑',
      '参考图支持图生图；角色可设「基准立绘」保持一致性',
      '图像落本地文件、DB 存元数据；图库不进工作区快照',
      '可查看大图 / 删除（联动删文件）/ 导出到本地'
    ],
    docLink: {
      label: '查看完整文档',
      href: '../../../../../projects/planning/v1.33.0-asset-image-generation-prd.md'
    }
  }
] as const
