/**
 * v1.36.2 生图传输层接线单测（桩 fetch，不发真实网络）
 *
 * 存在意义：本版修的缺陷是「参数被传输层丢弃」，而纯函数单测看不见接线错误——
 * 若有人把 size 改回硬编码字面量，其余 300+ 条用例仍会全绿。
 * 运行方式：
 *   set ELECTRON_RUN_AS_NODE=1&& electron --test electron/main/ai/transport/images.test.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { generateImage } from './images.ts'

const COMPAT_SETTINGS = {
  imageProvider: 'custom-openai-compatible',
  imageModel: 'gpt-image-1',
  imageApiKey: 'test-key',
  imageBaseUrl: 'https://compat.test/v1',
  proxyUrl: ''
}

const GRSAI_SETTINGS = {
  imageProvider: 'grsai',
  imageModel: 'nano-banana-fast',
  imageApiKey: 'test-key',
  imageBaseUrl: 'https://grsai.dakka.com.cn',
  proxyUrl: ''
}

/** 安装 fetch 桩；onCall 返回 'ok'（默认成功）或抛错（用于只需捕获请求体的场景） */
function installFetchStub(onCall) {
  const calls = []
  const original = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null
    calls.push({ url: String(url), body })
    if (onCall === 'throw') {
      throw new Error('stub-stop')
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ data: [{ b64_json: 'aW1hZ2U=' }] })
    }
  }
  return { calls, restore: () => { globalThis.fetch = original } }
}

test('OpenAI 兼容分支把画幅比真正落到请求体（16:9 → 1536x1024）', async () => {
  const stub = installFetchStub()
  try {
    const result = await generateImage(COMPAT_SETTINGS, 'prompt', { aspectRatio: '16:9', imageSize: '1K' })
    assert.equal(stub.calls.length, 1)
    assert.match(stub.calls[0].url, /\/images\/generations$/)
    assert.equal(stub.calls[0].body.size, '1536x1024')
    assert.equal(stub.calls[0].body.model, 'gpt-image-1')
    assert.equal(stub.calls[0].body.prompt, 'prompt')
    assert.equal(stub.calls[0].body.response_format, 'b64_json')
    assert.equal(result.dataUrl, 'data:image/png;base64,aW1hZ2U=')
  } finally {
    stub.restore()
  }
})

test('未带画幅比时保持 1.36.1 的固定竖版（封面等旧调用零变化）', async () => {
  const stub = installFetchStub()
  try {
    await generateImage(COMPAT_SETTINGS, 'cover prompt')
    assert.equal(stub.calls[0].body.size, '1024x1536')
  } finally {
    stub.restore()
  }
})

test('auto 透传给渠道，不被强塞具体档位', async () => {
  const stub = installFetchStub()
  try {
    await generateImage(COMPAT_SETTINGS, 'prompt', { aspectRatio: 'auto', imageSize: '4K' })
    assert.equal(stub.calls[0].body.size, 'auto')
    assert.equal(stub.calls[0].body.image_size ?? stub.calls[0].body.imageSize, undefined, '本分支不发明分辨率字段')
  } finally {
    stub.restore()
  }
})

test('2K/4K 不产生虚构像素：请求体仍只有档位 size', async () => {
  const stub = installFetchStub()
  try {
    await generateImage(COMPAT_SETTINGS, 'prompt', { aspectRatio: '1:1', imageSize: '4K' })
    assert.equal(stub.calls[0].body.size, '1024x1024')
    assert.deepEqual(Object.keys(stub.calls[0].body).sort(), ['model', 'prompt', 'response_format', 'size'])
  } finally {
    stub.restore()
  }
})

test('GRS 渠道仍走 /v1/api/generate 且按原值传画幅比（不受档位映射影响）', async () => {
  const stub = installFetchStub('throw')
  try {
    await assert.rejects(
      () => generateImage(GRSAI_SETTINGS, 'prompt', { aspectRatio: '16:9', imageSize: '2K' }),
      /stub-stop/
    )
    assert.match(stub.calls[0].url, /\/v1\/api\/generate$/)
    assert.equal(stub.calls[0].body.aspectRatio, '16:9')
    assert.equal(stub.calls[0].body.imageSize, '2K')
    assert.equal(stub.calls[0].body.replyType, 'json')
    assert.equal(stub.calls[0].body.size, undefined)
  } finally {
    stub.restore()
  }
})

test('provider 是自定义但 baseUrl 命中 GRS 主机时，按 GRS 路由（与浮层同一判定）', async () => {
  const stub = installFetchStub('throw')
  try {
    await assert.rejects(
      () => generateImage({ ...COMPAT_SETTINGS, imageBaseUrl: 'https://grsai.dakka.com.cn' }, 'prompt', { aspectRatio: '16:9' }),
      /stub-stop/
    )
    assert.match(stub.calls[0].url, /\/v1\/api\/generate$/)
    assert.equal(stub.calls[0].body.aspectRatio, '16:9')
  } finally {
    stub.restore()
  }
})
