/**
 * v1.33.0 资产图库主进程模块：图像落盘 / 落库 / 删除 / 导出 / 级联。
 *
 * 独立于 workspace-store 的实体链路：`asset_images` 表有意**不进工作区快照**，
 * 图库按资产懒加载，读写走专用 IPC，避免全局快照随图库膨胀。
 * 图像文件落 `userData/asset-images/<projectId>/<imageId>.<ext>`，DB 只存元数据与文件名。
 */
import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'

import type { AssetImageItem, AssetImageKind } from '@shared/ipc-types'
import { ensureWorkspaceDb } from './workspace-store'

/** 写库时携带的元数据（除 id/fileName/mime/时间戳外均由调用方提供） */
export interface AssetImageMeta {
  prompt?: string
  revisedPrompt?: string
  provider?: string
  model?: string
  aspectRatio?: string
  imageSize?: string
  referenceIds?: string[]
  isPrimary?: boolean
  status?: 'succeeded' | 'failed'
  error?: string
  runId?: string
}

type AssetImageRow = {
  id: string
  project_id: string
  asset_kind: string
  asset_id: string
  file_name: string
  mime: string
  prompt: string
  revised_prompt: string
  provider: string
  model: string
  aspect_ratio: string
  image_size: string
  reference_ids_json: string
  is_primary: number
  status: string
  error: string
  run_id: string
  created_at: string
  updated_at: string
}

/** 把 projectId 收敛成安全的目录名，避免路径穿越 */
function sanitizeSegment(value: string): string {
  return String(value ?? '').trim().replace(/[^a-zA-Z0-9_-]/g, '_')
}

function getAssetImageRoot(): string {
  return join(app.getPath('userData'), 'asset-images')
}

function getAssetImageDir(projectId: string): string {
  return join(getAssetImageRoot(), sanitizeSegment(projectId))
}

async function ensureAssetImageDir(projectId: string): Promise<string> {
  const dir = getAssetImageDir(projectId)
  await mkdir(dir, { recursive: true })
  return dir
}

function mimeToExtension(mime: string): string {
  const normalized = String(mime ?? '').toLowerCase()
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg'
  if (normalized.includes('webp')) return 'webp'
  if (normalized.includes('gif')) return 'gif'
  return 'png'
}

function parseReferenceIds(json: string): string[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.map((id) => String(id)).filter(Boolean) : []
  } catch {
    return []
  }
}

function rowToItem(row: AssetImageRow): AssetImageItem {
  return {
    id: row.id,
    projectId: row.project_id,
    assetKind: row.asset_kind as AssetImageKind,
    assetId: row.asset_id,
    fileName: row.file_name,
    mime: row.mime,
    prompt: row.prompt,
    revisedPrompt: row.revised_prompt,
    provider: row.provider,
    model: row.model,
    aspectRatio: row.aspect_ratio,
    imageSize: row.image_size,
    referenceIds: parseReferenceIds(row.reference_ids_json),
    isPrimary: row.is_primary === 1,
    status: row.status === 'failed' ? 'failed' : 'succeeded',
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/** 把 data URL / http(s) URL 解析为可落盘的字节与 MIME */
async function resolveImageSource(dataUrlOrUrl: string): Promise<{ buffer: Buffer; mime: string }> {
  const value = String(dataUrlOrUrl ?? '').trim()
  if (!value) throw new Error('没有可保存的图片数据。')

  if (value.startsWith('data:')) {
    const match = value.match(/^data:(image\/[\w+.-]+);base64,(.+)$/)
    if (!match) throw new Error('图片数据格式无效，无法保存。')
    return { buffer: Buffer.from(match[2], 'base64'), mime: match[1] }
  }

  if (/^https?:\/\//i.test(value)) {
    const response = await globalThis.fetch(value)
    if (!response.ok) throw new Error(`图片下载失败：HTTP ${response.status}`)
    const mime = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg'
    return { buffer: Buffer.from(await response.arrayBuffer()), mime }
  }

  throw new Error('不支持的图片数据来源，无法保存。')
}

function getRowById(db: DatabaseSync, id: string): AssetImageRow | undefined {
  return db.prepare('SELECT * FROM asset_images WHERE id = ?').get(id) as AssetImageRow | undefined
}

/**
 * 保存一张资产图像：先写本地文件，再写库，返回图库条目。
 * `dataUrlOrUrl` 通常为 transport 已下载好的 data URL。
 */
export async function saveAssetImage(
  projectId: string,
  kind: AssetImageKind,
  assetId: string,
  dataUrlOrUrl: string,
  meta: AssetImageMeta = {}
): Promise<AssetImageItem> {
  const db = await ensureWorkspaceDb()
  const { buffer, mime } = await resolveImageSource(dataUrlOrUrl)
  const id = randomUUID()
  const fileName = `${id}.${mimeToExtension(mime)}`
  const dir = await ensureAssetImageDir(projectId)
  const now = new Date().toISOString()
  const referenceIds = Array.isArray(meta.referenceIds) ? meta.referenceIds.map((ref) => String(ref)).filter(Boolean) : []

  await writeFile(join(dir, fileName), buffer)

  // v1.34.3：图库首图默认成为首选图（该资产尚无首选时，本次保存的图即首选）
  const existingPrimary = db.prepare(
    'SELECT id FROM asset_images WHERE project_id = ? AND asset_kind = ? AND asset_id = ? AND is_primary = 1 LIMIT 1'
  ).get(projectId, kind, assetId)
  const shouldBePrimary = meta.isPrimary === true || !existingPrimary

  db.prepare(
    `INSERT INTO asset_images (
      id, project_id, asset_kind, asset_id, file_name, mime, prompt, revised_prompt, provider, model,
      aspect_ratio, image_size, reference_ids_json, is_primary, status, error, run_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    projectId,
    kind,
    assetId,
    fileName,
    mime,
    meta.prompt ?? '',
    meta.revisedPrompt ?? '',
    meta.provider ?? '',
    meta.model ?? '',
    meta.aspectRatio ?? '',
    meta.imageSize ?? '',
    JSON.stringify(referenceIds),
    shouldBePrimary ? 1 : 0,
    meta.status === 'failed' ? 'failed' : 'succeeded',
    meta.error ?? '',
    meta.runId ?? '',
    now,
    now
  )

  const row = getRowById(db, id)
  if (!row) throw new Error('图像已写入，但图库记录创建失败。')
  return rowToItem(row)
}

/** 按资产查询图库（含 isPrimary），按创建时间倒序返回 */
export async function listAssetImages(
  projectId: string,
  kind: AssetImageKind,
  assetId: string
): Promise<AssetImageItem[]> {
  const db = await ensureWorkspaceDb()
  const rows = db.prepare(
    `SELECT * FROM asset_images
     WHERE project_id = ? AND asset_kind = ? AND asset_id = ?
     ORDER BY created_at DESC`
  ).all(projectId, kind, assetId) as AssetImageRow[]

  // v1.34.3 兜底：历史数据若「有图但无基准」，把最新一张补为基准（幂等，保证非空图库恒有基准）
  if (rows.length && !rows.some((row) => row.is_primary === 1)) {
    const newest = rows[0]
    db.prepare('UPDATE asset_images SET is_primary = 1, updated_at = ? WHERE id = ?').run(new Date().toISOString(), newest.id)
    newest.is_primary = 1
  }

  return rows.map(rowToItem)
}

/** 解析图库条目的本地文件绝对路径（供自定义协议 / 导出使用） */
export async function resolveAssetImageFile(id: string): Promise<{ filePath: string; mime: string } | null> {
  const db = await ensureWorkspaceDb()
  const row = getRowById(db, id)
  if (!row) return null
  return { filePath: join(getAssetImageDir(row.project_id), row.file_name), mime: row.mime }
}

/** 把图库条目的本地文件读成 data URL（供渲染层作参考图 / 回退显示） */
export async function readAssetImageDataUrl(id: string): Promise<string | null> {
  const resolved = await resolveAssetImageFile(id)
  if (!resolved) return null
  const buffer = await readFile(resolved.filePath)
  return `data:${resolved.mime};base64,${buffer.toString('base64')}`
}

/** 删除一张图像：删库行 + 删本地文件（文件缺失不报错） */
export async function deleteAssetImage(id: string): Promise<boolean> {
  const db = await ensureWorkspaceDb()
  const row = getRowById(db, id)
  if (!row) return false
  db.prepare('DELETE FROM asset_images WHERE id = ?').run(id)
  await rm(join(getAssetImageDir(row.project_id), row.file_name), { force: true })

  // v1.34.3：删掉的若是首选图，则把剩余最新一张提升为首选（保持「有图即有首选」）
  if (row.is_primary === 1) {
    const next = db.prepare(
      'SELECT id FROM asset_images WHERE project_id = ? AND asset_kind = ? AND asset_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(row.project_id, row.asset_kind, row.asset_id) as { id: string } | undefined
    if (next) {
      db.prepare('UPDATE asset_images SET is_primary = 1, updated_at = ? WHERE id = ?').run(new Date().toISOString(), next.id)
    }
  }

  return true
}

/** 同资产内互斥设置首选图（每资产至多 1 张） */
export async function setPrimaryAssetImage(id: string): Promise<boolean> {
  const db = await ensureWorkspaceDb()
  const row = getRowById(db, id)
  if (!row) return false
  const now = new Date().toISOString()
  db.prepare(
    'UPDATE asset_images SET is_primary = 0, updated_at = ? WHERE project_id = ? AND asset_kind = ? AND asset_id = ?'
  ).run(now, row.project_id, row.asset_kind, row.asset_id)
  db.prepare('UPDATE asset_images SET is_primary = 1, updated_at = ? WHERE id = ?').run(now, id)
  return true
}

/** 复制本地图像到用户指定路径（另存为对话框由 IPC 层负责） */
export async function copyAssetImageTo(id: string, targetPath: string): Promise<string> {
  const resolved = await resolveAssetImageFile(id)
  if (!resolved) throw new Error('图库中找不到该图像。')
  await copyFile(resolved.filePath, targetPath)
  return targetPath
}

/** 资产删除时的级联：清行 + 删对应本地文件 */
export async function pruneAssetImagesForAsset(
  projectId: string,
  kind: AssetImageKind,
  assetId: string
): Promise<void> {
  const db = await ensureWorkspaceDb()
  const rows = db.prepare(
    'SELECT * FROM asset_images WHERE project_id = ? AND asset_kind = ? AND asset_id = ?'
  ).all(projectId, kind, assetId) as AssetImageRow[]
  db.prepare(
    'DELETE FROM asset_images WHERE project_id = ? AND asset_kind = ? AND asset_id = ?'
  ).run(projectId, kind, assetId)
  await Promise.all(rows.map((row) => rm(join(getAssetImageDir(row.project_id), row.file_name), { force: true })))
}

/** 项目删除时整目录清理：清行 + 删整个项目图像目录 */
export async function pruneAssetImagesForProject(projectId: string): Promise<void> {
  const db = await ensureWorkspaceDb()
  db.prepare('DELETE FROM asset_images WHERE project_id = ?').run(projectId)
  await rm(getAssetImageDir(projectId), { recursive: true, force: true })
}
