import type { KnowledgeDocument, KnowledgeDocumentSourceType } from '@/types/app'

export type KnowledgeSourceScope = 'project' | 'reference'
export type KnowledgeSourceFilter = 'all' | KnowledgeSourceScope | KnowledgeDocumentSourceType

export interface KnowledgeDocumentView {
  document: KnowledgeDocument
  sourceScope: KnowledgeSourceScope
  sourceScopeLabel: string
  sourceTypeLabel: string
  sourceLabelText: string
  preview: string
  updatedAtLabel: string
  duplicateGroupId?: string
  conflictGroupId?: string
}

export interface KnowledgeDuplicateGroup {
  id: string
  title: string
  sourceTypeLabel: string
  sourceScopeLabel: string
  keepDocumentId: string
  removeDocumentIds: string[]
  documents: KnowledgeDocumentView[]
}

export interface KnowledgeConflictGroup {
  id: string
  title: string
  reason: string
  documents: KnowledgeDocumentView[]
}

export interface KnowledgeCenterStats {
  totalDocuments: number
  projectDocuments: number
  referenceDocuments: number
  duplicateGroups: number
  duplicateDocuments: number
  conflictGroups: number
  conflictDocuments: number
}

export interface KnowledgeCenterState {
  documents: KnowledgeDocumentView[]
  duplicateGroups: KnowledgeDuplicateGroup[]
  conflictGroups: KnowledgeConflictGroup[]
  stats: KnowledgeCenterStats
}

const PROJECT_SOURCE_TYPES = new Set<KnowledgeDocumentSourceType>([
  'workflow-document',
  'canon-fact',
  'chapter-summary'
])

const KNOWLEDGE_SOURCE_TYPE_LABELS: Record<KnowledgeDocumentSourceType, string> = {
  'reference-summary': '拆书总纲',
  'reference-chunk': '拆书分块',
  'workflow-document': '创作记忆',
  'canon-fact': '设定事实',
  'chapter-summary': '章节摘要'
}

function normalizeKnowledgeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s`~!@#$%^&*()_\-+=\[\]{}\\|;:'",.<>/?，。！？；：、（）【】《》“”‘’]+/g, '')
    .trim()
}

function buildKnowledgePreview(document: KnowledgeDocument): string {
  const baseText = String(document.summary || document.content || '').replace(/\s+/g, ' ').trim()
  if (baseText.length <= 180) {
    return baseText
  }

  return `${baseText.slice(0, 180).trimEnd()}...`
}

function resolveKnowledgeTimestamp(value?: string): number {
  const timestamp = value ? new Date(value).getTime() : Number.NaN
  return Number.isFinite(timestamp) ? timestamp : 0
}

function compareKnowledgeDocuments(a: KnowledgeDocument, b: KnowledgeDocument): number {
  const updatedDiff = resolveKnowledgeTimestamp(b.updatedAt) - resolveKnowledgeTimestamp(a.updatedAt)
  if (updatedDiff !== 0) {
    return updatedDiff
  }

  const createdDiff = resolveKnowledgeTimestamp(b.createdAt) - resolveKnowledgeTimestamp(a.createdAt)
  if (createdDiff !== 0) {
    return createdDiff
  }

  return b.id.localeCompare(a.id)
}

function buildKnowledgeDuplicateKey(document: KnowledgeDocument): string {
  const titleKey = normalizeKnowledgeText(document.title || document.sourceLabel || '')
  const bodyKey = normalizeKnowledgeText(document.summary || document.content).slice(0, 320)
  const keywordsKey = document.keywords
    .map((keyword) => normalizeKnowledgeText(String(keyword)))
    .filter(Boolean)
    .sort()
    .join('|')

  return [titleKey, document.sourceType, bodyKey, keywordsKey].join('::')
}

function buildKnowledgeConflictKey(document: KnowledgeDocument): string {
  const metadataTitle = String(document.metadata?.sourceTitle ?? '').trim()
  const titleSeed = document.title || metadataTitle || document.sourceLabel || ''
  return normalizeKnowledgeText(titleSeed)
}

function buildKnowledgeConflictBodyKey(document: KnowledgeDocument): string {
  const summaryKey = normalizeKnowledgeText(document.summary)
  const contentKey = normalizeKnowledgeText(document.content).slice(0, 320)
  return summaryKey || contentKey
}

export function isProjectKnowledgeSource(sourceType: KnowledgeDocumentSourceType): boolean {
  return PROJECT_SOURCE_TYPES.has(sourceType)
}

/** 项目知识仅在调用方明确提供兜底项目时补齐归属；历史空归属保持隔离。 */
export function normalizeKnowledgeDocumentScope(
  document: KnowledgeDocument,
  fallbackProjectId = ''
): KnowledgeDocument {
  return {
    ...document,
    projectId: isProjectKnowledgeSource(document.sourceType)
      ? String(document.projectId ?? '').trim() || fallbackProjectId.trim()
      : ''
  }
}

/** 当前项目只能看到自己的项目知识，但仍可使用全局参考资料。 */
export function filterKnowledgeDocumentsForProject(
  documents: KnowledgeDocument[],
  projectId: string
): KnowledgeDocument[] {
  const normalizedProjectId = projectId.trim()
  return documents.filter((document) => (
    !isProjectKnowledgeSource(document.sourceType)
    || (Boolean(normalizedProjectId) && String(document.projectId ?? '').trim() === normalizedProjectId)
  ))
}

function getKnowledgeDocumentSourceKey(document: KnowledgeDocument): string | null {
  const sourceTitle = String(document.metadata?.sourceTitle ?? '').trim()
  const fileName = String(document.metadata?.fileName ?? '').trim()
  if (!sourceTitle) {
    return null
  }

  const scopeKey = isProjectKnowledgeSource(document.sourceType)
    ? `project:${String(document.projectId ?? '').trim()}`
    : 'reference'
  return `${scopeKey}::${sourceTitle}${fileName ? `::${fileName}` : ''}`
}

/** 同一来源的重建只替换同一作用域内的旧文档，不影响其他项目。 */
export function replaceKnowledgeDocumentsBySource(
  existingDocuments: KnowledgeDocument[],
  incomingDocuments: KnowledgeDocument[]
): KnowledgeDocument[] {
  const incomingSourceKeys = new Set(
    incomingDocuments
      .map((document) => getKnowledgeDocumentSourceKey(document))
      .filter((key): key is string => Boolean(key))
  )
  if (!incomingSourceKeys.size) {
    return [...existingDocuments, ...incomingDocuments]
  }

  return [
    ...existingDocuments.filter((document) => {
      const sourceKey = getKnowledgeDocumentSourceKey(document)
      return !sourceKey || !incomingSourceKeys.has(sourceKey)
    }),
    ...incomingDocuments
  ]
}

export function resolveKnowledgeSourceScope(sourceType: KnowledgeDocumentSourceType): KnowledgeSourceScope {
  return isProjectKnowledgeSource(sourceType) ? 'project' : 'reference'
}

export function resolveKnowledgeSourceScopeLabel(sourceType: KnowledgeDocumentSourceType): string {
  return resolveKnowledgeSourceScope(sourceType) === 'project' ? '项目记忆' : '参考资料'
}

export function resolveKnowledgeSourceTypeLabel(sourceType: KnowledgeDocumentSourceType): string {
  return KNOWLEDGE_SOURCE_TYPE_LABELS[sourceType] ?? sourceType
}

export function formatKnowledgeDateTime(value?: string): string {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) {
    return value?.trim() || '未知时间'
  }

  return date.toLocaleString('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function filterKnowledgeDocumentViews(
  documents: KnowledgeDocumentView[],
  query: string,
  sourceFilter: KnowledgeSourceFilter
): KnowledgeDocumentView[] {
  const normalizedQuery = query.trim().toLowerCase()

  return documents.filter((item) => {
    if (sourceFilter !== 'all') {
      const matchesScope = sourceFilter === item.sourceScope
      const matchesType = sourceFilter === item.document.sourceType
      if (!matchesScope && !matchesType) {
        return false
      }
    }

    if (!normalizedQuery) {
      return true
    }

    const haystack = [
      item.document.title,
      item.document.summary,
      item.document.content,
      item.document.sourceLabel,
      item.document.keywords.join(' '),
      item.sourceTypeLabel,
      item.sourceScopeLabel
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(normalizedQuery)
  })
}

export function buildKnowledgeCenterState(documents: KnowledgeDocument[]): KnowledgeCenterState {
  const sortedDocuments = [...documents].sort(compareKnowledgeDocuments)
  const documentViews = sortedDocuments.map<KnowledgeDocumentView>((document) => ({
    document,
    sourceScope: resolveKnowledgeSourceScope(document.sourceType),
    sourceScopeLabel: resolveKnowledgeSourceScopeLabel(document.sourceType),
    sourceTypeLabel: resolveKnowledgeSourceTypeLabel(document.sourceType),
    sourceLabelText: document.sourceLabel.trim() || String(document.metadata?.sourceTitle ?? '').trim() || '未标注来源',
    preview: buildKnowledgePreview(document),
    updatedAtLabel: formatKnowledgeDateTime(document.updatedAt)
  }))

  const duplicateGroupMap = new Map<string, KnowledgeDocumentView[]>()
  documentViews.forEach((view) => {
    const duplicateKey = buildKnowledgeDuplicateKey(view.document)
    if (!duplicateKey.replace(/:/g, '').trim()) {
      return
    }

    const group = duplicateGroupMap.get(duplicateKey) ?? []
    group.push(view)
    duplicateGroupMap.set(duplicateKey, group)
  })

  const duplicateGroups = Array.from(duplicateGroupMap.values())
    .filter((group) => group.length > 1)
    .map<KnowledgeDuplicateGroup>((group, index) => {
      const sortedGroup = [...group].sort((a, b) => compareKnowledgeDocuments(a.document, b.document))
      return {
        id: `duplicate-${index + 1}`,
        title: sortedGroup[0]?.document.title || '未命名知识',
        sourceTypeLabel: sortedGroup[0]?.sourceTypeLabel || '未知来源',
        sourceScopeLabel: sortedGroup[0]?.sourceScopeLabel || '知识文档',
        keepDocumentId: sortedGroup[0]?.document.id || '',
        removeDocumentIds: sortedGroup.slice(1).map((item) => item.document.id),
        documents: sortedGroup
      }
    })
    .sort((a, b) => b.removeDocumentIds.length - a.removeDocumentIds.length)

  const duplicateGroupIdByDocument = new Map<string, string>()
  duplicateGroups.forEach((group) => {
    group.documents.forEach((item) => {
      duplicateGroupIdByDocument.set(item.document.id, group.id)
    })
  })

  const conflictGroupMap = new Map<string, KnowledgeDocumentView[]>()
  documentViews
    .filter((view) => view.sourceScope === 'project')
    .forEach((view) => {
      const conflictKey = buildKnowledgeConflictKey(view.document)
      if (!conflictKey.replace(/:/g, '').trim()) {
        return
      }

      const group = conflictGroupMap.get(conflictKey) ?? []
      group.push(view)
      conflictGroupMap.set(conflictKey, group)
    })

  const conflictGroups = Array.from(conflictGroupMap.values())
    .filter((group) => {
      if (group.length <= 1) {
        return false
      }

      return new Set(group.map((item) => buildKnowledgeConflictBodyKey(item.document))).size > 1
    })
    .map<KnowledgeConflictGroup>((group, index) => {
      const sortedGroup = [...group].sort((a, b) => compareKnowledgeDocuments(a.document, b.document))
      const versionCount = new Set(sortedGroup.map((item) => buildKnowledgeConflictBodyKey(item.document))).size
      return {
        id: `conflict-${index + 1}`,
        title: sortedGroup[0]?.document.title || '未命名知识',
        reason: `同名项目知识出现 ${versionCount} 个不同版本，建议核对最新结论与旧记录是否存在冲突。`,
        documents: sortedGroup
      }
    })
    .sort((a, b) => b.documents.length - a.documents.length)

  const conflictGroupIdByDocument = new Map<string, string>()
  conflictGroups.forEach((group) => {
    group.documents.forEach((item) => {
      conflictGroupIdByDocument.set(item.document.id, group.id)
    })
  })

  const decoratedDocuments = documentViews.map((view) => ({
    ...view,
    duplicateGroupId: duplicateGroupIdByDocument.get(view.document.id),
    conflictGroupId: conflictGroupIdByDocument.get(view.document.id)
  }))

  return {
    documents: decoratedDocuments,
    duplicateGroups: duplicateGroups.map((group) => ({
      ...group,
      documents: group.documents.map((item) => ({
        ...item,
        duplicateGroupId: group.id,
        conflictGroupId: conflictGroupIdByDocument.get(item.document.id)
      }))
    })),
    conflictGroups: conflictGroups.map((group) => ({
      ...group,
      documents: group.documents.map((item) => ({
        ...item,
        duplicateGroupId: duplicateGroupIdByDocument.get(item.document.id),
        conflictGroupId: group.id
      }))
    })),
    stats: {
      totalDocuments: decoratedDocuments.length,
      projectDocuments: decoratedDocuments.filter((item) => item.sourceScope === 'project').length,
      referenceDocuments: decoratedDocuments.filter((item) => item.sourceScope === 'reference').length,
      duplicateGroups: duplicateGroups.length,
      duplicateDocuments: duplicateGroups.reduce((count, group) => count + group.removeDocumentIds.length, 0),
      conflictGroups: conflictGroups.length,
      conflictDocuments: conflictGroups.reduce((count, group) => count + group.documents.length, 0)
    }
  }
}
