/**
 * Prompt 中心（v1.35.0）主进程单测
 * - catalog：任务目录**来自真实注册表**（条数一致、字段合法、agentRuntime 判定）
 * - preview：空 context → 基础骨架（含能力前言）；传入 context → 用该上下文试拼；未知任务抛错
 *
 * 注：仓库内多数主进程模块使用**无扩展名**相对导入，裸 Node 下需注册模块解析钩子
 * （对齐 `renderer/src/features/assetImage/composeAssetImagePrompt.test.mjs` 的范式）。
 */
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'

registerHooks({
  resolve(specifier, context, nextResolve) {
    // @shared/* → electron/shared/*（类型导入会被擦除，此处仅为兜底）
    if (specifier.startsWith('@shared/')) {
      return nextResolve(
        new URL(`../../../shared/${specifier.slice('@shared/'.length)}.ts`, import.meta.url).href,
        context
      )
    }
    // 相对导入且末段无扩展名 → 先试 .ts，再试目录 index.ts
    if (specifier.startsWith('.')) {
      const last = specifier.slice(specifier.lastIndexOf('/') + 1)
      if (last && !last.includes('.')) {
        try {
          return nextResolve(`${specifier}.ts`, context)
        } catch {
          return nextResolve(`${specifier}/index.ts`, context)
        }
      }
    }
    return nextResolve(specifier, context)
  }
})

const { listAiPromptCatalog } = await import('./catalog.ts')
const { renderPromptPreview } = await import('./preview.ts')

test('catalog：目录来自真实注册表，字段合法且覆盖全部任务', () => {
  const entries = listAiPromptCatalog()
  assert.ok(entries.length >= 40, `应覆盖全部已注册任务，实测 ${entries.length} 条`)
  const seen = new Set()
  for (const entry of entries) {
    assert.ok(entry.task && !seen.has(entry.task), `任务名应非空且唯一：${entry.task}`)
    seen.add(entry.task)
    assert.ok(entry.outputType === 'json' || entry.outputType === 'text', `${entry.task} 输出格式应为 json/text`)
    assert.ok(Array.isArray(entry.capabilities), `${entry.task} 的 capabilities 应为数组`)
    assert.ok(entry.capabilities.every((id) => typeof id === 'string' && id), `${entry.task} 的能力 id 应非空`)
    assert.ok(Array.isArray(entry.capabilityLabels), `${entry.task} 应有能力中文标签数组`)
    assert.equal(entry.capabilityLabels.length, entry.capabilities.length, `${entry.task} 能力标签应与 id 一一对应`)
    assert.equal(typeof entry.useSkills, 'boolean', `${entry.task} useSkills 应为布尔`)
    assert.equal(typeof entry.agentRuntime, 'boolean', `${entry.task} agentRuntime 应为布尔`)
  }

  const byTask = new Map(entries.map((entry) => [entry.task, entry]))
  assert.equal(byTask.get('worldview-entry')?.outputType, 'json', '世界观生成为 JSON 任务')
  assert.equal(byTask.get('ranking-style-analysis')?.outputType, 'text', '扫榜风格分析为文本任务')
  assert.ok(byTask.get('asset-visual-prompt'), '新任务应自动出现在目录里')
})

test('catalog：agentRuntime 判定（非流式白名单 + agent 流任务）', () => {
  const byTask = new Map(listAiPromptCatalog().map((entry) => [entry.task, entry]))
  assert.equal(byTask.get('global-assistant')?.agentRuntime, true, '全局助手走 agent')
  assert.equal(byTask.get('outline-batch')?.agentRuntime, true, '批量大纲走 agent（白名单）')
  assert.equal(byTask.get('chapter-assistant')?.agentRuntime, true, '章节助手走 agent 流')
  assert.equal(byTask.get('worldview-entry')?.agentRuntime, false, '世界观生成不走 agent')
})

test('preview：空 context → 基础骨架（含能力前言，无提示）', () => {
  const preview = renderPromptPreview({ task: 'worldview-entry' })
  assert.equal(preview.task, 'worldview-entry')
  assert.ok(preview.system.includes('你正在 CharacterArc 当前已实现的功能范围内工作。'), 'system 应含能力前言')
  assert.ok(preview.system.trim().length > 0, 'system 非空')
  assert.ok(preview.user.trim().length > 0, 'user 非空')
  assert.deepEqual(preview.notes, [], '非 agent 任务无提示')
  assert.equal(preview.agentRuntime, false)
})

test('preview：传入 context → 用该上下文试拼', () => {
  const preview = renderPromptPreview({
    task: 'asset-visual-prompt',
    context: { kind: 'character', name: '林昭', description: '临川城出身的少年剑修。' }
  })
  assert.ok(preview.user.includes('林昭'), 'user 应包含上下文里的资产名')
  assert.ok(preview.user.includes('临川城出身的少年剑修'), 'user 应包含上下文里的简介')
})

test('preview：agent 任务带「另有 Agent 系统层」提示', () => {
  const preview = renderPromptPreview({ task: 'global-assistant' })
  assert.equal(preview.agentRuntime, true)
  assert.ok(preview.notes.length > 0, 'agent 任务应有提示')
  assert.ok(preview.notes[0].includes('Agent'), '提示应说明另有 Agent 系统层')
})

test('preview：未知任务抛错（由 IPC 层兜成错误返回）', () => {
  assert.throws(() => renderPromptPreview({ task: 'not-a-real-task' }), /未知任务类型/)
})
