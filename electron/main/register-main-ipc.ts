import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron'
import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import type { WorkSheet } from 'xlsx'
import {
  IPC_CHANNELS,
  type ChapterMutationEvent,
  type DatabaseBackupSummary,
  type SaveChapterOrderRequest,
  type SaveChaptersRequest,
  type SaveWorkspaceEntitiesRequest
} from '@shared/ipc-types'

import type { AiTaskPayload } from './ai/shared-types'
import { runAiTask } from './ai/runtime'
import { listAiPromptCatalog } from './ai/prompts/catalog'
import { renderPromptPreview } from './ai/prompts/preview'
import { refreshRegistry as refreshSkillRegistry, toScanEntries as skillScanEntries, toContextEntries as skillContextEntries } from './ai/skills'
import { getProjectSkillsDirPath as getSkillsDirPath } from './ai/skills/discovery'
import { fetchWithCache } from './github-mirror'
import { fetchFanqieTrends } from './fanqie-trends'
import { fetchQidianRank } from './qidian-rank'
import { fetchQimaoTrends } from './qimao-trends'
import { fetchZonghengTrends } from './zongheng-trends'
import { getWorkspaceDirPath, WORKSPACE_SCHEMA_VERSION } from './workspace-store'
import {
  createWorkspaceManualBackup,
  deleteWorkspaceDatabaseBackup,
  listWorkspaceDatabaseBackups,
  rollbackWorkspaceDatabase,
  writeWorkspaceSchemaMarker
} from './workspace-upgrade-backup'
import { inspectContinuationNovelFile } from './continuation-import'
import {
  exportProjectArchive,
  getProjectArchiveDefaultName,
  importProjectArchiveInWorker,
  inspectProjectArchive,
  type ProjectArchiveImportProgressPayload,
  type ProjectArchiveImportMode,
  type ProjectArchiveModule
} from './archive/project-archive'
import type { WorkspacePayload } from './workspace-types'
import type { WindowManager } from './window-manager'
import {
  copyAssetImageTo,
  deleteAssetImage,
  listAssetImages,
  listProjectPrimaryImages,
  pruneAssetImagesForAsset,
  pruneAssetImagesForProject,
  readAssetImageDataUrl,
  setPrimaryAssetImage
} from './asset-images'
import type { AssetImageKind } from '@shared/ipc-types'

let xlsxModulePromise: Promise<typeof import('xlsx')> | null = null

/** 参考图本地选择时的体积上限（字节），避免超大图片随请求发送 */
const REFERENCE_IMAGE_MAX_BYTES = 8 * 1024 * 1024

const OUTLINE_SPREADSHEET_HEADERS = ['分卷名称', '分卷目标字数', '分卷摘要', '章节序号', '章节标题', '目标字数', '核心冲突', '剧情摘要', '状态']

function loadXlsx(): Promise<typeof import('xlsx')> {
  xlsxModulePromise ??= import('xlsx')
  return xlsxModulePromise
}

function normalizeOutlineHeader(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, '').trim()
}

function scoreOutlineSheet(rows: string[][]): number {
  if (rows.length === 0) return 0
  const headers = rows[0].map(normalizeOutlineHeader)
  const headerScore = OUTLINE_SPREADSHEET_HEADERS.reduce((score, header) => score + (headers.includes(header) ? 10 : 0), 0)
  const dataScore = Math.min(rows.slice(1).filter((row) => row.some(Boolean)).length, 20)
  return headerScore + dataScore
}

function readOutlineSheetRows(XLSX: typeof import('xlsx'), sheet: WorkSheet): string[][] {
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false
  })
  return rawRows
    .slice(0, 5001)
    .map((row) => row.map((cell) => String(cell ?? '').trim()))
    .filter((row) => row.some(Boolean))
}

function formatOutlineStatusLabel(status: unknown): string {
  switch (String(status ?? '').trim()) {
    case 'idea':
      return '点子'
    case 'drafting':
      return '写作中'
    case 'done':
      return '已完成'
    case 'planned':
    default:
      return '已规划'
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

type RegisterMainIpcHandlersDeps = {
  windowManager: WindowManager
  setLatestWorkspaceSnapshot: (payload: unknown) => void
  setLatestAppSettings: (
    settings: unknown,
    metadata: { theme: string; selectedProjectId: string }
  ) => void
  normalizeWorkspacePayload: (payload: unknown) => unknown
  ensureWorkspaceDb: () => Promise<DatabaseSync>
  getWorkspaceDbIfInitialized: () => DatabaseSync | null
  closeWorkspaceDbForRollback: () => void
  readWorkspaceSnapshot: (db: DatabaseSync) => unknown
  readWorkspaceSnapshotForRenderer: (db: DatabaseSync) => unknown
  writeWorkspaceSnapshot: (db: DatabaseSync, payload: unknown) => void
  writeChapterRows: (db: DatabaseSync, payload: SaveChaptersRequest) => void
  writeChapterOrder: (db: DatabaseSync, payload: SaveChapterOrderRequest) => void
  writeWorkspaceEntities: (db: DatabaseSync, payload: SaveWorkspaceEntitiesRequest) => void
  applyChapterMutation: (payload: ChapterMutationEvent) => void
  writeAppSettingsRow: (
    db: DatabaseSync,
    settings: unknown,
    metadata: { theme: string; selectedProjectId: string }
  ) => void
  validateImportedPayload: (payload: unknown) => { valid: true; payload: unknown; meta: unknown } | { valid: false; message: string }
  resolveImageMime: (filePath: string) => string
}

type ExportRequest = {
  data: unknown
  title?: string
  defaultPath?: string
}

type ProjectArchiveImportRequest = {
  filePath?: string
  mode?: ProjectArchiveImportMode
  targetProjectId?: string
  modules?: ProjectArchiveModule[]
}

export function registerMainIpcHandlers(deps: RegisterMainIpcHandlersDeps): void {
  ipcMain.handle(IPC_CHANNELS.BACKUP_CURRENT_DATABASE, async () => {
    try {
      const database = await deps.ensureWorkspaceDb()
      const result = await createWorkspaceManualBackup({
        workspaceDir: getWorkspaceDirPath(),
        appVersion: app.getVersion(),
        schemaVersion: WORKSPACE_SCHEMA_VERSION,
        database
      })
      return { success: true, backupPath: result.backupDir }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '备份当前数据库失败'
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.LIST_DATABASE_BACKUPS, async () => {
    try {
      const workspaceDir = getWorkspaceDirPath()
      const backups: DatabaseBackupSummary[] = await listWorkspaceDatabaseBackups(workspaceDir)
      return { success: true, backups, backupDirectory: join(workspaceDir, 'backups') }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '读取数据库备份失败'
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.DELETE_DATABASE_BACKUP, async (_event, payload: unknown) => {
    const backupId = payload && typeof payload === 'object'
      ? String((payload as { backupId?: unknown }).backupId ?? '').trim()
      : ''
    if (!backupId) return { success: false, error: '请选择要删除的数据库备份' }

    try {
      await deleteWorkspaceDatabaseBackup(getWorkspaceDirPath(), backupId)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '删除数据库备份失败'
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.ROLLBACK_DATABASE, async (_event, payload: unknown) => {
    const backupId = payload && typeof payload === 'object'
      ? String((payload as { backupId?: unknown }).backupId ?? '').trim()
      : ''
    if (!backupId) {
      return { success: false, error: '请选择需要回滚的数据库备份' }
    }

    const availableBackups = await listWorkspaceDatabaseBackups(getWorkspaceDirPath())
    if (!availableBackups.some((backup) => backup.id === backupId)) {
      return { success: false, error: '选择的数据库备份不存在或已损坏' }
    }

    try {
      deps.closeWorkspaceDbForRollback()
      const result = await rollbackWorkspaceDatabase({
        workspaceDir: getWorkspaceDirPath(),
        backupId,
        appVersion: app.getVersion(),
        currentSchemaVersion: WORKSPACE_SCHEMA_VERSION
      })
      const database = await deps.ensureWorkspaceDb()
      await writeWorkspaceSchemaMarker(getWorkspaceDirPath(), {
        schemaVersion: WORKSPACE_SCHEMA_VERSION,
        appVersion: app.getVersion(),
        upgradedAt: new Date().toISOString()
      })
      const workspace = deps.readWorkspaceSnapshotForRenderer(database)
      if (workspace) deps.setLatestWorkspaceSnapshot(workspace)
      return { success: true, safetyBackupPath: result.safetyBackupDir }
    } catch (error) {
      await deps.ensureWorkspaceDb().catch(() => {})
      return {
        success: false,
        error: error instanceof Error ? error.message : '数据库回滚失败'
      }
    }
  })

  ipcMain.handle('clytie:export-json', async (_event, payload: unknown) => {
    const window = deps.windowManager.getActiveWindow()
    if (!window) {
      return { success: false, canceled: true }
    }

    const request = (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)
      ? payload
      : {
          data: payload
        }) as ExportRequest

    const result = await dialog.showSaveDialog(window, {
      title: request.title ?? '导出项目数据',
      defaultPath: request.defaultPath ?? 'clytie-export.json',
      filters: [{ name: 'JSON 文件', extensions: ['json'] }]
    })

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true }
    }

    await writeFile(result.filePath, JSON.stringify(request.data, null, 2), 'utf-8')
    return {
      success: true,
      canceled: false,
      filePath: result.filePath
    }
  })

  ipcMain.handle('clytie:export-project-archive', async (_event, payload: unknown) => {
    const window = deps.windowManager.getActiveWindow()
    if (!window) {
      return { success: false, canceled: true }
    }

    const request = (payload ?? {}) as { projectId?: string; projectTitle?: string }
    const projectId = String(request.projectId ?? '').trim()
    if (!projectId) {
      return { success: false, canceled: false, error: '缺少要导出的项目 ID。' }
    }

    const result = await dialog.showSaveDialog(window, {
      title: '导出项目归档包',
      defaultPath: getProjectArchiveDefaultName(String(request.projectTitle ?? 'Clytie 项目')),
      filters: [{ name: 'Clytie 项目归档', extensions: ['carc'] }]
    })

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true }
    }

    try {
      const db = await deps.ensureWorkspaceDb()
      await exportProjectArchive({
        db,
        filePath: result.filePath,
        projectId,
        readWorkspaceSnapshot: deps.readWorkspaceSnapshot as (db: DatabaseSync) => WorkspacePayload | null
      })
      return { success: true, canceled: false, filePath: result.filePath }
    } catch (error) {
      return {
        success: false,
        canceled: false,
        error: error instanceof Error ? error.message : '导出项目归档失败'
      }
    }
  })

  ipcMain.handle('clytie:inspect-project-archive', async () => {
    const window = deps.windowManager.getActiveWindow()
    if (!window) {
      return { success: false, canceled: true }
    }

    const result = await dialog.showOpenDialog(window, {
      title: '选择项目归档包',
      properties: ['openFile'],
      filters: [{ name: 'Clytie 项目归档', extensions: ['carc'] }]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true }
    }

    try {
      const preview = await inspectProjectArchive(result.filePaths[0])
      return { success: true, canceled: false, filePath: result.filePaths[0], preview }
    } catch (error) {
      return {
        success: false,
        canceled: false,
        error: error instanceof Error ? error.message : '无法读取项目归档包'
      }
    }
  })

  ipcMain.handle('clytie:import-project-archive', async (_event, payload: unknown) => {
    const request = (payload ?? {}) as ProjectArchiveImportRequest
    const filePath = String(request.filePath ?? '').trim()
    const sendProgress = (progress: ProjectArchiveImportProgressPayload): void => {
      _event.sender.send('clytie:project-archive-import-progress', progress)
    }
    if (!filePath) {
      return { success: false, canceled: false, error: '缺少要导入的项目归档文件。' }
    }

    try {
      sendProgress({ phase: 'preparing', message: '正在准备导入任务...', percent: 2 })
      await deps.ensureWorkspaceDb()
      const result = await importProjectArchiveInWorker({
        filePath,
        mode: request.mode ?? 'new-project',
        targetProjectId: request.targetProjectId,
        modules: request.modules,
        onProgress: sendProgress
      })
      sendProgress({ phase: 'syncing', message: '正在刷新工作区数据...', percent: 96 })
      const db = await deps.ensureWorkspaceDb()
      const workspace = deps.readWorkspaceSnapshotForRenderer(db)
      if (workspace) {
        deps.setLatestWorkspaceSnapshot(workspace)
        deps.windowManager.broadcastWindowEvent('clytie:workspace-sync-event', workspace)
      }
      sendProgress({ phase: 'done', message: '导入完成', percent: 100 })
      return { success: true, canceled: false, selectedProjectId: result.selectedProjectId }
    } catch (error) {
      sendProgress({
        phase: 'error',
        message: error instanceof Error ? error.message : '导入项目归档失败',
        percent: 100
      })
      return {
        success: false,
        canceled: false,
        error: error instanceof Error ? error.message : '导入项目归档失败'
      }
    }
  })

  ipcMain.handle('clytie:export-text', async (_event, payload: unknown) => {
    const window = deps.windowManager.getActiveWindow()
    if (!window) {
      return { success: false, canceled: true }
    }

    const request = (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)
      ? payload
      : {
          data: payload
        }) as ExportRequest

    const result = await dialog.showSaveDialog(window, {
      title: request.title ?? '导出章节文本',
      defaultPath: request.defaultPath ?? 'clytie-export.txt',
      filters: [{ name: '文本文档', extensions: ['txt'] }]
    })

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true }
    }

    const data = request.data as {
      project?: { title?: string } | null
      outlineVolumes?: Array<{ id?: string; title?: string }>
      chapters?: Array<{ volumeId?: string; title?: string; content?: string }>
    }
    const volumeTitleMap = new Map((data.outlineVolumes ?? []).map((volume) => [volume.id ?? '', volume.title?.trim() || '未命名分卷']))
    let activeVolumeId = ''

    const text = [
      data.project?.title ? `# ${data.project.title}` : '# Clytie 导出',
      '',
      ...(data.chapters ?? []).flatMap((chapter, index) => {
        const shouldPrintVolume = chapter.volumeId && chapter.volumeId !== activeVolumeId
        if (chapter.volumeId) {
          activeVolumeId = chapter.volumeId
        }

        return [
          ...(shouldPrintVolume ? [`## ${volumeTitleMap.get(chapter.volumeId ?? '') || '未命名分卷'}`, ''] : []),
          `第${index + 1}章 ${chapter.title ?? '未命名章节'}`,
          '',
          chapter.content?.trim() || '（暂无正文内容）',
          '',
          ''.padEnd(48, '-'),
          ''
        ]
      })
    ].join('\n')

    await writeFile(result.filePath, text, 'utf-8')
    return {
      success: true,
      canceled: false,
      filePath: result.filePath
    }
  })

  ipcMain.handle('clytie:export-chapter-txt', async (_event, payload: unknown) => {
    const window = deps.windowManager.getActiveWindow()
    if (!window) {
      return { success: false, canceled: true }
    }

    const request = (payload ?? {}) as {
      title?: string
      content?: string
      defaultFileName?: string
    }

    const result = await dialog.showSaveDialog(window, {
      title: '导出章节为 TXT',
      defaultPath: request.defaultFileName?.trim() || 'chapter.txt',
      filters: [{ name: '文本文档', extensions: ['txt'] }]
    })

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true }
    }

    const text = [request.title?.trim() || '未命名章节', '', request.content ?? ''].join('\n')
    await writeFile(result.filePath, text, 'utf-8')
    return { success: true, canceled: false, filePath: result.filePath }
  })

  ipcMain.handle('clytie:export-chapter-docx', async (_event, payload: unknown) => {
    const window = deps.windowManager.getActiveWindow()
    if (!window) {
      return { success: false, canceled: true }
    }

    const request = (payload ?? {}) as {
      title?: string
      content?: string
      defaultFileName?: string
    }

    const result = await dialog.showSaveDialog(window, {
      title: '导出章节为 DOCX',
      defaultPath: request.defaultFileName?.trim() || 'chapter.docx',
      filters: [{ name: 'Word 文档', extensions: ['docx'] }]
    })

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true }
    }

    const { Document, HeadingLevel, Packer, Paragraph, TextRun } = await import('docx')
    const titleText = request.title?.trim() || '未命名章节'
    const paragraphs = (request.content ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())

    const docParagraphs = [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: titleText, bold: true, size: 36 })]
      }),
      ...paragraphs.map((line) =>
        new Paragraph({
          spacing: { line: 360 },
          children: [new TextRun({ text: line, size: 24 })]
        })
      )
    ]

    const doc = new Document({
      creator: 'Clytie',
      title: titleText,
      sections: [{ children: docParagraphs }]
    })

    const buffer = await Packer.toBuffer(doc)
    await writeFile(result.filePath, buffer)
    return { success: true, canceled: false, filePath: result.filePath }
  })

  ipcMain.handle('clytie:import-json', async () => {
    const window = deps.windowManager.getActiveWindow()
    if (!window) {
      return { success: false, canceled: true }
    }

    const result = await dialog.showOpenDialog(window, {
      title: '导入项目 JSON',
      properties: ['openFile'],
      filters: [{ name: 'JSON 文件', extensions: ['json'] }]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true }
    }

    const raw = await readFile(result.filePaths[0], 'utf-8')
    let parsed: unknown

    try {
      parsed = JSON.parse(raw)
    } catch {
      return {
        success: false,
        canceled: false,
        error: '文件不是有效的 JSON 格式。'
      }
    }

    const validation = deps.validateImportedPayload(parsed)
    if (!validation.valid) {
      return {
        success: false,
        canceled: false,
        error: validation.message
      }
    }

    return {
      success: true,
      canceled: false,
      payload: validation.payload,
      meta: validation.meta
    }
  })

  ipcMain.handle('clytie:import-outline-spreadsheet', async () => {
    const window = deps.windowManager.getActiveWindow()
    if (!window) return { success: false, canceled: true }

    const result = await dialog.showOpenDialog(window, {
      title: '导入剧情大纲',
      properties: ['openFile'],
      filters: [{ name: 'Excel 或 CSV', extensions: ['xlsx', 'xls', 'csv'] }]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true }
    }

    try {
      const filePath = result.filePaths[0]
      const XLSX = await loadXlsx()
      const workbook = XLSX.read(await readFile(filePath), { type: 'buffer' })
      const candidates = workbook.SheetNames
        .map((name) => {
          const rows = workbook.Sheets[name] ? readOutlineSheetRows(XLSX, workbook.Sheets[name]) : []
          return {
            sheetName: name,
            rows,
            score: scoreOutlineSheet(rows)
          }
        })
        .sort((left, right) => right.score - left.score)
      const selectedSheet = candidates[0]
      if (!selectedSheet) throw new Error('文件中没有可读取的工作表。')
      const { sheetName, rows } = selectedSheet
      if (rows.length < 2) throw new Error(`工作表「${sheetName}」没有可导入的数据行。`)
      return { success: true, canceled: false, fileName: basename(filePath), sheetName, rows }
    } catch (error) {
      return {
        success: false,
        canceled: false,
        error: error instanceof Error ? error.message : '无法读取大纲文件。'
      }
    }
  })

  ipcMain.handle('clytie:export-outline-template', async () => {
    const window = deps.windowManager.getActiveWindow()
    if (!window) return { success: false, canceled: true }
    const result = await dialog.showSaveDialog(window, {
      title: '下载大纲 Excel 模板',
      defaultPath: 'Clytie-大纲导入模板.xlsx',
      filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
    })
    if (result.canceled || !result.filePath) return { success: false, canceled: true }

    const XLSX = await loadXlsx()
    const headers = OUTLINE_SPREADSHEET_HEADERS
    const workbook = XLSX.utils.book_new()
    const templateSheet = XLSX.utils.aoa_to_sheet([headers, ['', '', '', '', '', '', '', '', '']])
    const exampleSheet = XLSX.utils.aoa_to_sheet([
      headers,
      ['第一卷：暗潮', '50000', '主角发现城中粮道失控的真正原因。', '1', '第1章：雨夜来客', '3200', '陌生人的求助可能是一场试探。', '主角在雨夜接下密信，并第一次接触南驿账簿。', '已规划'],
      ['', '', '', '2', '第2章：失踪账簿', '3500', '调查越深入，身边人的立场越可疑。', '账簿失踪，主角必须在官差封锁前找到经手人。', '点子']
    ])
    const descriptionSheet = XLSX.utils.aoa_to_sheet([
      ['字段', '是否必填', '说明'],
      ['分卷名称', '否', '每个分卷第一行填写即可，后续空白行自动沿用上一行分卷。不存在的分卷会在确认导入时新建。'],
      ['分卷目标字数', '否', '仅需在分卷第一行填写。'],
      ['分卷摘要', '否', '仅需在分卷第一行填写。'],
      ['章节序号', '否', '同一插入位置下的顺序，数字越小越靠前。'],
      ['章节标题', '是', '大纲节点标题。'],
      ['目标字数', '否', '章节预计字数。'],
      ['核心冲突', '否', '本章最主要的矛盾或阻力。'],
      ['剧情摘要', '否', '本章剧情推进内容。'],
      ['状态', '否', '可填：点子、已规划、写作中、已完成；不填默认已规划。']
    ])
    templateSheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, header.length + 4) }))
    exampleSheet['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 36 }, { wch: 12 }, { wch: 28 }, { wch: 12 }, { wch: 36 }, { wch: 52 }, { wch: 12 }]
    descriptionSheet['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 72 }]
    templateSheet['!autofilter'] = { ref: 'A1:I1' }
    exampleSheet['!autofilter'] = { ref: 'A1:I1' }
    XLSX.utils.book_append_sheet(workbook, templateSheet, '大纲模板')
    XLSX.utils.book_append_sheet(workbook, exampleSheet, '填写示例')
    XLSX.utils.book_append_sheet(workbook, descriptionSheet, '字段说明')
    await writeFile(result.filePath, XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
    return { success: true, canceled: false, filePath: result.filePath }
  })

  ipcMain.handle('clytie:export-outline-spreadsheet', async (_event, payload: unknown) => {
    const window = deps.windowManager.getActiveWindow()
    if (!window) return { success: false, canceled: true }
    const request = (payload ?? {}) as {
      projectTitle?: string
      volumes?: Array<{ id?: string; title?: string; wordTarget?: string; summary?: string }>
      items?: Array<{ volumeId?: string; title?: string; wordTarget?: string; conflict?: string; summary?: string; status?: string; sortOrder?: number }>
    }
    const safeProjectTitle = String(request.projectTitle ?? '织星').replace(/[\\/:*?"<>|]/g, '-').trim() || '织星'
    const result = await dialog.showSaveDialog(window, {
      title: '导出剧情大纲 Excel',
      defaultPath: `${safeProjectTitle}-剧情大纲.xlsx`,
      filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
    })
    if (result.canceled || !result.filePath) return { success: false, canceled: true }

    const XLSX = await loadXlsx()
    const volumes = request.volumes ?? []
    const volumeMap = new Map(volumes.map((volume) => [volume.id ?? '', volume]))
    const volumeOrderMap = new Map(volumes.map((volume, index) => [volume.id ?? '', index]))
    const volumeSequence = new Map<string, number>()
    let previousVolumeId = ''
    const rows = [...(request.items ?? [])]
      .sort((left, right) => {
        const leftVolumeOrder = volumeOrderMap.get(left.volumeId ?? '') ?? Number.MAX_SAFE_INTEGER
        const rightVolumeOrder = volumeOrderMap.get(right.volumeId ?? '') ?? Number.MAX_SAFE_INTEGER
        return leftVolumeOrder - rightVolumeOrder || (left.sortOrder ?? 0) - (right.sortOrder ?? 0)
      })
      .map((item) => {
      const volumeId = item.volumeId ?? ''
      const sequence = (volumeSequence.get(volumeId) ?? 0) + 1
      volumeSequence.set(volumeId, sequence)
      const volume = volumeMap.get(volumeId)
      const shouldPrintVolume = volumeId !== previousVolumeId
      previousVolumeId = volumeId
      return {
        分卷名称: shouldPrintVolume ? volume?.title ?? '' : '',
        分卷目标字数: shouldPrintVolume ? volume?.wordTarget ?? '' : '',
        分卷摘要: shouldPrintVolume ? volume?.summary ?? '' : '',
        章节序号: sequence,
        章节标题: item.title ?? '',
        目标字数: item.wordTarget ?? '',
        核心冲突: item.conflict ?? '',
        剧情摘要: item.summary ?? '',
        状态: formatOutlineStatusLabel(item.status)
      }
    })
    const workbook = XLSX.utils.book_new()
    const outlineSheet = XLSX.utils.json_to_sheet(rows, { header: OUTLINE_SPREADSHEET_HEADERS })
    outlineSheet['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 36 }, { wch: 12 }, { wch: 28 }, { wch: 12 }, { wch: 36 }, { wch: 52 }, { wch: 12 }]
    outlineSheet['!autofilter'] = { ref: 'A1:I1' }
    XLSX.utils.book_append_sheet(workbook, outlineSheet, '剧情大纲')
    await writeFile(result.filePath, XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
    return { success: true, canceled: false, filePath: result.filePath }
  })

  ipcMain.handle('clytie:pick-cover-image', async () => {
    const window = deps.windowManager.getActiveWindow()
    if (!window) {
      return { success: false, canceled: true }
    }

    const result = await dialog.showOpenDialog(window, {
      title: '选择项目封面',
      properties: ['openFile'],
      filters: [{ name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true }
    }

    const filePath = result.filePaths[0]
    const bytes = await readFile(filePath)
    const mime = deps.resolveImageMime(filePath)
    return {
      success: true,
      canceled: false,
      filePath,
      dataUrl: `data:${mime};base64,${bytes.toString('base64')}`
    }
  })

  ipcMain.handle('clytie:pick-continuation-novel', async () => {
    const window = deps.windowManager.getActiveWindow()
    if (!window) {
      return { success: false, canceled: true }
    }

    const result = await dialog.showOpenDialog(window, {
      title: '选择需要续写的小说 TXT',
      properties: ['openFile'],
      filters: [{ name: 'TXT 小说', extensions: ['txt'] }]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true }
    }

    try {
      const preview = await inspectContinuationNovelFile(result.filePaths[0])
      return { success: true, canceled: false, preview }
    } catch (error) {
      return {
        success: false,
        canceled: false,
        error: error instanceof Error ? error.message : '读取小说文件失败'
      }
    }
  })

  ipcMain.handle('clytie:save-cover-image', async (_event, payload: unknown) => {
    const window = deps.windowManager.getActiveWindow()
    if (!window) {
      return { success: false, canceled: true }
    }

    const request = payload as { dataUrl?: string; defaultFileName?: string }
    const dataUrl = String(request?.dataUrl ?? '').trim()
    if (!dataUrl) {
      return { success: false, error: '没有可保存的封面图片。' }
    }

    const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/)
    if (!match) {
      return { success: false, error: '封面数据格式无效，无法保存。' }
    }

    const ext = match[1] === 'jpeg' ? 'jpg' : match[1]
    const base64Data = match[2]
    const defaultName = request?.defaultFileName?.trim() || `cover-${Date.now()}.${ext}`

    const result = await dialog.showSaveDialog(window, {
      title: '保存封面图片',
      defaultPath: defaultName,
      filters: [{ name: '图片文件', extensions: [ext, 'png', 'jpg', 'webp'] }]
    })

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true }
    }

    await writeFile(result.filePath, Buffer.from(base64Data, 'base64'))
    return {
      success: true,
      canceled: false,
      filePath: result.filePath
    }
  })

  // ── 资产图库（v1.33.0）──
  ipcMain.handle(IPC_CHANNELS.LIST_ASSET_IMAGES, async (_event, payload: unknown) => {
    try {
      const req = payload as { projectId?: string; kind?: string; assetId?: string }
      const projectId = String(req?.projectId ?? '').trim()
      const kind = String(req?.kind ?? '').trim() as AssetImageKind
      const assetId = String(req?.assetId ?? '').trim()
      if (!projectId || !assetId) throw new Error('缺少 projectId 或 assetId。')
      return { success: true, result: await listAssetImages(projectId, kind, assetId) }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '读取资产图库失败' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.LIST_PRIMARY_ASSET_IMAGES, async (_event, payload: unknown) => {
    try {
      const req = payload as { projectId?: string }
      const projectId = String(req?.projectId ?? '').trim()
      if (!projectId) throw new Error('缺少 projectId。')
      return { success: true, result: await listProjectPrimaryImages(projectId) }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '读取资产首选图失败' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.DELETE_ASSET_IMAGE, async (_event, imageId: unknown) => {
    try {
      const id = String(imageId ?? '').trim()
      if (!id) throw new Error('缺少图像 ID。')
      const removed = await deleteAssetImage(id)
      return { success: removed, error: removed ? undefined : '图库中找不到该图像。' }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '删除资产图像失败' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SET_PRIMARY_IMAGE, async (_event, imageId: unknown) => {
    try {
      const id = String(imageId ?? '').trim()
      if (!id) throw new Error('缺少图像 ID。')
      const ok = await setPrimaryAssetImage(id)
      return { success: ok, error: ok ? undefined : '图库中找不到该图像。' }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '设置首选图失败' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.EXPORT_ASSET_IMAGE, async (_event, payload: unknown) => {
    const window = deps.windowManager.getActiveWindow()
    if (!window) return { success: false, canceled: true }
    const req = payload as { imageId?: string; defaultFileName?: string }
    const imageId = String(req?.imageId ?? '').trim()
    if (!imageId) return { success: false, error: '缺少图像 ID。' }
    const defaultName = req?.defaultFileName?.trim() || `asset-image-${Date.now()}.png`
    const result = await dialog.showSaveDialog(window, {
      title: '导出资产图像',
      defaultPath: defaultName,
      filters: [{ name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    })
    if (result.canceled || !result.filePath) return { success: false, canceled: true }
    try {
      const filePath = await copyAssetImageTo(imageId, result.filePath)
      return { success: true, canceled: false, filePath }
    } catch (error) {
      return { success: false, canceled: false, error: error instanceof Error ? error.message : '导出资产图像失败' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PICK_REFERENCE_IMAGE, async () => {
    const window = deps.windowManager.getActiveWindow()
    if (!window) return { success: false, canceled: true }
    const result = await dialog.showOpenDialog(window, {
      title: '选择参考图',
      properties: ['openFile'],
      filters: [{ name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true }
    try {
      const filePath = result.filePaths[0]
      const buffer = await readFile(filePath)
      if (buffer.byteLength > REFERENCE_IMAGE_MAX_BYTES) {
        return { success: false, canceled: false, error: '参考图体积过大，请选择小于 8MB 的图片。' }
      }
      const mime = deps.resolveImageMime(filePath)
      return {
        success: true,
        canceled: false,
        dataUrl: `data:${mime};base64,${buffer.toString('base64')}`,
        fileName: basename(filePath)
      }
    } catch (error) {
      return { success: false, canceled: false, error: error instanceof Error ? error.message : '读取参考图失败' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.READ_ASSET_IMAGE, async (_event, imageId: unknown) => {
    try {
      const id = String(imageId ?? '').trim()
      if (!id) throw new Error('缺少图像 ID。')
      const dataUrl = await readAssetImageDataUrl(id)
      if (!dataUrl) throw new Error('图库中找不到该图像。')
      return { success: true, dataUrl }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '读取资产图像失败' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PRUNE_ASSET_IMAGES, async (_event, payload: unknown) => {
    try {
      const req = payload as { projectId?: string; kind?: string; assetId?: string }
      const projectId = String(req?.projectId ?? '').trim()
      if (!projectId) throw new Error('缺少 projectId。')
      const kind = String(req?.kind ?? '').trim()
      const assetId = String(req?.assetId ?? '').trim()
      if (kind && assetId) {
        await pruneAssetImagesForAsset(projectId, kind as AssetImageKind, assetId)
      } else {
        await pruneAssetImagesForProject(projectId)
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '清理资产图库失败' }
    }
  })

  // ── Prompt 中心（v1.35.0）：只读展示 prompt，不调模型 / 不发网络 / 不写库 ──
  ipcMain.handle(IPC_CHANNELS.LIST_AI_PROMPT_CATALOG, async () => {
    try {
      return { success: true, entries: listAiPromptCatalog() }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '读取任务目录失败' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.RENDER_AI_PROMPT_PREVIEW, async (_event, payload: unknown) => {
    try {
      const req = payload as { task?: string; context?: Record<string, unknown> }
      const task = String(req?.task ?? '').trim()
      if (!task) throw new Error('缺少任务名。')
      return { success: true, preview: renderPromptPreview({ task, context: req?.context }) }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '生成 prompt 预览失败' }
    }
  })

  ipcMain.handle('clytie:workspace-sync-publish', (event, payload: unknown) => {
    if (payload && typeof payload === 'object') {
      deps.setLatestWorkspaceSnapshot(deps.normalizeWorkspacePayload(payload))
    }
    deps.windowManager.broadcastWindowEvent('clytie:workspace-sync-event', payload, event.sender.id)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.SAVE_CHAPTERS, async (event, payload: SaveChaptersRequest) => {
    try {
      if (!payload?.projectId || !Array.isArray(payload.chapters)) {
        throw new Error('章节增量保存参数无效')
      }
      const db = await deps.ensureWorkspaceDb()
      deps.writeChapterRows(db, payload)
      const mutation: ChapterMutationEvent = { kind: 'upsert', ...payload }
      deps.applyChapterMutation(mutation)
      deps.windowManager.broadcastWindowEvent('clytie:chapter-mutation-event', mutation, event.sender.id)
      return { success: true }
    } catch (error) {
      console.error('[workspace] saveChapters failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown chapter save error'
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SAVE_CHAPTER_ORDER, async (event, payload: SaveChapterOrderRequest) => {
    try {
      if (!payload?.projectId || !Array.isArray(payload.chapters)) {
        throw new Error('章节排序保存参数无效')
      }
      const db = await deps.ensureWorkspaceDb()
      deps.writeChapterOrder(db, payload)
      const mutation: ChapterMutationEvent = { kind: 'reorder', ...payload }
      deps.applyChapterMutation(mutation)
      deps.windowManager.broadcastWindowEvent('clytie:chapter-mutation-event', mutation, event.sender.id)
      return { success: true }
    } catch (error) {
      console.error('[workspace] saveChapterOrder failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown chapter order save error'
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SAVE_WORKSPACE_ENTITIES, async (_event, payload: SaveWorkspaceEntitiesRequest) => {
    try {
      if (
        !payload?.projectId
        || (
          !Array.isArray(payload.worldviewEntries)
          && !Array.isArray(payload.characters)
          && !Array.isArray(payload.inspirationEntries)
          && !Array.isArray(payload.sceneLocations)
          && !Array.isArray(payload.propItems)
        )
      ) {
        throw new Error('工作区实体保存参数无效')
      }
      const db = await deps.ensureWorkspaceDb()
      deps.writeWorkspaceEntities(db, payload)
      return { success: true }
    } catch (error) {
      console.error('[workspace] saveWorkspaceEntities failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown workspace entity save error'
      }
    }
  })

  ipcMain.handle('clytie:load-workspace', async () => {
    try {
      const db = await deps.ensureWorkspaceDb()
      const workspace = deps.readWorkspaceSnapshotForRenderer(db)

      if (!workspace) {
        return { success: false, payload: null }
      }

      deps.setLatestWorkspaceSnapshot(workspace)
      nativeTheme.themeSource = (workspace as { appSettings?: { darkMode?: boolean } }).appSettings?.darkMode ? 'dark' : 'light'

      return {
        success: true,
        payload: workspace
      }
    } catch (error) {
      console.error('[workspace] loadWorkspace failed:', error)
      return {
        success: false,
        payload: null,
        error: error instanceof Error ? error.message : 'Unknown workspace load error'
      }
    }
  })

  ipcMain.handle('clytie:get-zoom-factor', () => {
    const window = deps.windowManager.getActiveWindow()
    if (!window) {
      return {
        success: false,
        error: 'No active window'
      }
    }

    return {
      success: true,
      factor: window.webContents.getZoomFactor()
    }
  })

  ipcMain.handle('clytie:set-zoom-factor', (_event, factor: unknown) => {
    const window = deps.windowManager.getActiveWindow()
    if (!window) {
      return {
        success: false,
        error: 'No active window'
      }
    }

    const numericFactor = typeof factor === 'number' ? factor : Number(factor)
    const nextFactor = Number.isFinite(numericFactor) ? Math.min(1.75, Math.max(0.75, numericFactor)) : 1
    window.webContents.setZoomFactor(nextFactor)

    return {
      success: true,
      factor: nextFactor
    }
  })

  ipcMain.handle('clytie:toggle-boss-key', () => deps.windowManager.toggleBossKey())

  ipcMain.handle('clytie:boss-key-status', () => ({
    registered: deps.windowManager.isBossKeyRegistered()
  }))

  ipcMain.handle('clytie:set-titlebar-overlay', (_event, options: unknown) => {
    const value = options as { color?: unknown; symbolColor?: unknown } | null
    const colors = value && typeof value.color === 'string' && typeof value.symbolColor === 'string'
      ? { color: value.color, symbolColor: value.symbolColor }
      : undefined
    deps.windowManager.updateTitleBarOverlayColors(colors)
  })

  ipcMain.handle('clytie:save-workspace', async (_event, payload: unknown) => {
    try {
      const db = await deps.ensureWorkspaceDb()
      const normalized = deps.normalizeWorkspacePayload(payload)
      deps.writeWorkspaceSnapshot(db, normalized)
      deps.setLatestWorkspaceSnapshot(normalized)
      nativeTheme.themeSource = (normalized as { appSettings?: { darkMode?: boolean } }).appSettings?.darkMode ? 'dark' : 'light'

      return { success: true }
    } catch (error) {
      console.error('[workspace] saveWorkspace failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown workspace save error'
      }
    }
  })

  ipcMain.on('clytie:save-workspace-sync', (event, payload: unknown) => {
    try {
      const db = deps.getWorkspaceDbIfInitialized()
      if (!db) {
        throw new Error('工作区数据库尚未初始化')
      }
      const normalized = deps.normalizeWorkspacePayload(payload)
      deps.writeWorkspaceSnapshot(db, normalized)
      deps.setLatestWorkspaceSnapshot(normalized)
      deps.windowManager.broadcastWindowEvent('clytie:workspace-sync-event', normalized, event.sender.id)
      event.returnValue = { success: true }
    } catch (error) {
      console.error('[workspace] saveWorkspaceSync failed:', error)
      event.returnValue = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown workspace save error'
      }
    }
  })

  ipcMain.handle('clytie:save-app-settings', async (_event, payload: unknown) => {
    try {
      const db = await deps.ensureWorkspaceDb()
      const record = (payload ?? {}) as {
        theme?: unknown
        selectedProjectId?: unknown
        appSettings?: unknown
      }
      const theme = typeof record.theme === 'string' ? record.theme : 'ocean'
      const selectedProjectId = typeof record.selectedProjectId === 'string' ? record.selectedProjectId : ''
      const metadata = { theme, selectedProjectId }
      deps.writeAppSettingsRow(db, record.appSettings, metadata)
      deps.setLatestAppSettings(record.appSettings, metadata)
      nativeTheme.themeSource = (record.appSettings as { darkMode?: boolean } | undefined)?.darkMode ? 'dark' : 'light'
      return { success: true }
    } catch (error) {
      console.error('[workspace] saveAppSettings failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown app settings save error'
      }
    }
  })

  ipcMain.handle('clytie:project-skills-scan', async (_event, projectId: unknown) => {
    try {
      const resolvedProjectId = String(projectId ?? '').trim() || undefined
      await refreshSkillRegistry(resolvedProjectId)
      return { success: true, skills: skillScanEntries(resolvedProjectId) }
    } catch {
      return { success: true, skills: [] }
    }
  })

  ipcMain.handle('clytie:project-skills-import', async (_event, projectId: unknown) => {
    try {
      const resolvedProjectId = String(projectId ?? '').trim() || undefined

      const dialogOptions: Electron.OpenDialogOptions = {
        title: '选择要导入的 Skill 包目录',
        properties: ['openDirectory']
      }
      const ownerWindow = deps.windowManager.getMainWindow() ?? BrowserWindow.getFocusedWindow()
      const result = ownerWindow
        ? await dialog.showOpenDialog(ownerWindow, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions)

      if (result.canceled || !result.filePaths[0]) {
        return { success: true, canceled: true, importedSkillIds: [] }
      }

      const selectedPath = result.filePaths[0]
      const skillsRoot = getSkillsDirPath(resolvedProjectId)
      await mkdir(skillsRoot, { recursive: true })

      const findSkillDirs = async (root: string): Promise<string[]> => {
        if (existsSync(join(root, 'SKILL.md'))) return [root]
        if (!existsSync(root)) return []
        const nestedRoot = join(root, 'skills')
        const searchRoot = existsSync(nestedRoot) ? nestedRoot : root
        const entries = await readdir(searchRoot, { withFileTypes: true })
        return entries
          .filter((entry) => entry.isDirectory() && existsSync(join(searchRoot, entry.name, 'SKILL.md')))
          .map((entry) => join(searchRoot, entry.name))
      }

      const sourceDirs = await findSkillDirs(selectedPath)
      if (!sourceDirs.length) {
        return { success: false, canceled: false, error: '所选目录中没有识别到可导入的 SKILL.md。' }
      }

      const importedSkillIds: string[] = []
      for (const sourceDir of sourceDirs) {
        const targetDir = join(skillsRoot, basename(sourceDir))
        await cp(sourceDir, targetDir, { recursive: true, force: true })
        importedSkillIds.push(basename(sourceDir))
      }

      await refreshSkillRegistry(resolvedProjectId)
      return {
        success: true,
        canceled: false,
        importedSkillIds: importedSkillIds.sort((a, b) => a.localeCompare(b, 'zh-CN'))
      }
    } catch (error) {
      return { success: false, canceled: false, error: error instanceof Error ? error.message : '项目技能导入失败' }
    }
  })

  ipcMain.handle('clytie:global-skill-delete', async (_event, skillId: unknown) => {
    try {
      const normalizedSkillId = String(skillId ?? '').trim()
      if (!normalizedSkillId || basename(normalizedSkillId) !== normalizedSkillId || normalizedSkillId === '.' || normalizedSkillId === '..') {
        return { success: false, error: 'Skill 标识无效。' }
      }

      const sharedRoot = getSkillsDirPath()
      const targetDir = join(sharedRoot, normalizedSkillId)
      if (!existsSync(join(targetDir, 'SKILL.md'))) {
        return { success: false, error: '只能删除用户导入的全局 Skill，内置 Skill 不会被删除。' }
      }

      await rm(targetDir, { recursive: true, force: false })
      await refreshSkillRegistry()
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '删除全局 Skill 失败' }
    }
  })

  ipcMain.handle('clytie:project-skills-context', async (_event, projectId: unknown) => {
    try {
      const resolvedProjectId = String(projectId ?? '').trim()
      if (!resolvedProjectId) {
        return { success: true, skills: [] }
      }

      await refreshSkillRegistry(resolvedProjectId)
      return { success: true, skills: skillContextEntries(resolvedProjectId) }
    } catch {
      return { success: true, skills: [] }
    }
  })

  // ── 提交章节编辑提案 ──
  ipcMain.handle('clytie:commit-chapter-edit', async (_event, payload: unknown) => {
    try {
      const { projectId, chapterId, oldContent, newContent } = payload as {
        projectId: string
        chapterId: string
        oldContent: string
        newContent: string
      }
      const { commitChapterEdit } = await import('./ai/agent/tools/chapter-data-access')
      const result = await commitChapterEdit(projectId, chapterId, oldContent, newContent)
      return { success: true, versionId: result.versionId }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '写回失败' }
    }
  })

  // ── 检查更新（GitHub Release API） ──
  ipcMain.handle('clytie:check-update', async () => {
    try {
      const { app } = await import('electron')
      const currentVersion = app.getVersion()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 15_000)
      const response = await fetch('https://api.github.com/repos/uu201/character-arc/releases/latest', {
        headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'Clytie-Desktop' },
        signal: controller.signal
      })
      clearTimeout(timer)
      if (!response.ok) {
        return { success: false, error: `GitHub API 请求失败 (${response.status})` }
      }
      const release = await response.json() as {
        tag_name?: string
        name?: string
        body?: string
        html_url?: string
        published_at?: string
        assets?: Array<{ name?: string; browser_download_url?: string; size?: number }>
      }
      const latestTag = (release.tag_name ?? '').replace(/^v\.?/, '')
      const hasUpdate = latestTag && latestTag !== currentVersion && compareVersions(latestTag, currentVersion) > 0
      return {
        success: true,
        result: {
          hasUpdate,
          currentVersion,
          latestVersion: latestTag,
          releaseTitle: release.name ?? '',
          releaseNotes: release.body ?? '',
          releaseUrl: release.html_url ?? '',
          publishedAt: release.published_at ?? '',
          assets: (release.assets ?? []).map(a => ({
            name: a.name ?? '',
            downloadUrl: a.browser_download_url ?? '',
            size: a.size ?? 0
          }))
        }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '检查更新失败' }
    }
  })

  ipcMain.handle('clytie:fetch-announcements', async () => {
    return fetchWithCache({
      repo: 'uu201/character-arc',
      branch: 'main',
      filePath: 'announcements.json',
      cacheDir: 'announcements-cache',
      ttlMs: 0,
      timeoutMs: 8000,
      preferActiveMirror: false,
      allowStaleFallback: false,
    })
  })

  ipcMain.handle('clytie:fetch-tutorial', async () => {
    return fetchWithCache({
      repo: 'uu201/character-arc',
      branch: 'main',
      filePath: 'tutorial.json',
      cacheDir: 'tutorial-cache',
      ttlMs: 6 * 60 * 60 * 1000,
      timeoutMs: 8000,
      preferActiveMirror: true,
      allowStaleFallback: true
    })
  })

  ipcMain.handle('clytie:open-external-url', (_event, url: string) => {
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
      shell.openExternal(url)
    }
  })

  // ── 番茄风向标：抓取榜单数据（主进程缓存，避免每次请求） ──
  ipcMain.handle('clytie:fanqie-trends-fetch', async (_event, payload: { path?: string; force?: boolean }) => {
    const remotePath = typeof payload?.path === 'string' ? payload.path : ''
    const force = payload?.force === true
    return fetchFanqieTrends(remotePath, force)
  })

  // ── 七猫风向标：公开静态榜单 API（主进程缓存 + 路径白名单） ──
  ipcMain.handle('clytie:qimao-trends-fetch', async (_event, payload: { path?: string; force?: boolean }) => {
    const remotePath = typeof payload?.path === 'string' ? payload.path : ''
    return fetchQimaoTrends(remotePath, payload?.force === true)
  })

  // ── 纵横风向标：公开静态榜单 API（主进程缓存 + 路径白名单） ──
  ipcMain.handle('clytie:zongheng-trends-fetch', async (_event, payload: { path?: string; force?: boolean }) => {
    const remotePath = typeof payload?.path === 'string' ? payload.path : ''
    return fetchZonghengTrends(remotePath, payload?.force === true)
  })

  // ── 起点中文网：公开移动端榜单（按榜单与作品分类缓存） ──
  ipcMain.handle('clytie:qidian-rank-fetch', async (
    _event,
    payload: { type?: string; category?: string; force?: boolean }
  ) => {
    const type = typeof payload?.type === 'string' ? payload.type : 'hotsales'
    const category = typeof payload?.category === 'string' ? payload.category : '-1'
    return fetchQidianRank(type, category, payload?.force === true)
  })

  // ── AI 扫榜历史：持久化任务参数、报告和过程日志 ──
  ipcMain.handle('clytie:ranking-scan-list', async (_event, projectId?: unknown) => {
    try {
      const db = await deps.ensureWorkspaceDb()
      const scope = typeof projectId === 'string' ? projectId : ''
      const rows = db.prepare(`
        SELECT id, project_id, platform, board, category, sample_count, analysis_modes_json,
               model, status, progress, current_stage, created_at, started_at, completed_at,
               duration_ms, summary, report, ideas_json, logs_json, error, source_date
        FROM ranking_scan_runs
        WHERE project_id = ? OR project_id = ''
        ORDER BY created_at DESC
      `).all(scope) as Array<Record<string, unknown>>

      const parseJson = (value: unknown, fallback: unknown): unknown => {
        if (typeof value !== 'string' || !value.trim()) return fallback
        try {
          return JSON.parse(value)
        } catch {
          return fallback
        }
      }

      return {
        success: true,
        result: rows.map((row) => ({
          id: String(row.id ?? ''),
          projectId: String(row.project_id ?? ''),
          platform: String(row.platform ?? ''),
          board: String(row.board ?? ''),
          category: String(row.category ?? ''),
          sampleCount: Number(row.sample_count ?? 0),
          analysisModes: parseJson(row.analysis_modes_json, []),
          model: String(row.model ?? ''),
          status: String(row.status ?? 'failed'),
          progress: Number(row.progress ?? 0),
          currentStage: Number(row.current_stage ?? 0),
          createdAt: String(row.created_at ?? ''),
          startedAt: String(row.started_at ?? ''),
          completedAt: String(row.completed_at ?? ''),
          durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
          summary: String(row.summary ?? ''),
          report: String(row.report ?? ''),
          ideas: parseJson(row.ideas_json, []),
          logs: parseJson(row.logs_json, []),
          error: String(row.error ?? ''),
          sourceDate: String(row.source_date ?? '')
        }))
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '读取扫榜历史失败' }
    }
  })

  ipcMain.handle('clytie:ranking-scan-save', async (_event, payload: unknown) => {
    try {
      const input = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
      const id = typeof input.id === 'string' ? input.id.trim() : ''
      if (!id) return { success: false, error: '扫榜记录缺少 id' }
      const asJson = (value: unknown, fallback: unknown): string => {
        try {
          return JSON.stringify(value ?? fallback)
        } catch {
          return JSON.stringify(fallback)
        }
      }
      const db = await deps.ensureWorkspaceDb()
      db.prepare(`
        INSERT INTO ranking_scan_runs (
          id, project_id, platform, board, category, sample_count, analysis_modes_json,
          model, status, progress, current_stage, created_at, started_at, completed_at,
          duration_ms, summary, report, ideas_json, logs_json, error, source_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          project_id = excluded.project_id,
          platform = excluded.platform,
          board = excluded.board,
          category = excluded.category,
          sample_count = excluded.sample_count,
          analysis_modes_json = excluded.analysis_modes_json,
          model = excluded.model,
          status = excluded.status,
          progress = excluded.progress,
          current_stage = excluded.current_stage,
          created_at = excluded.created_at,
          started_at = excluded.started_at,
          completed_at = excluded.completed_at,
          duration_ms = excluded.duration_ms,
          summary = excluded.summary,
          report = excluded.report,
          ideas_json = excluded.ideas_json,
          logs_json = excluded.logs_json,
          error = excluded.error,
          source_date = excluded.source_date
      `).run(
        id,
        typeof input.projectId === 'string' ? input.projectId : '',
        typeof input.platform === 'string' ? input.platform : '',
        typeof input.board === 'string' ? input.board : '',
        typeof input.category === 'string' ? input.category : '',
        Number(input.sampleCount ?? 0) || 0,
        asJson(input.analysisModes, []),
        typeof input.model === 'string' ? input.model : '',
        typeof input.status === 'string' ? input.status : 'draft',
        Math.max(0, Math.min(100, Number(input.progress ?? 0) || 0)),
        Math.max(0, Number(input.currentStage ?? 0) || 0),
        typeof input.createdAt === 'string' ? input.createdAt : new Date().toISOString(),
        typeof input.startedAt === 'string' ? input.startedAt : '',
        typeof input.completedAt === 'string' ? input.completedAt : '',
        input.durationMs == null ? null : Number(input.durationMs) || 0,
        typeof input.summary === 'string' ? input.summary : '',
        typeof input.report === 'string' ? input.report : '',
        asJson(input.ideas, []),
        asJson(input.logs, []),
        typeof input.error === 'string' ? input.error : '',
        typeof input.sourceDate === 'string' ? input.sourceDate : ''
      )
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '保存扫榜历史失败' }
    }
  })

  ipcMain.handle('clytie:ranking-scan-delete', async (_event, id: unknown) => {
    try {
      const recordId = typeof id === 'string' ? id.trim() : ''
      if (!recordId) return { success: false, error: '扫榜记录 id 无效' }
      const db = await deps.ensureWorkspaceDb()
      db.prepare('DELETE FROM ranking_scan_runs WHERE id = ?').run(recordId)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '删除扫榜历史失败' }
    }
  })

  // ── AI 助手会话持久化 ──

  ipcMain.handle('clytie:session-list', async (_event, projectId: string) => {
    try {
      const db = await deps.ensureWorkspaceDb()
      const rows = db.prepare(
        'SELECT id, title, created_at, updated_at FROM assistant_sessions WHERE project_id = ? ORDER BY updated_at DESC'
      ).all(projectId) as Array<{ id: string; title: string; created_at: string; updated_at: string }>
      return { success: true, result: rows }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '获取会话列表失败' }
    }
  })

  ipcMain.handle('clytie:session-load', async (_event, sessionId: string) => {
    try {
      const db = await deps.ensureWorkspaceDb()
      const row = db.prepare(
        'SELECT id, project_id, title, messages_json, created_at, updated_at FROM assistant_sessions WHERE id = ?'
      ).get(sessionId) as { id: string; project_id: string; title: string; messages_json: string; created_at: string; updated_at: string } | undefined
      if (!row) return { success: false, error: '会话不存在' }
      const parsed = JSON.parse(row.messages_json)
      const messages = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.messages) ? parsed.messages : []
      return { success: true, result: { ...row, ...(!Array.isArray(parsed) && parsed && typeof parsed === 'object' ? parsed : {}), messages } }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '加载会话失败' }
    }
  })

  ipcMain.handle('clytie:session-save', async (_event, payload: {
    id: string
    projectId: string
    title: string
    messages: unknown[]
    proposal?: unknown | null
    lastProposalPrompt?: string
    lastAssistantReply?: string
  }) => {
    try {
      const db = await deps.ensureWorkspaceDb()
      const now = new Date().toISOString()
      const messagesJson = JSON.stringify({
        messages: payload.messages,
        proposal: payload.proposal ?? null,
        lastProposalPrompt: payload.lastProposalPrompt ?? '',
        lastAssistantReply: payload.lastAssistantReply ?? ''
      })
      db.prepare(
        `INSERT INTO assistant_sessions (id, project_id, title, messages_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, messages_json = excluded.messages_json, updated_at = excluded.updated_at`
      ).run(payload.id, payload.projectId, payload.title, messagesJson, now, now)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '保存会话失败' }
    }
  })

  ipcMain.handle('clytie:session-delete', async (_event, sessionId: string) => {
    try {
      const db = await deps.ensureWorkspaceDb()
      db.prepare('DELETE FROM assistant_sessions WHERE id = ?').run(sessionId)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '删除会话失败' }
    }
  })
}
