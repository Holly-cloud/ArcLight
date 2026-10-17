/**
 * v1.34.0 资产生图「生成选项」契约
 * - 由生成选项浮层（AssetGenerateOptionsPopover）产出的本次生成参数
 * - 单独放在 .ts 里：`<script setup>` 不能写 export，避免 SFC 内导出类型
 */

/** 一次生成请求的参数（提示词 / 画幅比 / 分辨率 / 参考图） */
export interface GeneratePayload {
  /** 本次生成使用的提示词（已 trim） */
  prompt: string
  /** 画幅比 */
  aspectRatio: string
  /** 分辨率 */
  imageSize: string
  /** 参考图 data URL 列表（可空） */
  images: string[]
  /** 参考图对应的图库 id（写入图库元数据，可空） */
  referenceIds: string[]
}
