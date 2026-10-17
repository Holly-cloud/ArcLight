<script setup lang="ts">
// v1.33.0 资产卡「图库」区块：生成 / 预览 / 删除 / 导出 / 设基准（角色）
// - 仅 Naive UI + lucide 图标；颜色全走 --arc-* 令牌；滚动容器用 .arc-scrollbar
// - 渲染层不直接访问文件系统：显示走 arc-asset://，读写走 window.characterArc（IPC）
import { computed, ref, watch } from 'vue'
import {
  NAlert, NButton, NEmpty, NImage, NInput, NPopconfirm, NSelect, NSpin, NTag, useMessage
} from 'naive-ui'
import type { SelectOption } from 'naive-ui'
import { Download, ImagePlus, Sparkles, Star, Trash2, Upload, X } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import { toIpcPayload } from '@/utils/ipcPayload'
import FeatureHelp from '@/components/FeatureHelp.vue'
import type { AssetImageItem, AssetImageKind } from '@/types/app'
import {
  ASPECT_RATIO_OPTIONS,
  IMAGE_SIZE_OPTIONS,
  composeAssetImagePrompt,
  recommendAspectRatio,
  type AssetImagePromptAsset,
  type PromptProjectVisualStyle
} from '@/features/assetImage/composeAssetImagePrompt'
import {
  imageBadgeLabel,
  pickPrimaryImage,
  validateReferenceCount,
  validateReferenceImageSize
} from '@/features/assetImage/assetImageModel'

const props = defineProps<{
  projectId: string
  kind: AssetImageKind
  assetId: string
  assetName: string
  /** 资产视觉字段（组装提示词用）；缺省空则仅用项目风格 + 附加说明 */
  asset?: AssetImagePromptAsset | null
  /** 项目级视觉风格 */
  projectStyle?: PromptProjectVisualStyle | null
  /** 是否支持「基准立绘」（角色） */
  primaryCapable?: boolean
}>()

const appStore = useAppStore()
const message = useMessage()

const TASK_KEY = 'asset-image-generate'
const generating = computed(() => appStore.isAiTaskRunning(TASK_KEY))

/** 切到非 GRS 渠道时参考图不可用（P1 单渠道切换） */
const isGrsai = computed(() => (appStore.appSettings.imageProvider ?? '').trim() === 'grsai')

const images = computed<AssetImageItem[]>(() => appStore.getAssetImages(props.projectId, props.kind, props.assetId))
const primaryImage = computed(() => pickPrimaryImage(images.value))

const promptText = ref('')
const aspectRatio = ref(recommendAspectRatio(props.kind))
const imageSize = ref('1K')
const showCostHint = ref(true)

const aspectOptions: SelectOption[] = ASPECT_RATIO_OPTIONS.map((value) => ({ label: value, value }))
const sizeOptions: SelectOption[] = IMAGE_SIZE_OPTIONS.map((value) => ({ label: value, value }))

/** 参考图（图库选 / 本地上传），发送时转 data URL */
interface ReferenceItem {
  key: string
  /** 来自图库时的图库 id（写入图库元数据） */
  id?: string
  dataUrl: string
  label: string
}
const references = ref<ReferenceItem[]>([])
const galleryOptions = computed<SelectOption[]>(() => images.value.map((item) => ({
  label: `${item.isPrimary ? '★ ' : ''}${new Date(item.createdAt).toLocaleString()}`,
  value: item.id
})))

function recomposePrompt(): void {
  promptText.value = composeAssetImagePrompt({
    asset: props.asset ?? null,
    projectStyle: props.projectStyle ?? null
  })
}

watch(
  () => [props.projectId, props.kind, props.assetId],
  async () => {
    references.value = []
    aspectRatio.value = recommendAspectRatio(props.kind)
    recomposePrompt()
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

async function addGalleryReference(imageId: string): Promise<void> {
  if (!imageId) return
  if (references.value.some((ref) => ref.id === imageId)) return
  const check = validateReferenceCount(references.value.length + 1)
  if (!check.ok) {
    message.warning(check.message ?? '参考图数量超限')
    return
  }
  try {
    const response = await window.characterArc.readAssetImageDataUrl(imageId)
    if (!response.success || !response.dataUrl) {
      throw new Error(response.error ?? '读取参考图失败')
    }
    const sizeCheck = validateReferenceImageSize(response.dataUrl)
    if (!sizeCheck.ok) {
      message.warning(sizeCheck.message ?? '参考图体积过大')
      return
    }
    references.value = [...references.value, { key: `gallery-${imageId}`, id: imageId, dataUrl: response.dataUrl, label: '图库图' }]
  } catch (error) {
    message.error(error instanceof Error ? error.message : '读取参考图失败')
  }
}

async function addLocalReference(): Promise<void> {
  const check = validateReferenceCount(references.value.length + 1)
  if (!check.ok) {
    message.warning(check.message ?? '参考图数量超限')
    return
  }
  const response = await window.characterArc.pickReferenceImage()
  if (response.canceled) return
  if (!response.success || !response.dataUrl) {
    message.error(response.error ?? '读取参考图失败')
    return
  }
  references.value = [...references.value, { key: `local-${Date.now()}`, dataUrl: response.dataUrl, label: response.fileName || '本地图' }]
}

function removeReference(key: string): void {
  references.value = references.value.filter((ref) => ref.key !== key)
}

function clearReferences(): void {
  references.value = []
}

/** 组装发送用的参考图 data URL 与图库 id（含基准立绘自动注入） */
async function collectReferencePayload(): Promise<{ images: string[]; referenceIds: string[] }> {
  const urls: string[] = []
  const ids: string[] = []
  for (const ref of references.value) {
    urls.push(ref.dataUrl)
    if (ref.id) ids.push(ref.id)
  }
  if (isGrsai.value && props.primaryCapable && primaryImage.value && !ids.includes(primaryImage.value.id)) {
    try {
      const response = await window.characterArc.readAssetImageDataUrl(primaryImage.value.id)
      if (response.success && response.dataUrl) {
        urls.unshift(response.dataUrl)
        ids.unshift(primaryImage.value.id)
      }
    } catch {
      /* 基准立绘读取失败不阻断生成 */
    }
  }
  return { images: urls, referenceIds: ids }
}

async function handleGenerate(): Promise<void> {
  if (!props.projectId || !props.assetId) {
    message.warning('请先保存资产后再生成图像')
    return
  }
  const prompt = promptText.value.trim()
  if (!prompt) {
    message.warning('提示词不能为空')
    return
  }

  try {
    const { images: refImages, referenceIds } = await collectReferencePayload()
    await appStore.runTrackedAiTask(
      {
        key: TASK_KEY,
        kind: 'other',
        label: 'AI 生成资产图',
        description: `正在为「${props.assetName || '资产'}」渲染图像`,
        panel: 'asset-library'
      },
      async () => {
        const response = await window.characterArc.generateImage(toIpcPayload({
          settings: appStore.appSettings,
          prompt,
          projectId: props.projectId,
          assetKind: props.kind,
          assetId: props.assetId,
          images: refImages.length ? refImages : undefined,
          aspectRatio: aspectRatio.value,
          imageSize: imageSize.value,
          referenceIds,
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
  }
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
  <section class="asset-gallery arc-scrollbar">
    <div class="gallery-header">
      <span class="gallery-title">图库</span>
      <span class="gallery-count">{{ images.length }} 张</span>
      <FeatureHelp feature-id="asset-image" />
    </div>

    <n-alert
      v-if="showCostHint"
      type="warning"
      class="gallery-hint"
      closable
      @close="showCostHint = false"
    >
      生图会调用第三方服务 grsai.dakka.com.cn，按次计费（约 ¥0.02/次，失败返还）；你的描述与参考图会上传至该服务。
    </n-alert>

    <div class="gallery-toolbar">
      <n-input v-model:value="promptText" type="textarea" :autosize="{ minRows: 2, maxRows: 5 }" placeholder="生图提示词（自动组装，可编辑）" />
      <div class="gallery-toolbar-row">
        <n-select v-model:value="aspectRatio" class="toolbar-select" :options="aspectOptions" placeholder="画幅比" />
        <n-select v-model:value="imageSize" class="toolbar-select" :options="sizeOptions" placeholder="分辨率" />
        <n-button size="small" @click="recomposePrompt">重新拼装</n-button>
        <n-button size="small" type="primary" :loading="generating" @click="handleGenerate">
          <template #icon><Sparkles :size="14" /></template>
          生成
        </n-button>
      </div>
    </div>

    <div class="gallery-refs">
      <div class="refs-head">
        <span class="refs-title">参考图（图生图 / 一致性）</span>
        <span v-if="!isGrsai" class="refs-disabled-hint">当前生图渠道非 GRS AI，参考图不可用</span>
      </div>
      <div class="refs-row">
        <n-select
          class="toolbar-select"
          :options="galleryOptions"
          :disabled="!isGrsai || galleryOptions.length === 0"
          placeholder="从图库选"
          @update:value="addGalleryReference"
        />
        <n-button size="small" :disabled="!isGrsai" @click="addLocalReference">
          <template #icon><Upload :size="14" /></template>
          本地上传
        </n-button>
        <n-button size="small" :disabled="references.length === 0" @click="clearReferences">清除</n-button>
      </div>
      <div v-if="references.length" class="refs-chips">
        <n-tag v-for="ref in references" :key="ref.key" size="small" closable @close="removeReference(ref.key)">
          {{ ref.label }}
        </n-tag>
      </div>
    </div>

    <div v-if="images.length" class="gallery-grid">
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
      <n-spin v-if="generating" size="small" />
      <n-empty v-else description="该资产还没有图像，点上方「生成」创作第一张" />
    </div>
  </section>
</template>

<style scoped>
.asset-gallery {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-top: 1px solid var(--arc-border);
  margin-top: 12px;
  padding-top: 12px;
  max-height: 420px;
  overflow-y: auto;
}

.gallery-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.gallery-title {
  color: var(--arc-text-primary);
  font-size: 13px;
  font-weight: 650;
}

.gallery-count {
  color: var(--arc-text-hint);
  font-size: 12px;
}

.gallery-toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.gallery-toolbar-row,
.refs-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.toolbar-select {
  width: 140px;
}

.gallery-refs {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid var(--arc-border);
  border-radius: var(--arc-radius-md);
  background: var(--arc-bg-mix);
  padding: 8px 10px;
}

.refs-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.refs-title {
  color: var(--arc-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.refs-disabled-hint {
  color: var(--arc-text-hint);
  font-size: 11.5px;
}

.refs-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
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
  min-height: 120px;
}
</style>
