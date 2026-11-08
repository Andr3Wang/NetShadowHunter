<script setup lang="ts">
import { computed } from 'vue'
import WindowControls from './WindowControls.vue'
import { desktop, ui, commitAddress, downloadThisPage, goBack, goForward, goHome, reloadPage } from '../store'

const canDownload = computed(() => desktop && !ui.browser.isHome && ui.browser.url.startsWith('http') && !ui.picker?.loading)

function onFocus(): void {
  ui.addressFocused = true
  if (ui.browser.isHome) ui.address = ''
}

function onBlur(): void {
  ui.addressFocused = false
  ui.address = ui.browser.isHome ? '' : ui.browser.url
}

function openSettings(): void {
  ui.view = 'settings'
}
</script>

<template>
  <header class="toolbar">
    <div class="brand">
      <div class="mark" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="7.2" fill="none" stroke="white" stroke-width="1.7" />
          <path d="M10.3 8.7v6.6l5.4-3.3-5.4-3.3Z" fill="white" />
        </svg>
      </div>
      <div class="wordmark">
        <strong>网影猎手</strong>
        <span>NETSHADOW</span>
      </div>
    </div>

    <div class="nav-group no-drag">
      <button class="nav-btn" type="button" title="后退" :disabled="!ui.browser.canGoBack" @click="goBack">
        <svg viewBox="0 0 24 24"><path d="M14.5 6.5 9 12l5.5 5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
      <button class="nav-btn" type="button" title="前进" :disabled="!ui.browser.canGoForward" @click="goForward">
        <svg viewBox="0 0 24 24"><path d="M9.5 6.5 15 12l-5.5 5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
      <button class="nav-btn" type="button" title="刷新" @click="reloadPage">
        <svg viewBox="0 0 24 24"><path d="M19 12a7 7 0 1 1-1.7-4.6M19 5v4.2h-4.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
      <button class="nav-btn" type="button" title="起始页" @click="goHome">
        <svg viewBox="0 0 24 24"><path d="M4.5 11.2 12 5l7.5 6.2V19a1 1 0 0 1-1 1h-4.2v-5.2H9.7V20H5.5a1 1 0 0 1-1-1v-7.8Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /></svg>
      </button>
    </div>

    <form class="address no-drag" @submit.prevent="commitAddress">
      <input
        v-model="ui.address"
        spellcheck="false"
        :placeholder="ui.browser.isHome ? '输入网址后回车' : '输入网址'"
        aria-label="网址"
        @focus="onFocus"
        @blur="onBlur"
      />
    </form>

    <div class="toolbar-actions no-drag">
      <button class="cta" :class="{ busy: ui.picker?.loading }" type="button" :disabled="desktop && !canDownload" @click="downloadThisPage">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4v10.5M8.2 11.2 12 15l3.8-3.8M6 19h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span>{{ ui.picker?.loading ? '解析中…' : '下载此页' }}</span>
      </button>
      <button class="icon-btn" type="button" title="设置" @click="openSettings">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.7" />
          <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.36.62.94 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>

    <WindowControls />
    <div v-if="ui.browser.loading" class="loadline" aria-hidden="true"><i></i></div>
  </header>
</template>
