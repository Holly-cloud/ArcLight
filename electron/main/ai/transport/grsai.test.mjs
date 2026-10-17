/**
 * v1.33.0 GRS AI 生图协议单测（纯函数 + 桩数据，无网络）
 * 覆盖：请求体构造、响应解析（status / results 分支）、violation / failed 错误、URL→本地 data URL。
 * 运行方式：
 *   set ELECTRON_RUN_AS_NODE=1&& electron --test electron/main/ai/transport/grsai.test.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

const {
  GRSAI_DEFAULT_ASPECT_RATIO,
  GRSAI_DEFAULT_IMAGE_SIZE,
  GRSAI_DEFAULT_REPLY_TYPE,
  buildGrsaiRequestBody,
  parseGrsaiResponse,
  grsaiResultToDataUrl,
  isRetryableGrsaiError,
  isGrsaiTerminalStatus,
  grsaiGenerateEndpoint,
  grsaiResultEndpoint
} = await import('./grsai.ts')

test('buildGrsaiRequestBody：基础字段与默认值', () => {
  const body = JSON.parse(buildGrsaiRequestBody({ model: 'nano-banana-fast', prompt: '一只猫' }))
  assert.equal(body.model, 'nano-banana-fast')
  assert.equal(body.prompt, '一只猫')
  assert.equal(body.aspectRatio, GRSAI_DEFAULT_ASPECT_RATIO)
  assert.equal(body.imageSize, GRSAI_DEFAULT_IMAGE_SIZE)
  assert.equal(body.replyType, GRSAI_DEFAULT_REPLY_TYPE)
  assert.equal('images' in body, false, '无参考图时不下发 images')
})

test('buildGrsaiRequestBody：带参考图时下发 images（过滤空值）', () => {
  const body = JSON.parse(buildGrsaiRequestBody({
    model: 'm',
    prompt: 'p',
    images: ['data:image/jpeg;base64,AAAA', '', 'https://example.com/a.png'],
    aspectRatio: '16:9',
    imageSize: '2K',
    replyType: 'async'
  }))
  assert.deepEqual(body.images, ['data:image/jpeg;base64,AAAA', 'https://example.com/a.png'])
  assert.equal(body.aspectRatio, '16:9')
  assert.equal(body.imageSize, '2K')
  assert.equal(body.replyType, 'async')
})

test('parseGrsaiResponse：succeeded + results[0].url', () => {
  const parsed = parseGrsaiResponse({
    id: 'abc',
    status: 'succeeded',
    progress: 100,
    results: [{ url: 'https://cdn.example.com/1.jpg' }]
  })
  assert.equal(parsed.status, 'succeeded')
  assert.equal(parsed.url, 'https://cdn.example.com/1.jpg')
  assert.equal(parsed.progress, 100)
  assert.equal(parsed.error, '')
})

test('parseGrsaiResponse：violation 保留错误文案', () => {
  const parsed = parseGrsaiResponse({ id: 'v', status: 'violation', results: [], error: '内容违规' })
  assert.equal(parsed.status, 'violation')
  assert.equal(parsed.error, '内容违规')
  assert.equal(parsed.url, '')
})

test('parseGrsaiResponse：failed（failure_reason 兜底）', () => {
  const parsed = parseGrsaiResponse({ id: 'f', status: 'failed', results: [], failure_reason: '上游超时' })
  assert.equal(parsed.status, 'failed')
  assert.equal(parsed.error, '上游超时')
})

test('parseGrsaiResponse：running 需继续轮询', () => {
  const parsed = parseGrsaiResponse({ id: 'r', status: 'running', progress: 40, results: [] })
  assert.equal(parsed.status, 'running')
  assert.equal(isGrsaiTerminalStatus(parsed.status), false)
})

test('parseGrsaiResponse：running 但已带 url → 视为 succeeded（兜底）', () => {
  const parsed = parseGrsaiResponse({ id: 'r', status: 'running', results: [{ url: 'https://x/y.png' }] })
  assert.equal(parsed.status, 'succeeded')
})

test('parseGrsaiResponse：succeeded 但无 url → failed', () => {
  const parsed = parseGrsaiResponse({ id: 's', status: 'succeeded', results: [] })
  assert.equal(parsed.status, 'failed')
  assert.equal(parsed.url, '')
})

test('parseGrsaiResponse：缺省 status 但有 url → succeeded；完全非法 → failed', () => {
  assert.equal(parseGrsaiResponse({ results: [{ url: 'https://x/z.png' }] }).status, 'succeeded')
  assert.equal(parseGrsaiResponse(null).status, 'failed')
  assert.equal(parseGrsaiResponse('oops').status, 'failed')
})

test('grsaiResultToDataUrl：成功时用 downloader 下载远程 URL（URL→本地）', async () => {
  const parsed = { id: 'a', status: 'succeeded', progress: 100, url: 'https://cdn/1.jpg', error: '' }
  const calls = []
  const dataUrl = await grsaiResultToDataUrl(parsed, async (url) => {
    calls.push(url)
    return 'data:image/jpeg;base64,QUJD'
  })
  assert.deepEqual(calls, ['https://cdn/1.jpg'])
  assert.equal(dataUrl, 'data:image/jpeg;base64,QUJD')
})

test('grsaiResultToDataUrl：violation / failed / running / 无 url 均抛错', async () => {
  const noop = async () => 'data:image/png;base64,AA=='
  await assert.rejects(
    () => grsaiResultToDataUrl({ id: '', status: 'violation', progress: 0, url: '', error: '违规' }, noop),
    /违规/
  )
  await assert.rejects(
    () => grsaiResultToDataUrl({ id: '', status: 'failed', progress: 0, url: '', error: '' }, noop),
    /图片生成失败/
  )
  await assert.rejects(
    () => grsaiResultToDataUrl({ id: 'r', status: 'running', progress: 10, url: '', error: '' }, noop),
    /仍在生成中/
  )
  await assert.rejects(
    () => grsaiResultToDataUrl({ id: '', status: 'succeeded', progress: 100, url: '', error: '' }, noop),
    /没有返回图片数据/
  )
})

test('isRetryableGrsaiError：仅网络 / 超时 / 429 / 5xx 可重试', () => {
  assert.equal(isRetryableGrsaiError(new Error('请求失败：429 Too Many Requests')), true)
  assert.equal(isRetryableGrsaiError(new Error('请求失败：503 Service Unavailable')), true)
  assert.equal(isRetryableGrsaiError(new Error('请求超时，请检查网络')), true)
  assert.equal(isRetryableGrsaiError(new Error('fetch failed')), true)
  assert.equal(isRetryableGrsaiError(new Error('请求失败：400 Bad Request')), false)
  assert.equal(isRetryableGrsaiError(new Error('图片生成被判定为违规')), false)
  assert.equal(isRetryableGrsaiError(''), false)
})

test('endpoint 拼接：generate / result', () => {
  assert.equal(grsaiGenerateEndpoint('https://grsai.dakka.com.cn/'), 'https://grsai.dakka.com.cn/v1/api/generate')
  assert.equal(grsaiResultEndpoint('https://grsai.dakka.com.cn', 'id-1'), 'https://grsai.dakka.com.cn/v1/api/result?id=id-1')
})
