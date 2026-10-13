import { diffChars } from 'diff'

type RevisionSegment = { text: string; changed: boolean }
type RevisionParagraph = { segments: RevisionSegment[] }

function normalizeParagraphs(text: string): string {
  return text.replace(/\r\n/g, '\n').split(/\n+/).map((line) => line.trim()).filter(Boolean).join('\n')
}

export function compareChapterRevision(beforeText: string, afterText: string): {
  before: RevisionParagraph[]
  after: RevisionParagraph[]
} {
  const before: RevisionParagraph[] = [{ segments: [] }]
  const after: RevisionParagraph[] = [{ segments: [] }]
  const append = (paragraphs: RevisionParagraph[], text: string, changed: boolean): void => {
    text.split('\n').forEach((line, index) => {
      if (index > 0) paragraphs.push({ segments: [] })
      if (line) paragraphs[paragraphs.length - 1].segments.push({ text: line, changed })
    })
  }
  for (const change of diffChars(normalizeParagraphs(beforeText), normalizeParagraphs(afterText))) {
    if (!change.added) append(before, change.value, change.removed)
    if (!change.removed) append(after, change.value, change.added)
  }
  return {
    before: before.filter((paragraph) => paragraph.segments.length > 0),
    after: after.filter((paragraph) => paragraph.segments.length > 0)
  }
}
