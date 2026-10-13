import type { DatabaseSync } from 'node:sqlite'

/** 世界状态库与剧情线索/人物关系卡使用不同的表，不能共用实体删除工具。 */
export const STORY_STATE_ENTITIES = {
  character_state: { table: 'story_character_state', key: 'character_id', label: '角色状态' },
  foreshadowing: { table: 'story_foreshadowing', key: 'id', label: '伏笔' },
  relationship: { table: 'story_relationships', key: 'id', label: '角色关系' },
  timeline: { table: 'story_timeline', key: 'id', label: '时间线' },
  world_rule: { table: 'story_world_rules', key: 'id', label: '世界规则' },
  countdown_clock: { table: 'story_countdown_clocks', key: 'id', label: '倒计时' }
} as const

export type StoryStateEntityType = keyof typeof STORY_STATE_ENTITIES
type StateRow = Record<string, string | number | null>

export function isStoryStateEntityType(value: unknown): value is StoryStateEntityType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(STORY_STATE_ENTITIES, value)
}

export function readStoryStateRecords(db: DatabaseSync, projectId: string, type: StoryStateEntityType, id: string): StateRow[] {
  const { table, key } = STORY_STATE_ENTITIES[type]
  return db.prepare(`SELECT * FROM ${table} WHERE project_id = ? AND ${key} = ? ORDER BY id`)
    .all(projectId, id) as StateRow[]
}

export function listStoryStateRecords(
  db: DatabaseSync, projectId: string, type: StoryStateEntityType, offset: number, limit: number
): { rows: StateRow[]; total: number } {
  const { table, key } = STORY_STATE_ENTITIES[type]
  const count = db.prepare(`SELECT COUNT(DISTINCT ${key}) AS total FROM ${table} WHERE project_id = ?`)
    .get(projectId) as { total: number }
  // 角色状态只列每人的最新状态；删除时包含其历史，避免旧状态再次出现在知识库。
  const latestOnly = type === 'character_state'
    ? `AND chapter_index = (SELECT MAX(old.chapter_index) FROM ${table} old WHERE old.project_id = current.project_id AND old.character_id = current.character_id)`
    : ''
  const rows = db.prepare(`SELECT * FROM ${table} current WHERE project_id = ? ${latestOnly} ORDER BY ${key} LIMIT ? OFFSET ?`)
    .all(projectId, limit, offset) as StateRow[]
  return { rows, total: Number(count.total) }
}

const FIELD_LABELS: Record<string, string> = {
  character_id: '角色', chapter_index: '章节', location: '位置', physical_state: '身体状态',
  mental_state: '心理状态', arc_stage: '弧光阶段', power_level: '能力', knowledge_json: '已知信息',
  inventory_json: '物品', goals_json: '目标', foreshadowing_id: '伏笔编号', type: '类型',
  description: '描述', status: '状态', planted_chapter: '埋设章节', planted_method: '埋设手法',
  payoff_chapter: '预期回收章节', resolved_chapter: '实际回收章节', clues_json: '线索',
  connections_json: '关联', relationship_id: '关系编号', participant_a: '角色甲', participant_b: '角色乙',
  current_status: '当前关系', tension_points_json: '张力', trajectory: '走向', last_interaction_chapter: '最近互动章节',
  story_date: '故事日期', events_json: '事件', world_state_changes_json: '世界变化',
  rule_id: '规则编号', rule_content: '规则内容', established_chapter: '确立章节', exceptions_json: '例外',
  must_comply: '强约束', clock_id: '倒计时编号', event_description: '事件描述', deadline_chapter: '截止章节', urgency: '紧迫程度'
}

export function renderStoryStateRecords(rows: StateRow[]): string {
  return rows.map((row) => Object.entries(row)
    .filter(([key]) => FIELD_LABELS[key])
    .map(([key, value]) => `${FIELD_LABELS[key]}：${value ?? '（空）'}`)
    .join('\n')).join('\n\n')
}

export function storyStateRecordTitle(type: StoryStateEntityType, row: StateRow): string {
  switch (type) {
    case 'character_state': return String(row.character_id)
    case 'foreshadowing': return String(row.description)
    case 'relationship': return `${row.participant_a} ⇄ ${row.participant_b}`
    case 'timeline': return `第 ${row.chapter_index} 章时间线`
    case 'world_rule': return String(row.rule_content)
    case 'countdown_clock': return String(row.event_description)
  }
}

/** 写回前核对完整记录，防止补录或其他操作更新数据后误删。 */
export function deleteStoryStateRecords(
  db: DatabaseSync, projectId: string, type: StoryStateEntityType, id: string, expectedRecords: string
): void {
  const { table, key } = STORY_STATE_ENTITIES[type]
  db.exec('BEGIN')
  try {
    const rows = readStoryStateRecords(db, projectId, type, id)
    if (!rows.length) throw new Error('世界状态条目不存在或已删除。')
    if (JSON.stringify(rows) !== expectedRecords) throw new Error('世界状态条目在暂存后已发生变化，请重新生成删除提案。')
    db.prepare(`DELETE FROM ${table} WHERE project_id = ? AND ${key} = ?`).run(projectId, id)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
