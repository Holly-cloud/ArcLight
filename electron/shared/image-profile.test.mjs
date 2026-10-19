import assert from 'node:assert/strict'
import test from 'node:test'

import {
  IMAGE_PROFILE_LIMIT,
  legacyImageColumnsToProfile,
  normalizeImageProfiles,
  resolveActiveImageProfile,
  toImageRequestSettings
} from './image-profile.ts'
import { isGrsaiChannel } from './image-channel.ts'

test('toImageRequestSettings 把 protocol 落成 transport 认识的 imageProvider', () => {
  assert.deepEqual(toImageRequestSettings({
    id: 'p1',
    name: '云雾',
    protocol: 'openai-images',
    baseUrl: 'https://yunwu.ai/v1',
    apiKey: 'sk-1',
    model: 'gpt-image-1'
  }), {
    imageProvider: 'openai-images',
    imageModel: 'gpt-image-1',
    imageApiKey: 'sk-1',
    imageBaseUrl: 'https://yunwu.ai/v1'
  })

  // 没有渠道时也要给出可判定的形状，transport 会据此抛出「请先配置」而不是崩
  assert.deepEqual(toImageRequestSettings(null), {
    imageProvider: 'openai-images',
    imageModel: '',
    imageApiKey: '',
    imageBaseUrl: ''
  })
})

test('合成形状喂回 isGrsaiChannel 的结论必须与 protocol 一致', () => {
  // 这是 transport 分支与渲染层门控同源的根：不一致就会出现「界面说支持、实际丢弃」
  const grsai = toImageRequestSettings({
    id: 'g', name: 'GRS', protocol: 'grsai',
    baseUrl: 'https://grsai.dakka.com.cn', apiKey: 'k', model: 'm'
  })
  assert.equal(isGrsaiChannel(grsai), true)

  const compat = toImageRequestSettings({
    id: 'c', name: 'OpenAI', protocol: 'openai-images',
    baseUrl: 'https://api.openai.com/v1', apiKey: 'k', model: 'm'
  })
  assert.equal(isGrsaiChannel(compat), false)

  // protocol 与主机冲突时以主机为准——transport 就是这么路由的
  const conflicting = toImageRequestSettings({
    id: 'x', name: '手填 GRS 主机', protocol: 'openai-images',
    baseUrl: 'https://grsai.dakka.com.cn', apiKey: 'k', model: 'm'
  })
  assert.equal(isGrsaiChannel(conflicting), true)
})

test('resolveActiveImageProfile 命中则取该条，落空退回首条，全空返回 null', () => {
  const a = { id: 'a', name: 'A', protocol: 'openai-images', baseUrl: '', apiKey: '', model: '' }
  const b = { id: 'b', name: 'B', protocol: 'grsai', baseUrl: '', apiKey: '', model: '' }

  assert.equal(resolveActiveImageProfile([a, b], 'b'), b)
  assert.equal(resolveActiveImageProfile([a, b], '已删除的 id'), a)
  assert.equal(resolveActiveImageProfile([a, b], ''), a)
  assert.equal(resolveActiveImageProfile([], 'a'), null)
  assert.equal(resolveActiveImageProfile(undefined, undefined), null)
})

test('normalizeImageProfiles 去空 id、trim、补协议并截断到上限', () => {
  const normalized = normalizeImageProfiles([
    { id: '  ', name: '无 id', baseUrl: 'https://x.test' },
    null,
    '不是对象',
    {
      id: ' p1 ',
      name: ' 云雾 ',
      baseUrl: ' https://yunwu.ai/v1 ',
      apiKey: ' sk-1 ',
      model: ' gpt-image-1 '
    },
    ...Array.from({ length: 12 }, (_, index) => ({ id: `auto-${index}`, baseUrl: 'https://x.test' }))
  ])

  assert.equal(normalized.length, IMAGE_PROFILE_LIMIT)
  assert.deepEqual(normalized[0], {
    id: 'p1',
    name: '云雾',
    protocol: 'openai-images',
    baseUrl: 'https://yunwu.ai/v1',
    apiKey: 'sk-1',
    model: 'gpt-image-1'
  })
})

test('normalizeImageProfiles 只在 protocol 缺失或非法时按主机名推断', () => {
  assert.equal(
    normalizeImageProfiles([{ id: 'a', baseUrl: 'https://api.grsaiapi.com/v1' }])[0].protocol,
    'grsai'
  )
  assert.equal(
    normalizeImageProfiles([{ id: 'a', baseUrl: 'https://grsai.dakka.com.cn', protocol: 'openai-images' }])[0].protocol,
    'openai-images'
  )
  assert.equal(
    normalizeImageProfiles([{ id: 'a', baseUrl: 'https://grsai.dakka.com.cn', protocol: '胡说八道' }])[0].protocol,
    'grsai'
  )
})

test('legacyImageColumnsToProfile 保留 Key 与地址，四字段全空时不造幽灵配置', () => {
  assert.equal(legacyImageColumnsToProfile({}), null)
  assert.equal(legacyImageColumnsToProfile({ imageProvider: '', imageModel: '', imageApiKey: '', imageBaseUrl: '' }), null)

  const profile = legacyImageColumnsToProfile({
    imageProvider: 'custom-openai-compatible',
    imageModel: 'gpt-image-1',
    imageApiKey: 'sk-用户填的key',
    imageBaseUrl: 'https://compat.test/v1'
  })
  assert.ok(profile)
  assert.equal(profile.apiKey, 'sk-用户填的key')
  assert.equal(profile.baseUrl, 'https://compat.test/v1')
  assert.equal(profile.protocol, 'openai-images')
  assert.equal(profile.id, 'legacy-image-profile')
})
