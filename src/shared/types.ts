export const APP_NAME = '网影猎手'
export const APP_ID = 'netshadow-hunter'

export type PresetId = '2160' | '1440' | '1080' | '720' | '480' | 'audio-mp3' | 'audio-m4a' | 'audio-best'

export type FormatPreference = 'ask' | 'source-max' | PresetId

export interface Settings {
  downloadDir: string
  filenameTemplate: string
  formatPreference: FormatPreference
  concurrentDownloads: number
  proxy: string
  ytdlpPath: string
  ffmpegPath: string
  theme: 'dark' | 'light'
  useCookies: boolean
  noPlaylist: boolean
}

export interface BinarySlot {
  path: string
  version: string | null
  source: 'settings' | 'path' | 'bundled' | 'missing'
}

export interface BinaryInfo {
  ytdlp: BinarySlot
  ffmpeg: BinarySlot
}

export interface BrowserState {
  url: string
  title: string
  canGoBack: boolean
  canGoForward: boolean
  loading: boolean
  isHome: boolean
  error: string
}

export interface BrowserBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface MediaFormat {
  formatId: string
  ext: string
  kind: 'video' | 'audio' | 'combined'
  label: string
  detail: string
  height: number | null
  fps: number | null
  vcodec: string
  acodec: string
  filesize: number | null
  tbr: number | null
  mergeAudio: boolean
}

export interface ProbeResult {
  ok: boolean
  error?: string
  title: string
  thumbnail?: string
  duration?: number
  extractor?: string
  webpageUrl: string
  formats: MediaFormat[]
}

export interface FormatChoice {
  kind: 'preset' | 'id'
  preset?: PresetId
  formatId?: string
  mergeAudio?: boolean
  ext?: string
  label: string
}

export type TaskStatus = 'queued' | 'downloading' | 'paused' | 'completed' | 'error' | 'cancelled'

export type TaskEngine = 'ytdlp' | 'browser'

export interface DownloadTask {
  id: string
  engine: TaskEngine
  url: string
  title: string
  thumbnail?: string
  status: TaskStatus
  formatLabel: string
  choice: FormatChoice | null
  outputDir: string
  filenameTemplate: string
  noPlaylist: boolean
  useCookies: boolean
  proxy: string
  progress: number
  indeterminate: boolean
  speed: string
  eta: string
  sizeLabel: string
  message: string
  outputFile?: string
  error?: string
  createdAt: number
  updatedAt: number
}

export interface HistoryItem {
  id: string
  url: string
  title: string
  status: TaskStatus
  outputFile?: string
  outputDir: string
  formatLabel: string
  error?: string
  finishedAt: number
}

export interface StartRequest {
  url: string
  title: string
  thumbnail?: string
  choice: FormatChoice
  outputDir: string
  filenameTemplate: string
}

export interface Bootstrap {
  settings: Settings
  binaries: BinaryInfo
  browser: BrowserState
  tasks: DownloadTask[]
  history: HistoryItem[]
  version: string
}

export interface InstallProgress {
  running: boolean
  progress: number
  message: string
  error?: string
}

export const DEFAULT_TEMPLATE = '%(title)s [%(id)s].%(ext)s'

export const QUICK_SITES = [
  { id: 'bilibili', name: 'Bilibili', url: 'https://www.bilibili.com', color: '#fb7299' },
  { id: 'douyin', name: '抖音', url: 'https://www.douyin.com', color: '#161823' },
  { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com', color: '#ff4d4d' },
  { id: 'xiaohongshu', name: '小红书', url: 'https://www.xiaohongshu.com', color: '#ff2442' }
] as const
