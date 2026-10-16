/**
 * 项目小说原文的读写包装（复用知识文档既有链路，零新增 store API）。
 *
 * - 读取：直接读 store 的 `knowledgeDocuments`（已按 projectId 过滤，含 novel-source）。
 * - 追加：把新文本合并进既有原文后，用 `mergeKnowledgeDocuments` 写回同一条文档；
 *   因 sourceTitle 固定为「小说原文」，`replaceKnowledgeDocumentsBySource` 会替换旧文档，
 *   天然保证「1 项目 1 本」（后续导入 = 对同一本的补充）。
 *
 * 本模块只依赖 store 的公开字段，不新增任何 store action / IPC / 表结构。
 */

import type { KnowledgeDocument } from '@/types/app'
import {
  appendNovelText,
  buildNovelDocument,
  locateProjectNovel,
  readProjectNovelContent
} from './novelSource.ts'

/** readProjectNovel / appendProjectNovel 所需的最小 store 结构。 */
export interface ProjectNovelStore {
  currentProject?: { id: string } | null
  /** 当前项目可见的知识文档（含 novel-source） */
  knowledgeDocuments: KnowledgeDocument[]
  /** 已知来源替换语义的知识文档合并入口 */
  mergeKnowledgeDocuments: (documents: KnowledgeDocument[]) => void
}

function resolveProjectId(store: ProjectNovelStore): string {
  return String(store.currentProject?.id ?? '').trim()
}

/** 读取当前项目的累积小说原文；无小说文档时返回空串（旧项目兼容）。 */
export function readProjectNovel(store: ProjectNovelStore): string {
  const projectId = resolveProjectId(store)
  if (!projectId) return ''
  return readProjectNovelContent(store.knowledgeDocuments, projectId)
}

/**
 * 追加导入小说原文：合并到当前项目唯一的小说文档。
 * @returns 合并后的完整原文
 */
export function appendProjectNovel(
  store: ProjectNovelStore,
  text: string,
  now: string = new Date().toISOString()
): string {
  const projectId = resolveProjectId(store)
  if (!projectId) {
    throw new Error('未选择项目，无法导入小说原文。')
  }

  const existingDocument = locateProjectNovel(store.knowledgeDocuments, projectId)
  const existingContent = typeof existingDocument?.content === 'string' ? existingDocument.content : ''
  const mergedContent = appendNovelText(existingContent, text)
  if (mergedContent === existingContent) {
    return mergedContent
  }

  const document = buildNovelDocument({
    projectId,
    content: mergedContent,
    id: existingDocument?.id,
    now,
    metadata: existingDocument?.metadata
  })
  store.mergeKnowledgeDocuments([document])

  return mergedContent
}
