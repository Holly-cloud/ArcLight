/**
 * Prompt 中心（v1.35.0）：prompt 预览（**纯函数，不调模型 / 不发网络 / 不写库**）。
 *
 * 复用真实的任务组装链路：
 *   `tasks/index.getTaskHandler` + `runtime/context-builder.buildPromptInput` + `handler.buildPrompt`
 * 因此「代码一改，页面立刻是新的」，且与真实运行使用**同一套拼装逻辑**。
 *
 * 两种模式：
 * - **基础骨架**：不传 `context`（空对象）→ 只含该任务默认能力的 prompt 骨架；
 * - **试拼**：传入渲染层给的上下文 → 用该上下文拼一次。
 */
import type { AiPromptPreviewRequest, AiPromptPreviewResult } from '@shared/ipc-types'
import type { AiTaskName, AiTaskPayload, AppSettings } from '../shared-types'
import { getTaskHandler } from '../tasks'
import { buildPromptInput } from '../runtime/context-builder'
import { getDefaultCapabilities } from './capability'
import { isAgentRuntimeTask } from './agent-runtime'

/**
 * 预览期间无需真实设置：`buildPromptInput()` 只读 `task.task` 与 `task.context`
 * （见 `runtime/context-builder.ts`），**不会读取 settings / API Key**，也不会发起任何网络请求。
 */
const PREVIEW_SETTINGS = {} as AppSettings

/** 组装指定任务的 prompt 预览（system / user 两段全文） */
export function renderPromptPreview(request: AiPromptPreviewRequest): AiPromptPreviewResult {
  const task = String(request?.task ?? '').trim() as AiTaskName
  const handler = getTaskHandler(task)
  const context = request?.context && typeof request.context === 'object' ? request.context : {}

  const payload: AiTaskPayload = {
    task,
    settings: PREVIEW_SETTINGS,
    context
  }

  const input = buildPromptInput(payload, [], undefined)
  const pair = handler.buildPrompt(input)
  const agentRuntime = isAgentRuntimeTask(task)

  return {
    task,
    system: String(pair.system ?? ''),
    user: String(pair.user ?? ''),
    capabilities: getDefaultCapabilities(task),
    agentRuntime,
    notes: agentRuntime ? ['该任务另有 Agent 系统层（工具调用与追加规则），本页只展示其基础 prompt。'] : []
  }
}
