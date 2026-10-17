/**
 * AI 任务名 → 中文展示名（单一来源）。
 *
 * v1.35.0 从 `components/TitlebarModelSwitcher.vue` 抽出，供「标题栏 AI 任务中心」与
 * 「Prompt 中心」共用，避免两处清单各自维护而漂移。
 */

/** 任务名 → 中文名映射；未收录的任务回退为任务名本身 */
export const TASK_LABEL_MAP: Record<string, string> = {
  'global-assistant': '全局助理',
  'global-assistant-proposal': '写回提案',
  'chapter-assistant': '章节助理',
  'chapter-first-draft': '章节初稿',
  'chapter-memo': '写作备忘',
  'chapter-audit': '章节审计',
  'chapter-repair': '章节修复',
  'chapter-humanize': '章节去 AI 味',
  'chapter-summarize': '章节摘要',
  'chapter-scene-plan': '场景规划',
  'chapter-analysis': '章节分析',
  'chapter-session-note': '写作日志',
  'story-deep-audit': '全书审计',
  'state-backfill': '状态补录',
  'assistant-intent': '意图判断',
  'assistant-action-proposal': '操作建议',
  'worldview-entry': '世界观生成',
  'worldview-enhance': '世界观补充',
  'character-card': '角色生成',
  'character-enhance': '角色补充',
  'relation-enhance': '关系补充',
  'outline-item': '大纲扩写',
  'outline-batch': '分卷补全',
  'outline-chain': '大纲链编',
  'outline-enhance': '大纲补充',
  'ranking-style-analysis': 'AI 扫榜分析',
  'ranking-idea-combinations': '扫榜脑洞生成',
  'workflow-documents': '设定导出',
  'plot-thread-detect': '伏笔检测',
  'premise-enhance': '小说简介优化',
  'project-bootstrap': '项目初始化',
  'spiral-seed': '项目核心设计',
  'spiral-expand': '角色关系与大纲扩展',
  'spiral-characters': '深度构建配角',
  'spiral-organizations': '深度构建组织',
  'spiral-relationships': '深度构建关系',
  'spiral-worldview-expand': '深度补充世界观',
  'spiral-outline': '深度构建大纲',
  'spiral-validate': '项目一致性校验',
  'inspiration-pack': '灵感整理',
  'catalog-batch': '图鉴批量生成',
  'catalog-batch:character': '角色批量生成',
  'catalog-batch:organization': '组织批量生成',
  'catalog-batch:relationship': '人物关系批量生成',
  'catalog-batch:membership': '组织成员批量生成',
  'catalog-batch:worldview': '世界观批量生成',
  'catalog-batch:inspiration': '灵感批量生成',
  'asset-extract': '资产提取',
  'asset-reextract': '资产再提取',
  'asset-visual-prompt': '视觉提示词生成',
  'novel-split-locate': '小说划分定位',
  'continuation-import-chunk': '续写导入分块',
  'continuation-import-aggregate': '续写导入汇总',
  'cover-generate': '封面生成'
}

/**
 * 解析任务的中文展示名：优先用 clientKey（前端任务注册表 key，可带子类后缀），
 * 其次用任务名，都没有则回退任务名本身。
 */
export function resolveTaskLabel(task: string, clientKey?: string): string {
  return (clientKey && TASK_LABEL_MAP[clientKey]) || TASK_LABEL_MAP[task] || task
}
