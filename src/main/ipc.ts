import { app, clipboard, dialog, ipcMain, shell } from 'electron'

import type { BrowserWindow } from 'electron'

import type { BrowserBounds, Settings, StartRequest } from '@shared/types'

import { normalizeUrl } from '@shared/ytdlp'

import { detectBinaries, installYtdlp } from './binaries'

import type { EmbeddedBrowser } from './browser'

import type { DownloadManager } from './downloads'

import { loadSettings, saveSettings } from './settings'



export interface AppServices {

  getWindow: () => BrowserWindow

  getBrowser: () => EmbeddedBrowser

  getDownloads: () => DownloadManager

}



function asRecord(value: unknown): Record<string, unknown> {

  if (!value || typeof value !== 'object') return {}

  return value as Record<string, unknown>

}



function attachWindowEvents(services: AppServices): void {

  const win = services.getWindow()

  const emit = (): void => {

    if (!win.isDestroyed()) win.webContents.send('window:maximized', win.isMaximized())

  }

  win.on('maximize', emit)

  win.on('unmaximize', emit)

}



export function registerIpc(services: AppServices): void {

  try { attachWindowEvents(services) } catch { /* window may not be ready yet */ }

  const sendBinaries = async (): Promise<void> => {

    const settings = loadSettings()

    const binaries = await detectBinaries(settings.ytdlpPath, settings.ffmpegPath)

    services.getDownloads().updateRuntime(settings, binaries)

    const win = services.getWindow()

    if (!win.isDestroyed()) win.webContents.send('binaries:info', binaries)

  }



  ipcMain.handle('app:bootstrap', async () => {

    const settings = loadSettings()

    const binaries = await detectBinaries(settings.ytdlpPath, settings.ffmpegPath)

    services.getDownloads().updateRuntime(settings, binaries)

    return {

      settings,

      binaries,

      browser: services.getBrowser().getState(),

      tasks: services.getDownloads().list(),

      history: services.getDownloads().listHistory(),

      version: app.getVersion()

    }

  })



  ipcMain.handle('browser:navigate', (_event, input: unknown) => {

    services.getBrowser().navigate(String(input || ''))

  })

  ipcMain.handle('browser:back', () => services.getBrowser().back())

  ipcMain.handle('browser:forward', () => services.getBrowser().forward())

  ipcMain.handle('browser:reload', () => services.getBrowser().reload())

  ipcMain.handle('browser:home', () => services.getBrowser().goHome())

  ipcMain.handle('browser:get-state', () => services.getBrowser().getState())

  ipcMain.handle('browser:set-bounds', (_event, raw: unknown) => {

    const bounds = asRecord(raw)

    const next: BrowserBounds = {

      x: Number(bounds.x) || 0,

      y: Number(bounds.y) || 0,

      width: Number(bounds.width) || 0,

      height: Number(bounds.height) || 0

    }

    if (next.width < 8 || next.height < 8) services.getBrowser().hide()

    else services.getBrowser().setBounds(next)

  })



  ipcMain.handle('downloads:probe', (_event, url: unknown) => services.getDownloads().probe(String(url || '')))

  ipcMain.handle('downloads:probe-cancel', () => services.getDownloads().cancelProbe())

  ipcMain.handle('downloads:start', (_event, raw: unknown) => {

    const body = asRecord(raw) as unknown as StartRequest

    if (!body || typeof body !== 'object') throw new Error('任务参数无效')

    return services.getDownloads().start(body)

  })

  ipcMain.handle('downloads:pause', (_event, id: unknown) => services.getDownloads().pause(String(id)))

  ipcMain.handle('downloads:resume', (_event, id: unknown) => services.getDownloads().resume(String(id)))

  ipcMain.handle('downloads:cancel', (_event, id: unknown) => services.getDownloads().cancel(String(id)))

  ipcMain.handle('downloads:remove', (_event, id: unknown) => services.getDownloads().remove(String(id)))

  ipcMain.handle('downloads:clear-finished', () => services.getDownloads().clearFinished())

  ipcMain.handle('downloads:open-file', (_event, id: unknown) => services.getDownloads().openTask(String(id)))

  ipcMain.handle('downloads:show-folder', (_event, id: unknown) => services.getDownloads().showTask(String(id)))

  ipcMain.handle('downloads:list', () => services.getDownloads().list())

  ipcMain.handle('downloads:history', () => services.getDownloads().listHistory())

  ipcMain.handle('downloads:clear-history', () => services.getDownloads().clearHistory())

  ipcMain.handle('downloads:remove-history', (_event, id: unknown) =>

    services.getDownloads().removeHistory(String(id))

  )



  ipcMain.handle('settings:get', () => loadSettings())

  ipcMain.handle('settings:set', async (_event, raw: unknown) => {

    const current = loadSettings()

    const patch = asRecord(raw) as Partial<Settings>

    const saved = saveSettings({ ...current, ...patch })

    await sendBinaries()

    return saved

  })

  ipcMain.handle('settings:choose-dir', async () => {

    const win = services.getWindow()

    const result = await dialog.showOpenDialog(win, {

      title: '选择下载目录',

      properties: ['openDirectory', 'createDirectory']

    })

    if (result.canceled || !result.filePaths[0]) return null

    return result.filePaths[0]

  })

  ipcMain.handle('settings:open-path', async (_event, target: unknown) => {

    const error = await shell.openPath(String(target || ''))

    if (error) throw new Error(error)

  })



  ipcMain.handle('binaries:info', async () => {

    const settings = loadSettings()

    return detectBinaries(settings.ytdlpPath, settings.ffmpegPath)

  })

  ipcMain.handle('binaries:install-ytdlp', async () => {

    const win = services.getWindow()

    const settings = loadSettings()

    try {

      const slot = await installYtdlp(settings.proxy, (progress, message) => {

        if (!win.isDestroyed()) {

          win.webContents.send('binaries:install-progress', { running: true, progress, message })

        }

      })

      const saved = saveSettings({ ...settings, ytdlpPath: slot.path })

      const binaries = await detectBinaries(saved.ytdlpPath, saved.ffmpegPath)

      services.getDownloads().updateRuntime(saved, binaries)

      if (!win.isDestroyed()) {

        win.webContents.send('binaries:install-progress', { running: false, progress: 1, message: '引擎已就绪' })

        win.webContents.send('binaries:info', binaries)

        win.webContents.send('settings:changed', saved)

      }

      return binaries

    } catch (error) {

      const message = error instanceof Error ? error.message : '下载引擎失败'

      if (!win.isDestroyed()) {

        win.webContents.send('binaries:install-progress', {

          running: false,

          progress: 0,

          message,

          error: message

        })

      }

      throw error

    }

  })





  ipcMain.handle('window:minimize', () => {

    services.getWindow().minimize()

  })

  ipcMain.handle('window:maximize', () => {

    const win = services.getWindow()

    if (win.isMaximized()) win.unmaximize()

    else win.maximize()

    return win.isMaximized()

  })

  ipcMain.handle('window:close', () => {

    services.getWindow().close()

  })

  ipcMain.handle('window:is-maximized', () => services.getWindow().isMaximized())



  ipcMain.handle('shell:open-external', (_event, target: unknown) => {

    const url = normalizeUrl(String(target || ''))

    if (!url || !url.startsWith('https://')) throw new Error('只能打开 https 链接')

    return shell.openExternal(url)

  })

  ipcMain.handle('shell:copy', (_event, text: unknown) => {

    clipboard.writeText(String(text || ''))

  })

}

