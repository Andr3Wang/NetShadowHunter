import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import type { FormatPreference, Settings } from '@shared/types'
import { DEFAULT_TEMPLATE } from '@shared/types'

function filePath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function defaultSettings(): Settings {
  const videos = app.getPath('videos')
  const downloads = app.getPath('downloads')
  return {
    downloadDir: videos || downloads,
    filenameTemplate: DEFAULT_TEMPLATE,
    formatPreference: 'source-max',
    concurrentDownloads: 2,
    proxy: '',
    ytdlpPath: '',
    ffmpegPath: '',
    theme: 'dark',
    useCookies: false,
    noPlaylist: true
  }
}

function clampConcurrency(value: unknown): number {
  const number = Number(value)
  if (!Number.isFinite(number)) return 2
  return Math.min(5, Math.max(1, Math.round(number)))
}

export function sanitizeSettings(input: Partial<Settings> | null | undefined, base?: Settings): Settings {
  const defaults = base || defaultSettings()
  const source = input || {}
  const preference: FormatPreference = 'source-max'
  const downloadDir =
    typeof source.downloadDir === 'string' && source.downloadDir.trim()
      ? source.downloadDir.trim()
      : defaults.downloadDir
  return {
    downloadDir,
    filenameTemplate: defaults.filenameTemplate,
    formatPreference: preference,
    concurrentDownloads: clampConcurrency(source.concurrentDownloads ?? defaults.concurrentDownloads),
    proxy: typeof source.proxy === 'string' ? source.proxy.trim() : defaults.proxy,
    ytdlpPath: '',
    ffmpegPath: '',
    theme: source.theme === 'light' ? 'light' : 'dark',
    useCookies: false,
    noPlaylist: true
  }
}

export function loadSettings(): Settings {
  try {
    const raw = readFileSync(filePath(), 'utf8')
    return sanitizeSettings(JSON.parse(raw) as Partial<Settings>)
  } catch {
    return defaultSettings()
  }
}

export function saveSettings(settings: Settings): Settings {
  const clean = sanitizeSettings(settings)
  const target = filePath()
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, JSON.stringify(clean, null, 2), 'utf8')
  if (!existsSync(clean.downloadDir)) {
    try {
      mkdirSync(clean.downloadDir, { recursive: true })
    } catch {
      // best-effort
    }
  }
  return clean
}