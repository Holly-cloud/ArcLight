<script setup lang="ts">
// v1.34.0 资产生图「生成选项」浮层（按钮 + 锚定 popover）
// - 位置锚定在图库头下方，不随网格数量位移（解决「图一多就被推走」）
// - 拥有本次生成的全部选项状态：提示词 / 画幅比 / 分辨率 / 参考图
// - 通过 defineExpose 暴露 getPayload()，供图库「生成立绘」按钮调用
// - 仅 Naive UI + lucide；颜色全走 --arc-* 令牌
import { computed, ref, watch } from 'vue'
import { NButton, NInput, NPopover, NSelect, NTag, useMessage } from 'naive-ui'
import type { SelectOption } from 'naive-ui'
import { RefreshCw, Settings, Upload } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import type { AssetImageItem, AssetImageKind } from '@/types/app'
import {
  ASPECT_RATIO_OPTIONS,
  IMAGE_SIZE_OPTIONS,
  resolveAssetPrompt,
  resolveDefaultAspectRatio,
  type AssetImagePromptAsset,
  type PromptProjectVisualStyle
} from '@/features/assetImage/composeAssetImagePrompt'
import {
  validateReferenceCount,
  validateReferenceImageSize
} from '@/features/assetImage/assetImageModel'
import { resolveOpenAiCompatibleSize } from '@shared/image-size'
import { isGrsaiChannel } from '@shared/image-channel'
import type { GeneratePayload } from '@/features/assetImage/generateOptions'

const props = defineProps<{
  projectId: string
  kind: AssetImageKind
  assetId: string
  /** 资产视觉字段（组装提示词用） */
  asset?: AssetImagePromptAsset | null
  /** 项目级「图片主风格」 */
  projectStyle?: PromptProjectVisualStyle | null
  /** 图库现有图像（供「从图库选」作参考图） */
  images: AssetImageItem[]
}>()

const appStore = useAppStore()
const message = useMessage()

/** 切到非 GRS 渠道时参考图不可用（P1 单渠道切换） */
const isGrsai = computed(() => (appStore.appSettings.imageProvider ?? '').trim() === 'grsai')

const promptText = ref('')
const aspectRatio = ref(resolveDefaultAspectRatio(props.kind, props.projectStyle ?? null))
const imageSize = ref('1K')

/**
 * v1.36.2：非 GRS 渠道按 OpenAI 兼容档位就近取档，实际档位必须如实显示。
 * 门控用主进程同一谓词（预设或主机名命中 GRS）——否则「自定义渠道手填 GRS 主机」时
 * 实际走 GRS 原值传参，这里却会提示"已就近取档"，等于假明示。
 * 参考图门控仍沿用上方 provider-only 判定，本版不改其行为。
 */
const openAiSizeNote = computed(() => {
  if (isGrsaiChannel(appStore.appSettings)) return ''
  const resolved = resolveOpenAiCompatibleSize(aspectRatio.value, imageSize.value)
  return resolved.applied ? resolved.note : ''
})

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
const galleryOptions = computed<SelectOption[]>(() => props.images.map((item) => ({
  label: `${item.isPrimary ? '★ ' : ''}${new Date(item.createdAt).toLocaleString()}`,
  value: item.id
})))

function recomposePrompt(): void {
  // v1.34.3：优先资产自带的「视觉提示词」，为空时才按视觉字段拼装
  promptText.value = resolveAssetPrompt(props.asset ?? null, props.projectStyle ?? null)
}

watch(
  () => [props.projectId, props.kind, props.assetId, props.projectStyle],
  () => {
    references.value = []
    aspectRatio.value = resolveDefaultAspectRatio(props.kind, props.projectStyle ?? null)
    recomposePrompt()
  },
  { immediate: true }
)

// 资产「视觉提示词」变化（人工编辑或 AI 生成）时仅刷新提示词文本，不重置画幅比 / 参考图
watch(
  () => props.asset?.visualPrompt,
  () => recomposePrompt()
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

/**
 * 组装发送用的参考图 data URL 与图库 id。
 * v1.36.0：**不再自动把「首选图」当参考图注入**——首选图只是图库排序置顶与左栏头像用图，
 * 不参与生图方向；要保持角色一致请在此手动「从图库选」。
 */
function collectReferencePayload(): { images: string[]; referenceIds: string[] } {
  const urls: string[] = []
  const ids: string[] = []
  for (const ref of references.value) {
    urls.push(ref.dataUrl)
    if (ref.id) ids.push(ref.id)
  }
  return { images: urls, referenceIds: ids }
}

/** 供图库「生成立绘」读取本次生成参数 */
function getPayload(): GeneratePayload {
  const { images, referenceIds } = collectReferencePayload()
  return {
    prompt: promptText.value.trim(),
    aspectRatio: aspectRatio.value,
    imageSize: imageSize.value,
    images,
    referenceIds
  }
}

defineExpose({ getPayload })
</script>

<template>
  <n-popover trigger="click" placement="bottom-end" :show-arrow="false" :style="{ width: '360px' }">
    <template #trigger>
      <n-button size="small">
        <template #icon><Settings :size="14" /></template>
        生成选项
      </n-button>
    </template>

    <div class="gen-options">
      <div class="gen-options__head">
        <span class="gen-options__title">生成选项</span>
        <span class="gen-options__note">本次生成（不改变全局）</span>
      </div>

      <div class="gen-options__body arc-scrollbar">
        <div class="gen-options__field">
          <span class="gen-options__label">提示词</span>
          <n-input
            v-model:value="promptText"
            type="textarea"
            :autosize="{ minRows: 3, maxRows: 6 }"
            placeholder="生图提示词（自动组装，已含负面提示词；可编辑）"
          />
        </div>

        <div class="gen-options__row">
          <n-select v-model:value="aspectRatio" class="gen-options__select" :options="aspectOptions" placeholder="画幅比" />
          <n-select v-model:value="imageSize" class="gen-options__select" :options="sizeOptions" placeholder="分辨率" />
          <n-button size="small" @click="recomposePrompt">重新拼装</n-button>
        </div>

        <p v-if="openAiSizeNote" class="gen-options__tip">{{ openAiSizeNote }}</p>

        <div class="gen-options__field">
          <div class="gen-options__field-head">
            <span class="gen-options__label">参考图（图生图 / 一致性）</span>
            <span v-if="!isGrsai" class="gen-options__hint">当前渠道非 GRS AI，参考图不可用</span>
          </div>
          <div class="gen-options__row">
            <n-select
              class="gen-options__select"
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
          <div v-if="references.length" class="gen-options__chips">
            <n-tag v-for="ref in references" :key="ref.key" size="small" closable @close="removeReference(ref.key)">
              {{ ref.label }}
            </n-tag>
          </div>
        </div>

        <p class="gen-options__tip">
          <template v-if="isGrsai">生图会调用第三方服务 grsai.dakka.com.cn，按次计费（约 ¥0.02/次，失败返还）；你的描述与参考图会上传至该服务。</template>
          <template v-else>生图会调用你在设置中配置的第三方图片服务；你的描述与参考图会上传至该服务。</template>
        </p>
      </div>
    </div>
  </n-popover>
</template>

<style scoped>
.gen-options {
  display: flex;
  flex-direction: column;
}

.gen-options__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px solid var(--arc-border);
  padding-bottom: 8px;
}

.gen-options__title {
  color: var(--arc-text-primary);
  font-size: 13px;
  font-weight: 650;
}

.gen-options__note {
  color: var(--arc-text-hint);
  font-size: 12px;
}

.gen-options__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 380px;
  overflow-y: auto;
  padding-top: 10px;
}

.gen-options__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.gen-options__field-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.gen-options__label {
  color: var(--arc-text-secondary);
  font-size: 12.5px;
}

.gen-options__row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.gen-options__select {
  width: 132px;
}

.gen-options__chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.gen-options__hint {
  color: var(--arc-text-hint);
  font-size: 11.5px;
}

.gen-options__tip {
  margin: 0;
  border: 1px dashed var(--arc-border-strong);
  border-radius: var(--arc-radius-md);
  color: var(--arc-text-hint);
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.65;
}
</style>
