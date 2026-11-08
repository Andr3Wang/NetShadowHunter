<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Toolbar from './components/Toolbar.vue'
import Sidebar from './components/Sidebar.vue'
import SettingsView from './components/SettingsView.vue'
import StartPane from './components/StartPane.vue'
import { desktop, init, reportBounds, ui } from './store'

const host = ref<HTMLElement | null>(null)
let observer: ResizeObserver | null = null
let frame = 0

function applyTheme(theme: 'dark' | 'light'): void {
  document.documentElement.setAttribute('data-theme', theme)
  document.documentElement.style.colorScheme = theme
}

async function publishBounds(): Promise<void> {
  if (!desktop) return
  if (ui.view !== 'browse' || !host.value) {
    await reportBounds(null)
    return
  }
  const rect = host.value.getBoundingClientRect()
  await reportBounds({ x: rect.left, y: rect.top, width: rect.width, height: rect.height })
}

function schedule(): void {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    void publishBounds()
  })
}

onMounted(async () => {
  await init()
  applyTheme(ui.settings.theme === 'light' ? 'light' : 'dark')
  await nextTick()
  schedule()
  window.setTimeout(schedule, 120)
  observer = new ResizeObserver(() => schedule())
  if (host.value) observer.observe(host.value)
  window.addEventListener('resize', schedule)
  window.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', schedule)
  window.removeEventListener('keydown', onKey)
  cancelAnimationFrame(frame)
})

watch(
  () => ui.view,
  async () => {
    await nextTick()
    schedule()
  }
)

watch(
  () => ui.settings.theme,
  (theme) => applyTheme(theme === 'light' ? 'light' : 'dark')
)

function onKey(event: KeyboardEvent): void {
  const meta = event.metaKey || event.ctrlKey
  if (meta && event.key.toLowerCase() === 'l') {
    event.preventDefault()
    document.querySelector<HTMLInputElement>('.address input')?.focus()
  }
  if (meta && event.key.toLowerCase() === 'd') {
    const target = event.target as HTMLElement | null
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
    event.preventDefault()
    document.querySelector<HTMLButtonElement>('.cta')?.click()
  }
}
</script>

<template>
  <div class="app" :class="{ 'is-settings': ui.view === 'settings' }" :data-theme="ui.settings.theme">
    <template v-if="ui.view === 'browse'">
      <Toolbar />
      <div class="workspace">
        <div ref="host" class="browser-host">
          <StartPane />
          <p v-if="desktop" class="host-wait">正在打开页面…</p>
        </div>
        <Sidebar />
      </div>
    </template>
    <SettingsView v-else />
    <div v-if="ui.toast" class="toast" role="status">{{ ui.toast }}</div>
  </div>
</template>