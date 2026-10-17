<script setup lang="ts">
// v1.34.0 资产「图库」区块（编辑页右栏 / 编辑弹窗共用）
// - 默认态只有：网格 + 「⚙ 生成选项」浮层 + 「✦ 生成立绘」
// - 生成选项改为按钮 + 锚定浮层（位置稳定，不随网格数量位移）；移除常驻计费警告条
// - 点一次即发起受跟踪的非阻塞任务，可连点排队多张；完成后图库自动刷新
// - 仅 Naive UI + lucide 图标；颜色全走 --arc-* 令牌；滚动容器用 .arc-scrollbar
// - 渲染层不直接访问文件系统：显示走 arc-asset://，读写走 window.characterArc（IPC）
import { computed, ref, watch } from 'vue'
import { NButton, NEmpty, NImage, NPopconfirm, NSpin, NTag, useMessage } from 'naive-ui'
import { Download, Sparkles, Star, Trash2 } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import { toIpcPayload } from '@/utils/ipcPayload'
import FeatureHelp from '@/components/FeatureHelp.vue'
import AssetGenerateOptionsPopover from '@/components/assetImage/AssetGenerateOptionsPopover.vue'
import type { GeneratePayload } from '@/features/assetImage/generateOptions'
import type { AssetImageItem, AssetImageKind } from '@/types/app'
import type { AssetImagePromptAsset, PromptProjectVisualStyle } from '@/features/assetImage/composeAssetImagePrompt'
import { imageBadgeLabel } from '@/features/assetImage/assetImageModel'

const props = defineProps<{
  projectId: string
  kind: AssetImageKind
  assetId: string
  assetName: string
  /** 资产视觉字段（组装提示词用）；缺省空则仅用项目风格 + 附加说明 */
  asset?: AssetImagePromptAsset | null
  /** 项目级视觉风格（图片主风格） */
  projectStyle?: PromptProjectVisualStyle | null
  /** 是否支持「基准立绘」（角色） */
  primaryCapable?: boolean
}>()

const appStore = useAppStore()
const message = useMessage()

const optionsRef = ref<InstanceType<typeof AssetGenerateOptionsPopover> | null>(null)

const images = computed<AssetImageItem[]>(() => appStore.getAssetImages(props.projectId, props.kind, props.assetId))

/** 排队中的生成任务数（连点即排队；此项 > 0 表示有任务在跑 / 在排队） */
const queuedCount = ref(0)
/** 串行队列尾：连点排队多张，逐张串行生成（避免并发限流 / 任务标识竞争） */
let queueTail: Promise<void> = Promise.resolve()

const generateLabel = computed(() => {
  if (props.kind === 'scene') return '生成场景图'
  if (props.kind === 'prop') return '生成道具图'
  return '生成立绘'
})

watch(
  () => [props.projectId, props.kind, props.assetId],
  async () => {
    if (props.projectId && props.assetId) {
      try {
        await appStore.loadAssetImages(props.projectId, props.kind, props.assetId)
      } catch (error) {
        message.error(error instanceof Error ? error.message : '读取资产图库失败')
      }
    }
  },
  { immediate: true }
)

/** 单次生成：受跟踪的 AI 任务 + 落库 + 拉新图（失败 toast，不阻断界面） */
async function runGeneration(payload: GeneratePayload): Promise<void> {
  try {
    await appStore.runTrackedAiTask(
      {
        key: `asset-image-generate:${props.assetId}:${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kind: 'other',
        label: 'AI 生成资产图',
        description: `正在为「${props.assetName || '资产'}」渲染图像`,
        panel: 'asset-library'
      },
      async () => {
        const response = await window.characterArc.generateImage(toIpcPayload({
          settings: appStore.appSettings,
          prompt: payload.prompt,
          projectId: props.projectId,
          assetKind: props.kind,
          assetId: props.assetId,
          images: payload.images.length ? payload.images : undefined,
          aspectRatio: payload.aspectRatio,
          imageSize: payload.imageSize,
          referenceIds: payload.referenceIds,
          clientTaskId: appStore.getClientTaskId()
        }))
        if (!response.success || !response.result) {
          throw new Error(response.error ?? '图片生成失败')
        }
        const item = response.result as AssetImageItem
        if (item?.id) {
          appStore.addAssetImage(item)
        }
        return item
      }
    )
    message.success('图像已生成并加入图库')
  } catch (error) {
    message.error(error instanceof Error ? error.message : '图片生成失败')
  } finally {
    try {
      await appStore.loadAssetImages(props.projectId, props.kind, props.assetId)
    } catch {
      /* 刷新失败不阻断后续排队任务 */
    }
  }
}

/** 「生成立绘」：一键直接发起（不弹确认）；连点继续排队多张 */
function handleGenerate(): void {
  if (!props.projectId || !props.assetId) {
    message.warning('请先保存资产后再生成图像')
    return
  }
  const options = optionsRef.value
  if (!options) return

  queuedCount.value += 1
  queueTail = queueTail
    .then(async () => {
      let payload: GeneratePayload
      try {
        payload = await options.getPayload()
      } catch (error) {
        message.error(error instanceof Error ? error.message : '读取生成参数失败')
        return
      }
      if (!payload.prompt) {
        message.warning('提示词不能为空')
        return
      }
      await runGeneration(payload)
    })
    .catch(() => {
      /* runGeneration 已内部 toast，此处仅保证队列不因异常中断 */
    })
    .finally(() => {
      queuedCount.value = Math.max(0, queuedCount.value - 1)
    })
}

async function handleSetPrimary(item: AssetImageItem): Promise<void> {
  try {
    await appStore.setPrimaryAssetImage(item.id, props.projectId, props.kind, props.assetId)
    message.success('已设为基准立绘')
  } catch (error) {
    message.error(error instanceof Error ? error.message : '设置基准立绘失败')
  }
}

async function handleDelete(item: AssetImageItem): Promise<void> {
  try {
    await appStore.removeAssetImage(item.id, props.projectId, props.kind, props.assetId)
    message.success('已删除该图像')
  } catch (error) {
    message.error(error instanceof Error ? error.message : '删除资产图像失败')
  }
}

async function handleExport(item: AssetImageItem): Promise<void> {
  const ext = item.mime.includes('jpeg') || item.mime.includes('jpg')
    ? 'jpg'
    : item.mime.includes('webp') ? 'webp' : 'png'
  const response = await window.characterArc.exportAssetImage({
    imageId: item.id,
    defaultFileName: `${props.assetName || 'asset'}-${item.createdAt.slice(0, 10)}.${ext}`
  })
  if (response.canceled) return
  if (!response.success) {
    message.error(response.error ?? '导出资产图像失败')
    return
  }
  message.success('已导出图像')
}

/** 自定义协议 arc-asset:// 加载失败时的 data URL 回退表（CSP 已允许 data:） */
const protocolBlockedFallback = ref<Record<string, string>>({})

/**
 * 图库缩略图地址：优先走自定义协议 arc-asset://（渲染层不持有 base64，省内存）；
 * 若该协议被 CSP / 运行环境阻止，`handleImageError` 会回退为 IPC 读取的 data URL。
 */
function imageSrc(item: AssetImageItem): string {
  return protocolBlockedFallback.value[item.id] || `arc-asset://${item.id}`
}

/** arc-asset:// 加载失败时回退到 IPC 读图（返回 data URL），保证图库始终可见 */
async function handleImageError(item: AssetImageItem): Promise<void> {
  if (protocolBlockedFallback.value[item.id]) return
  try {
    const response = await window.characterArc.readAssetImageDataUrl(item.id)
    if (response.success && response.dataUrl) {
      protocolBlockedFallback.value = { ...protocolBlockedFallback.value, [item.id]: response.dataUrl }
    }
  } catch {
    /* 读取失败则保留占位，不阻断图库 */
  }
}
</script>

<template>
  <section class="asset-gallery">
    <div class="gallery-header">
      <span class="gallery-title">图库</span>
      <span class="gallery-count">{{ images.length }} 张</span>
      <span v-if="queuedCount > 0" class="gallery-queued">
        <n-spin size="small" />
        生成中（{{ queuedCount }}）
      </span>
      <span class="gallery-spacer" />
      <AssetGenerateOptionsPopover
        ref="optionsRef"
        :project-id="projectId"
        :kind="kind"
        :asset-id="assetId"
        :asset="asset ?? null"
        :project-style="projectStyle ?? null"
        :images="images"
        :primary-capable="primaryCapable"
      />
      <n-button type="primary" size="small" @click="handleGenerate">
        <template #icon><Sparkles :size="14" /></template>
        {{ generateLabel }}
      </n-button>
      <FeatureHelp feature-id="asset-image" />
    </div>

    <div v-if="images.length" class="gallery-grid arc-scrollbar">
      <figure v-for="item in images" :key="item.id" class="gallery-card">
        <n-image :src="imageSrc(item)" object-fit="cover" class="gallery-thumb" :alt="assetName" :on-error="() => handleImageError(item)" />
        <n-tag v-if="imageBadgeLabel(item)" class="gallery-badge" size="tiny" :type="item.status === 'failed' ? 'error' : 'warning'">
          {{ imageBadgeLabel(item) }}
        </n-tag>
        <figcaption class="gallery-actions">
          <n-button v-if="primaryCapable && !item.isPrimary" quaternary size="tiny" title="设为基准立绘" @click="handleSetPrimary(item)">
            <template #icon><Star :size="13" /></template>
          </n-button>
          <n-button quaternary size="tiny" title="导出" @click="handleExport(item)">
            <template #icon><Download :size="13" /></template>
          </n-button>
          <n-popconfirm @positive-click="handleDelete(item)">
            <template #trigger>
              <n-button quaternary size="tiny" title="删除">
                <template #icon><Trash2 :size="13" /></template>
              </n-button>
            </template>
            删除该图像（同时删除本地文件）？确定继续？
          </n-popconfirm>
        </figcaption>
      </figure>
    </div>
    <div v-else class="gallery-empty">
      <n-spin v-if="queuedCount > 0" size="small" />
      <n-empty v-else :description="`还没有图像，点「${generateLabel}」开始`" />
    </div>
  </section>
</template>

<style scoped>
.asset-gallery {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 12px;
}

.gallery-header {
  display: flex;
  align-items: center;
  gap: 9px;
}

.gallery-title {
  color: var(--arc-text-primary);
  font-size: 15px;
  font-weight: 700;
}

.gallery-count {
  color: var(--arc-text-hint);
  font-size: 12.5px;
}

.gallery-queued {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--arc-primary);
  font-size: 12.5px;
}

.gallery-spacer {
  flex: 1;
}

.gallery-grid {
  display: grid;
  min-height: 0;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  overflow-y: auto;
}

.gallery-card {
  position: relative;
  margin: 0;
  border: 1px solid var(--arc-border);
  border-radius: var(--arc-radius-md);
  overflow: hidden;
  background: var(--arc-bg-surface);
}

.gallery-thumb {
  width: 100%;
  display: block;
}

.gallery-badge {
  position: absolute;
  top: 6px;
  left: 6px;
}

.gallery-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  padding: 2px 4px;
  border-top: 1px solid var(--arc-border);
}

.gallery-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 160px;
}
</style>
