import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CUSTOM_IMAGE_TEMPLATE_ID,
  IMAGE_PROFILE_TEMPLATES,
  getImageProfileTemplate,
  imageProfileTemplateOptions
} from './imageProfileTemplates.ts'
import { isGrsaiChannel } from '../../../../electron/shared/image-channel.ts'
import { toImageRequestSettings } from '../../../../electron/shared/image-profile.ts'

test('模板 id 唯一、协议合法，且下拉选项与模板一一对应', () => {
  const ids = IMAGE_PROFILE_TEMPLATES.map((template) => template.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(imageProfileTemplateOptions.length, ids.length)
  for (const template of IMAGE_PROFILE_TEMPLATES) {
    assert.ok(['grsai', 'openai-images'].includes(template.protocol), template.id)
    assert.ok(template.label.trim(), '每条模板都要有名字，新建时直接拿它当渠道名')
  }
})

test('模板声明的协议必须和 transport 的路由结论一致', () => {
  // 若某条 OpenAI 兼容模板的 baseUrl 其实是 GRS 主机，顶栏显示与主进程分支就会分叉
  for (const template of IMAGE_PROFILE_TEMPLATES) {
    const routed = isGrsaiChannel(toImageRequestSettings({
      id: template.id,
      name: template.label,
      protocol: template.protocol,
      baseUrl: template.baseUrl,
      apiKey: 'k',
      model: template.model
    }))
    assert.equal(routed, template.protocol === 'grsai', template.id)
  }
})

test('只有 GRS 模板是 grsai 协议，通用兼容模板兜底在最后', () => {
  assert.deepEqual(
    IMAGE_PROFILE_TEMPLATES.filter((t) => t.protocol === 'grsai').map((t) => t.id),
    ['grsai']
  )
  assert.equal(IMAGE_PROFILE_TEMPLATES[IMAGE_PROFILE_TEMPLATES.length - 1].id, CUSTOM_IMAGE_TEMPLATE_ID)
  assert.equal(IMAGE_PROFILE_TEMPLATES.length <= 8, true, '模板数不得超过渠道上限 8 条')
})

test('未知模板回退到通用 OpenAI 兼容模板，不抛错', () => {
  assert.equal(getImageProfileTemplate('不存在').id, CUSTOM_IMAGE_TEMPLATE_ID)
  assert.equal(getImageProfileTemplate('').id, CUSTOM_IMAGE_TEMPLATE_ID)
  assert.equal(getImageProfileTemplate('grsai').protocol, 'grsai')
})

test('模板预填不附带 Key，符合"改模板不覆盖已填 Key"', () => {
  for (const template of IMAGE_PROFILE_TEMPLATES) {
    assert.equal('apiKey' in template, false, template.id)
  }
})
