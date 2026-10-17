/**
 * Prompt 中心（v1.35.0）：任务目录（纯函数，无副作用）。
 *
 * 目录**直接来自真实注册表**（`tasks/index.ts` 的 `TASK_REGISTRY`），
 * 因此新增任务会自动出现在 Prompt 中心，无需手工维护清单。
 */
import type { AiPromptCatalogEntry } from '@shared/ipc-types'
import { listTaskHandlers } from '../tasks'
import { getDefaultCapabilities } from './capability'
import { isAgentRuntimeTask } from './agent-runtime'

/** 列出全部已注册任务的可展示档案（按注册顺序） */
export function listAiPromptCatalog(): AiPromptCatalogEntry[] {
  return listTaskHandlers().map((handler) => ({
    task: handler.name,
    outputType: handler.outputType,
    capabilities: getDefaultCapabilities(handler.name),
    useSkills: handler.useSkills !== false,
    agentRuntime: isAgentRuntimeTask(handler.name)
  }))
}
