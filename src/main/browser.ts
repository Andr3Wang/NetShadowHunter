import { BrowserWindow, WebContentsView } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'
import type { BrowserBounds, BrowserState } from '@shared/types'
import { normalizeUrl } from '@shared/ytdlp'
import homeAsset from '../../resources/home.html?asset'

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export function homeFilePath(): string {
  if (is.dev) return homeAsset
  return join(process.resourcesPath, 'home.html')
}

function isHomeUrl(url: string): boolean {
  if (!url) return true
  return url.startsWith('file:')
}

export class EmbeddedBrowser {
  readonly view: WebContentsView
  private state: BrowserState = {
    url: '',
    title: '起始页',
    canGoBack: false,
    canGoForward: false,
    loading: false,
    isHome: true,
    error: ''
  }

  constructor(
    private readonly win: BrowserWindow,
    private readonly emit: (state: BrowserState) => void
  ) {
    this.view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        partition: 'persist:netshadow-browser',
        spellcheck: false
      }
    })
    this.win.contentView.addChildView(this.view)
    const contents = this.view.webContents
    contents.setUserAgent(CHROME_UA)
    contents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
      const allowed = new Set([
        'media',
        'fullscreen',
        'pointerLock',
        'clipboard-sanitized-write',
        'notifications'
      ])
      callback(allowed.has(permission))
    })
    contents.setWindowOpenHandler(({ url }) => {
      const next = normalizeUrl(url)
      if (next) void contents.loadURL(next)
      return { action: 'deny' }
    })
    contents.on('will-navigate', (event, url) => {
      if (!this.allow(url)) event.preventDefault()
    })
    contents.on('will-redirect', (event, url) => {
      if (!this.allow(url)) event.preventDefault()
    })
    const refresh = (): void => this.push()
    contents.on('did-start-loading', refresh)
    contents.on('did-stop-loading', refresh)
    contents.on('did-navigate', refresh)
    contents.on('did-navigate-in-page', refresh)
    contents.on('page-title-updated', refresh)
    contents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
      if (!isMainFrame || code === -3) return
      this.state = { ...this.read(), error: description || '页面加载失败' }
      this.emit(this.state)
    })
    this.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    this.view.setVisible(false)
  }

  private allow(url: string): boolean {
    if (url.startsWith('file:')) return url.includes('home.html')
    return !!normalizeUrl(url)
  }

  private read(): BrowserState {
    const contents = this.view.webContents
    const url = contents.getURL()
    return {
      url,
      title: contents.getTitle() || '',
      canGoBack: contents.navigationHistory.canGoBack(),
      canGoForward: contents.navigationHistory.canGoForward(),
      loading: contents.isLoading(),
      isHome: isHomeUrl(url),
      error: ''
    }
  }

  private push(): void {
    this.state = this.read()
    this.emit(this.state)
  }

  getState(): BrowserState {
    return this.state.url ? this.read() : this.state
  }

  setBounds(bounds: BrowserBounds): void {
    const width = Math.max(0, Math.round(bounds.width))
    const height = Math.max(0, Math.round(bounds.height))
    this.view.setVisible(width > 8 && height > 8)
    this.view.setBounds({
      x: Math.max(0, Math.round(bounds.x)),
      y: Math.max(0, Math.round(bounds.y)),
      width,
      height
    })
  }

  hide(): void {
    this.view.setVisible(false)
  }

  goHome(): void {
    void this.view.webContents.loadFile(homeFilePath())
  }

  navigate(input: string): void {
    const url = normalizeUrl(input)
    if (!url) throw new Error('请输入 http 或 https 网址')
    void this.view.webContents.loadURL(url)
  }

  back(): void {
    if (this.view.webContents.navigationHistory.canGoBack()) {
      this.view.webContents.navigationHistory.goBack()
    }
  }

  forward(): void {
    if (this.view.webContents.navigationHistory.canGoForward()) {
      this.view.webContents.navigationHistory.goForward()
    }
  }

  reload(): void {
    if (this.getState().isHome) this.goHome()
    else this.view.webContents.reload()
  }
}
