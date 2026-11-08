<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const maximized = ref(false)
let stop: (() => void) | undefined

onMounted(async () => {
  if (!window.api?.window) return
  maximized.value = await window.api.window.isMaximized()
  stop = window.api.window.onMaximized((value) => {
    maximized.value = value
  })
})

onBeforeUnmount(() => stop?.())

function minimize(): void {
  void window.api?.window?.minimize()
}

function toggleMaximize(): void {
  void window.api?.window?.maximize()
}

function close(): void {
  void window.api?.window?.close()
}
</script>

<template>
  <div class="win-controls" aria-label="窗口控制">
    <button class="win-btn" type="button" title="最小化" aria-label="最小化" @click="minimize">
      <svg viewBox="0 0 10 10" aria-hidden="true">
        <path d="M1 5h8" fill="none" stroke="currentColor" stroke-width="1" />
      </svg>
    </button>
    <button class="win-btn" type="button" :title="maximized ? '还原' : '最大化'" :aria-label="maximized ? '还原' : '最大化'" @click="toggleMaximize">
      <svg v-if="!maximized" viewBox="0 0 10 10" aria-hidden="true">
        <rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1" />
      </svg>
      <svg v-else viewBox="0 0 10 10" aria-hidden="true">
        <path d="M3 3.5h5.5v5.5H3z" fill="none" stroke="currentColor" stroke-width="1" />
        <path d="M2 6.5V2h4.5" fill="none" stroke="currentColor" stroke-width="1" />
      </svg>
    </button>
    <button class="win-btn close" type="button" title="关闭" aria-label="关闭" @click="close">
      <svg viewBox="0 0 10 10" aria-hidden="true">
        <path d="M2.2 2.2l5.6 5.6M7.8 2.2L2.2 7.8" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" />
      </svg>
    </button>
  </div>
</template>
