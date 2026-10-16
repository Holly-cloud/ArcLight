/**
 * 章节正文（HTML）→ 纯文本（纯函数）。
 *
 * 供资产提取使用：把 `plainNovelTextToHtml` 落库的章节 HTML 逆向还原为可读纯文本，
 * 剥离标签、保留换行（`br` 视为换行、块级闭合视为段落空行），并解码常见 HTML 实体。
 * 本模块只操作字符串，不接 IPC / 不依赖 store，便于单测。
 */

/** `br` 视为软换行 */
const BR_TAG_RE = /<br\s*\/?>/gi
/** 块级标签闭合视为段落分隔（空行） */
const BLOCK_TAG_RE = /<\/?(?:p|div|h[1-6]|li|ul|ol|blockquote|section|article|tr|table)\b[^>]*>/gi
/** 其余任意标签直接剥离 */
const ANY_TAG_RE = /<\/?[^>]+>/g

/** 解码常见 HTML 实体（`&amp;` 最后处理，避免二次解码）。 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&')
}

/** 规整换行、去首尾空白，保留段落空行。 */
function normalizePlainText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 章节正文 HTML → 纯文本。空值/无正文返回空串（旧项目兼容，不报错）。
 */
export function chapterContentToPlainText(html: unknown): string {
  const source = String(html ?? '')
  if (!source.trim()) return ''
  if (!/[<&]/.test(source)) return normalizePlainText(source)

  const withBreaks = source
    .replace(BR_TAG_RE, '\n')
    .replace(BLOCK_TAG_RE, (tag) => (tag.startsWith('</') ? '\n\n' : ''))
  const stripped = withBreaks.replace(ANY_TAG_RE, '')
  return normalizePlainText(decodeHtmlEntities(stripped))
}
