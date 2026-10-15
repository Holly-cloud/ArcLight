<script setup lang="ts">
/**
 * IssuesBanner 公共组件（PRD T12）
 * - 接 issues: AdaptationIssue[] + onJumpIssue 事件
 * - 红/黄徽标按 severity 分组
 * - 仅用 --arc-* + Naive UI；不写硬编码色值
 */
import { computed } from 'vue'
import { AlertTriangle, ShieldAlert } from 'lucide-vue-next'
import { NAlert, NEmpty, NSpace, NTag } from 'naive-ui'
import type { AdaptationIssue } from '@/features/adaptation/validateAdaptationRun'

interface Props {
  issues: AdaptationIssue[]
  /** 当为空数组时是否显示"门禁已通过"绿色提示 */
  showPassedHint?: boolean
  /** 是否展示头部说明 */
  showHeader?: boolean
}

interface Emits {
  (event: 'jumpIssue', issueId: string): void
}

const props = withDefaults(defineProps<Props>(), {
  showPassedHint: true,
  showHeader: true
})
const emit = defineEmits<Emits>()

const grouped = computed(() => {
  const errors: AdaptationIssue[] = []
  const warnings: AdaptationIssue[] = []
  for (const issue of props.issues) {
    if (issue.severity === 'error') errors.push(issue)
    else warnings.push(issue)
  }
  return { errors, warnings }
})

function severityLabel(severity: AdaptationIssue['severity']): string {
  return severity === 'error' ? '错误' : '警告'
}

function onIssueClick(issue: AdaptationIssue): void {
  emit('jumpIssue', issue.code)
}
</script>

<template>
  <div class="issues-banner">
    <div v-if="props.showHeader" class="issues-banner-header">
      <strong>门禁问题</strong>
      <n-space size="small">
        <n-tag :bordered="false" type="error" size="small">
          错误 {{ grouped.errors.length }}
        </n-tag>
        <n-tag :bordered="false" type="warning" size="small">
          警告 {{ grouped.warnings.length }}
        </n-tag>
      </n-space>
    </div>

    <n-empty
      v-if="props.issues.length === 0 && props.showPassedHint"
      description="当前阶段无门禁问题"
      size="small"
    />

    <div v-else class="issues-banner-list">
      <n-alert
        v-for="issue in grouped.errors"
        :key="`${issue.code}-error`"
        type="error"
        :show-icon="false"
        class="issues-banner-item"
      >
        <template #header>
          <div class="issues-banner-item-header">
            <span class="issues-banner-item-title">
              <ShieldAlert :size="14" />
              {{ severityLabel(issue.severity) }} · {{ issue.code }}
            </span>
            <a class="issues-banner-item-link" @click.prevent="onIssueClick(issue)" href="#">
              跳转
            </a>
          </div>
        </template>
        {{ issue.message }}
      </n-alert>
      <n-alert
        v-for="issue in grouped.warnings"
        :key="`${issue.code}-warning`"
        type="warning"
        :show-icon="false"
        class="issues-banner-item"
      >
        <template #header>
          <div class="issues-banner-item-header">
            <span class="issues-banner-item-title">
              <AlertTriangle :size="14" />
              {{ severityLabel(issue.severity) }} · {{ issue.code }}
            </span>
            <a class="issues-banner-item-link" @click.prevent="onIssueClick(issue)" href="#">
              跳转
            </a>
          </div>
        </template>
        {{ issue.message }}
      </n-alert>
    </div>
  </div>
</template>

<style scoped>
.issues-banner {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.issues-banner-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.issues-banner-header strong {
  color: var(--arc-text-primary);
  font-size: 13px;
}

.issues-banner-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.issues-banner-item {
  border: 1px solid var(--arc-border);
}

.issues-banner-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.issues-banner-item-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--arc-text-primary);
  font-weight: 600;
  font-size: 13px;
}

.issues-banner-item-link {
  color: var(--arc-primary);
  font-size: 12px;
  text-decoration: none;
  cursor: pointer;
}

.issues-banner-item-link:hover {
  text-decoration: underline;
}
</style>
