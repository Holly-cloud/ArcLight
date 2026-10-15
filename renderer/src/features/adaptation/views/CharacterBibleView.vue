<script setup lang="ts">
/**
 * CharacterBibleView 子视图（PRD T17）
 * - 左侧：人物列表（含 participationCount / mainlineCardCount）
 * - 右侧：选中人物详情（dramaticFunction / protagonistImpact / 合并建议）
 * - 底部：核心关系图（≤20 条）
 * - Tone 卡：三刻度滑杆可手动覆盖 humorLevel / romanceLevel / darknessLevel
 * - 合并台账 UI：用户手动接受
 */
import { computed, ref } from 'vue'
import { Sparkles, UserPlus } from 'lucide-vue-next'
import {
  NButton,
  NCard,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NSlider,
  NSpace,
  NTag,
  useMessage
} from 'naive-ui'
import { useAppStore } from '@/stores/app'
import FeatureHelp from '@/components/FeatureHelp.vue'
import {
  runCharacterBible,
  runToneProfile
} from '@/features/adaptation/services/runAdaptationAiTask'
import {
  parseCharacterBlocks,
  parseRelationshipBlocks,
  parseToneBlocks
} from '@/features/adaptation/parsers/adaptationTagParser'
import { TONE_SCALE_DEFAULTS } from '@/features/adaptation/validateAdaptationRun'
import type {
  AdaptationCharacter,
  AdaptationRun,
  CharacterMergeEntry,
  CharacterRelationship,
  ToneProfile
} from '@/types/app'

interface Props { run: AdaptationRun }
const props = defineProps<Props>()

const appStore = useAppStore()
const message = useMessage()

const loading = ref(false)
const toneLoading = ref(false)
const error = ref('')
const toneStatus = computed(() => props.run.toneProfile?.status ?? 'fresh')

const characters = computed(() => props.run.characters ?? [])
const relationships = computed(() => (props.run.relationships ?? []).slice(0, 20))
const selectedId = ref<string>('')
const selectedCharacter = computed<AdaptationCharacter | null>(() =>
  characters.value.find((c) => c.id === selectedId.value) ?? null
)

const localTone = ref<ToneProfile | null>(null)
function ensureLocalTone(): ToneProfile {
  if (localTone.value) return localTone.value
  const seed = props.run.toneProfile ?? {
    coreTone: '',
    genrePromise: '',
    audiencePromise: '',
    emotionalPalette: [],
    narrativeVoice: '',
    pacing: '',
    conflictTemperature: '',
    dialogueStyle: '',
    humorLevel: TONE_SCALE_DEFAULTS.humorLevel,
    romanceLevel: TONE_SCALE_DEFAULTS.romanceLevel,
    darknessLevel: TONE_SCALE_DEFAULTS.darknessLevel,
    mustKeepRules: [],
    avoidRules: [],
    deviationWarnings: [],
    status: 'fresh',
    extractedAt: new Date().toISOString()
  }
  localTone.value = { ...seed }
  return localTone.value
}

function updateScale(key: 'humorLevel' | 'romanceLevel' | 'darknessLevel', value: number): void {
  const tone = ensureLocalTone()
  tone[key] = value
  appStore.updateAdaptationRun(props.run.id, { toneProfile: { ...tone, status: 'fresh' } })
}

async function runCharacters(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const response = await runCharacterBible({
      referenceWorkId: props.run.referenceWorkId,
      referenceTitle: props.run.sourceTitle,
      chapterManifest: '[]',
      sourceText: '',
      lead: props.run.leadSelection ? { name: '已选', userNote: props.run.leadSelection.userNote } : null,
      assetSynthesis: true
    })
    let parsedCharacters: AdaptationCharacter[] = []
    let parsedRelationships: CharacterRelationship[] = []
    try {
      parsedCharacters = parseCharacterBlocks(response)
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : '人物解析失败'
    }
    try {
      parsedRelationships = parseRelationshipBlocks(response)
    } catch {
      parsedRelationships = []
    }
    appStore.updateAdaptationRun(props.run.id, {
      characters: parsedCharacters,
      relationships: parsedRelationships,
      error: ''
    })
    appStore.transitionAdaptationStageState(props.run.id, 'characters', 'completed', '')
    appStore.recalculateAdaptationCharacterStats(props.run.id)
    message.success(`人物资产合成完成，共 ${parsedCharacters.length} 个角色`)
  } catch (caughtError) {
    error.value = caughtError instanceof Error ? caughtError.message : '人物资产失败'
    message.error(error.value)
  } finally {
    loading.value = false
  }
}

async function runTone(): Promise<void> {
  toneLoading.value = true
  error.value = ''
  try {
    const response = await runToneProfile({
      referenceWorkId: props.run.referenceWorkId,
      referenceTitle: props.run.sourceTitle,
      chapterManifest: '[]',
      sourceText: '',
      lead: props.run.leadSelection ? { name: '已选', userNote: props.run.leadSelection.userNote } : null
    })
    let parsedTone: ToneProfile | null = null
    try {
      parsedTone = parseToneBlocks(response)
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : '基调解析失败'
    }
    if (parsedTone) {
      parsedTone.status = 'fresh'
      appStore.updateAdaptationRun(props.run.id, { toneProfile: parsedTone })
      localTone.value = { ...parsedTone }
      appStore.transitionAdaptationStageState(props.run.id, 'tone', 'completed', '')
      message.success('全书基调已重新提取')
    }
  } catch (caughtError) {
    error.value = caughtError instanceof Error ? caughtError.message : '基调提取失败'
    message.error(error.value)
  } finally {
    toneLoading.value = false
  }
}

const mergeLedger = ref<CharacterMergeEntry[]>([])
const mergeModalOpen = ref(false)
const draftMerge = ref<CharacterMergeEntry | null>(null)

function openMergeEntry(): void {
  draftMerge.value = {
    id: `merge-${Date.now()}`,
    keepCharacterId: '',
    mergeIntoCharacterId: '',
    affectedPlotCardIds: [],
    mergeLossesAndRisks: '',
    confirmedAt: null
  }
  mergeModalOpen.value = true
}

function saveMergeEntry(): void {
  if (!draftMerge.value) return
  const entry: CharacterMergeEntry = {
    ...draftMerge.value,
    confirmedAt: new Date().toISOString()
  }
  mergeLedger.value = [...mergeLedger.value, entry]
  appStore.updateAdaptationRun(props.run.id, {
    characterMergeLedger: mergeLedger.value
  })
  mergeModalOpen.value = false
  message.success('合并建议已记录（仅作建议，不自动执行）')
}
</script>

<template>
  <div class="character-bible">
    <n-card size="small" title="Tone 卡（三刻度可手动覆盖）">
      <template #header-extra>
        <n-space>
          <FeatureHelp feature-id="tone-profile" />
          <n-tag v-if="toneStatus === 'stale'" type="warning" :bordered="false">基调已过期</n-tag>
          <n-button secondary :loading="toneLoading" @click="runTone">
            <template #icon><Sparkles :size="14" /></template>
            重新提取
          </n-button>
        </n-space>
      </template>
      <div v-if="ensureLocalTone() as ToneProfile" class="tone-scales">
        <n-form-item label="幽默浓度">
          <n-slider :value="ensureLocalTone().humorLevel" :max="100" :min="0" :step="5" @update:value="(v) => updateScale('humorLevel', v)" />
          <span>{{ ensureLocalTone().humorLevel }}</span>
        </n-form-item>
        <n-form-item label="浪漫浓度">
          <n-slider :value="ensureLocalTone().romanceLevel" :max="100" :min="0" :step="5" @update:value="(v) => updateScale('romanceLevel', v)" />
          <span>{{ ensureLocalTone().romanceLevel }}</span>
        </n-form-item>
        <n-form-item label="黑暗浓度">
          <n-slider :value="ensureLocalTone().darknessLevel" :max="100" :min="0" :step="5" @update:value="(v) => updateScale('darknessLevel', v)" />
          <span>{{ ensureLocalTone().darknessLevel }}</span>
        </n-form-item>
      </div>
    </n-card>

    <n-card size="small" title="人物资产">
      <template #header-extra>
        <n-space>
          <FeatureHelp feature-id="character-bible" />
          <n-button type="primary" :loading="loading" @click="runCharacters">
            <template #icon><Sparkles :size="14" /></template>
            AI 合成人物
          </n-button>
          <n-button secondary @click="openMergeEntry">
            <template #icon><UserPlus :size="14" /></template>
            记录合并建议
          </n-button>
        </n-space>
      </template>

      <n-alert v-if="error" type="error" :title="error" :show-icon="false" />

      <div class="character-grid">
        <aside class="character-list">
          <n-empty v-if="characters.length === 0" description="尚未合成人物" />
          <button
            v-for="character in characters"
            :key="character.id"
            type="button"
            class="character-card"
            :class="{ 'is-selected': character.id === selectedId }"
            @click="selectedId = character.id"
          >
            <strong>{{ character.name }}</strong>
            <div class="character-stats">
              <span>参与 {{ character.participationCount }}</span>
              <span>主线 {{ character.mainlineCardCount }}</span>
            </div>
          </button>
        </aside>

        <section v-if="selectedCharacter" class="character-detail">
          <h3>{{ selectedCharacter.name }}</h3>
          <p class="character-line"><strong>戏剧功能：</strong>{{ selectedCharacter.dramaticFunction || '原文未明确' }}</p>
          <p class="character-line"><strong>对主角影响：</strong>{{ selectedCharacter.protagonistImpact || '原文未明确' }}</p>
          <p class="character-line"><strong>背景：</strong>{{ selectedCharacter.background || '原文未明确' }}</p>
          <p class="character-line"><strong>目标：</strong>{{ selectedCharacter.goal || '原文未明确' }}</p>
          <p class="character-line"><strong>恐惧或弱点：</strong>{{ selectedCharacter.fearOrWeakness || '原文未明确' }}</p>
        </section>
        <n-empty v-else description="左侧选择人物查看详情" />
      </div>
    </n-card>

    <n-card size="small" title="核心关系图（≤ 20 条）">
      <n-empty v-if="relationships.length === 0" description="尚未合成关系" />
      <ul v-else class="relationship-list">
        <li v-for="rel in relationships" :key="rel.id">
          <n-tag size="tiny" :bordered="false">{{ rel.fromCharacterId }}</n-tag>
          <span> → {{ rel.type || '关联' }} → </span>
          <n-tag size="tiny" :bordered="false">{{ rel.toCharacterId }}</n-tag>
          <span> · 强度 {{ rel.intensity }}</span>
          <small v-if="rel.description"> · {{ rel.description }}</small>
        </li>
      </ul>
    </n-card>

    <n-card size="small" title="人物合并台账（仅作建议，需用户手动接受）">
      <n-empty v-if="(props.run.characterMergeLedger ?? []).length === 0" description="尚无合并记录" />
      <ul v-else class="merge-ledger">
        <li v-for="entry in (props.run.characterMergeLedger ?? [])" :key="entry.id">
          保留 <strong>{{ entry.keepCharacterId }}</strong> ↔ 合并入 <strong>{{ entry.mergeIntoCharacterId }}</strong>
          <p>损失与风险：{{ entry.mergeLossesAndRisks || '原文未明确' }}</p>
          <small>确认时间：{{ entry.confirmedAt ?? '未确认' }}</small>
        </li>
      </ul>
    </n-card>

    <n-modal v-model:show="mergeModalOpen" preset="card" title="记录合并建议" style="max-width: 560px">
      <n-form label-placement="top">
        <n-form-item label="保留角色 ID">
          <n-input v-model:value="draftMerge!.keepCharacterId" />
        </n-form-item>
        <n-form-item label="合并入角色 ID">
          <n-input v-model:value="draftMerge!.mergeIntoCharacterId" />
        </n-form-item>
        <n-form-item label="影响剧情段（剧情卡 ID 列表）">
          <n-input :value="draftMerge!.affectedPlotCardIds.join(';')" readonly />
        </n-form-item>
        <n-form-item label="损失与风险">
          <n-input v-model:value="draftMerge!.mergeLossesAndRisks" type="textarea" :rows="3" />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="mergeModalOpen = false">取消</n-button>
          <n-button type="primary" @click="saveMergeEntry">记录（仅作建议）</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
.character-bible {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tone-scales {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.character-grid {
  display: grid;
  grid-template-columns: minmax(180px, 240px) 1fr;
  gap: 10px;
  align-items: start;
}

.character-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 360px;
  overflow-y: auto;
}

.character-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  padding: 8px 10px;
  border: 1px solid var(--arc-border);
  border-radius: var(--arc-radius-md);
  background: var(--arc-bg-surface);
  cursor: pointer;
  text-align: left;
}

.character-card.is-selected {
  border-color: var(--arc-primary);
  background: var(--arc-primary-soft);
}

.character-stats {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: var(--arc-text-secondary);
}

.character-detail {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--arc-border);
  border-radius: var(--arc-radius-md);
  background: var(--arc-bg-weak);
}

.character-detail h3 {
  margin: 0;
  color: var(--arc-text-primary);
}

.character-line {
  margin: 0;
  font-size: 12px;
  color: var(--arc-text-secondary);
  line-height: 1.6;
}

.relationship-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 6px;
}

.relationship-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border: 1px solid var(--arc-border);
  border-radius: var(--arc-radius-md);
  font-size: 12px;
  color: var(--arc-text-secondary);
}

.merge-ledger {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.merge-ledger li {
  padding: 10px;
  border: 1px solid var(--arc-border);
  border-radius: var(--arc-radius-md);
  font-size: 12px;
}

.merge-ledger p {
  margin: 4px 0;
  color: var(--arc-text-secondary);
}
</style>
