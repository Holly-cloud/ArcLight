/**
 * 小说资产提取：多批结果合并 + 按名称去重（纯函数）。
 *
 * 原文超长时提取会分批调用 AI，每批返回一批候选；本模块把多批结果合并成一份，
 * 并按「名称归一」去重（大小写不敏感、去空白），跨批产生的同名实体只保留首次出现项。
 */

import type {
  CharacterCandidate,
  ExtractionCandidates,
  PropCandidate,
  SceneCandidate
} from './parseExtractionResult.ts'

/** 名称归一：trim + 小写 + 去空白，用于跨批去重。 */
export function normalizeExtractionName(name: unknown): string {
  return String(name ?? '').trim().toLowerCase().replace(/\s+/g, '')
}

function mergeCandidateList<T extends { name: string }>(
  lists: Array<readonly T[] | null | undefined>
): T[] {
  const result: T[] = []
  const seen = new Set<string>()

  for (const list of lists) {
    if (!Array.isArray(list)) continue
    for (const candidate of list) {
      if (!candidate || typeof candidate.name !== 'string') continue
      const key = normalizeExtractionName(candidate.name)
      if (!key || seen.has(key)) continue
      seen.add(key)
      result.push(candidate)
    }
  }

  return result
}

/**
 * 合并多批提取结果，按 name 去重（首次出现优先）。
 * 入参允许出现 null/undefined 批（例如某批解析失败）。
 */
export function mergeExtractionCandidates(
  batches: Array<Partial<ExtractionCandidates> | null | undefined>
): ExtractionCandidates {
  return {
    characters: mergeCandidateList<CharacterCandidate>(batches.map((batch) => batch?.characters)),
    scenes: mergeCandidateList<SceneCandidate>(batches.map((batch) => batch?.scenes)),
    props: mergeCandidateList<PropCandidate>(batches.map((batch) => batch?.props))
  }
}
