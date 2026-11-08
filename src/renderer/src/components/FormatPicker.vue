<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { FormatChoice, MediaFormat, PresetId } from '@shared/types'
import { AUDIO_PRESETS, choiceNeedsFfmpeg, defaultChoice, formatBytes, formatDuration, presetLabel, recommendedPresets } from '@shared/ytdlp'
import { chooseDirectory, closePicker, confirmDownload, saveSettings, ui } from '../store'

const selected = ref<FormatChoice>(defaultChoice(ui.settings.formatPreference, ui.picker?.formats || []))
const presets = computed(() => recommendedPresets(ui.picker?.formats || []))
const outputDir = ref(ui.settings.downloadDir)
const starting = ref(false)
const localError = ref('')
const showAdvancedFormats = ref(false)

watch(
  () => [ui.picker?.url, ui.picker?.formats] as const,
  () => {
    selected.value = defaultChoice(ui.settings.formatPreference, ui.picker?.formats || [])
    outputDir.value = ui.settings.downloadDir
    localError.value = ''
    showAdvancedFormats.value =
      selected.value.kind === 'preset' && !!selected.value.preset && AUDIO_PRESETS.includes(selected.value.preset)
  }
)

watch(presets, (list) => {
  if (selected.value.kind !== 'preset') return
  const id = selected.value.preset
  if (!id || list.includes(id) || AUDIO_PRESETS.includes(id)) return
  selected.value = defaultChoice(ui.settings.formatPreference, ui.picker?.formats || [])
})

const videos = computed(() => (ui.picker?.formats || []).filter((item) => item.kind !== 'audio'))
const audios = computed(() => (ui.picker?.formats || []).filter((item) => item.kind === 'audio'))
const needsFfmpeg = computed(() => choiceNeedsFfmpeg(selected.value))
const ffmpegMissing = computed(() => needsFfmpeg.value && ui.binaries.ffmpeg.source === 'missing')


function pickPreset(preset: PresetId): void {
  selected.value = { kind: 'preset', preset, label: presetLabel(preset) }
}

function pickFormat(format: MediaFormat): void {
  selected.value = {
    kind: 'id',
    formatId: format.formatId,
    mergeAudio: format.mergeAudio,
    ext: format.ext,
    label: simpleFormatTitle(format)
  }
}

function isPreset(preset: PresetId): boolean {
  return selected.value.kind === 'preset' && selected.value.preset === preset
}

function isFormat(id: string): boolean {
  return selected.value.kind === 'id' && selected.value.formatId === id
}

function simpleFormatTitle(format: MediaFormat): string {
  const bits: string[] = []
  if (format.kind === 'audio') {
    bits.push((format.ext || '音频').toUpperCase())
    if (format.tbr) bits.push(`${Math.round(format.tbr)} kbps`)
  } else {
    if (format.height) {
      bits.push(`${format.height}p${format.fps && format.fps > 30 ? format.fps : ''}`)
    } else {
      bits.push('视频')
    }
    if (format.ext) bits.push(format.ext.toUpperCase())
    if (format.mergeAudio) bits.push('需合并音轨')
  }
  const size = formatBytes(format.filesize)
  if (size) bits.push(size)
  return bits.join(' · ')
}

function simpleFormatHint(format: MediaFormat): string {
  if (format.kind === 'audio') return '音频'
  if (format.mergeAudio) return '视频轨'
  return '完整文件'
}

async function browse(): Promise<void> {
  const picked = await chooseDirectory()
  if (picked) outputDir.value = picked
}

async function makeDefault(): Promise<void> {
  if (!outputDir.value.trim()) return
  await saveSettings({ downloadDir: outputDir.value.trim() })
}

async function start(): Promise<void> {
  starting.value = true
  localError.value = ''
  try {
    await confirmDownload(selected.value, outputDir.value)
  } catch (error) {
    localError.value = error instanceof Error ? error.message : '无法开始下载'
  } finally {
    starting.value = false
  }
}
</script>

<template>
  <section v-if="ui.picker" class="picker">
    <div class="picker-head">
      <h2>{{ ui.picker.loading ? '正在读取可用格式…' : ui.picker.resultTitle }}</h2>
      <button class="text-btn" type="button" @click="closePicker">返回</button>
    </div>
    <p class="sub">
      <template v-if="ui.picker.extractor">{{ ui.picker.extractor }}</template>
      <template v-if="ui.picker.duration"> · 时长 {{ formatDuration(ui.picker.duration) }}</template>
      <template v-if="!ui.picker.extractor && !ui.picker.duration">选择画质或音频后开始</template>
    </p>
    <p v-if="ui.picker.error" class="banner error">{{ ui.picker.error }}</p>

    <div v-if="ui.picker.loading" class="empty"><p>正在解析这个页面，通常需要几秒到半分钟。</p></div>

    <template v-else>
      <div class="group-label">推荐</div>
      <div class="choices">
        <button v-for="preset in presets" :key="preset" class="choice" :class="{ selected: isPreset(preset) }" type="button" @click="pickPreset(preset)">
          <span class="choice-title">{{ presetLabel(preset) }}</span>
        </button>
      </div>

      <details class="picker-advanced" :open="showAdvancedFormats" @toggle="showAdvancedFormats = ($event.target as HTMLDetailsElement).open">
        <summary>高级 · 手动选格式</summary>

        <div class="group-label">仅音频</div>
        <div class="choices">
          <button v-for="preset in AUDIO_PRESETS" :key="preset" class="choice" :class="{ selected: isPreset(preset) }" type="button" @click="pickPreset(preset)">
            <span class="choice-title">{{ presetLabel(preset) }}</span>
          </button>
        </div>

        <template v-if="videos.length">
          <div class="group-label">视频</div>
          <div class="choices">
            <button v-for="format in videos" :key="format.formatId" class="choice" :class="{ selected: isFormat(format.formatId) }" type="button" @click="pickFormat(format)">
              <span class="choice-title">{{ simpleFormatTitle(format) }}</span>
              <small>{{ simpleFormatHint(format) }}</small>
            </button>
          </div>
        </template>

        <template v-if="audios.length">
          <div class="group-label">音轨格式</div>
          <div class="choices">
            <button v-for="format in audios" :key="format.formatId" class="choice" :class="{ selected: isFormat(format.formatId) }" type="button" @click="pickFormat(format)">
              <span class="choice-title">{{ simpleFormatTitle(format) }}</span>
              <small>{{ simpleFormatHint(format) }}</small>
            </button>
          </div>
        </template>
      </details>

      <div class="dir-row">
        <input v-model="outputDir" aria-label="保存目录" spellcheck="false" />
        <button class="btn dir-browse" type="button" @click="browse">更改</button>
      </div>
      <p v-if="outputDir && outputDir !== ui.settings.downloadDir" class="hint">
        仅这次任务使用该目录。
        <button class="linkish" type="button" @click="makeDefault">设为默认</button>
      </p>
      <p v-if="ffmpegMissing" class="warn">合并或转码需要转码引擎。当前未就绪，这个选项可能会失败。</p>
      <p v-if="localError" class="task-error">{{ localError }}</p>
<div class="picker-actions">
        <button class="btn-ghost picker-cancel" type="button" @click="closePicker">取消</button>
        <button class="btn-primary" type="button" :disabled="starting || !outputDir.trim()" @click="start">开始下载</button>
      </div>
    </template>
  </section>
</template>
