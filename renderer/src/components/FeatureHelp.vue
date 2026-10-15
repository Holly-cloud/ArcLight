<script setup lang="ts">
/**
 * FeatureHelp 公共组件（v1.25.2 新增）
 * - Q7 锁定：组件 prop 只接单个 featureId（联合类型 13 条穷举）
 * - D7 兜底：featureId 找不到时静默渲染 null（不报错、不显示兜底卡）
 * - 聚合渲染由调用方控制（v-for 渲染多个组件实例）
 * - 视觉令牌硬约束（D6）：全用 --arc-* 令牌，不写硬编码色值
 */
import { computed } from 'vue'
import { HelpCircle, Lightbulb } from 'lucide-vue-next'
import { NButton, NPopover } from 'naive-ui'
import type { PopoverPlacement } from 'naive-ui'
import { getFeatureDescription } from '@/features/help/types'
import type { FeatureId } from '@/features/help/types'

interface FeatureHelpProps {
  /** 必填：13 条联合类型之一 */
  featureId: FeatureId
  /** 可选：弹卡片位置；默认 'bottom-end'（D4） */
  placement?: PopoverPlacement
  /** 可选：Naive UI 按钮尺寸；默认 'small' */
  size?: 'tiny' | 'small' | 'medium'
}

const props = withDefaults(defineProps<FeatureHelpProps>(), {
  placement: 'bottom-end',
  size: 'small'
})

// D7 兜底：featureId 不在 13 条内 → 渲染 null
const description = computed(() => getFeatureDescription(props.featureId))
</script>

<template>
  <NPopover
    v-if="description"
    trigger="click"
    :placement="placement"
    :show-arrow="true"
    class="feature-help-popover"
  >
    <template #trigger>
      <NButton
        quaternary
        circle
        :size="size"
        aria-label="查看功能说明"
        class="feature-help-trigger"
      >
        <template #icon><HelpCircle :size="14" /></template>
      </NButton>
    </template>

    <article class="feature-help-card">
      <header class="feature-help-header">{{ description.title }}</header>
      <p class="feature-help-why">{{ description.whyItMatters }}</p>
      <hr class="feature-help-divider" />
      <section class="feature-help-concepts">
        <strong class="feature-help-concepts-title">关键概念：</strong>
        <ul class="feature-help-concepts-list">
          <li
            v-for="(concept, index) in description.keyConcepts"
            :key="index"
            class="feature-help-concept-item"
          >
            <Lightbulb :size="12" class="feature-help-concept-icon" />
            <span>{{ concept }}</span>
          </li>
        </ul>
      </section>
      <template v-if="description.docLink">
        <hr class="feature-help-divider" />
        <a
          :href="description.docLink.href"
          target="_blank"
          rel="noopener noreferrer"
          class="feature-help-doc-link"
        >
          {{ description.docLink.label }} ↗
        </a>
      </template>
    </article>
  </NPopover>
</template>

<style scoped>
.feature-help-trigger {
  color: var(--arc-text-secondary);
}

.feature-help-trigger:hover {
  color: var(--arc-text-primary);
}

/* 卡片底 / 边框 / 圆角 / 阴影全部走 --arc-* 令牌（D6） */
.feature-help-card {
  max-width: 360px;
  max-height: 280px;
  overflow-y: auto;
  padding: 12px;
  background: var(--arc-bg-surface);
  border: 1px solid var(--arc-border);
  border-radius: var(--arc-radius-md);
  box-shadow: var(--arc-shadow-md);
  color: var(--arc-text-primary);
}

.feature-help-header {
  font-size: 14px;
  font-weight: 600;
  color: var(--arc-text-primary);
  margin-bottom: 6px;
  line-height: 1.4;
}

.feature-help-why {
  font-size: 13px;
  color: var(--arc-text-secondary);
  line-height: 1.6;
  margin: 0 0 8px 0;
}

.feature-help-divider {
  border: none;
  border-top: 1px solid var(--arc-border);
  margin: 8px 0;
}

.feature-help-concepts {
  font-size: 13px;
  color: var(--arc-text-secondary);
}

.feature-help-concepts-title {
  display: block;
  margin-bottom: 4px;
  color: var(--arc-text-primary);
  font-size: 13px;
  font-weight: 600;
}

.feature-help-concepts-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.feature-help-concept-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 4px 0;
  line-height: 1.5;
}

.feature-help-concept-icon {
  color: var(--arc-primary);
  margin-top: 4px;
  flex-shrink: 0;
}

.feature-help-doc-link {
  display: inline-block;
  color: var(--arc-primary);
  font-size: 12px;
  text-decoration: none;
  margin-top: 4px;
}

.feature-help-doc-link:hover {
  text-decoration: underline;
}
</style>
