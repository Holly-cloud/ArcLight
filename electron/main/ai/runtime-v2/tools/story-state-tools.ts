import type { DatabaseSync } from 'node:sqlite'
import type { Tool } from '../../agent/tools/types'
import type { StagedChangesStore } from '../staged-changes-store'
import {
  STORY_STATE_ENTITIES, isStoryStateEntityType, listStoryStateRecords, readStoryStateRecords,
  renderStoryStateRecords, storyStateRecordTitle
} from '../../../story-state-management'

export interface StoryStateToolsDeps {
  sessionId: string
  turnId: string
  projectId: string
  stagedStore: StagedChangesStore
  ensureDb: () => Promise<DatabaseSync>
}

const ENTITY_TYPE_SCHEMA = {
  type: 'string', enum: Object.keys(STORY_STATE_ENTITIES),
  description: '世界状态类别：character_state=角色状态；foreshadowing=伏笔；relationship=角色关系；timeline=时间线；world_rule=世界规则；countdown_clock=倒计时。'
}

function readString(input: Record<string, unknown>, key: string): string {
  return typeof input[key] === 'string' ? input[key].trim() : ''
}

function readInteger(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value ?? fallback)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.trunc(number))) : fallback
}

export function makeStoryStateTools(deps: StoryStateToolsDeps): Tool[] {
  return [{
    definition: {
      name: 'read_story_state',
      description: '读取项目知识库中的世界状态库。与 plot_threads 剧情线索和 relationships 人物关系卡不同。省略 entity_type 查看分类数量；指定类别分页列出条目和 match_id；指定 match_id 精读。包含已回收/废弃伏笔和已结束倒计时。',
      inputSchema: {
        type: 'object', properties: {
          entity_type: ENTITY_TYPE_SCHEMA,
          match_id: { type: 'string', description: '本工具返回的精确目标 ID。角色状态使用角色 ID（包含全部历史状态），其他类别使用数据库记录 ID。' },
          offset: { type: 'integer', description: '分页偏移，默认 0。' },
          limit: { type: 'integer', description: '每页条数，默认 10，最多 30。' }
        }
      }
    },
    handler: async (input) => {
      const type = readString(input, 'entity_type')
      const id = readString(input, 'match_id')
      if ((type && !isStoryStateEntityType(type)) || (id && !type)) {
        return { content: '请提供有效的 entity_type；match_id 必须与类别一起使用。', isError: true }
      }
      const db = await deps.ensureDb()
      if (!isStoryStateEntityType(type)) {
        const lines = Object.entries(STORY_STATE_ENTITIES).map(([key, config]) => {
          const count = db.prepare(`SELECT COUNT(DISTINCT ${config.key}) AS total FROM ${config.table} WHERE project_id = ?`)
            .get(deps.projectId) as { total: number }
          return `${config.label}（entity_type=${key}）：${count.total}`
        })
        return { content: `项目知识库 / 世界状态库\n${lines.join('\n')}\n请指定 entity_type 读取目标类别。删除用 stage_story_state_delete，不要用 stage_plot_thread 或 stage_relationship。` }
      }
      if (id) {
        const rows = readStoryStateRecords(db, deps.projectId, type, id)
        return rows.length
          ? { content: `类别：${STORY_STATE_ENTITIES[type].label}\nmatch_id=${id}\n${renderStoryStateRecords(rows)}` }
          : { content: '当前项目中没有该世界状态条目。', isError: true }
      }
      const offset = readInteger(input.offset, 0, 0, Number.MAX_SAFE_INTEGER)
      const limit = readInteger(input.limit, 10, 1, 30)
      const { rows, total } = listStoryStateRecords(db, deps.projectId, type, offset, limit)
      const content = rows.map((row) => `match_id=${row[STORY_STATE_ENTITIES[type].key]}\n${renderStoryStateRecords([row])}`).join('\n\n')
      const next = offset + rows.length
      return { content: `${STORY_STATE_ENTITIES[type].label}：共 ${total} 条\n${content || '（空）'}${next < total ? `\nNext offset: ${next}（沿用 entity_type 和 limit）` : ''}` }
    }
  }, {
    definition: {
      name: 'stage_story_state_delete',
      description: '暂存删除项目知识库 / 世界状态库中的指定条目，不直接删除。先用 read_story_state 读取并取得 match_id。角色状态删除该角色的全部历史快照（不删除人物卡）；其他类别只删除指定记录。用户确认并写回后生效。',
      inputSchema: {
        type: 'object', properties: {
          entity_type: ENTITY_TYPE_SCHEMA,
          match_id: { type: 'string', description: 'read_story_state 返回的精确目标 ID，不能用标题或猜测 ID。' },
          reason: { type: 'string', description: '用户要求删除的依据。' }
        }, required: ['entity_type', 'match_id', 'reason']
      }
    },
    handler: async (input) => {
      const type = readString(input, 'entity_type')
      const id = readString(input, 'match_id')
      const reason = readString(input, 'reason')
      if (!isStoryStateEntityType(type) || !id || !reason) {
        return { content: '删除需要有效的 entity_type、精确的 match_id 和 reason。', isError: true }
      }
      const db = await deps.ensureDb()
      const rows = readStoryStateRecords(db, deps.projectId, type, id)
      if (!rows.length) return { content: '当前项目中没有该世界状态条目，请重新用 read_story_state 定位。', isError: true }
      const latest = type === 'character_state'
        ? rows.reduce((previous, row) => Number(row.chapter_index) > Number(previous.chapter_index) ? row : previous)
        : rows[0]
      const title = `${STORY_STATE_ENTITIES[type].label}：${storyStateRecordTitle(type, latest)}`
      const change = deps.stagedStore.add({
        sessionId: deps.sessionId, turnId: deps.turnId, kind: 'story_state', action: 'delete',
        entityId: id, entityTitle: title, reason, before: renderStoryStateRecords(rows), after: '',
        entityPayload: { entityType: type, expectedRecords: JSON.stringify(rows) }
      })
      return { content: `已暂存世界状态删除（change_id=${change.id}）：${title}。${type === 'character_state' ? `包含 ${rows.length} 个历史状态快照，不删除人物卡。` : ''}尚未删除，需用户在暂存区确认并写回。` }
    }
  }]
}
