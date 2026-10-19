/**
 * v1.36.2 生图渠道协议判定单测（纯函数，无 IO）
 * 运行方式：
 *   set ELECTRON_RUN_AS_NODE=1&& electron --test electron/shared/image-channel.test.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { isGrsaiChannel } from './image-channel.ts'

test('显式 grsai 预设直接命中（大小写与空格不敏感）', () => {
  assert.equal(isGrsaiChannel({ imageProvider: 'grsai' }), true)
  assert.equal(isGrsaiChannel({ imageProvider: ' GRSai ' }), true)
})

test('图片 Base URL 命中 GRS 主机时同样走 GRS（与主进程历史判定一致）', () => {
  assert.equal(isGrsaiChannel({ imageProvider: 'custom-openai-compatible', imageBaseUrl: 'https://grsai.dakka.com.cn' }), true)
  assert.equal(isGrsaiChannel({ imageProvider: 'custom-openai-compatible', imageBaseUrl: 'https://api.grsaiapi.com/v1' }), true)
})

test('没有图片 Base URL 时回退看通用 Base URL', () => {
  assert.equal(isGrsaiChannel({ imageProvider: 'custom-openai-compatible', imageBaseUrl: '', baseUrl: 'https://grsai.dakka.com.cn' }), true)
})

test('非 GRS 主机与缺配置不命中', () => {
  assert.equal(isGrsaiChannel({ imageProvider: 'gpt-image-yunwu', imageBaseUrl: 'https://yunwu.ai/v1' }), false)
  assert.equal(isGrsaiChannel({ imageProvider: '', imageBaseUrl: '', baseUrl: '' }), false)
  assert.equal(isGrsaiChannel({ imageProvider: null, imageBaseUrl: undefined }), false)
  assert.equal(isGrsaiChannel(null), false)
  assert.equal(isGrsaiChannel({ imageBaseUrl: '不是网址' }), false)
})

test('只匹配主机本身或其子域，不被路径里的同名字符串骗过', () => {
  assert.equal(isGrsaiChannel({ imageBaseUrl: 'https://example.test/grsai.dakka.com.cn' }), false)
  assert.equal(isGrsaiChannel({ imageBaseUrl: 'https://grsai.dakka.com.cn.evil.test' }), false)
})
