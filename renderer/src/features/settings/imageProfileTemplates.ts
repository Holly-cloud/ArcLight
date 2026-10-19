import type { ImageProfileProtocol } from '@shared/image-profile'

/**
 * 新建生图渠道时的通用模板。
 *
 * v1.37.0 之前这里是「图片服务预设」，选一条就覆盖唯一的一套配置；
 * 现在渠道可以存多条，模板只负责在新增时预填协议 / 模型 / Base URL。
 */
export interface ImageProfileTemplate {
  id: string
  label: string
  protocol: ImageProfileProtocol
  model: string
  baseUrl: string
  hint: string
}

export const IMAGE_PROFILE_TEMPLATES: ImageProfileTemplate[] = [
  {
    id: 'grsai',
    label: 'GRS AI (nano-banana)',
    protocol: 'grsai',
    model: 'nano-banana-fast',
    baseUrl: 'https://grsai.dakka.com.cn',
    hint: '支持图生图与参考图；按次计费约 ¥0.02/次，失败返还。'
  },
  {
    id: 'gpt-image-openai',
    label: 'GPT-Image-2 (OpenAI)',
    protocol: 'openai-images',
    model: 'gpt-image-1',
    baseUrl: 'https://api.openai.com/v1',
    hint: 'OpenAI 官方图片生成接口，支持 gpt-image-1。需要 OpenAI API Key。'
  },
  {
    id: 'gpt-image-yunwu',
    label: 'GPT-Image-2 (云雾 AI)',
    protocol: 'openai-images',
    model: 'gpt-image-1',
    baseUrl: 'https://yunwu.ai/v1',
    hint: '云雾 AI 中转，兼容 OpenAI 格式。适合国内用户使用 GPT-Image 系列模型。'
  },
  {
    id: 'flux-siliconflow',
    label: 'FLUX.1 (SiliconFlow)',
    protocol: 'openai-images',
    model: 'black-forest-labs/FLUX.1-schnell',
    baseUrl: 'https://api.siliconflow.cn/v1',
    hint: 'SiliconFlow 提供的 FLUX.1 系列模型。模型示例：FLUX.1-schnell / FLUX.1-dev。'
  },
  {
    id: 'doubao-seedream',
    label: 'Doubao Seedream 3.0 (火山引擎)',
    protocol: 'openai-images',
    model: 'doubao-seedream-3.0',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    hint: '字节跳动火山引擎旗下的 Seedream 图片生成模型。'
  },
  {
    id: 'kolors-siliconflow',
    label: 'Kolors (快手可图)',
    protocol: 'openai-images',
    model: 'Kwai-Kolors/Kolors',
    baseUrl: 'https://api.siliconflow.cn/v1',
    hint: 'SiliconFlow 提供的快手 Kolors 可图模型，适合生成高质量中文风格封面。'
  },
  {
    id: 'custom-openai-compatible',
    label: '通用 OpenAI 兼容接口',
    protocol: 'openai-images',
    model: '',
    baseUrl: '',
    hint: '自定义 OpenAI 兼容的图片生成接口，请手动填写模型名和 Base URL。'
  }
]

export const CUSTOM_IMAGE_TEMPLATE_ID = 'custom-openai-compatible'

export const imageProfileTemplateOptions = IMAGE_PROFILE_TEMPLATES.map(({ label, id }) => ({ label, value: id }))

export function getImageProfileTemplate(templateId: string): ImageProfileTemplate {
  return IMAGE_PROFILE_TEMPLATES.find((item) => item.id === templateId)
    ?? IMAGE_PROFILE_TEMPLATES[IMAGE_PROFILE_TEMPLATES.length - 1]
}
