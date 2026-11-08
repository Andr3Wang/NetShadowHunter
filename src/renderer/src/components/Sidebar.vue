<script setup lang="ts">
import { computed } from 'vue'
import { QUICK_SITES } from '@shared/types'
import TaskCard from './TaskCard.vue'
import FormatPicker from './FormatPicker.vue'
import {
  clearFinished,
  clearHistory,
  desktop,
  installYtdlp,
  openDownloadDir,
  openFolder,
  openQuick,
  removeHistory,
  ui
} from '../store'

const activeCount = computed(() => ui.tasks.filter((task) => task.status === 'downloading' || task.status === 'queued').length)
const hasFinished = computed(() => ui.tasks.some((task) => task.status === 'completed' || task.status === 'cancelled'))

const engineClass = computed(() => {
  if (ui.binaries.ytdlp.source === 'missing') return 'bad'
  if (ui.binaries.ffmpeg.source === 'missing') return ''
  return 'ready'
})

const engineText = computed(() => {
  if (ui.binaries.ytdlp.source === 'missing') return '引擎未就绪'
  if (ui.binaries.ffmpeg.source === 'missing') return '引擎未就绪'
  return '引擎就绪'
})
const engineDetail = computed(() => {
  if (ui.binaries.ytdlp.source === 'missing' || ui.binaries.ffmpeg.source === 'missing') {
    return '内置引擎未就绪'
  }
  return '内置解析与下载引擎已就绪'
})

function historyTime(ts: number): string {
  const date = new Date(ts)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
</script>

<template>
  <aside class="sidebar">
    <header class="side-head">
      <div>
        <h1>下载队列<span v-if="activeCount"> · {{ activeCount }}</span></h1>
        <p>保存这一页的影像与声音</p>
      </div>
      <div class="tabs">
        <button type="button" :class="{ active: ui.tab === 'queue' }" @click="ui.tab = 'queue'">队列</button>
        <button type="button" :class="{ active: ui.tab === 'history' }" @click="ui.tab = 'history'">最近</button>
      </div>
    </header>

    <div class="side-scroll">
      <p v-if="!desktop" class="preview-note">当前是界面预览。运行 <b>npm run dev</b> 会打开带内嵌浏览器的桌面窗口。</p>
      <p v-if="ui.bootError" class="banner error">{{ ui.bootError }}</p>
      <p v-if="ui.browser.error && ui.tab === 'queue' && !ui.picker" class="banner error">{{ ui.browser.error }}</p>

      <FormatPicker v-if="ui.picker && ui.tab === 'queue'" />

      <template v-else-if="ui.tab === 'queue'">
        <div v-if="hasFinished" class="queue-tools">
          <button type="button" @click="clearFinished">清除已完成</button>
        </div>
        <div v-if="ui.tasks.length === 0" class="empty">
          <div class="empty-orb" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 4v9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
              <path d="m8.2 10.2 3.8 3.8 3.8-3.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M5 18.5h14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
            </svg>
          </div>
          <h2>还没有下载任务</h2>
          <p>打开想看的视频或想听的音频页面，点击右上角的「下载此页」。页面里触发的下载也会进到这里。</p>
          <p class="support">支持常见视频与音频站点</p>
        </div>
        <TaskCard v-for="task in ui.tasks" :key="task.id" :task="task" />
      </template>

      <template v-else>
        <div v-if="ui.history.length" class="queue-tools">
          <button type="button" @click="clearHistory">清空记录</button>
        </div>
        <div v-if="ui.history.length === 0" class="empty">
          <h2>还没有下载记录</h2>
          <p>完成、失败或取消的任务会留在这里，方便再次打开文件。</p>
        </div>
        <article v-for="item in ui.history" :key="item.id + item.finishedAt" class="task">
          <div class="task-top">
            <div class="task-copy">
              <h3 :title="item.title">{{ item.title }}</h3>
              <p>{{ historyTime(item.finishedAt) }} · {{ item.formatLabel }}</p>
            </div>
            <span class="status" :class="item.status">{{ item.status === 'completed' ? '完成' : item.status === 'error' ? '失败' : '已取消' }}</span>
          </div>
          <p v-if="item.error" class="task-error">{{ item.error }}</p>
          <div class="task-actions">
            <button v-if="item.outputDir" type="button" @click="openFolder(item.outputDir)">打开文件夹</button>
            <button type="button" @click="removeHistory(item.id)">移除</button>
          </div>
        </article>
      </template>
    </div>

    <section v-if="!ui.picker" class="quick">
      <h2>快捷访问</h2>
      <div class="sites">
        <button v-for="site in QUICK_SITES" :key="site.id" class="site" type="button" @click="openQuick(site.url)">
          <i class="dot" :style="{ background: site.color }"></i>
          {{ site.name }}
        </button>
      </div>
    </section>

    <button class="folder" type="button" @click="openDownloadDir">打开下载文件夹</button>

    <footer class="footer">
      <p class="engine" :class="engineClass"  :title="engineDetail"><i></i><span>{{ engineText }}</span></p>      <div v-if="ui.binaries.ytdlp.source === 'missing' || ui.install.running" class="install-row">
        <button class="btn" type="button" :disabled="ui.install.running" @click="installYtdlp">
          {{ ui.install.running ? '正在下载…' : '下载引擎' }}
        </button>
        <span v-if="ui.install.message">{{ ui.install.message }}</span>
      </div>
    </footer>
  </aside>
</template>
