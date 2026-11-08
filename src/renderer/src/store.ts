import { reactive } from 'vue'



import type {



  BinaryInfo,



  BrowserState,



  DownloadTask,



  FormatChoice,



  HistoryItem,



  MediaFormat,



  Settings,



  StartRequest



} from '@shared/types'



import { DEFAULT_TEMPLATE } from '@shared/types'







export const desktop = typeof window !== 'undefined' && !!window.api







const fallbackSettings = (): Settings => ({



  downloadDir: '',



  filenameTemplate: DEFAULT_TEMPLATE,



  formatPreference: 'source-max',



  concurrentDownloads: 2,



  proxy: '',



  ytdlpPath: '',



  ffmpegPath: '',



  theme: 'dark',



  useCookies: true,



  noPlaylist: true



})







const emptyBrowser = (): BrowserState => ({



  url: '',



  title: '起始页',



  canGoBack: false,



  canGoForward: false,



  loading: false,



  isHome: true,



  error: ''



})







interface PickerState {



  loading: boolean



  error: string



  resultTitle: string



  thumbnail?: string



  duration?: number



  extractor?: string



  formats: MediaFormat[]



  url: string



}







const emptyBinaries = (): BinaryInfo => ({



  ytdlp: { path: '', version: null, source: 'missing' },



  ffmpeg: { path: '', version: null, source: 'missing' }



})







export const ui = reactive({



  ready: false,



  bootError: '',



  view: 'browse' as 'browse' | 'settings',



  tab: 'queue' as 'queue' | 'history',



  address: '',



  addressFocused: false,



  browser: emptyBrowser(),



  settings: fallbackSettings(),



  binaries: emptyBinaries(),



  tasks: [] as DownloadTask[],



  history: [] as HistoryItem[],



  version: '0.1.0',



  picker: null as PickerState | null,



  install: { running: false, progress: 0, message: '', error: '' },



  toast: ''



})







function errorMessage(error: unknown): string {



  const message = error instanceof Error ? error.message : String(error || '出了点问题')



  const remote = message.match(/Error invoking remote method '[^']+': ([\s\S]+)/)



  return remote?.[1] || message



}







export function toast(message: string): void {



  ui.toast = message



  window.setTimeout(() => {



    if (ui.toast === message) ui.toast = ''



  }, 3400)



}







export async function init(): Promise<void> {



  if (!window.api) {



    ui.ready = true



    return



  }



  try {



    const data = await window.api.bootstrap()



    ui.settings = data.settings



    ui.binaries = data.binaries



    ui.browser = data.browser



    ui.tasks = data.tasks



    ui.history = data.history



    ui.version = data.version



    ui.address = data.browser.isHome ? '' : data.browser.url



    window.api.browser.onState((state) => {



      ui.browser = state



      if (!ui.addressFocused) ui.address = state.isHome ? '' : state.url



    })



    window.api.downloads.onTask((task) => {



      const index = ui.tasks.findIndex((item) => item.id === task.id)



      if (index === -1) {



        if (task.status === 'queued' || task.status === 'downloading') ui.tasks.unshift(task)



        return



      }



      ui.tasks[index] = task



    })



    window.api.downloads.onList((tasks) => {



      ui.tasks = tasks



    })



    window.api.downloads.onHistory((items) => {



      ui.history = items



    })



    window.api.binaries.onInfo((info) => {



      ui.binaries = info



    })



    window.api.binaries.onInstall((progress) => {



      ui.install.running = progress.running



      ui.install.progress = progress.progress



      ui.install.message = progress.message



      ui.install.error = progress.error || ''



    })



    window.api.settings.onChanged((settings) => {



      ui.settings = settings



    })



  } catch (error) {



    ui.bootError = errorMessage(error)



  } finally {



    ui.ready = true



  }



}







export async function commitAddress(): Promise<void> {



  const value = ui.address.trim()



  if (!value) {



    await goHome()



    return



  }



  if (!window.api) {



    toast('界面预览不能打开网页，请运行桌面窗口')



    return



  }



  try {



    await window.api.browser.navigate(value)



  } catch (error) {



    toast(errorMessage(error))



  }



}







export async function goBack(): Promise<void> {



  await window.api?.browser.back()



}







export async function goForward(): Promise<void> {



  await window.api?.browser.forward()



}







export async function reloadPage(): Promise<void> {



  await window.api?.browser.reload()



}







export async function goHome(): Promise<void> {



  ui.address = ''



  if (!window.api) return



  await window.api.browser.home()



}







export async function openQuick(url: string): Promise<void> {



  ui.view = 'browse'



  if (!window.api) {



    window.open(url, '_blank', 'noopener')



    return



  }



  try {



    await window.api.browser.navigate(url)



  } catch (error) {



    toast(errorMessage(error))



  }



}







export async function downloadThisPage(): Promise<void> {



  if (!window.api) {



    toast('下载需要在桌面窗口里运行')



    return



  }



  if (ui.browser.isHome || !ui.browser.url.startsWith('http')) {



    toast('请先打开一个 http 或 https 页面')



    return



  }



  const url = ui.browser.url



  ui.view = 'browse'



  ui.tab = 'queue'



  ui.picker = {



    loading: true,



    error: '',



    resultTitle: ui.browser.title || url,



    formats: [],



    url



  }



  const result = await window.api.downloads.probe(url)



  if (!ui.picker || ui.picker.url !== url) return



  if (result.error === '已取消') {



    ui.picker = null



    return



  }



  ui.picker = {
    loading: false,
    error: result.ok ? '' : result.error || '解析失败',
    resultTitle: result.title || url,
    thumbnail: result.thumbnail,
    duration: result.duration,
    extractor: result.extractor,
    formats: result.formats,
    url
  }

  if (!result.ok) {
    toast(result.error || '解析失败')
    ui.picker = null
    return
  }
  // 解析成功：保留格式面板，让用户选分辨率 / 音轨 / 保存目录后再开始下载。
}







export async function closePicker(): Promise<void> {



  ui.picker = null



  await window.api?.downloads.cancelProbe()



}







function plainChoice(choice: FormatChoice): FormatChoice {



  return {



    kind: choice.kind,



    preset: choice.preset,



    formatId: choice.formatId,



    mergeAudio: choice.mergeAudio,



    ext: choice.ext,



    label: String(choice.label || '')



  }



}







export async function confirmDownload(choice: FormatChoice, outputDir: string): Promise<void> {



  if (!window.api || !ui.picker) return



  const request: StartRequest = {



    url: String(ui.picker.url || ''),



    title: String(ui.picker.resultTitle || ''),



    thumbnail: ui.picker.thumbnail ? String(ui.picker.thumbnail) : undefined,



    choice: plainChoice(choice),



    outputDir: String(outputDir || '').trim() || String(ui.settings.downloadDir || ''),



    filenameTemplate: String(ui.settings.filenameTemplate || DEFAULT_TEMPLATE)



  }



  await window.api.downloads.start(JSON.parse(JSON.stringify(request)) as StartRequest)



  ui.picker = null



  ui.tab = 'queue'



}







export async function pauseTask(id: string): Promise<void> {



  try {



    await window.api?.downloads.pause(id)



  } catch (error) {



    toast(errorMessage(error))



  }



}







export async function resumeTask(id: string): Promise<void> {



  try {



    await window.api?.downloads.resume(id)



  } catch (error) {



    toast(errorMessage(error))



  }



}







export async function cancelTask(id: string): Promise<void> {



  try {



    await window.api?.downloads.cancel(id)



  } catch (error) {



    toast(errorMessage(error))



  }



}







export async function removeTask(id: string): Promise<void> {



  try {



    await window.api?.downloads.remove(id)



  } catch (error) {



    toast(errorMessage(error))



  }



}







export async function clearFinished(): Promise<void> {



  await window.api?.downloads.clearFinished()



}







export async function openTaskFile(id: string): Promise<void> {



  try {



    await window.api?.downloads.openFile(id)



  } catch (error) {



    toast(errorMessage(error))



  }



}







export async function showTaskFolder(id: string): Promise<void> {



  try {



    await window.api?.downloads.showFolder(id)



  } catch (error) {



    toast(errorMessage(error))



  }



}







export async function clearHistory(): Promise<void> {



  await window.api?.downloads.clearHistory()



}







export async function removeHistory(id: string): Promise<void> {



  await window.api?.downloads.removeHistory(id)



}







export async function openFolder(target: string): Promise<void> {



  if (!target) return



  if (!window.api) {



    toast(target)



    return



  }



  try {



    await window.api.settings.openPath(target)



  } catch (error) {



    toast(errorMessage(error))



  }



}







export async function openDownloadDir(): Promise<void> {



  const dir = ui.settings.downloadDir



  if (!dir) {



    toast('还没有设置下载目录')



    return



  }



  if (!window.api) {



    toast(dir)



    return



  }



  try {



    await window.api.settings.openPath(dir)



  } catch (error) {



    toast(errorMessage(error))



  }



}







export async function saveSettings(patch: Partial<Settings>): Promise<void> {



  if (!window.api) {



    ui.settings = { ...ui.settings, ...patch }



    return



  }



  try {



    ui.settings = await window.api.settings.set(patch)



  } catch (error) {



    toast(errorMessage(error))



  }



}







export async function chooseDirectory(): Promise<string | null> {



  if (!window.api) return null



  return window.api.settings.chooseDirectory()



}







export async function installYtdlp(): Promise<void> {



  if (!window.api) {



    toast('请在桌面窗口中下载引擎')



    return



  }



  ui.install.running = true



  ui.install.error = ''



  ui.install.message = '正在连接…'



  try {



    ui.binaries = await window.api.binaries.installYtdlp()



    toast('下载引擎已就绪')



  } catch (error) {



    ui.install.running = false



    ui.install.error = errorMessage(error)



    toast(ui.install.error)



  }



}














export async function reportBounds(rect: { x: number; y: number; width: number; height: number } | null): Promise<void> {



  if (!window.api) return



  if (!rect || ui.view !== 'browse') {



    await window.api.browser.setBounds({ x: 0, y: 0, width: 0, height: 0 })



    return



  }



  await window.api.browser.setBounds(rect)



}



