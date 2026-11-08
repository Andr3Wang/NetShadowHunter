<script setup lang="ts">
import { QUICK_SITES } from '@shared/types'
import { openQuick } from '../store'
</script>

<template>
  <div class="start">
    <div class="start-empty">
      <div class="empty-orb" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 4v9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
          <path d="m8.2 10.2 3.8 3.8 3.8-3.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M5 18.5h14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
        </svg>
      </div>
      <h2>还没有下载任务</h2>
      <p>打开视频或音频页面，点右上角「下载此页」。</p>
      <div class="sites">
        <button v-for="site in QUICK_SITES" :key="site.id" class="site" type="button" @click="openQuick(site.url)">
          <i class="dot" :style="{ background: site.color }"></i>
          {{ site.name }}
        </button>
      </div>
    </div>
  </div>
</template>
