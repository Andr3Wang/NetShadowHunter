<script setup lang="ts">
import type { DownloadTask } from '@shared/types'
import { cancelTask, openTaskFile, pauseTask, removeTask, resumeTask, showTaskFolder } from '../store'

defineProps<{ task: DownloadTask }>()

const labels: Record<DownloadTask['status'], string> = {
  queued: '等待',
  downloading: '下载中',
  paused: '已暂停',
  completed: '完成',
  error: '失败',
  cancelled: '已取消'
}
</script>

<template>
  <article class="task">
    <div class="task-top">
      <img v-if="task.thumbnail" class="thumb" :src="task.thumbnail" alt="" referrerpolicy="no-referrer" />
      <div v-else class="thumb-fallback">{{ task.engine === 'browser' ? '网页' : '影音' }}</div>
      <div class="task-copy">
        <h3 :title="task.title">{{ task.title }}</h3>
        <p :title="task.formatLabel">{{ task.formatLabel }}</p>
      </div>
      <span class="status" :class="task.status">{{ labels[task.status] }}</span>
    </div>
    <div v-if="task.status === 'downloading' || task.status === 'paused' || task.progress > 0" class="track" :class="{ indeterminate: task.indeterminate && task.status === 'downloading' }">
      <span :style="{ width: `${Math.max(0, Math.min(100, task.progress))}%` }"></span>
    </div>
    <div class="meta">
      <span>{{ task.message }}</span>
      <span>{{ [task.speed, task.eta ? `剩余 ${task.eta}` : '', task.sizeLabel].filter(Boolean).join(' · ') }}</span>
    </div>
    <p v-if="task.error && task.status === 'error'" class="task-error">{{ task.error }}</p>
    <div class="task-actions">
      <button v-if="task.status === 'downloading' || task.status === 'queued'" type="button" @click="pauseTask(task.id)">暂停</button>
      <button v-if="task.status === 'paused' || task.status === 'error'" type="button" @click="resumeTask(task.id)">{{ task.status === 'error' ? '重试' : '继续' }}</button>
      <button v-if="task.status === 'downloading' || task.status === 'queued' || task.status === 'paused'" class="danger" type="button" @click="cancelTask(task.id)">取消</button>
      <button v-if="task.outputFile && task.status === 'completed'" type="button" @click="openTaskFile(task.id)">打开文件</button>
      <button v-if="task.outputFile || task.outputDir" type="button" @click="showTaskFolder(task.id)">打开文件夹</button>
      <button v-if="task.status !== 'downloading'" type="button" @click="removeTask(task.id)">移除</button>
    </div>
</article>
</template>
