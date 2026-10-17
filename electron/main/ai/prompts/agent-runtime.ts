import type { AiTaskName } from '../shared-types'
import { AGENT_TASK_WHITELIST } from '../settings'

/**
 * 走 Agent 运行时（带工具调用、并在基础 prompt 之外**追加系统层**）的任务清单。
 *
 * 来源两处，均为实读代码：
 * 1. 主进程**非流式** agent 白名单 —— `settings.ts` 的 `AGENT_TASK_WHITELIST`（`outline-batch` / `global-assistant`）；
 * 2. 渲染层经 **agent 流**送来的任务 —— 据 `agent/streaming-orchestrator.ts` 的任务分支
 *    （`chapter-assistant` / `chapter-first-draft` / `global-assistant`），取其中不属于白名单者。
 *
 * Prompt 中心据此提示「该任务另有 Agent 系统层」；若后续新增 agent 任务，往此处补即可。
 */
const STREAMING_AGENT_TASKS: readonly AiTaskName[] = ['chapter-assistant', 'chapter-first-draft']

/** Agent 运行时任务集合 */
export const AGENT_RUNTIME_TASKS: ReadonlySet<AiTaskName> = new Set<AiTaskName>([
  ...AGENT_TASK_WHITELIST,
  ...STREAMING_AGENT_TASKS
])

/** 判断指定任务是否走 Agent 运行时 */
export function isAgentRuntimeTask(task: AiTaskName): boolean {
  return AGENT_RUNTIME_TASKS.has(task)
}
