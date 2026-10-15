/**
 * 对白锚点防伪（PRD §4.2 / §3.2 P0-6 / deconstruction-analysis.md §5.2）
 * - 三重匹配：等值 / 双向包含 / 章节 excerpt 兜底
 * - 匹配不上自动降级 mode: 'adapted' 并清 sourceQuote
 * - 返回 { valid, downgraded }；mode !== 'original' 跳过校验
 * - 产品诚信底线，必须先单测再接 UI
 */

import type { AdaptationSourceEvidence, DialogueAnchor } from '@/types/app'

export interface DialogueValidationResult {
  /** 校验通过（仍标 original 或非 original 跳过）的锚点列表 */
  valid: DialogueAnchor[]
  /** 校验失败已降级为 adapted 的锚点列表（清除 sourceQuote） */
  downgraded: DialogueAnchor[]
}

/**
 * 校验一组对白锚点是否真为"原文对白"
 * - anchor.mode !== 'original'：直接通过（视为改编对白，无需校验）
 * - 三重匹配（任一命中即视为匹配）：
 *   1. 等值：q.text === anchor.text
 *   2. 双向包含：q.text.includes(anchor.text) || anchor.text.includes(q.text)
 *   3. 章节 excerpt 兜底：anchor.sourceQuote && evidence.some(i => i.excerpt.includes(anchor.sourceQuote))
 * - 不匹配 → mode 降级为 'adapted' 且清空 sourceQuote
 */
export function validateOriginalDialogueAnchors(
  anchors: DialogueAnchor[] | undefined,
  evidence: AdaptationSourceEvidence[]
): DialogueValidationResult {
  const valid: DialogueAnchor[] = []
  const downgraded: DialogueAnchor[] = []
  const evidenceByChapterId = new Map<string, AdaptationSourceEvidence>()
  for (const item of evidence) {
    if (item && item.chapterId) evidenceByChapterId.set(item.chapterId, item)
  }
  for (const anchor of anchors ?? []) {
    if (!anchor || anchor.mode !== 'original') {
      valid.push(anchor)
      continue
    }
    const chapterEvidence = anchor.sourceChapterId
      ? evidenceByChapterId.get(anchor.sourceChapterId)
      : undefined
    let matched = false
    if (chapterEvidence) {
      for (const quote of chapterEvidence.dialogueQuotes ?? []) {
        if (!quote || typeof quote.text !== 'string') continue
        if (
          quote.text === anchor.text
          || quote.text.includes(anchor.text)
          || (anchor.text.length > 0 && anchor.text.includes(quote.text))
        ) {
          matched = true
          break
        }
      }
    }
    if (!matched && anchor.sourceQuote) {
      const quote = anchor.sourceQuote
      const found = evidence.some((item) => typeof item.excerpt === 'string' && item.excerpt.includes(quote))
      if (found) matched = true
    }
    if (matched) {
      valid.push(anchor)
    } else {
      // 未匹配：降级 mode 并清 sourceQuote
      downgraded.push({
        ...anchor,
        mode: 'adapted',
        sourceQuote: undefined
      })
    }
  }
  return { valid, downgraded }
}
