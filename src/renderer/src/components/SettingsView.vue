<script setup lang="ts">
import { reactive, watch } from 'vue'
import type { Settings } from '@shared/types'
import WindowControls from './WindowControls.vue'
import { chooseDirectory, saveSettings, ui } from '../store'

const draft = reactive<Settings>({ ...ui.settings })

watch(
  () => ui.settings,
  (settings) => Object.assign(draft, settings),
  { deep: true }
)

const concurrencyOptions = [1, 2, 3, 4, 5]

async function browse(): Promise<void> {
  const picked = await chooseDirectory()
  if (!picked) return
  draft.downloadDir = picked
  await saveSettings({ downloadDir: picked })
}

async function commit(): Promise<void> {
  await saveSettings({ ...draft, theme: 'dark', ytdlpPath: '', ffmpegPath: '' })
}

function back(): void {
  ui.view = 'browse'
}

</script>

<template>
  <div class="settings">
    <header class="settings-chrome">
      <div class="settings-top">
        <button class="cta back-cta no-drag" type="button" @click="back">返回浏览</button>
</div>
      <WindowControls />
    </header>

    <div class="settings-inner">
      <section class="card-block">
        <h2>下载</h2>
        <div class="field">
          <span class="label">默认保存目录</span>
          <div class="inline">
            <input v-model="draft.downloadDir" spellcheck="false" @change="commit" />
            <button class="btn" type="button" @click="browse">浏览</button>
          </div>
        </div>
        <div class="field">
          <span class="label">同时下载数（1–5）</span>
          <select v-model.number="draft.concurrentDownloads" class="concurrency-select" @change="commit">
            <option v-for="n in concurrencyOptions" :key="n" :value="n">{{ n }}</option>
          </select>
        </div>
      </section>
      <section class="card-block about">
        <h2>关于</h2>
        <p>网影猎手 {{ ui.version }} · NetShadow Hunter</p>
        <p>开源的「打开网页 → 一键下载」客户端。内嵌浏览器浏览，解析与下载由内置引擎完成。</p>
        <p>请只保存你有权下载的内容，并遵守各站服务条款与版权法。</p>
      </section>
    </div>
  </div>
</template>
