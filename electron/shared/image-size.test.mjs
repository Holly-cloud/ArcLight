/**
 * v1.36.2 OpenAI 兼容生图尺寸档位映射单测（纯函数，无 IO / 无网络）
 * 运行方式：
 *   set ELECTRON_RUN_AS_NODE=1&& electron --test electron/shared/image-size.test.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  OPENAI_COMPATIBLE_AUTO_SIZE,
  OPENAI_COMPATIBLE_FALLBACK_SIZE,
  OPENAI_COMPATIBLE_SIZE_TIERS,
  resolveOpenAiCompatibleSize
} from './image-size.ts'

test('档位表为 OpenAI 兼容通用四档（含 auto 由函数处理）', () => {
  assert.deepEqual(
    OPENAI_COMPATIBLE_SIZE_TIERS.map((tier) => tier.size),
    ['1024x1024', '1536x1024', '1024x1536']
  )
})

test('16:9 没有对应档位 → 就近取 1536x1024（3:2）并如实标注非精确', () => {
  const resolved = resolveOpenAiCompatibleSize('16:9')
  assert.equal(resolved.size, '1536x1024')
  assert.equal(resolved.tierRatio, '3:2')
  assert.equal(resolved.exact, false)
  assert.equal(resolved.applied, true)
  assert.match(resolved.note, /此渠道按 1536x1024（3:2）出图/)
  assert.match(resolved.note, /没有 16:9，已就近取 3:2/)
})

test('比例一致的三档命中 exact', () => {
  assert.equal(resolveOpenAiCompatibleSize('1:1').size, '1024x1024')
  assert.equal(resolveOpenAiCompatibleSize('1:1').exact, true)
  assert.equal(resolveOpenAiCompatibleSize('3:2').size, '1536x1024')
  assert.equal(resolveOpenAiCompatibleSize('3:2').exact, true)
  assert.equal(resolveOpenAiCompatibleSize('2:3').size, '1024x1536')
  assert.equal(resolveOpenAiCompatibleSize('2:3').exact, true)
  assert.equal(resolveOpenAiCompatibleSize('3:2').note, '此渠道按 1536x1024（3:2）出图。该档位比例与所选一致。')
})

test('横竖方向不会被映射反：横倾比例取横档，竖倾比例取竖档', () => {
  for (const ratio of ['4:3', '5:4', '16:9', '21:9']) {
    assert.equal(resolveOpenAiCompatibleSize(ratio).size, '1536x1024', `${ratio} 应取横档`)
  }
  for (const ratio of ['3:4', '4:5', '9:16', '2:3']) {
    assert.equal(resolveOpenAiCompatibleSize(ratio).size, '1024x1536', `${ratio} 应取竖档`)
  }
})

test('auto 透传 auto，不强塞档位；文案不得自相矛盾地提"档位"', () => {
  const resolved = resolveOpenAiCompatibleSize('auto')
  assert.equal(resolved.size, OPENAI_COMPATIBLE_AUTO_SIZE)
  assert.equal(resolved.auto, true)
  assert.equal(resolved.applied, true)
  assert.match(resolved.note, /由服务端决定/)
  assert.doesNotMatch(resolved.note, /档位/)
  assert.doesNotMatch(resolveOpenAiCompatibleSize('auto', '4K').note, /档位/)
})

test('未带画幅比或画幅比不可解析 → 回落 1.36.1 的硬编码值且不出提示（旧行为）', () => {
  for (const value of [undefined, null, '', '   ', '16/9', 'abc', '0:1', '-1:2']) {
    const resolved = resolveOpenAiCompatibleSize(value)
    assert.equal(resolved.size, OPENAI_COMPATIBLE_FALLBACK_SIZE, `${String(value)} 应回落到旧值`)
    assert.equal(resolved.applied, false)
    assert.equal(resolved.note, '')
  }
})

test('分辨率档位在本协议下不可翻译，2K/4K 需在提示中说明', () => {
  assert.equal(resolveOpenAiCompatibleSize('1:1', '1K').sizeIgnored, false)
  assert.equal(resolveOpenAiCompatibleSize('1:1', '').sizeIgnored, false)
  assert.equal(resolveOpenAiCompatibleSize('1:1', '2K').sizeIgnored, true)
  assert.match(resolveOpenAiCompatibleSize('1:1', '4K').note, /4K 分辨率在该协议下不生效/)
  assert.equal(resolveOpenAiCompatibleSize('auto', '4K').sizeIgnored, true)
  assert.match(resolveOpenAiCompatibleSize('auto', '4K').note, /auto 请求尺寸/)
})

test('带空格的画幅比同样可用；提示文案不含 URL 与密钥形态内容', () => {
  const resolved = resolveOpenAiCompatibleSize(' 16 : 9 ')
  assert.equal(resolved.size, '1536x1024')
  assert.doesNotMatch(resolved.note, /http|api|key|token/i)
})
