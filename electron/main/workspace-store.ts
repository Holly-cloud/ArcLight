import { join } from 'node:path'
import { mkdir, readFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'

import {
  type KnowledgeDocumentSourceType,
  type LegacyWorkspacePayload,
  type WorkspaceAiRunRecord,
  type WorkspaceAiRunKnowledgeItem,
  type WorkspaceAiRunStatus,
  type WorkspacePayload,
  normalizeAppSettings,
  normalizeProjectRecord,
  normalizeWorkspacePayload
} from './workspace-types'
import { initStoryStateSchema } from './story-state-store'
import { initAssistantRuntimeSchema } from './ai/runtime-v2/conversation-manager'
import { resetRuntimeState } from './ai/runtime-v2/state'
import { initChapterProcessingSchema } from './ai/runtime/chapter-processing-store'
import { initStateBackfillSchema } from './ai/state-backfill-store'
import { migrateKnowledgeDocumentScopes } from './knowledge-document-schema'
import { countChapterCharacters, ensureChapterContentMetadata } from './chapter-content-metadata'
import { prepareWorkspaceHierarchyUpserts } from './workspace-snapshot-upserts'

export { readChapterMutationPayload, writeChapterOrder, writeChapterRows } from './chapter-persistence'

const WORKSPACE_DB = 'workspace.db'
const WORKSPACE_FILE = 'workspace.json'
export const WORKSPACE_SCHEMA_VERSION = 4

export type WorkspaceUpgradeProgress = {
  phase: 'schema' | 'chapters' | 'chapter-versions' | 'validation'
  message: string
  current: number
  total: number
  percent: number
}

export function getWorkspaceDirPath(): string {
  const override = process.env.CHARACTERARC_WORKSPACE_DIR?.trim()
  if (override) return override
  const electronRequire = eval('require') as NodeJS.Require
  const { app } = electronRequire('electron') as { app: { getPath: (name: 'userData') => string } }
  return join(app.getPath('userData'), 'data')
}

function getWorkspaceFilePath(): string {
  return join(getWorkspaceDirPath(), WORKSPACE_FILE)
}

function getWorkspaceDbPath(): string {
  return join(getWorkspaceDirPath(), WORKSPACE_DB)
}

let workspaceDb: DatabaseSync | null = null
let dbInitPromise: Promise<DatabaseSync> | null = null

export function getWorkspaceDbIfInitialized(): DatabaseSync | null {
  return workspaceDb
}

export function closeWorkspaceDbForRollback(): void {
  const db = workspaceDb
  if (!db) {
    resetRuntimeState()
    dbInitPromise = null
    return
  }

  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  } finally {
    try {
      resetRuntimeState()
      db.close()
    } finally {
      workspaceDb = null
      dbInitPromise = null
    }
  }
}

async function ensureWorkspaceDir(): Promise<void> {
  await mkdir(getWorkspaceDirPath(), { recursive: true })
}

export async function ensureWorkspaceDb(options: {
  onUpgradeProgress?: (progress: WorkspaceUpgradeProgress) => void
} = {}): Promise<DatabaseSync> {
  if (workspaceDb) return workspaceDb
  if (dbInitPromise) return dbInitPromise

  dbInitPromise = (async () => {
    try {
    await ensureWorkspaceDir()
    options.onUpgradeProgress?.({
      phase: 'schema',
      message: '正在检查数据库结构…',
      current: 0,
      total: 1,
      percent: 5
    })
    const db = new DatabaseSync(getWorkspaceDbPath())
    db.function('chapter_character_count', (content) => countChapterCharacters(String(content ?? '')))
    db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      premise TEXT,
      genre TEXT NOT NULL,
      novel_length TEXT NOT NULL DEFAULT 'long',
      word_count TEXT NOT NULL,
      last_edited TEXT NOT NULL,
      cover TEXT NOT NULL,
      target_platform TEXT NOT NULL DEFAULT '',
      cover_history_json TEXT NOT NULL DEFAULT '[]',
      writing_style_preset_id TEXT NOT NULL DEFAULT 'cinematic-cool',
      writing_style_prompt TEXT NOT NULL DEFAULT '',
      novel_workflow_stages_json TEXT NOT NULL DEFAULT '[]',
      project_skills_json TEXT NOT NULL DEFAULT '[]',
      skill_policy_json TEXT NOT NULL DEFAULT '{"mode":"auto","skillIds":[]}',
      chapter_assistant_templates_json TEXT NOT NULL DEFAULT '[]'
    ) STRICT;

    CREATE TABLE IF NOT EXISTS worldview_entries (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      description TEXT NOT NULL,
      avatar TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      motto TEXT NOT NULL,
      color TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS character_relationships (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      from_character_id TEXT NOT NULL,
      to_character_id TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      intensity INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS organization_memberships (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      role TEXT NOT NULL,
      notes TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS scene_locations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      color TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      related_character_ids_json TEXT NOT NULL DEFAULT '[]',
      related_prop_ids_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS prop_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      owner_character_id TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      color TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      related_scene_ids_json TEXT NOT NULL DEFAULT '[]',
      related_character_ids_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS inspiration_entries (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      source TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS outline_volumes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      word_target TEXT NOT NULL,
      summary TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS outline_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      volume_id TEXT NOT NULL,
      title TEXT NOT NULL,
      word_target TEXT NOT NULL,
      conflict TEXT NOT NULL,
      summary TEXT NOT NULL,
      related_character_ids_json TEXT NOT NULL DEFAULT '[]',
      related_organization_ids_json TEXT NOT NULL DEFAULT '[]',
      related_worldview_ids_json TEXT NOT NULL DEFAULT '[]',
      sort_order INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
      FOREIGN KEY (volume_id) REFERENCES outline_volumes (id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      volume_id TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      status TEXT NOT NULL,
      word_target TEXT NOT NULL,
      content TEXT NOT NULL,
      content_length INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
      FOREIGN KEY (volume_id) REFERENCES outline_volumes (id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS chapter_versions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      status TEXT NOT NULL,
      word_target TEXT NOT NULL,
      content TEXT NOT NULL,
      content_length INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
      FOREIGN KEY (chapter_id) REFERENCES chapters (id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS ai_messages (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS knowledge_documents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_label TEXT NOT NULL,
      content TEXT NOT NULL,
      summary TEXT NOT NULL,
      keywords_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS ai_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL DEFAULT '',
      task TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL DEFAULT '',
      duration_ms INTEGER,
      used_knowledge_json TEXT NOT NULL DEFAULT '[]',
      tool_calls_json TEXT NOT NULL DEFAULT '[]',
      usage_json TEXT NOT NULL DEFAULT '{}',
      repair_triggered INTEGER NOT NULL DEFAULT 0,
      error TEXT NOT NULL DEFAULT '',
      response_preview TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS ranking_scan_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL DEFAULT '',
      platform TEXT NOT NULL,
      board TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      sample_count INTEGER NOT NULL DEFAULT 0,
      analysis_modes_json TEXT NOT NULL DEFAULT '[]',
      model TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      current_stage INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      started_at TEXT NOT NULL DEFAULT '',
      completed_at TEXT NOT NULL DEFAULT '',
      duration_ms INTEGER,
      summary TEXT NOT NULL DEFAULT '',
      report TEXT NOT NULL DEFAULT '',
      ideas_json TEXT NOT NULL DEFAULT '[]',
      logs_json TEXT NOT NULL DEFAULT '[]',
      error TEXT NOT NULL DEFAULT '',
      source_date TEXT NOT NULL DEFAULT ''
    ) STRICT;

    CREATE TABLE IF NOT EXISTS global_ai_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL DEFAULT '',
      chapter_id TEXT NOT NULL DEFAULT '',
      task TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL DEFAULT '',
      duration_ms INTEGER,
      used_knowledge_json TEXT NOT NULL DEFAULT '[]',
      tool_calls_json TEXT NOT NULL DEFAULT '[]',
      usage_json TEXT NOT NULL DEFAULT '{}',
      repair_triggered INTEGER NOT NULL DEFAULT 0,
      error TEXT NOT NULL DEFAULT '',
      response_preview TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS workflow_documents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      volume_id TEXT NOT NULL DEFAULT 'volume-legacy-default',
      doc_key TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
      FOREIGN KEY (volume_id) REFERENCES outline_volumes (id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS plot_threads (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      opened_in_chapter_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      closed_in_chapter_id TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      theme TEXT NOT NULL,
      selected_project_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      api_key TEXT NOT NULL,
      base_url TEXT NOT NULL,
      proxy_url TEXT NOT NULL DEFAULT '',
      temperature REAL,
      top_p REAL,
      presence_penalty REAL,
      frequency_penalty REAL,
      ai_profiles_json TEXT NOT NULL DEFAULT '[]',
      active_ai_profile_id TEXT NOT NULL DEFAULT '',
      image_provider TEXT NOT NULL DEFAULT '',
      image_model TEXT NOT NULL DEFAULT '',
      image_api_key TEXT NOT NULL DEFAULT '',
      image_base_url TEXT NOT NULL DEFAULT '',
      auto_save_interval TEXT NOT NULL,
      editor_font TEXT NOT NULL DEFAULT 'clear-mono',
      ui_scale REAL NOT NULL DEFAULT 1,
      workspace_menu_order_json TEXT NOT NULL DEFAULT '[]',
      hidden_workbench_modules_json TEXT NOT NULL DEFAULT '[]',
      dark_mode INTEGER NOT NULL DEFAULT 0,
      dark_mode_style TEXT NOT NULL DEFAULT 'standard'
    ) STRICT;

    CREATE TABLE IF NOT EXISTS cover_workbench_history (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      cover TEXT NOT NULL,
      prompt_title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      summary TEXT NOT NULL,
      keywords_json TEXT NOT NULL DEFAULT '[]',
      genre TEXT NOT NULL DEFAULT '',
      target_platform TEXT NOT NULL DEFAULT '',
      author_name TEXT NOT NULL DEFAULT '',
      extra_notes TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0
    ) STRICT;

    CREATE TABLE IF NOT EXISTS assistant_sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      messages_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_chapters_project_sort
      ON chapters (project_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_chapters_project_volume_sort
      ON chapters (project_id, volume_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_chapter_versions_chapter_created
      ON chapter_versions (chapter_id, created_at DESC);
  `)

  const worldviewColumns = db.prepare(`PRAGMA table_info(worldview_entries)`).all() as Array<{ name: string }>
  const worldviewColumnNames = new Set(worldviewColumns.map((column) => column.name))

  if (!worldviewColumnNames.has('created_at')) {
    db.exec(`ALTER TABLE worldview_entries ADD COLUMN created_at TEXT NOT NULL DEFAULT '';`)
  }

  if (!worldviewColumnNames.has('updated_at')) {
    db.exec(`ALTER TABLE worldview_entries ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';`)
  }

  db.exec(`
    UPDATE worldview_entries
    SET created_at = COALESCE(NULLIF(created_at, ''), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at = COALESCE(NULLIF(updated_at, ''), created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    WHERE created_at = '' OR updated_at = '';
  `)

  ensureAppSettingsColumns(db)
  ensureAiRunColumns(db)
  ensureChapterColumns(db, (progress) => {
    const isChapter = progress.phase === 'chapters'
    const start = isChapter ? 35 : 70
    const span = isChapter ? 35 : 18
    const ratio = progress.total > 0 ? progress.current / progress.total : 1
    options.onUpgradeProgress?.({
      phase: progress.phase,
      message: isChapter ? '正在升级章节数据…' : '正在升级章节历史版本…',
      current: progress.current,
      total: progress.total,
      percent: Math.round(start + span * ratio)
    })
  })
  ensureProjectColumns(db)
  ensureProjectScopedColumns(db)
  ensureVolumeColumns(db)
  ensureOutlineItemColumns(db)
  ensureEntityVisualColumns(db)
  ensureWorkbenchDissolutionSchema(db)
  ensureWorkflowDocumentColumns(db)
  ensureKnowledgeDocumentSchema(db)
  initStoryStateSchema(db)
  initAssistantRuntimeSchema(db)
  initChapterProcessingSchema(db)
  initStateBackfillSchema(db)

  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace_schema_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      schema_version INTEGER NOT NULL,
      upgraded_at TEXT NOT NULL
    ) STRICT;
    INSERT INTO workspace_schema_meta (id, schema_version, upgraded_at)
    VALUES (1, ${WORKSPACE_SCHEMA_VERSION}, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ON CONFLICT(id) DO UPDATE SET
      schema_version = excluded.schema_version,
      upgraded_at = excluded.upgraded_at;
  `)

  await migrateLegacyWorkspaceFile(db)
  options.onUpgradeProgress?.({
    phase: 'validation',
    message: '正在检查升级结果…',
    current: 1,
    total: 1,
    percent: 98
  })
  workspaceDb = db
  return db
    } catch (err) {
      dbInitPromise = null
      throw err
    }
  })()

  return dbInitPromise
}

function ensureAppSettingsColumns(db: DatabaseSync): void {
  const columns = db.prepare(`PRAGMA table_info('app_settings')`).all() as Array<{ name: string }>
  const columnNames = new Set(columns.map((column) => column.name))

  if (!columnNames.has('model')) {
    db.exec(`ALTER TABLE app_settings ADD COLUMN model TEXT NOT NULL DEFAULT '';`)
  }

  if (!columnNames.has('ui_scale')) {
    db.exec(`ALTER TABLE app_settings ADD COLUMN ui_scale REAL NOT NULL DEFAULT 1;`)
  }

  if (!columnNames.has('dark_mode')) {
    db.exec(`ALTER TABLE app_settings ADD COLUMN dark_mode INTEGER NOT NULL DEFAULT 0;`)
  }

  if (!columnNames.has('dark_mode_style')) {
    db.exec(`ALTER TABLE app_settings ADD COLUMN dark_mode_style TEXT NOT NULL DEFAULT 'standard';`)
  }

  if (!columnNames.has('temperature')) {
    db.exec(`ALTER TABLE app_settings ADD COLUMN temperature REAL;`)
  }

  if (!columnNames.has('proxy_url')) {
    db.exec(`ALTER TABLE app_settings ADD COLUMN proxy_url TEXT NOT NULL DEFAULT '';`)
  }

  if (!columnNames.has('top_p')) {
    db.exec(`ALTER TABLE app_settings ADD COLUMN top_p REAL;`)
  }

  if (!columnNames.has('presence_penalty')) {
    db.exec(`ALTER TABLE app_settings ADD COLUMN presence_penalty REAL;`)
  }

  if (!columnNames.has('frequency_penalty')) {
    db.exec(`ALTER TABLE app_settings ADD COLUMN frequency_penalty REAL;`)
  }

  if (!columnNames.has('image_provider')) {
    db.exec(`ALTER TABLE app_settings ADD COLUMN image_provider TEXT NOT NULL DEFAULT '';`)
  }

  if (!columnNames.has('ai_profiles_json')) {
    db.exec(`ALTER TABLE app_settings ADD COLUMN ai_profiles_json TEXT NOT NULL DEFAULT '[]';`)
  }

  if (!columnNames.has('active_ai_profile_id')) {
    db.exec(`ALTER TABLE app_settings ADD COLUMN active_ai_profile_id TEXT NOT NULL DEFAULT '';`)
  }

  if (!columnNames.has('image_model')) {
    db.exec(`ALTER TABLE app_settings ADD COLUMN image_model TEXT NOT NULL DEFAULT '';`)
  }

  if (!columnNames.has('image_api_key')) {
    db.exec(`ALTER TABLE app_settings ADD COLUMN image_api_key TEXT NOT NULL DEFAULT '';`)
  }

  if (!columnNames.has('image_base_url')) {
    db.exec(`ALTER TABLE app_settings ADD COLUMN image_base_url TEXT NOT NULL DEFAULT '';`)
  }

  if (!columnNames.has('editor_font')) {
    db.exec(`ALTER TABLE app_settings ADD COLUMN editor_font TEXT NOT NULL DEFAULT 'clear-mono';`)
  }

  if (!columnNames.has('workspace_menu_order_json')) {
    db.exec(`ALTER TABLE app_settings ADD COLUMN workspace_menu_order_json TEXT NOT NULL DEFAULT '[]';`)
  }

  if (!columnNames.has('hidden_workbench_modules_json')) {
    db.exec(`ALTER TABLE app_settings ADD COLUMN hidden_workbench_modules_json TEXT NOT NULL DEFAULT '[]';`)
  }
}

function ensureAiRunColumns(db: DatabaseSync): void {
  const columns = db.prepare(`PRAGMA table_info('ai_runs')`).all() as Array<{ name: string }>
  const columnNames = new Set(columns.map((column) => column.name))

  if (!columnNames.has('tool_calls_json')) {
    db.exec(`ALTER TABLE ai_runs ADD COLUMN tool_calls_json TEXT NOT NULL DEFAULT '[]';`)
  }

  if (!columnNames.has('usage_json')) {
    db.exec(`ALTER TABLE ai_runs ADD COLUMN usage_json TEXT NOT NULL DEFAULT '{}';`)
  }
}

function ensureChapterColumns(
  db: DatabaseSync,
  onProgress?: Parameters<typeof ensureChapterContentMetadata>[1]
): void {
  const columns = db.prepare(`PRAGMA table_info('chapters')`).all() as Array<{ name: string }>
  const columnNames = new Set(columns.map((column) => column.name))

  if (!columnNames.has('outline_item_id')) {
    db.exec(`ALTER TABLE chapters ADD COLUMN outline_item_id TEXT NOT NULL DEFAULT '';`)
  }

  if (!columnNames.has('summary')) {
    db.exec(`ALTER TABLE chapters ADD COLUMN summary TEXT NOT NULL DEFAULT '待补充章节摘要';`)
  }

  if (!columnNames.has('status')) {
    db.exec(`ALTER TABLE chapters ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';`)
  }

  if (!columnNames.has('word_target')) {
    db.exec(`ALTER TABLE chapters ADD COLUMN word_target TEXT NOT NULL DEFAULT '预估 3000字';`)
  }

  ensureChapterContentMetadata(db, onProgress)
}

function ensureProjectScopedColumns(db: DatabaseSync): void {
  const defaultProjectId =
    (
      db.prepare(`SELECT selected_project_id AS projectId FROM app_settings WHERE id = 1`).get() as
        | { projectId?: string }
        | undefined
    )?.projectId ||
    (db.prepare(`SELECT id FROM projects ORDER BY rowid ASC LIMIT 1`).get() as { id?: string } | undefined)?.id ||
    'project-1'

  const projectScopedTables = [
    'worldview_entries',
    'characters',
    'organizations',
    'scene_locations',
    'prop_items',
    'character_relationships',
    'organization_memberships',
    'inspiration_entries',
    'outline_volumes',
    'outline_items',
    'chapters',
    'chapter_versions',
    'ai_messages'
  ]

  for (const tableName of projectScopedTables) {
    const columns = db.prepare(`PRAGMA table_info('${tableName}')`).all() as Array<{ name: string }>
    const columnNames = new Set(columns.map((column) => column.name))

    if (!columnNames.has('project_id')) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN project_id TEXT NOT NULL DEFAULT '${defaultProjectId}';`)
    }
  }
}

function ensureVolumeColumns(db: DatabaseSync): void {
  const defaultVolumeId = 'volume-legacy-default'

  for (const tableName of ['outline_items', 'chapters']) {
    const columns = db.prepare(`PRAGMA table_info('${tableName}')`).all() as Array<{ name: string }>
    const columnNames = new Set(columns.map((column) => column.name))

    if (!columnNames.has('volume_id')) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN volume_id TEXT NOT NULL DEFAULT '${defaultVolumeId}';`)
    }
  }

  const outlineColumns = db.prepare(`PRAGMA table_info('outline_items')`).all() as Array<{ name: string }>
  const outlineColumnNames = new Set(outlineColumns.map((column) => column.name))
  if (!outlineColumnNames.has('status')) {
    db.exec(`ALTER TABLE outline_items ADD COLUMN status TEXT NOT NULL DEFAULT 'planned';`)
  }
}

function ensureOutlineItemColumns(db: DatabaseSync): void {
  const columns = db.prepare(`PRAGMA table_info('outline_items')`).all() as Array<{ name: string }>
  const columnNames = new Set(columns.map((column) => column.name))

  if (!columnNames.has('related_character_ids_json')) {
    db.exec(`ALTER TABLE outline_items ADD COLUMN related_character_ids_json TEXT NOT NULL DEFAULT '[]';`)
  }

  if (!columnNames.has('related_organization_ids_json')) {
    db.exec(`ALTER TABLE outline_items ADD COLUMN related_organization_ids_json TEXT NOT NULL DEFAULT '[]';`)
  }

  if (!columnNames.has('related_worldview_ids_json')) {
    db.exec(`ALTER TABLE outline_items ADD COLUMN related_worldview_ids_json TEXT NOT NULL DEFAULT '[]';`)
  }
}

/**
 * v1.27.0 视觉一致性元数据列迁移守卫（幂等）。
 * - characters / scene_locations / prop_items / projects 缺视觉列时守卫式补列。
 * - 只用 `PRAGMA table_info` 取列 → 缺则 `ALTER TABLE ADD COLUMN ... TEXT NOT NULL DEFAULT ''`；
 *   绝不做破坏性重建表（DROP / RENAME）。
 * - 旧库旧行的视觉列值默认为空串，读取侧统一回退为 null（向后兼容）。
 */
export function ensureEntityVisualColumns(db: DatabaseSync): void {
  const tables: Array<{ table: string; column: string }> = [
    { table: 'characters', column: 'visual_style_json' },
    { table: 'scene_locations', column: 'visual_context_json' },
    { table: 'prop_items', column: 'visual_context_json' },
    { table: 'projects', column: 'project_visual_style_json' }
  ]

  for (const { table, column } of tables) {
    const columns = db.prepare(`PRAGMA table_info('${table}')`).all() as Array<{ name: string }>
    const columnNames = new Set(columns.map((item) => item.name))

    if (!columnNames.has(column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT NOT NULL DEFAULT '';`)
    }
  }
}

function ensureKnowledgeDocumentSchema(db: DatabaseSync): void {
  const columns = db.prepare(`PRAGMA table_info('knowledge_documents')`).all() as Array<{ name: string }>
  const columnNames = new Set(columns.map((column) => column.name))
  const foreignKeys = db.prepare(`PRAGMA foreign_key_list('knowledge_documents')`).all() as Array<{ table: string; from: string }>
  const hasProjectIdFk = foreignKeys.some((fk) => fk.from === 'project_id')

  if (!columnNames.has('project_id')) {
    db.exec(`ALTER TABLE knowledge_documents ADD COLUMN project_id TEXT NOT NULL DEFAULT '';`)
  }

  if (hasProjectIdFk) {
    db.exec(`
      CREATE TABLE knowledge_documents__new (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_label TEXT NOT NULL,
        content TEXT NOT NULL,
        summary TEXT NOT NULL,
        keywords_json TEXT NOT NULL DEFAULT '[]',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      INSERT INTO knowledge_documents__new (id, project_id, title, source_type, source_label, content, summary, keywords_json, metadata_json, created_at, updated_at)
      SELECT id, project_id, title, source_type, source_label, content, summary, keywords_json, metadata_json, created_at, updated_at
      FROM knowledge_documents;
      DROP TABLE knowledge_documents;
      ALTER TABLE knowledge_documents__new RENAME TO knowledge_documents;
    `)
  }

  migrateKnowledgeDocumentScopes(db)
}

function ensureWorkflowDocumentColumns(db: DatabaseSync): void {
  const columns = db.prepare(`PRAGMA table_info('workflow_documents')`).all() as Array<{ name: string }>
  const columnNames = new Set(columns.map((column) => column.name))

  if (!columnNames.has('project_id')) {
    const defaultProjectId =
      (
        db.prepare(`SELECT selected_project_id AS projectId FROM app_settings WHERE id = 1`).get() as
          | { projectId?: string }
          | undefined
      )?.projectId ||
      (db.prepare(`SELECT id FROM projects ORDER BY rowid ASC LIMIT 1`).get() as { id?: string } | undefined)?.id ||
      'project-1'
    db.exec(`ALTER TABLE workflow_documents ADD COLUMN project_id TEXT NOT NULL DEFAULT '${defaultProjectId}';`)
  }

  if (!columnNames.has('volume_id')) {
    db.exec(`ALTER TABLE workflow_documents ADD COLUMN volume_id TEXT NOT NULL DEFAULT '';`)
  }

  db.exec(`
    UPDATE workflow_documents
    SET volume_id = COALESCE(
      (
        SELECT id
        FROM outline_volumes
        WHERE outline_volumes.project_id = workflow_documents.project_id
        ORDER BY sort_order ASC, rowid ASC
        LIMIT 1
      ),
      'volume-legacy-default'
    )
    WHERE COALESCE(volume_id, '') = '';
  `)
}

function ensureProjectColumns(db: DatabaseSync): void {
  const columns = db.prepare(`PRAGMA table_info('projects')`).all() as Array<{ name: string }>
  const columnNames = new Set(columns.map((column) => column.name))

  if (!columnNames.has('premise')) {
    // 保留 NULL 作为旧数据标记，读取时可从原首卷摘要兼容恢复。
    db.exec(`ALTER TABLE projects ADD COLUMN premise TEXT;`)
  }

  if (!columnNames.has('novel_length')) {
    db.exec(`ALTER TABLE projects ADD COLUMN novel_length TEXT NOT NULL DEFAULT 'long';`)
  }

  if (!columnNames.has('writing_style_preset_id')) {
    db.exec(`ALTER TABLE projects ADD COLUMN writing_style_preset_id TEXT NOT NULL DEFAULT 'cinematic-cool';`)
  }

  if (!columnNames.has('writing_style_prompt')) {
    db.exec(`ALTER TABLE projects ADD COLUMN writing_style_prompt TEXT NOT NULL DEFAULT '';`)
  }

  if (!columnNames.has('chapter_assistant_templates_json')) {
    db.exec(`ALTER TABLE projects ADD COLUMN chapter_assistant_templates_json TEXT NOT NULL DEFAULT '[]';`)
  }

  if (!columnNames.has('novel_workflow_stages_json')) {
    db.exec(`ALTER TABLE projects ADD COLUMN novel_workflow_stages_json TEXT NOT NULL DEFAULT '[]';`)
  }

  if (!columnNames.has('project_skills_json')) {
    db.exec(`ALTER TABLE projects ADD COLUMN project_skills_json TEXT NOT NULL DEFAULT '[]';`)
  }

  if (!columnNames.has('skill_policy_json')) {
    db.exec(`ALTER TABLE projects ADD COLUMN skill_policy_json TEXT NOT NULL DEFAULT '{"mode":"auto","skillIds":[]}';`)
  }

  if (!columnNames.has('target_platform')) {
    db.exec(`ALTER TABLE projects ADD COLUMN target_platform TEXT NOT NULL DEFAULT '';`)
  }

  if (!columnNames.has('cover_history_json')) {
    db.exec(`ALTER TABLE projects ADD COLUMN cover_history_json TEXT NOT NULL DEFAULT '[]';`)
  }
}

/**
 * v1.32.0 schema 3→4 破坏性迁移（幂等）：
 * - 删除参考作品库 / 改编运行两张表
 * - 重建 projects，去掉 reference_works_json 列（INSERT ... SELECT 保留其余列）
 * 迁移前由 workspace-upgrade.ts 依 schema 版本差异自动触发升级前备份。
 */
export function ensureWorkbenchDissolutionSchema(db: DatabaseSync): void {
  const columns = db
    .prepare(`PRAGMA table_info('projects')`)
    .all() as Array<{ name: string; type: string; notnull: number; dflt_value: string | null; pk: number }>
  const hasReferenceColumn = columns.some((column) => column.name === 'reference_works_json')

  const keptColumns = hasReferenceColumn
    ? columns.filter((column) => column.name !== 'reference_works_json')
    : columns
  const columnDefs = keptColumns
    .map((column) => {
      const primaryKey = column.pk ? ' PRIMARY KEY' : ''
      const notNull = column.notnull ? ' NOT NULL' : ''
      const defaultValue = column.dflt_value === null ? '' : ` DEFAULT ${column.dflt_value}`
      return `${column.name} ${column.type}${primaryKey}${notNull}${defaultValue}`
    })
    .join(',\n        ')
  const columnList = keptColumns.map((column) => column.name).join(', ')

  // ⚠️ 破坏性 DDL 必须关闭外键：`PRAGMA foreign_keys = ON` 时 DROP TABLE 会先执行隐式 DELETE FROM，
  // 经子表 `REFERENCES projects(id) ON DELETE CASCADE` 级联清空 worldview / characters / chapters 等
  // 全部项目子表数据。关闭后执行、完事恢复。
  db.exec('PRAGMA foreign_keys = OFF;')
  try {
    db.exec(`DROP TABLE IF EXISTS reference_works;`)
    db.exec(`DROP TABLE IF EXISTS adaptation_runs;`)

    if (!hasReferenceColumn) return

    db.exec(`
    CREATE TABLE projects__new (
        ${columnDefs}
      ) STRICT;
    INSERT INTO projects__new (${columnList})
      SELECT ${columnList} FROM projects;
    DROP TABLE projects;
    ALTER TABLE projects__new RENAME TO projects;
  `)
  } finally {
    db.exec('PRAGMA foreign_keys = ON;')
  }
}

async function migrateLegacyWorkspaceFile(db: DatabaseSync): Promise<void> {
  const hasProject = db.prepare('SELECT id FROM projects LIMIT 1').get() as { id: string } | undefined

  if (hasProject) {
    return
  }

  try {
    const legacyRaw = await readFile(getWorkspaceFilePath(), 'utf-8')
    const legacyPayload = JSON.parse(legacyRaw)
    writeWorkspaceSnapshot(db, normalizeWorkspacePayload(legacyPayload as LegacyWorkspacePayload))
  } catch {
    // Ignore missing or invalid legacy files and let the renderer fall back to defaults.
  }
}

export function readWorkspaceSnapshot(
  db: DatabaseSync,
  options: { includeChapterContent?: boolean } = {}
): WorkspacePayload | null {
  const includeChapterContent = options.includeChapterContent !== false
  const projectRows = db.prepare(`
    SELECT id, title, premise, genre, novel_length AS novelLength, word_count AS wordCount, last_edited AS lastEdited, cover,
      target_platform AS targetPlatform,
      cover_history_json AS coverHistoryJson,
      writing_style_preset_id AS writingStylePresetId,
      writing_style_prompt AS writingStylePrompt,
      novel_workflow_stages_json AS novelWorkflowStagesJson,
      project_skills_json AS projectSkillsJson,
      skill_policy_json AS skillPolicyJson,
      chapter_assistant_templates_json AS chapterAssistantTemplatesJson,
      project_visual_style_json AS projectVisualStyleJson
    FROM projects
    ORDER BY rowid ASC
  `).all() as Array<
    Omit<WorkspacePayload['projects'][number], 'chapterAssistantTemplates' | 'novelWorkflowStages' | 'projectSkills' | 'skillPolicy' | 'coverHistory'> & {
      coverHistoryJson?: string
      chapterAssistantTemplatesJson?: string
      novelWorkflowStagesJson?: string
      projectSkillsJson?: string
      skillPolicyJson?: string
      projectVisualStyleJson?: string
    }
  >

  const projects = projectRows.map((project) =>
    normalizeProjectRecord({
      ...project,
      coverHistory: parseJson(project.coverHistoryJson, []),
      novelWorkflowStages: parseJson(project.novelWorkflowStagesJson, []),
      projectSkills: parseJson(project.projectSkillsJson, []),
      skillPolicy: parseJson(project.skillPolicyJson, { mode: 'auto', skillIds: [] }),
      chapterAssistantTemplates: parseJson(project.chapterAssistantTemplatesJson, []),
      projectVisualStyle: parseJson(project.projectVisualStyleJson, null)
    })
  )

  if (projects.length === 0) {
    const settings = db.prepare(`
      SELECT theme, selected_project_id AS selectedProjectId, provider, api_key AS apiKey, base_url AS baseUrl, proxy_url AS proxyUrl, temperature, top_p AS topP, presence_penalty AS presencePenalty, frequency_penalty AS frequencyPenalty, auto_save_interval AS autoSaveInterval, editor_font AS editorFont
      , model, ai_profiles_json AS aiProfilesJson, active_ai_profile_id AS activeAiProfileId, image_provider AS imageProvider, image_model AS imageModel, image_api_key AS imageApiKey, image_base_url AS imageBaseUrl, ui_scale AS uiScale, workspace_menu_order_json AS workspaceMenuOrderJson, hidden_workbench_modules_json AS hiddenWorkbenchModulesJson, dark_mode AS darkMode, dark_mode_style AS darkModeStyle
      FROM app_settings
      WHERE id = 1
    `).get() as
      | {
          theme: string
          selectedProjectId: string
          provider: string
          model: string
          apiKey: string
          baseUrl: string
          proxyUrl: string
          temperature: number | null
          topP: number | null
          presencePenalty: number | null
          frequencyPenalty: number | null
          aiProfilesJson: string
          activeAiProfileId: string
          imageProvider: string
          imageModel: string
          imageApiKey: string
          imageBaseUrl: string
          autoSaveInterval: string
          editorFont: string
          uiScale: number
          workspaceMenuOrderJson: string
          hiddenWorkbenchModulesJson: string
          darkMode: number
          darkModeStyle: string
        }
      | undefined

    const coverWorkbenchHistoryRows = db.prepare(`
      SELECT id, created_at AS createdAt, cover, prompt_title AS promptTitle, prompt, summary,
        keywords_json AS keywordsJson, genre, target_platform AS targetPlatform,
        author_name AS authorName, extra_notes AS extraNotes
      FROM cover_workbench_history
      ORDER BY sort_order ASC, created_at DESC
    `).all() as Array<{
      id: string
      createdAt: string
      cover: string
      promptTitle: string
      prompt: string
      summary: string
      keywordsJson: string
      genre: string
      targetPlatform: string
      authorName: string
      extraNotes: string
    }>

    const knowledgeDocuments = db.prepare(`
      SELECT id, project_id AS projectId, title, source_type AS sourceType, source_label AS sourceLabel, content, summary,
        keywords_json AS keywordsJson, metadata_json AS metadataJson, created_at AS createdAt, updated_at AS updatedAt
      FROM knowledge_documents
      ORDER BY created_at DESC, rowid DESC
    `).all().map((row) => ({
      id: row.id as string,
      projectId: row.projectId as string,
      title: row.title as string,
      sourceType: row.sourceType as KnowledgeDocumentSourceType,
      sourceLabel: row.sourceLabel as string,
      content: row.content as string,
      summary: row.summary as string,
      keywords: parseJson(row.keywordsJson as string, [] as string[]),
      metadata: parseJson(row.metadataJson as string, {} as Record<string, unknown>),
      createdAt: row.createdAt as string,
      updatedAt: row.updatedAt as string
    })) as WorkspacePayload['knowledgeDocuments']

    const aiRuns = db.prepare(`
      SELECT project_id AS projectId, id, chapter_id AS chapterId, task, provider, model, status,
        started_at AS startedAt, finished_at AS finishedAt, duration_ms AS durationMs,
        used_knowledge_json AS usedKnowledgeJson, tool_calls_json AS toolCallsJson,
        usage_json AS usageJson, repair_triggered AS repairTriggered, error,
        response_preview AS responsePreview
      FROM global_ai_runs
      ORDER BY started_at ASC, sort_order ASC
    `).all().map((row) => ({
      projectId: row.projectId as string,
      id: row.id as string,
      chapterId: (row.chapterId as string) || undefined,
      task: row.task as string,
      provider: row.provider as string,
      model: row.model as string,
      status: row.status as WorkspaceAiRunStatus,
      startedAt: row.startedAt as string,
      finishedAt: (row.finishedAt as string) || undefined,
      durationMs: typeof row.durationMs === 'number' ? row.durationMs : undefined,
      usage: parseJson(row.usageJson as string, {} as NonNullable<WorkspaceAiRunRecord['usage']>),
      usedKnowledge: parseJson(row.usedKnowledgeJson as string, [] as WorkspaceAiRunKnowledgeItem[]),
      toolCalls: parseJson(row.toolCallsJson as string, [] as NonNullable<WorkspaceAiRunRecord['toolCalls']>),
      repairTriggered: Boolean(row.repairTriggered),
      error: row.error as string,
      responsePreview: row.responsePreview as string
    })) as WorkspacePayload['aiRuns']

    return {
      theme: settings?.theme ?? 'ocean',
      selectedProjectId: '',
      knowledgeDocuments,
      aiRuns,
      projects: [],
      workspaces: {},
      appSettings: settings
        ? {
            ...normalizeAppSettings({
              provider: settings.provider,
              model: settings.model,
              apiKey: settings.apiKey,
              baseUrl: settings.baseUrl,
              proxyUrl: settings.proxyUrl,
              temperature: settings.temperature === null ? undefined : settings.temperature,
              topP: settings.topP === null ? undefined : settings.topP,
              presencePenalty: settings.presencePenalty === null ? undefined : settings.presencePenalty,
              frequencyPenalty: settings.frequencyPenalty === null ? undefined : settings.frequencyPenalty,
              aiProfiles: parseJson(settings.aiProfilesJson, []),
              activeAiProfileId: settings.activeAiProfileId,
              imageProvider: settings.imageProvider,
              imageModel: settings.imageModel,
              imageApiKey: settings.imageApiKey,
              imageBaseUrl: settings.imageBaseUrl,
              autoSaveInterval: settings.autoSaveInterval,
              editorFont: settings.editorFont,
              uiScale: settings.uiScale,
              workspaceMenuOrder: parseJson(settings.workspaceMenuOrderJson, [] as string[]),
              hiddenWorkbenchModules: parseJson(settings.hiddenWorkbenchModulesJson, [] as string[]),
              darkMode: Boolean(settings.darkMode)
            })
          }
        : normalizeAppSettings({}),
      coverWorkbenchHistory: coverWorkbenchHistoryRows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        cover: row.cover,
        promptTitle: row.promptTitle,
        prompt: row.prompt,
        summary: row.summary,
        keywords: parseJson(row.keywordsJson, [] as string[]),
        genre: row.genre,
        targetPlatform: row.targetPlatform,
        authorName: row.authorName,
        extraNotes: row.extraNotes
      }))
    }
  }

  const worldviewEntries = db.prepare(`
    SELECT project_id AS projectId, id, type, title, content, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt
    FROM worldview_entries
    ORDER BY project_id ASC, sort_order ASC
  `).all() as Array<WorkspacePayload['workspaces'][string]['worldviewEntries'][number] & { projectId: string }>

  const characters = db.prepare(`
    SELECT project_id AS projectId, id, name, role, description, avatar, tags_json AS tagsJson,
      visual_style_json AS visualStyleJson
    FROM characters
    ORDER BY project_id ASC, rowid ASC
  `).all().map((row) => ({
    projectId: row.projectId as string,
    id: row.id as string,
    name: row.name as string,
    role: row.role as string,
    description: row.description as string,
    avatar: row.avatar as string,
    tags: parseJson(row.tagsJson as string, [] as Array<{ label: string; tone?: string }>),
    visualStyle: parseJson(row.visualStyleJson as string, null)
  })) as Array<WorkspacePayload['workspaces'][string]['characters'][number] & { projectId: string }>

  const organizations = db.prepare(`
    SELECT project_id AS projectId, id, name, type, description, motto, color, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt
    FROM organizations
    ORDER BY project_id ASC, sort_order ASC
  `).all() as Array<WorkspacePayload['workspaces'][string]['organizations'][number] & { projectId: string }>

  const characterRelationships = db.prepare(`
    SELECT project_id AS projectId, id, from_character_id AS fromCharacterId, to_character_id AS toCharacterId, type, description, intensity, created_at AS createdAt, updated_at AS updatedAt
    FROM character_relationships
    ORDER BY project_id ASC, rowid ASC
  `).all() as Array<WorkspacePayload['workspaces'][string]['characterRelationships'][number] & { projectId: string }>

  const organizationMemberships = db.prepare(`
    SELECT project_id AS projectId, id, character_id AS characterId, organization_id AS organizationId, role, notes, created_at AS createdAt, updated_at AS updatedAt
    FROM organization_memberships
    ORDER BY project_id ASC, rowid ASC
  `).all() as Array<WorkspacePayload['workspaces'][string]['organizationMemberships'][number] & { projectId: string }>

  const sceneLocations = db.prepare(`
    SELECT project_id AS projectId, id, name, type, description, tags_json AS tagsJson, color,
      sort_order AS sortOrder,
      related_character_ids_json AS relatedCharacterIdsJson,
      related_prop_ids_json AS relatedPropIdsJson,
      visual_context_json AS visualContextJson,
      created_at AS createdAt, updated_at AS updatedAt
    FROM scene_locations
    ORDER BY project_id ASC, sort_order ASC
  `).all().map((row) => ({
    projectId: row.projectId as string,
    id: row.id as string,
    name: row.name as string,
    type: row.type as string,
    description: row.description as string,
    tags: parseJson(row.tagsJson as string, [] as Array<{ label: string; tone?: string }>),
    color: row.color as string,
    sortOrder: row.sortOrder as number,
    relatedCharacterIds: parseJson(row.relatedCharacterIdsJson as string, [] as string[]),
    relatedPropIds: parseJson(row.relatedPropIdsJson as string, [] as string[]),
    visualContext: parseJson(row.visualContextJson as string, null),
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string
  })) as Array<WorkspacePayload['workspaces'][string]['sceneLocations'][number] & { projectId: string }>

  const propItems = db.prepare(`
    SELECT project_id AS projectId, id, name, type, description, owner_character_id AS ownerCharacterId,
      tags_json AS tagsJson, color, sort_order AS sortOrder,
      related_scene_ids_json AS relatedSceneIdsJson,
      related_character_ids_json AS relatedCharacterIdsJson,
      visual_context_json AS visualContextJson,
      created_at AS createdAt, updated_at AS updatedAt
    FROM prop_items
    ORDER BY project_id ASC, sort_order ASC
  `).all().map((row) => ({
    projectId: row.projectId as string,
    id: row.id as string,
    name: row.name as string,
    type: row.type as string,
    description: row.description as string,
    ownerCharacterId: row.ownerCharacterId as string,
    tags: parseJson(row.tagsJson as string, [] as Array<{ label: string; tone?: string }>),
    color: row.color as string,
    sortOrder: row.sortOrder as number,
    relatedSceneIds: parseJson(row.relatedSceneIdsJson as string, [] as string[]),
    relatedCharacterIds: parseJson(row.relatedCharacterIdsJson as string, [] as string[]),
    visualContext: parseJson(row.visualContextJson as string, null),
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string
  })) as Array<WorkspacePayload['workspaces'][string]['propItems'][number] & { projectId: string }>

  const inspirationEntries = db.prepare(`
    SELECT project_id AS projectId, id, type, title, content, tags_json AS tagsJson, source, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt
    FROM inspiration_entries
    ORDER BY project_id ASC, sort_order ASC
  `).all().map((row) => ({
    projectId: row.projectId as string,
    id: row.id as string,
    type: row.type as string,
    title: row.title as string,
    content: row.content as string,
    tags: parseJson(row.tagsJson as string, [] as string[]),
    source: ((row.source as string) === 'manual' ? 'manual' : 'ai') as 'ai' | 'manual',
    sortOrder: row.sortOrder as number,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string
  })) as Array<WorkspacePayload['workspaces'][string]['inspirationEntries'][number] & { projectId: string }>

  const outlineVolumes = db.prepare(`
    SELECT project_id AS projectId, id, title, word_target AS wordTarget, summary
    FROM outline_volumes
    ORDER BY project_id ASC, sort_order ASC
  `).all().map((row) => ({
    projectId: row.projectId as string,
    id: row.id as string,
    title: row.title as string,
    wordTarget: row.wordTarget as string,
    summary: row.summary as string
  })) as Array<WorkspacePayload['workspaces'][string]['outlineVolumes'][number] & { projectId: string }>

  const outlineItems = db.prepare(`
    SELECT project_id AS projectId, volume_id AS volumeId, id, title, word_target AS wordTarget, conflict, summary,
      related_character_ids_json AS relatedCharacterIdsJson,
      related_organization_ids_json AS relatedOrganizationIdsJson,
      related_worldview_ids_json AS relatedWorldviewIdsJson,
      status, sort_order AS sortOrder
    FROM outline_items
    ORDER BY project_id ASC, sort_order ASC
  `).all().map((row) => ({
    projectId: row.projectId as string,
    id: row.id as string,
    volumeId: row.volumeId as string,
    title: row.title as string,
    wordTarget: row.wordTarget as string,
    conflict: row.conflict as string,
    summary: row.summary as string,
    relatedCharacterIds: parseJson(row.relatedCharacterIdsJson as string, [] as string[]),
    relatedOrganizationIds: parseJson(row.relatedOrganizationIdsJson as string, [] as string[]),
    relatedWorldviewIds: parseJson(row.relatedWorldviewIdsJson as string, [] as string[]),
    status: row.status as WorkspacePayload['workspaces'][string]['outlineItems'][number]['status'],
    sortOrder: row.sortOrder as number
  })) as Array<WorkspacePayload['workspaces'][string]['outlineItems'][number] & { projectId: string }>

  const chapters = includeChapterContent
    ? db.prepare(`
        SELECT project_id AS projectId, volume_id AS volumeId, outline_item_id AS outlineItemId,
          id, title, summary, status, word_target AS wordTarget, content, sort_order AS sortOrder
        FROM chapters
        ORDER BY project_id ASC, sort_order ASC
      `).all() as unknown as Array<WorkspacePayload['workspaces'][string]['chapters'][number] & { projectId: string }>
    : db.prepare(`
        SELECT project_id AS projectId, volume_id AS volumeId, outline_item_id AS outlineItemId,
          id, title, summary, status, word_target AS wordTarget,
          content_length AS contentLength, sort_order AS sortOrder
        FROM chapters
        ORDER BY project_id ASC, sort_order ASC
      `).all().map((row) => ({
        projectId: String(row.projectId),
        volumeId: String(row.volumeId),
        outlineItemId: String(row.outlineItemId),
        sortOrder: Number(row.sortOrder),
        id: String(row.id),
        title: String(row.title),
        summary: String(row.summary),
        status: String(row.status) as WorkspacePayload['workspaces'][string]['chapters'][number]['status'],
        wordTarget: String(row.wordTarget),
        content: '',
        contentLoaded: false,
        contentLength: Number(row.contentLength ?? 0),
        contentPreview: '',
        contentEnding: ''
      })) as Array<WorkspacePayload['workspaces'][string]['chapters'][number] & { projectId: string }>

  const chapterVersions = includeChapterContent
    ? db.prepare(`
        SELECT project_id AS projectId, id, chapter_id AS chapterId, title, summary, status,
          word_target AS wordTarget, content, created_at AS createdAt
        FROM chapter_versions
        ORDER BY project_id ASC, created_at DESC, rowid DESC
      `).all() as unknown as Array<WorkspacePayload['workspaces'][string]['chapterVersions'][number] & { projectId: string }>
    : db.prepare(`
        SELECT project_id AS projectId, id, chapter_id AS chapterId, title, summary, status,
          word_target AS wordTarget, content_length AS contentLength, created_at AS createdAt
        FROM chapter_versions
        ORDER BY project_id ASC, created_at DESC, rowid DESC
      `).all().map((row) => ({
        projectId: String(row.projectId),
        id: String(row.id),
        chapterId: String(row.chapterId),
        title: String(row.title),
        summary: String(row.summary),
        status: String(row.status) as WorkspacePayload['workspaces'][string]['chapterVersions'][number]['status'],
        wordTarget: String(row.wordTarget),
        content: '',
        contentLoaded: false,
        contentLength: Number(row.contentLength ?? 0),
        createdAt: String(row.createdAt)
      })) as Array<WorkspacePayload['workspaces'][string]['chapterVersions'][number] & { projectId: string }>

  const messages = db.prepare(`
    SELECT project_id AS projectId, id, role, content
    FROM ai_messages
    ORDER BY project_id ASC, sort_order ASC
  `).all() as Array<WorkspacePayload['workspaces'][string]['messages'][number] & { projectId: string }>

  const assistantSessions = db.prepare(`
    SELECT project_id AS projectId, id, title, messages_json AS messagesJson, created_at AS createdAt, updated_at AS updatedAt
    FROM assistant_sessions
    ORDER BY project_id ASC, updated_at DESC
  `).all().map((row) => {
    const payload = parseJson(row.messagesJson as string, {} as {
      messages?: WorkspacePayload['workspaces'][string]['globalAssistantSessions'][number]['messages']
      proposal?: unknown | null
      lastProposalPrompt?: string
      lastAssistantReply?: string
      active?: boolean
    })
    return {
      projectId: row.projectId as string,
      id: row.id as string,
      title: row.title as string,
      messages: Array.isArray(payload.messages) ? payload.messages : [],
      proposal: payload.proposal ?? null,
      lastProposalPrompt: String(payload.lastProposalPrompt ?? ''),
      lastAssistantReply: String(payload.lastAssistantReply ?? ''),
      active: Boolean(payload.active),
      createdAt: row.createdAt as string,
      updatedAt: row.updatedAt as string
    }
  }) as Array<WorkspacePayload['workspaces'][string]['globalAssistantSessions'][number] & {
    projectId: string
    active: boolean
  }>

  const knowledgeDocuments = db.prepare(`
    SELECT id, project_id AS projectId, title, source_type AS sourceType, source_label AS sourceLabel, content, summary,
      keywords_json AS keywordsJson, metadata_json AS metadataJson, created_at AS createdAt, updated_at AS updatedAt
    FROM knowledge_documents
    ORDER BY created_at DESC, rowid DESC
  `).all().map((row) => ({
    id: row.id as string,
    projectId: row.projectId as string,
    title: row.title as string,
    sourceType: row.sourceType as KnowledgeDocumentSourceType,
    sourceLabel: row.sourceLabel as string,
    content: row.content as string,
    summary: row.summary as string,
    keywords: parseJson(row.keywordsJson as string, [] as string[]),
    metadata: parseJson(row.metadataJson as string, {} as Record<string, unknown>),
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string
  })) as WorkspacePayload['knowledgeDocuments']

  // 旧版本按项目存储日志；迁移到无项目外键的全局历史表，保留 project_id 作为可选上下文。
  db.exec(`
    INSERT OR IGNORE INTO global_ai_runs (
      id, project_id, chapter_id, task, provider, model, status, started_at, finished_at,
      duration_ms, used_knowledge_json, tool_calls_json, usage_json, repair_triggered,
      error, response_preview, sort_order
    )
    SELECT id, project_id, chapter_id, task, provider, model, status, started_at, finished_at,
      duration_ms, used_knowledge_json, tool_calls_json, usage_json, repair_triggered,
      error, response_preview, sort_order
    FROM ai_runs;
  `)

  const aiRuns = db.prepare(`
    SELECT project_id AS projectId, id, chapter_id AS chapterId, task, provider, model, status,
      started_at AS startedAt, finished_at AS finishedAt, duration_ms AS durationMs,
      used_knowledge_json AS usedKnowledgeJson, tool_calls_json AS toolCallsJson, usage_json AS usageJson, repair_triggered AS repairTriggered,
      error, response_preview AS responsePreview
    FROM global_ai_runs
    ORDER BY started_at ASC, sort_order ASC
  `).all().map((row) => ({
    projectId: row.projectId as string,
    id: row.id as string,
    chapterId: (row.chapterId as string) || undefined,
    task: row.task as string,
    provider: row.provider as string,
    model: row.model as string,
    status: row.status as WorkspaceAiRunStatus,
    startedAt: row.startedAt as string,
    finishedAt: (row.finishedAt as string) || undefined,
    durationMs: typeof row.durationMs === 'number' ? row.durationMs : undefined,
    usage: parseJson(row.usageJson as string, {} as NonNullable<WorkspaceAiRunRecord['usage']>),
    usedKnowledge: parseJson(row.usedKnowledgeJson as string, [] as WorkspaceAiRunKnowledgeItem[]),
    toolCalls: parseJson(row.toolCallsJson as string, [] as NonNullable<WorkspaceAiRunRecord['toolCalls']>),
    repairTriggered: Boolean(row.repairTriggered),
    error: row.error as string,
    responsePreview: row.responsePreview as string
  })) as WorkspacePayload['aiRuns']

  const workflowDocuments = db.prepare(`
    SELECT project_id AS projectId, volume_id AS volumeId, doc_key AS docKey, title, content, updated_at AS updatedAt
    FROM workflow_documents
    ORDER BY project_id ASC, volume_id ASC, sort_order ASC
  `).all() as Array<
    WorkspacePayload['workspaces'][string]['workflowDocuments'][number] & {
      projectId: string
      volumeId: string
      docKey: WorkspacePayload['workspaces'][string]['workflowDocuments'][number]['key']
    }
  >

  const plotThreads = db.prepare(`
    SELECT project_id AS projectId, id, title, description,
      opened_in_chapter_id AS openedInChapterId, status,
      closed_in_chapter_id AS closedInChapterId,
      tags_json AS tagsJson, created_at AS createdAt, updated_at AS updatedAt
    FROM plot_threads
    ORDER BY project_id ASC, created_at ASC
  `).all() as Array<{
    projectId: string
    id: string
    title: string
    description: string
    openedInChapterId: string
    status: 'open' | 'resolved'
    closedInChapterId: string
    tagsJson: string
    createdAt: string
    updatedAt: string
  }>

  const coverWorkbenchHistoryRows = db.prepare(`
    SELECT id, created_at AS createdAt, cover, prompt_title AS promptTitle, prompt, summary,
      keywords_json AS keywordsJson, genre, target_platform AS targetPlatform,
      author_name AS authorName, extra_notes AS extraNotes
    FROM cover_workbench_history
    ORDER BY sort_order ASC, created_at DESC
  `).all() as Array<{
    id: string
    createdAt: string
    cover: string
    promptTitle: string
    prompt: string
    summary: string
    keywordsJson: string
    genre: string
    targetPlatform: string
    authorName: string
    extraNotes: string
  }>

  const settings = db.prepare(`
    SELECT theme, selected_project_id AS selectedProjectId, provider, api_key AS apiKey, base_url AS baseUrl, proxy_url AS proxyUrl, temperature, top_p AS topP, presence_penalty AS presencePenalty, frequency_penalty AS frequencyPenalty, auto_save_interval AS autoSaveInterval, editor_font AS editorFont
    , model, ai_profiles_json AS aiProfilesJson, active_ai_profile_id AS activeAiProfileId, image_provider AS imageProvider, image_model AS imageModel, image_api_key AS imageApiKey, image_base_url AS imageBaseUrl, ui_scale AS uiScale, workspace_menu_order_json AS workspaceMenuOrderJson, hidden_workbench_modules_json AS hiddenWorkbenchModulesJson, dark_mode AS darkMode, dark_mode_style AS darkModeStyle
    FROM app_settings
    WHERE id = 1
  `).get() as
    | {
        theme: string
        selectedProjectId: string
        provider: string
        model: string
        apiKey: string
        baseUrl: string
        proxyUrl: string
        temperature: number | null
        topP: number | null
        presencePenalty: number | null
        frequencyPenalty: number | null
        aiProfilesJson: string
        activeAiProfileId: string
        imageProvider: string
        imageModel: string
        imageApiKey: string
        imageBaseUrl: string
        autoSaveInterval: string
        editorFont: string
        uiScale: number
        workspaceMenuOrderJson: string
        hiddenWorkbenchModulesJson: string
        darkMode: number
        darkModeStyle: string
      }
    | undefined

  if (!settings) {
    return null
  }

  // Single-pass grouping: O(n) instead of O(n*m) filter-per-project
  function groupBy<T extends { projectId: string }>(items: T[]): Map<string, T[]> {
    const map = new Map<string, T[]>()
    for (const item of items) {
      const list = map.get(item.projectId)
      if (list) list.push(item)
      else map.set(item.projectId, [item])
    }
    return map
  }

  const worldviewByProject = groupBy(worldviewEntries)
  const charactersByProject = groupBy(characters)
  const organizationsByProject = groupBy(organizations)
  const relationshipsByProject = groupBy(characterRelationships)
  const membershipsByProject = groupBy(organizationMemberships)
  const sceneLocationsByProject = groupBy(sceneLocations)
  const propItemsByProject = groupBy(propItems)
  const inspirationByProject = groupBy(inspirationEntries)
  const volumesByProject = groupBy(outlineVolumes)
  const outlineItemsByProject = groupBy(outlineItems)
  const chaptersByProject = groupBy(chapters)
  const versionsByProject = groupBy(chapterVersions)
  const messagesByProject = groupBy(messages)
  const assistantSessionsByProject = groupBy(assistantSessions)
  const plotThreadsByProject = groupBy(plotThreads)

  // workflow documents need compound key: projectId + volumeId
  const workflowByProjectVolume = new Map<string, typeof workflowDocuments>()
  for (const doc of workflowDocuments) {
    const key = `${doc.projectId}:${doc.volumeId}`
    const list = workflowByProjectVolume.get(key)
    if (list) list.push(doc)
    else workflowByProjectVolume.set(key, [doc])
  }

  const workspaces = Object.fromEntries(
    projects.map((project) => [
      project.id,
      {
        worldviewEntries: (worldviewByProject.get(project.id) ?? [])
          .map(({ projectId: _projectId, ...entry }) => entry),
        characters: (charactersByProject.get(project.id) ?? [])
          .map(({ projectId: _projectId, ...character }) => character),
        organizations: (organizationsByProject.get(project.id) ?? [])
          .map(({ projectId: _projectId, ...entry }) => entry),
        sceneLocations: (sceneLocationsByProject.get(project.id) ?? [])
          .map(({ projectId: _projectId, ...entry }) => entry),
        propItems: (propItemsByProject.get(project.id) ?? [])
          .map(({ projectId: _projectId, ...entry }) => entry),
        characterRelationships: (relationshipsByProject.get(project.id) ?? [])
          .map(({ projectId: _projectId, ...entry }) => entry),
        organizationMemberships: (membershipsByProject.get(project.id) ?? [])
          .map(({ projectId: _projectId, ...entry }) => entry),
        inspirationEntries: (inspirationByProject.get(project.id) ?? [])
          .map(({ projectId: _projectId, ...entry }) => entry),
        outlineVolumes: (volumesByProject.get(project.id) ?? [])
          .map(({ projectId: _projectId, ...volume }) => ({
            ...volume,
            workflowDocuments: (workflowByProjectVolume.get(`${project.id}:${volume.id}`) ?? [])
              .map(({ projectId: _docProjectId, volumeId: _docVolumeId, docKey: _docKey, ...document }) => ({
                ...document,
                key: _docKey
              }))
          })),
        outlineItems: (outlineItemsByProject.get(project.id) ?? [])
          .map(({ projectId: _projectId, ...item }) => item),
        chapters: (chaptersByProject.get(project.id) ?? [])
          .map(({ projectId: _projectId, ...chapter }) => chapter),
        chapterVersions: (versionsByProject.get(project.id) ?? [])
          .map(({ projectId: _projectId, ...version }) => version),
        messages: (messagesByProject.get(project.id) ?? [])
          .map(({ projectId: _projectId, ...message }) => message),
        globalAssistantSessions: (assistantSessionsByProject.get(project.id) ?? [])
          .map(({ projectId: _projectId, active: _active, ...session }) => session),
        activeGlobalAssistantSessionId:
          (assistantSessionsByProject.get(project.id) ?? []).find((session) => session.active)?.id
          ?? (assistantSessionsByProject.get(project.id) ?? [])[0]?.id
          ?? '',
        aiRuns: [],
        workflowDocuments: [],
        plotThreads: (plotThreadsByProject.get(project.id) ?? [])
          .map(({ projectId: _projectId, tagsJson, ...thread }) => ({
            ...thread,
            tags: parseJson(tagsJson, [] as string[])
          }))
      }
    ])
  ) as WorkspacePayload['workspaces']

  return {
    theme: settings.theme,
    selectedProjectId: settings.selectedProjectId,
    knowledgeDocuments,
    aiRuns,
    projects,
    workspaces,
    appSettings: {
      ...normalizeAppSettings({
        provider: settings.provider,
        model: settings.model,
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        proxyUrl: settings.proxyUrl,
        temperature: settings.temperature === null ? undefined : settings.temperature,
        topP: settings.topP === null ? undefined : settings.topP,
        presencePenalty: settings.presencePenalty === null ? undefined : settings.presencePenalty,
        frequencyPenalty: settings.frequencyPenalty === null ? undefined : settings.frequencyPenalty,
        aiProfiles: parseJson(settings.aiProfilesJson, []),
        activeAiProfileId: settings.activeAiProfileId,
        imageProvider: settings.imageProvider,
        imageModel: settings.imageModel,
        imageApiKey: settings.imageApiKey,
        imageBaseUrl: settings.imageBaseUrl,
        autoSaveInterval: settings.autoSaveInterval,
        editorFont: settings.editorFont,
        uiScale: settings.uiScale,
        workspaceMenuOrder: parseJson(settings.workspaceMenuOrderJson, [] as string[]),
        hiddenWorkbenchModules: parseJson(settings.hiddenWorkbenchModulesJson, [] as string[]),
        darkMode: Boolean(settings.darkMode)
      })
    },
    coverWorkbenchHistory: coverWorkbenchHistoryRows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      cover: row.cover,
      promptTitle: row.promptTitle,
      prompt: row.prompt,
      summary: row.summary,
      keywords: parseJson(row.keywordsJson, [] as string[]),
      genre: row.genre,
      targetPlatform: row.targetPlatform,
      authorName: row.authorName,
      extraNotes: row.extraNotes
    }))
  }
}

export function writeWorkspaceSnapshot(db: DatabaseSync, payload: WorkspacePayload): void {
  db.exec('BEGIN')
  try {
    const allIds: Record<string, Set<string>> = {
      projects: new Set(),
      worldview_entries: new Set(),
      characters: new Set(),
      organizations: new Set(),
      scene_locations: new Set(),
      prop_items: new Set(),
      character_relationships: new Set(),
      organization_memberships: new Set(),
      inspiration_entries: new Set(),
      outline_volumes: new Set(),
      outline_items: new Set(),
      chapters: new Set(),
      chapter_versions: new Set(),
      ai_messages: new Set(),
      knowledge_documents: new Set(),
      workflow_documents: new Set(),
      plot_threads: new Set(),
      assistant_sessions: new Set(),
      cover_workbench_history: new Set()
    }

    const insertProject = db.prepare(`
      INSERT INTO projects (id, title, premise, genre, novel_length, word_count, last_edited, cover, target_platform, cover_history_json, writing_style_preset_id, writing_style_prompt, novel_workflow_stages_json, project_skills_json, skill_policy_json, chapter_assistant_templates_json, project_visual_style_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        premise = excluded.premise,
        genre = excluded.genre,
        novel_length = excluded.novel_length,
        word_count = excluded.word_count,
        last_edited = excluded.last_edited,
        cover = excluded.cover,
        target_platform = excluded.target_platform,
        cover_history_json = excluded.cover_history_json,
        writing_style_preset_id = excluded.writing_style_preset_id,
        writing_style_prompt = excluded.writing_style_prompt,
        novel_workflow_stages_json = excluded.novel_workflow_stages_json,
        project_skills_json = excluded.project_skills_json,
        skill_policy_json = excluded.skill_policy_json,
        chapter_assistant_templates_json = excluded.chapter_assistant_templates_json,
        project_visual_style_json = excluded.project_visual_style_json
    `)
    for (const project of payload.projects) {
      allIds.projects.add(project.id)
      insertProject.run(
        project.id,
        project.title,
        project.premise ?? null,
        project.genre,
        project.novelLength,
        project.wordCount,
        project.lastEdited,
        project.cover,
        project.targetPlatform,
        JSON.stringify(project.coverHistory ?? []),
        project.writingStylePresetId,
        project.writingStylePrompt,
        JSON.stringify(project.novelWorkflowStages ?? []),
        JSON.stringify(project.projectSkills ?? []),
        JSON.stringify(project.skillPolicy ?? { mode: 'auto', skillIds: [] }),
        JSON.stringify(project.chapterAssistantTemplates ?? []),
        project.projectVisualStyle ? JSON.stringify(project.projectVisualStyle) : ''
      )
    }

    const insertWorldview = db.prepare(`
      INSERT OR REPLACE INTO worldview_entries (id, project_id, type, title, content, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertCharacter = db.prepare(`
      INSERT OR REPLACE INTO characters (id, project_id, name, role, description, avatar, tags_json, visual_style_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertOrganization = db.prepare(`
      INSERT OR REPLACE INTO organizations (id, project_id, name, type, description, motto, color, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertSceneLocation = db.prepare(`
      INSERT OR REPLACE INTO scene_locations (
        id, project_id, name, type, description, tags_json, color, sort_order,
        related_character_ids_json, related_prop_ids_json, created_at, updated_at, visual_context_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertPropItem = db.prepare(`
      INSERT OR REPLACE INTO prop_items (
        id, project_id, name, type, description, owner_character_id, tags_json, color, sort_order,
        related_scene_ids_json, related_character_ids_json, created_at, updated_at, visual_context_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertCharacterRelationship = db.prepare(`
      INSERT OR REPLACE INTO character_relationships (id, project_id, from_character_id, to_character_id, type, description, intensity, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertOrganizationMembership = db.prepare(`
      INSERT OR REPLACE INTO organization_memberships (id, project_id, character_id, organization_id, role, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertInspiration = db.prepare(`
      INSERT OR REPLACE INTO inspiration_entries (id, project_id, type, title, content, tags_json, source, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const {
      insertOutlineVolume,
      insertChapter,
      insertChapterVersion
    } = prepareWorkspaceHierarchyUpserts(db)

    const insertOutline = db.prepare(`
      INSERT OR REPLACE INTO outline_items (
        id, project_id, volume_id, title, word_target, conflict, summary,
        related_character_ids_json, related_organization_ids_json, related_worldview_ids_json,
        status, sort_order
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const updateChapterMetadata = db.prepare(`
      UPDATE chapters
      SET project_id = ?, volume_id = ?, outline_item_id = ?, title = ?, summary = ?, status = ?, word_target = ?, sort_order = ?
      WHERE id = ?
    `)

    const updateChapterVersionMetadata = db.prepare(`
      UPDATE chapter_versions
      SET project_id = ?, chapter_id = ?, title = ?, summary = ?, status = ?, word_target = ?, created_at = ?
      WHERE id = ?
    `)
    const insertMessage = db.prepare(`
      INSERT OR REPLACE INTO ai_messages (id, project_id, role, content, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `)

    const insertAssistantSession = db.prepare(`
      INSERT OR REPLACE INTO assistant_sessions (id, project_id, title, messages_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    const insertKnowledgeDocument = db.prepare(`
      INSERT OR REPLACE INTO knowledge_documents (id, project_id, title, source_type, source_label, content, summary, keywords_json, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertAiRun = db.prepare(`
      INSERT OR REPLACE INTO global_ai_runs (id, project_id, chapter_id, task, provider, model, status, started_at, finished_at, duration_ms, used_knowledge_json, tool_calls_json, usage_json, repair_triggered, error, response_preview, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertWorkflowDocument = db.prepare(`
      INSERT OR REPLACE INTO workflow_documents (id, project_id, volume_id, doc_key, title, content, updated_at, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertPlotThread = db.prepare(`
      INSERT OR REPLACE INTO plot_threads (id, project_id, title, description, opened_in_chapter_id, status, closed_in_chapter_id, tags_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const project of payload.projects) {
      const workspace = payload.workspaces[project.id] ?? {
        worldviewEntries: [],
        characters: [],
        organizations: [],
        sceneLocations: [],
        propItems: [],
        characterRelationships: [],
        organizationMemberships: [],
        inspirationEntries: [],
        outlineVolumes: [],
        outlineItems: [],
        chapters: [],
        chapterVersions: [],
        messages: [],
        globalAssistantSessions: [],
        activeGlobalAssistantSessionId: '',
        knowledgeDocuments: [],
        aiRuns: [],
        workflowDocuments: [],
        plotThreads: []
      }

      workspace.worldviewEntries.forEach((entry, index) => {
        allIds.worldview_entries.add(entry.id)
        insertWorldview.run(
          entry.id,
          project.id,
          entry.type,
          entry.title,
          entry.content,
          entry.sortOrder ?? index,
          entry.createdAt,
          entry.updatedAt
        )
      })

      workspace.characters.forEach((character) => {
        allIds.characters.add(character.id)
        insertCharacter.run(
          character.id,
          project.id,
          character.name,
          character.role,
          character.description,
          character.avatar,
          JSON.stringify(character.tags),
          character.visualStyle ? JSON.stringify(character.visualStyle) : ''
        )
      })

      workspace.organizations.forEach((organization, index) => {
        allIds.organizations.add(organization.id)
        insertOrganization.run(
          organization.id,
          project.id,
          organization.name,
          organization.type,
          organization.description,
          organization.motto,
          organization.color,
          organization.sortOrder ?? index,
          organization.createdAt,
          organization.updatedAt
        )
      })

      ;(workspace.sceneLocations ?? []).forEach((scene, index) => {
        allIds.scene_locations.add(scene.id)
        insertSceneLocation.run(
          scene.id,
          project.id,
          scene.name,
          scene.type,
          scene.description,
          JSON.stringify(scene.tags ?? []),
          scene.color ?? '',
          scene.sortOrder ?? index,
          JSON.stringify(scene.relatedCharacterIds ?? []),
          JSON.stringify(scene.relatedPropIds ?? []),
          scene.createdAt,
          scene.updatedAt,
          scene.visualContext ? JSON.stringify(scene.visualContext) : ''
        )
      })

      ;(workspace.propItems ?? []).forEach((prop, index) => {
        allIds.prop_items.add(prop.id)
        insertPropItem.run(
          prop.id,
          project.id,
          prop.name,
          prop.type,
          prop.description,
          prop.ownerCharacterId ?? '',
          JSON.stringify(prop.tags ?? []),
          prop.color ?? '',
          prop.sortOrder ?? index,
          JSON.stringify(prop.relatedSceneIds ?? []),
          JSON.stringify(prop.relatedCharacterIds ?? []),
          prop.createdAt,
          prop.updatedAt,
          prop.visualContext ? JSON.stringify(prop.visualContext) : ''
        )
      })

      workspace.characterRelationships.forEach((relationship) => {
        allIds.character_relationships.add(relationship.id)
        insertCharacterRelationship.run(
          relationship.id,
          project.id,
          relationship.fromCharacterId,
          relationship.toCharacterId,
          relationship.type,
          relationship.description,
          relationship.intensity,
          relationship.createdAt,
          relationship.updatedAt
        )
      })

      workspace.organizationMemberships.forEach((membership) => {
        allIds.organization_memberships.add(membership.id)
        insertOrganizationMembership.run(
          membership.id,
          project.id,
          membership.characterId,
          membership.organizationId,
          membership.role,
          membership.notes,
          membership.createdAt,
          membership.updatedAt
        )
      })

      workspace.inspirationEntries.forEach((entry, index) => {
        allIds.inspiration_entries.add(entry.id)
        insertInspiration.run(
          entry.id,
          project.id,
          entry.type,
          entry.title,
          entry.content,
          JSON.stringify(entry.tags),
          entry.source,
          entry.sortOrder ?? index,
          entry.createdAt,
          entry.updatedAt
        )
      })

      workspace.outlineVolumes.forEach((volume, index) => {
        allIds.outline_volumes.add(volume.id)
        insertOutlineVolume.run(volume.id, project.id, volume.title, volume.wordTarget, volume.summary, index)
      })

      workspace.outlineItems.forEach((item, index) => {
        allIds.outline_items.add(item.id)
        insertOutline.run(
          item.id,
          project.id,
          item.volumeId,
          item.title,
          item.wordTarget,
          item.conflict,
          item.summary,
          JSON.stringify(item.relatedCharacterIds ?? []),
          JSON.stringify(item.relatedOrganizationIds ?? []),
          JSON.stringify(item.relatedWorldviewIds ?? []),
          item.status,
          item.sortOrder ?? index
        )
      })

      workspace.chapters.forEach((chapter, index) => {
        allIds.chapters.add(chapter.id)
        if (chapter.contentLoaded === false) {
          const result = updateChapterMetadata.run(
            project.id,
            chapter.volumeId,
            chapter.outlineItemId,
            chapter.title,
            chapter.summary,
            chapter.status,
            chapter.wordTarget,
            chapter.sortOrder ?? (index + 1) * 1024,
            chapter.id
          )
          if (result.changes > 0) return
        }
        insertChapter.run(
          chapter.id,
          project.id,
          chapter.volumeId,
          chapter.outlineItemId,
          chapter.title,
          chapter.summary,
          chapter.status,
          chapter.wordTarget,
          chapter.content,
          chapter.sortOrder ?? (index + 1) * 1024
        )
      })

      workspace.chapterVersions.forEach((version) => {
        allIds.chapter_versions.add(version.id)
        if (version.contentLoaded === false) {
          const result = updateChapterVersionMetadata.run(
            project.id,
            version.chapterId,
            version.title,
            version.summary,
            version.status,
            version.wordTarget,
            version.createdAt,
            version.id
          )
          if (result.changes > 0) return
        }
        insertChapterVersion.run(
          version.id,
          project.id,
          version.chapterId,
          version.title,
          version.summary,
          version.status,
          version.wordTarget,
          version.content,
          version.createdAt
        )
      })

      workspace.messages.forEach((message, index) => {
        allIds.ai_messages.add(message.id)
        insertMessage.run(message.id, project.id, message.role, message.content, index)
      })

      const assistantSessionSources = (workspace.globalAssistantSessions ?? []).length
        ? workspace.globalAssistantSessions
        : workspace.messages.length
          ? [{
              id: `${project.id}-global-assistant-session-legacy`,
              title: '历史会话',
              messages: workspace.messages,
              proposal: null,
              lastProposalPrompt: '',
              lastAssistantReply: '',
              createdAt: project.lastEdited,
              updatedAt: project.lastEdited
            }]
          : []

      assistantSessionSources.forEach((session) => {
        allIds.assistant_sessions.add(session.id)
        insertAssistantSession.run(
          session.id,
          project.id,
          session.title,
          JSON.stringify({
            messages: session.messages ?? [],
            proposal: session.proposal ?? null,
            lastProposalPrompt: session.lastProposalPrompt ?? '',
            lastAssistantReply: session.lastAssistantReply ?? '',
            active: session.id === workspace.activeGlobalAssistantSessionId
          }),
          session.createdAt,
          session.updatedAt
        )
      })

      const volumeWorkflowSources =
        workspace.outlineVolumes.flatMap((volume) =>
          (volume.workflowDocuments ?? []).map((document, index) => ({
            volumeId: volume.id,
            document,
            sortOrder: index
          }))
        ) || []

      const fallbackWorkflowSources =
        volumeWorkflowSources.length === 0 && workspace.outlineVolumes[0]
          ? workspace.workflowDocuments.map((document, index) => ({
              volumeId: workspace.outlineVolumes[0].id,
              document,
              sortOrder: index
            }))
          : []

      ;(volumeWorkflowSources.length > 0 ? volumeWorkflowSources : fallbackWorkflowSources).forEach(
        ({ volumeId, document, sortOrder }) => {
          const docId = `${project.id}-${volumeId}-${document.key}`
          allIds.workflow_documents.add(docId)
          insertWorkflowDocument.run(
            docId,
            project.id,
            volumeId,
            document.key,
            document.title,
            document.content,
            document.updatedAt,
            sortOrder
          )
        }
      )

      ;(workspace.plotThreads ?? []).forEach((thread) => {
        allIds.plot_threads.add(thread.id)
        insertPlotThread.run(
          thread.id,
          project.id,
          thread.title,
          thread.description,
          thread.openedInChapterId ?? '',
          thread.status ?? 'open',
          thread.closedInChapterId ?? '',
          JSON.stringify(thread.tags ?? []),
          thread.createdAt,
          thread.updatedAt
        )
      })
    }

    const normalizedAppSettings = normalizeAppSettings(payload.appSettings)

    const globalKnowledgeDocuments = Array.isArray(payload.knowledgeDocuments) ? payload.knowledgeDocuments : []
    globalKnowledgeDocuments.forEach((document) => {
      allIds.knowledge_documents.add(document.id)
      insertKnowledgeDocument.run(
        document.id,
        String(document.projectId ?? ''),
        document.title,
        document.sourceType,
        document.sourceLabel,
        document.content,
        document.summary,
        JSON.stringify(document.keywords ?? []),
        JSON.stringify(document.metadata ?? {}),
        document.createdAt,
        document.updatedAt
      )
    })

    const globalAiRuns = Array.isArray(payload.aiRuns) ? payload.aiRuns : []
    globalAiRuns.forEach((run, index) => {
      insertAiRun.run(
        run.id,
        run.projectId ?? '',
        run.chapterId ?? '',
        run.task,
        run.provider,
        run.model,
        run.status,
        run.startedAt,
        run.finishedAt ?? '',
        typeof run.durationMs === 'number' ? Math.max(0, Math.round(run.durationMs)) : null,
        JSON.stringify(run.usedKnowledge ?? []),
        JSON.stringify(run.toolCalls ?? []),
        JSON.stringify(run.usage ?? {}),
        run.repairTriggered ? 1 : 0,
        run.error ?? '',
        run.responsePreview ?? '',
        index
      )
    })

    const coverWorkbenchHistory = Array.isArray(payload.coverWorkbenchHistory) ? payload.coverWorkbenchHistory : []
    if (coverWorkbenchHistory.length > 0) {
      const insertCoverHistory = db.prepare(`
        INSERT OR REPLACE INTO cover_workbench_history (id, created_at, cover, prompt_title, prompt, summary, keywords_json, genre, target_platform, author_name, extra_notes, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      coverWorkbenchHistory.forEach((item, index) => {
        allIds.cover_workbench_history.add(item.id)
        insertCoverHistory.run(
          item.id,
          item.createdAt,
          item.cover,
          item.promptTitle,
          item.prompt,
          item.summary,
          JSON.stringify(Array.isArray(item.keywords) ? item.keywords : []),
          item.genre,
          item.targetPlatform,
          item.authorName,
          item.extraNotes,
          index
        )
      })
    }

    db.prepare(`
    INSERT OR REPLACE INTO app_settings (id, theme, selected_project_id, provider, model, api_key, base_url, proxy_url, temperature, top_p, presence_penalty, frequency_penalty, ai_profiles_json, active_ai_profile_id, image_provider, image_model, image_api_key, image_base_url, auto_save_interval, editor_font, ui_scale, workspace_menu_order_json, hidden_workbench_modules_json, dark_mode, dark_mode_style)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payload.theme,
      payload.selectedProjectId,
      normalizedAppSettings.provider,
      normalizedAppSettings.model,
      normalizedAppSettings.apiKey,
      normalizedAppSettings.baseUrl,
      normalizedAppSettings.proxyUrl,
      normalizedAppSettings.temperature ?? null,
      normalizedAppSettings.topP ?? null,
      normalizedAppSettings.presencePenalty ?? null,
      normalizedAppSettings.frequencyPenalty ?? null,
      JSON.stringify(normalizedAppSettings.aiProfiles ?? []),
      normalizedAppSettings.activeAiProfileId,
      normalizedAppSettings.imageProvider,
      normalizedAppSettings.imageModel,
      normalizedAppSettings.imageApiKey,
      normalizedAppSettings.imageBaseUrl,
      normalizedAppSettings.autoSaveInterval,
      normalizedAppSettings.editorFont,
      normalizedAppSettings.uiScale,
      JSON.stringify(normalizedAppSettings.workspaceMenuOrder),
      JSON.stringify(normalizedAppSettings.hiddenWorkbenchModules ?? []),
      normalizedAppSettings.darkMode ? 1 : 0,
      normalizedAppSettings.darkModeStyle
    )

    // 删除不再存在于 payload 中的孤儿行
    for (const [table, ids] of Object.entries(allIds)) {
      const existing = db.prepare(`SELECT id FROM ${table}`).all() as Array<{ id: string }>
      const deleteStmt = db.prepare(`DELETE FROM ${table} WHERE id = ?`)
      for (const row of existing) {
        if (!ids.has(row.id)) deleteStmt.run(row.id)
      }
    }

    // 孤儿 embedding 清理
    const activeChapterIds = allIds.chapters

    const embeddingRows = db.prepare(`SELECT id, source_type, source_id FROM story_embeddings`).all() as Array<{
      id: string
      source_type: string
      source_id: string
    }>
    const deleteEmbedding = db.prepare(`DELETE FROM story_embeddings WHERE id = ?`)
    for (const row of embeddingRows) {
      const isChapterSegment = row.source_type === 'chapter_segment'
      const isReferenceSegment = row.source_type === 'reference_novel'
      // v1.32.0 参考作品库已删除：reference_novel 类 embedding 一律视为孤儿一并清理
      const orphaned = (isChapterSegment && !activeChapterIds.has(row.source_id)) || isReferenceSegment
      if (orphaned) deleteEmbedding.run(row.id)
    }

    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

function parseJson<T>(value: string | undefined, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback
  } catch {
    return fallback
  }
}

export function writeAppSettingsRow(
  db: DatabaseSync,
  settings: Partial<WorkspacePayload['appSettings']>,
  metadata: { theme: string; selectedProjectId: string }
): void {
  const normalized = normalizeAppSettings(settings)
  db.prepare(`
    INSERT INTO app_settings (id, theme, selected_project_id, provider, model, api_key, base_url, proxy_url, temperature, top_p, presence_penalty, frequency_penalty, ai_profiles_json, active_ai_profile_id, image_provider, image_model, image_api_key, image_base_url, auto_save_interval, editor_font, ui_scale, workspace_menu_order_json, hidden_workbench_modules_json, dark_mode, dark_mode_style)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      theme = excluded.theme,
      selected_project_id = excluded.selected_project_id,
      provider = excluded.provider,
      model = excluded.model,
      api_key = excluded.api_key,
      base_url = excluded.base_url,
      proxy_url = excluded.proxy_url,
      temperature = excluded.temperature,
      top_p = excluded.top_p,
      presence_penalty = excluded.presence_penalty,
      frequency_penalty = excluded.frequency_penalty,
      ai_profiles_json = excluded.ai_profiles_json,
      active_ai_profile_id = excluded.active_ai_profile_id,
      image_provider = excluded.image_provider,
      image_model = excluded.image_model,
      image_api_key = excluded.image_api_key,
      image_base_url = excluded.image_base_url,
      auto_save_interval = excluded.auto_save_interval,
      editor_font = excluded.editor_font,
      ui_scale = excluded.ui_scale,
      workspace_menu_order_json = excluded.workspace_menu_order_json,
      hidden_workbench_modules_json = excluded.hidden_workbench_modules_json,
      dark_mode = excluded.dark_mode,
      dark_mode_style = excluded.dark_mode_style
  `).run(
    metadata.theme,
    metadata.selectedProjectId,
    normalized.provider,
    normalized.model,
    normalized.apiKey,
    normalized.baseUrl,
    normalized.proxyUrl,
    normalized.temperature ?? null,
    normalized.topP ?? null,
    normalized.presencePenalty ?? null,
    normalized.frequencyPenalty ?? null,
    JSON.stringify(normalized.aiProfiles ?? []),
    normalized.activeAiProfileId,
    normalized.imageProvider,
    normalized.imageModel,
    normalized.imageApiKey,
    normalized.imageBaseUrl,
    normalized.autoSaveInterval,
    normalized.editorFont,
    normalized.uiScale,
    JSON.stringify(normalized.workspaceMenuOrder),
    JSON.stringify(normalized.hiddenWorkbenchModules ?? []),
    normalized.darkMode ? 1 : 0,
    normalized.darkModeStyle
  )
}
