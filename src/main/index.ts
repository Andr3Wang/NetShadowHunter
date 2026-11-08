import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import type { BrowserState } from '@shared/types'
import { detectBinaries } from './binaries'
import { EmbeddedBrowser } from './browser'
import { DownloadManager } from './downloads'
import { registerIpc } from './ipc'
import { loadSettings } from './settings'

let mainWindow: BrowserWindow | null = null
let browser: EmbeddedBrowser | null = null
let downloads: DownloadManager | null = null

function send(channel: string, payload: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(channel, payload)
}

function createWindow(): void {
  const settings = loadSettings()
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 680,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#12141a',
    title: '网影猎手',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  browser = new EmbeddedBrowser(mainWindow, (state: BrowserState) => send('browser:state', state))
  if (!downloads) {
    downloads = new DownloadManager(mainWindow, settings, {
      ytdlp: { path: '', version: null, source: 'missing' },
      ffmpeg: { path: '', version: null, source: 'missing' }
    }, () => browser!.view.webContents.session)
  } else {
    downloads.setWindow(mainWindow)
  }

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  browser.goHome()
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(async () => {
    electronApp.setAppUserModelId('app.netshadow.hunter')
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })
    createWindow()
    registerIpc({
      getWindow: () => {
        if (!mainWindow) throw new Error('窗口还没准备好')
        return mainWindow
      },
      getBrowser: () => {
        if (!browser) throw new Error('浏览器还没准备好')
        return browser
      },
      getDownloads: () => {
        if (!downloads) throw new Error('下载器还没准备好')
        return downloads
      }
    })
    const settings = loadSettings()
    const binaries = await detectBinaries(settings.ytdlpPath, settings.ffmpegPath)
    downloads?.updateRuntime(settings, binaries)
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    downloads?.shutdown()
  })
}
