import type { FeatureDescription } from '@/features/help/types'

/**
 * v1.24 文章拆解改编（v1.25.2 功能说明数据）
 * - lead-confirmation：主角确认
 * - stage-mapping：阶段划分
 * - plot-card：剧情卡
 * - character-bible：人物圣经
 * - tone-profile：全书基调
 * - tag-protocol：自造标记协议（7 标签）
 * - dialogue-anchors：对白锚点防伪
 * - 18-gates：18 类质量门禁
 */
export const ADAPTATION_HELP: readonly FeatureDescription[] = [
  {
    id: 'lead-confirmation',
    title: '关于「主角确认」',
    whyItMatters:
      'AI 自动从原文识别候选主角，人工最终确认。解决"AI 凭印象选主角"问题。',
    keyConcepts: [
      'LeadCandidate 字段：name / role / confidence / reason',
      '证据引用强制（evidenceRefs ≥ 1 条）',
      '空候选时：原文过短 → 人工指定主角',
      '确认后下游阶段（阶段 / 剧情卡）自动 unlock'
    ],
    docLink: {
      label: '查看完整文档',
      href: '../../../../../projects/planning/feature-help-prd.md'
    }
  },
  {
    id: 'stage-mapping',
    title: '关于「阶段划分」',
    whyItMatters:
      '4-5 个阶段把长文拆为可改编单元（开端 / 发展 / 高潮 / 结局）。短剧改编的骨架。',
    keyConcepts: [
      'AdaptationStage 字段：title / sourceChapterStart~End / goal',
      '门禁 stage-count：阶段数必须在 4-5 之间',
      '阶段含 TRANSITION_HOOK（承接钩子）',
      '阶段完成时同步 TONE / BOOK_UNDERSTANDING 摘要'
    ],
    docLink: {
      label: '查看完整文档',
      href: '../../../../../projects/planning/feature-help-prd.md'
    }
  },
  {
    id: 'plot-card',
    title: '关于「剧情卡」',
    whyItMatters:
      '每阶段的具体改编卡片（功能 / 与主角关系 / 主线 / 副线），AI 生成 + 人工编辑。80 集短剧的工作量管理。',
    keyConcepts: [
      'PlotCard 字段：title / function / protagonistRelation / synopsis',
      '主线判定 helper：isMainlineProtagonistCard 四重排除',
      '覆盖率体检 + 缺口列表（按 stageId 分组）',
      '对白锚点自动降级（防伪）'
    ],
    docLink: {
      label: '查看完整文档',
      href: '../../../../../projects/planning/feature-help-prd.md'
    }
  },
  {
    id: 'character-bible',
    title: '关于「人物圣经」',
    whyItMatters:
      '人物档案 + 关系图 + 合并建议（"保留谁 / 影响剧情段 / 损失与风险"）。改编作者最痛的人物合并问题。',
    keyConcepts: [
      'AdaptationCharacter：dramaticFunction / protagonistImpact',
      '合并台账：仅作建议，需用户手动接受',
      '核心关系图（≤ 20 条边）',
      'participationCount / mainlineCardCount 实时统计'
    ],
    docLink: {
      label: '查看完整文档',
      href: '../../../../../projects/planning/feature-help-prd.md'
    }
  },
  {
    id: 'tone-profile',
    title: '关于「全书基调」',
    whyItMatters:
      'humorLevel / romanceLevel / darknessLevel 三刻度，AI 提取 + 人工覆盖。改编时统一风格。',
    keyConcepts: [
      'ToneProfile：humor / romance / darkness 三刻度滑杆',
      '门禁：基调必须经用户确认才解锁',
      '主线变更后 status = stale，强制重提取',
      '三刻度可手动覆盖，保存立即生效'
    ],
    docLink: {
      label: '查看完整文档',
      href: '../../../../../projects/planning/feature-help-prd.md'
    }
  },
  {
    id: 'tag-protocol',
    title: '关于「自造标记协议（7 标签）」',
    whyItMatters:
      '5 段 AI 任务统一以行式 KEY: value 标签返回（LEAD / STAGE / CARD / CHARACTER / RELATIONSHIP / TONE / BOOK_UNDERSTANDING），不返回标准 JSON：抗模型抖动 + 解析失败可定位行号。EVIDENCE_REFS 必填，不整批拒收。',
    keyConcepts: [
      '7 个标签：LEAD / STAGE / CARD / CHARACTER / RELATIONSHIP / TONE / BOOK_UNDERSTANDING',
      '行式 KEY: value 解析（失败定位行号）',
      'EVIDENCE_REFS 必填（拒收不整批）',
      '合法"不知道"出口：原文未明确'
    ],
    docLink: {
      label: '查看完整文档',
      href: '../../../../../projects/planning/feature-help-prd.md'
    }
  },
  {
    id: 'dialogue-anchors',
    title: '关于「对白锚点防伪」',
    whyItMatters:
      '剧情卡引用原文对白时，若 AI 把原创台词伪装为"原文对白"会被自动降级为"改编对白"。**产品诚信底线**：绝不混淆原文与原创。',
    keyConcepts: [
      '三重匹配：等值 / 双向包含 / 章节 excerpt 兜底',
      '不匹配自动降级 mode: adapted',
      '不伪造 sourceQuote',
      '产品诚信底线（绝不混淆原文 / 原创）'
    ],
    docLink: {
      label: '查看完整文档',
      href: '../../../../../projects/planning/feature-help-prd.md'
    }
  },
  {
    id: '18-gates',
    title: '关于「18 类质量门禁」',
    whyItMatters:
      '改编完成后自动覆盖 18 类质量检查（缺主角 / 阶段数不符 / 缺证据 / 主线判定错误等）。质量保障的最后一道屏障。',
    keyConcepts: [
      '18 类问题：lead-missing / stage-count / cards-empty / tone-stale',
      '主线判定 / 依赖闭包 / 18 条具体规则',
      'severity 分级（error / warning）',
      'IssuesBanner 红 / 黄徽标 + 跳转 issue code'
    ],
    docLink: {
      label: '查看完整文档',
      href: '../../../../../projects/planning/feature-help-prd.md'
    }
  }
] as const
