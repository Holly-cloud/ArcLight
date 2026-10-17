import type { FeatureDescription } from '@/features/help/types'

/**
 * v1.33.0 资产图库（生图）功能说明数据（v1.34.3 文案更新）
 * - asset-image：资产编辑页右栏「图库」——为角色 / 场景 / 道具生图，结果入库落盘，可查看 / 删除 / 导出；
 *   支持参考图（图生图）与「基准图」一致性；生成非阻塞、可连点排队多张。
 */
export const ASSET_IMAGE_HELP: readonly FeatureDescription[] = [
  {
    id: 'asset-image',
    title: '关于「资产图库」',
    whyItMatters:
      '把资产从「描述沉淀」升级为「描述 + 图像沉淀」：在资产编辑页右栏「图库」一键生成立绘或配图，结果入库落盘，可查看 / 删除 / 导出。',
    keyConcepts: [
      '生图走 GRS AI（nano-banana-fast），按次计费、失败返还',
      '提示词优先取资产卡「视觉提示词」（以简介为核心、结合小说原文生成），留空时按项目「图片主风格」+ 资产字段自动拼装',
      '「生成选项」为锚定浮层：画幅比 / 分辨率 / 参考图；默认 16:9（道具 1:1）',
      '参考图支持图生图；每个资产的第一张图默认即「基准图」（「设为基准」会移到第一位）',
      '一键生成受跟踪、非阻塞；可连点排队多张，完成后自动出现新图',
      '图像落本地文件、DB 存元数据；图库不进工作区快照'
    ],
    docLink: {
      label: '查看完整文档',
      href: '../../../../../projects/planning/v1.33.0-asset-image-generation-prd.md'
    }
  }
] as const
