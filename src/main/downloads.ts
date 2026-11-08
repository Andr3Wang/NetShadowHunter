import { spawn, type ChildProcess } from 'child_process'
import { app, shell } from 'electron'
import type { BrowserWindow, DownloadItem, Session } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { mkdir } from 'fs/promises'
import { basename, extname, join } from 'path'
import type { BinaryInfo, DownloadTask, HistoryItem, ProbeResult, Settings, StartRequest } from '@shared/types'
import {
  buildYtDlpArgs,
  formatBytes,
  formatDuration,
  mapProbeJson,
  normalizeUrl,
  parseYtDlpLine
} from '@shared/ytdlp'
import { removeCookieJar } from './cookies'

interface Sample {
  bytes: number
  at: number
}

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function safeName(name: string): string {
  const base = basename(name)
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\p{Cc}/gu, '_')
    .trim()
  return (base || 'download').slice(0, 180)
}

function uniquePath(dir: string, name: string): string {
  const base = safeName(name)
  let candidate = join(dir, base)
  if (!existsSync(candidate)) return candidate
  const ext = extname(base)
  const stem = basename(base, ext)
  for (let index = 1; index < 1000; index += 1) {
    candidate = join(dir, `${stem} (${index})${ext}`)
    if (!existsSync(candidate)) return candidate
  }
  return join(dir, `${stem}-${Date.now()}${ext}`)
}

/** yt-dlp on Chinese Windows often prints paths as GBK even when the file name on disk is Unicode. */
function decodeYtDlpChunk(chunk: Buffer | string): string {
  if (typeof chunk === 'string') return chunk
  const utf8 = chunk.toString('utf8')
  if (process.platform !== 'win32' || !utf8.includes('�')) return utf8
  try {
    const gbk = new TextDecoder('gbk').decode(chunk)
    if (!gbk.includes('�')) return gbk
  } catch {
    // TextDecoder('gbk') unavailable — keep utf8
  }
  return utf8
}

function extractOutputNeedle(task: DownloadTask): string | null {
  const fromFile = task.outputFile?.match(/\[([^\]]+)\](\.[^.]+)?$/)
  if (fromFile?.[1]) return fromFile[1]
  const bv = task.url.match(/BV[\w]+/i)
  if (bv) return bv[0]
  try {
    const id = new URL(task.url).searchParams.get('v')
    if (id) return id
  } catch {
    // ignore
  }
  return null
}

function resolveExistingOutput(task: DownloadTask): string | null {
  const file = task.outputFile?.trim()
  if (file && existsSync(file)) return file

  const dir = task.outputDir?.trim()
  if (!dir || !existsSync(dir)) return null

  const needle = extractOutputNeedle(task)
  if (!needle) return null

  try {
    const hits = readdirSync(dir)
      .filter((name) => name.includes(needle))
      .filter((name) => !/\.(part|ytdl|temp|tmp)$/i.test(name))
      .map((name) => {
        const full = join(dir, name)
        try {
          return { full, mtime: statSync(full).mtimeMs, size: statSync(full).size }
        } catch {
          return null
        }
      })
      .filter((item): item is { full: string; mtime: number; size: number } => !!item && item.size > 0)
      .sort((a, b) => b.mtime - a.mtime)
    return hits[0]?.full || null
  } catch {
    return null
  }
}

export class DownloadManager {
  private tasks: DownloadTask[] = []
  private history: HistoryItem[] = []
  private children = new Map<string, ChildProcess>()
  private stopReason = new Map<string, 'pause' | 'cancel'>()
  private browserItems = new Map<string, DownloadItem>()
  private samples = new Map<string, Sample>()
  private lastEmit = new Map<string, number>()
  private probeChild: ChildProcess | null = null
  private probeToken = 0
  private probeCookies: string | null = null
  private persistTimer: NodeJS.Timeout | null = null

  constructor(
    private win: BrowserWindow,
    private settings: Settings,
    private binaries: BinaryInfo,
    private readonly sessionFor: () => Session
  ) {
    this.restore()
    this.watchBrowserDownloads()
  }

  setWindow(win: BrowserWindow): void {
    this.win = win
  }

  updateRuntime(settings: Settings, binaries: BinaryInfo): void {
    this.settings = settings
    this.binaries = binaries
    this.pump()
  }

  list(): DownloadTask[] {
    return this.tasks.map((task) => ({ ...task }))
  }

  listHistory(): HistoryItem[] {
    return this.history.map((item) => ({ ...item }))
  }

  async probe(url: string): Promise<ProbeResult> {
    this.cancelProbe()
    const token = this.probeToken
    const empty = (error: string, page = url): ProbeResult => ({
      ok: false,
      error,
      title: page,
      webpageUrl: page,
      formats: []
    })
    if (this.binaries.ytdlp.source === 'missing' || !this.binaries.ytdlp.path) {
      return empty('下载引擎未就绪。可点侧栏底部的「下载引擎」，或确认 resources\\bin 内置文件完整。')
    }
    const normalized = normalizeUrl(url)
    if (!normalized) return empty('请先打开一个 http 或 https 页面')

    const args = ['-J', '--no-warnings', this.settings.noPlaylist ? '--no-playlist' : '--yes-playlist']
    if (this.binaries.ffmpeg.path) args.push('--ffmpeg-location', this.binaries.ffmpeg.path)
    if (this.settings.proxy.trim()) args.push('--proxy', this.settings.proxy.trim())
    // MVP: Cookie / 登录态跟随已关闭，不写 cookie jar
    const cookies: string | null = null
    args.push(normalized)

    try {
      const stdout = await this.execProbe(this.binaries.ytdlp.path, args)
      if (token !== this.probeToken) return empty('已取消', normalized)
      const mapped = mapProbeJson(JSON.parse(stdout), normalized)
      if (mapped.isPlaylist && mapped.formats.length === 0) {
        return empty('这是播放列表页。打开具体的视频，或在设置里关闭「仅下载当前条目」。', normalized)
      }
      return {
        ok: true,
        title: mapped.title,
        thumbnail: mapped.thumbnail,
        duration: mapped.duration,
        extractor: mapped.extractor,
        webpageUrl: mapped.webpageUrl,
        formats: mapped.formats
      }
    } catch (error) {
      if (token !== this.probeToken) return empty('已取消', normalized)
      const message = error instanceof Error ? error.message : '解析失败'
      return empty(message, normalized)
    } finally {
      await removeCookieJar(cookies)
      if (this.probeCookies === cookies) this.probeCookies = null
    }
  }

  cancelProbe(): void {
    this.probeToken += 1
    if (this.probeChild) {
      this.killProcess(this.probeChild)
      this.probeChild = null
    }
  }

  start(request: StartRequest): DownloadTask {
    const url = normalizeUrl(request.url)
    if (!url) throw new Error('链接无效')
    if (!request.choice) throw new Error('请选择格式')
    const outputDir = request.outputDir.trim() || this.settings.downloadDir
    const task: DownloadTask = {
      id: createId(),
      engine: 'ytdlp',
      url,
      title: request.title.trim() || url,
      thumbnail: request.thumbnail,
      status: 'queued',
      formatLabel: request.choice.label,
      choice: request.choice,
      outputDir,
      filenameTemplate: request.filenameTemplate || this.settings.filenameTemplate,
      noPlaylist: this.settings.noPlaylist,
      useCookies: false, // MVP: no cookie/login follow
      proxy: this.settings.proxy,
      progress: 0,
      indeterminate: false,
      speed: '',
      eta: '',
      sizeLabel: '',
      message: '排队中',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    try {
      buildYtDlpArgs({
        url,
        choice: request.choice,
        outputDir,
        filenameTemplate: task.filenameTemplate,
        ffmpegPath: this.binaries.ffmpeg.path || undefined,
        proxy: task.proxy,
        noPlaylist: task.noPlaylist
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '无法生成下载命令'
      throw new Error(message, { cause: error })
    }
    this.tasks.unshift(task)
    this.touch(task, true)
    this.pump()
    return { ...task }
  }

  pause(id: string): void {
    const task = this.must(id)
    if (task.engine === 'browser') {
      const item = this.browserItems.get(id)
      if (item && !item.isPaused()) item.pause()
      task.status = 'paused'
      task.message = '已暂停'
      this.touch(task, true)
      return
    }
    if (task.status === 'queued') {
      task.status = 'paused'
      task.message = '已暂停'
      this.touch(task, true)
      return
    }
    if (task.status === 'downloading') {
      this.stopReason.set(id, 'pause')
      task.message = '正在暂停…'
      this.touch(task, true)
      const child = this.children.get(id)
      if (child) this.killProcess(child)
    }
  }

  resume(id: string): void {
    const task = this.must(id)
    if (task.engine === 'browser') {
      const item = this.browserItems.get(id)
      if (!item) throw new Error('这次网页下载已经结束，无法继续')
      if (item.isPaused()) item.resume()
      task.status = 'downloading'
      task.message = '正在从网页下载'
      this.touch(task, true)
      return
    }
    if (task.status !== 'paused' && task.status !== 'error') return
    task.status = 'queued'
    task.error = undefined
    task.message = '排队中'
    this.touch(task, true)
    this.pump()
  }

  cancel(id: string): void {
    const task = this.tasks.find((item) => item.id === id)
    if (!task) return
    if (task.engine === 'browser') {
      const item = this.browserItems.get(id)
      if (item) item.cancel()
      else this.markStopped(task, 'cancelled', '已取消')
      return
    }
    if (task.status === 'downloading') {
      this.stopReason.set(id, 'cancel')
      const child = this.children.get(id)
      if (child) this.killProcess(child)
      return
    }
    if (task.status === 'queued' || task.status === 'paused') {
      this.markStopped(task, 'cancelled', '已取消')
    }
  }

  remove(id: string): void {
    const task = this.tasks.find((item) => item.id === id)
    if (!task) return
    if (task.status === 'downloading' || task.status === 'queued') this.cancel(id)
    this.tasks = this.tasks.filter((item) => item.id !== id)
    this.persistSoon()
    this.sendList()
  }

  clearFinished(): void {
    this.tasks = this.tasks.filter((task) => task.status !== 'completed' && task.status !== 'cancelled')
    this.persistSoon()
    this.sendList()
  }

  clearHistory(): void {
    this.history = []
    this.persistSoon()
    this.sendHistory()
  }

  removeHistory(id: string): void {
    this.history = this.history.filter((item) => item.id !== id)
    this.persistSoon()
    this.sendHistory()
  }

  async openTask(id: string): Promise<void> {
    const task = this.must(id)
    const target = task.outputFile
    if (!target) throw new Error('还没有可打开的文件')
    const error = await shell.openPath(target)
    if (error) throw new Error(error)
  }

  showTask(id: string): void {
    const task = this.must(id)
    if (task.outputFile && existsSync(task.outputFile)) shell.showItemInFolder(task.outputFile)
    else void shell.openPath(task.outputDir)
  }

  shutdown(): void {
    this.cancelProbe()
    for (const child of this.children.values()) this.killProcess(child)
    this.flush()
  }

  private watchBrowserDownloads(): void {
    this.sessionFor().on('will-download', (_event, item) => {
      try {
        mkdirSync(this.settings.downloadDir, { recursive: true })
      } catch {
        // Fall through and let the download fail visibly if the directory is unusable.
      }
      const savePath = uniquePath(this.settings.downloadDir, item.getFilename())
      item.setSavePath(savePath)
      const task: DownloadTask = {
        id: createId(),
        engine: 'browser',
        url: item.getURL(),
        title: item.getFilename() || '网页下载',
        status: 'downloading',
        formatLabel: '浏览器下载',
        choice: null,
        outputDir: this.settings.downloadDir,
        filenameTemplate: '',
        noPlaylist: true,
        useCookies: false,
        proxy: '',
        progress: 0,
        indeterminate: item.getTotalBytes() <= 0,
        speed: '',
        eta: '',
        sizeLabel: '',
        message: '正在从网页下载',
        outputFile: savePath,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      this.tasks.unshift(task)
      this.browserItems.set(task.id, item)
      this.touch(task, true)
      item.on('updated', () => this.onBrowserProgress(task.id, item))
      item.once('done', (_doneEvent, state) => {
        this.browserItems.delete(task.id)
        this.samples.delete(task.id)
        if (state === 'completed') this.markStopped(task, 'completed', '下载完成')
        else if (state === 'cancelled') this.markStopped(task, 'cancelled', '已取消')
        else this.markStopped(task, 'error', '网页下载中断')
      })
    })
  }

  private onBrowserProgress(id: string, item: DownloadItem): void {
    const task = this.tasks.find((entry) => entry.id === id)
    if (!task) return
    const received = item.getReceivedBytes()
    const total = item.getTotalBytes()
    task.progress = total > 0 ? Math.min(100, (received / total) * 100) : 0
    task.indeterminate = total <= 0
    task.sizeLabel = total > 0 ? `${formatBytes(received)} / ${formatBytes(total)}` : formatBytes(received)
    task.outputFile = item.getSavePath()
    const now = Date.now()
    const sample = this.samples.get(id)
    if (sample && now - sample.at >= 500) {
      const speed = (received - sample.bytes) / ((now - sample.at) / 1000)
      task.speed = speed > 1 ? `${formatBytes(speed)}/s` : ''
      if (total > received && speed > 1) task.eta = formatDuration((total - received) / speed)
      this.samples.set(id, { bytes: received, at: now })
    } else if (!sample) {
      this.samples.set(id, { bytes: received, at: now })
    }
    task.status = item.isPaused() ? 'paused' : 'downloading'
    task.message = task.status === 'paused' ? '已暂停' : '正在从网页下载'
    this.touch(task, false)
  }

  private execProbe(bin: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, {
        shell: false,
        windowsHide: true,
        env: { ...process.env, NO_COLOR: '1', PYTHONUNBUFFERED: '1', FORCE_COLOR: '0', PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }
      })
      this.probeChild = child
      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => {
        this.killProcess(child)
        reject(new Error('解析超时。这个页面可能不受支持，或网络没有响应。'))
      }, 90_000)
      child.stdout.on('data', (chunk) => {
        stdout += String(chunk)
      })
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk)
      })
      child.on('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        if (this.probeChild === child) this.probeChild = null
        if (code === 0 && stdout.trim()) {
          resolve(stdout)
          return
        }
        const errorLine = stderr
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.startsWith('ERROR:'))
          .pop()
        reject(new Error(errorLine ? errorLine.replace(/^ERROR:\s*/, '') : '引擎没有返回可用信息'))
      })
    })
  }

  private pump(): void {
    const active = this.tasks.filter((task) => task.status === 'downloading' && task.engine === 'ytdlp').length
    let slots = this.settings.concurrentDownloads - active
    if (slots <= 0) return
    const queued = this.tasks.filter((task) => task.status === 'queued' && task.engine === 'ytdlp')
    for (const task of queued.reverse()) {
      if (slots <= 0) break
      slots -= 1
      void this.run(task)
    }
  }

  private async run(task: DownloadTask): Promise<void> {
    if (!task.choice) return
    if (this.binaries.ytdlp.source === 'missing' || !this.binaries.ytdlp.path) {
      task.status = 'error'
      task.error = '未找到下载引擎'
      task.message = task.error
      this.markStopped(task, 'error', task.error)
      return
    }
    task.status = 'downloading'
    task.message = '正在启动下载引擎…'
    task.error = undefined
    this.touch(task, true)

    let cookies: string | null = null
    try {
      await mkdir(task.outputDir, { recursive: true })
      // MVP: Cookie / 登录态跟随已关闭
      const pending = this.stopReason.get(task.id)
      if (pending || task.status !== 'downloading') {
        await removeCookieJar(cookies)
        this.stopReason.delete(task.id)
        if (pending === 'cancel') this.markStopped(task, 'cancelled', '已取消')
        else {
          task.status = 'paused'
          task.message = '已暂停。继续时会接着下载未完成的部分。'
          task.speed = ''
          this.touch(task, true)
          this.pump()
        }
        return
      }
      const args = buildYtDlpArgs({
        url: task.url,
        choice: task.choice,
        outputDir: task.outputDir,
        filenameTemplate: task.filenameTemplate,
        ffmpegPath: this.binaries.ffmpeg.path || undefined,
        proxy: task.proxy,
        cookiesPath: cookies || undefined,
        noPlaylist: task.noPlaylist
      })
      const child = spawn(this.binaries.ytdlp.path, args, {
        shell: false,
        windowsHide: true,
        detached: process.platform !== 'win32',
        env: { ...process.env, NO_COLOR: '1', PYTHONUNBUFFERED: '1', FORCE_COLOR: '0', PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }
      })
      this.children.set(task.id, child)
      let buffer = ''
      const consume = (chunk: unknown): void => {
        const text = Buffer.isBuffer(chunk) ? decodeYtDlpChunk(chunk) : String(chunk)
        buffer += text
        const lines = buffer.split(/\n/)
        buffer = lines.pop() || ''
        for (const line of lines) this.applyLine(task, line)
        this.touch(task, false)
      }
      child.stdout?.on('data', consume)
      child.stderr?.on('data', consume)
      child.on('error', (error) => {
        task.error = error.message
        this.markStopped(task, 'error', error.message)
      })
      child.on('close', (code) => {
        this.children.delete(task.id)
        const reason = this.stopReason.get(task.id)
        this.stopReason.delete(task.id)
        void removeCookieJar(cookies)
        if (task.status === 'error' && !reason) return
        if (reason === 'pause') {
          task.status = 'paused'
          task.message = '已暂停。继续时会接着下载未完成的部分。'
          task.speed = ''
          this.touch(task, true)
          this.pump()
          return
        }
        if (reason === 'cancel') {
          this.markStopped(task, 'cancelled', '已取消')
          return
        }
        if (code === 0) {
          const verified = this.verifyOutput(task)
          if (!verified.ok) {
            this.markStopped(task, 'error', verified.message)
            return
          }
          task.error = undefined
          this.markStopped(task, 'completed', '下载完成')
          return
        }
        this.markStopped(task, 'error', task.error || `引擎退出码 ${code ?? '未知'}`)
      })
    } catch (error) {
      await removeCookieJar(cookies)
      const message = error instanceof Error ? error.message : '启动下载失败'
      this.markStopped(task, 'error', message)
    }
  }

  private applyLine(task: DownloadTask, line: string): void {
    const update = parseYtDlpLine(line)
    if (!update) return
    if (typeof update.percent === 'number') task.progress = update.percent
    if (typeof update.indeterminate === 'boolean') task.indeterminate = update.indeterminate
    if (update.speed !== undefined) task.speed = update.speed
    if (update.eta !== undefined) task.eta = update.eta
    if (update.sizeLabel) task.sizeLabel = update.sizeLabel
    if (update.outputFile) task.outputFile = update.outputFile
    if (update.message) task.message = update.message
    if (update.error) task.error = update.error
  }

  
  private verifyOutput(task: DownloadTask): { ok: boolean; message: string } {
    const resolved = resolveExistingOutput(task)
    if (!resolved) {
      const hinted = task.outputFile?.trim()
      if (!hinted) {
        return { ok: false, message: '下载结束但没有得到输出文件路径，请检查保存目录。' }
      }
      return { ok: false, message: `找不到输出文件：${hinted}` }
    }
    task.outputFile = resolved
    try {
      const size = statSync(resolved).size
      if (size <= 0) {
        return { ok: false, message: '输出文件是 0 字节，可能合并失败。请确认转码引擎可用后重试。' }
      }
      if (!task.sizeLabel) {
        const mb = size / (1024 * 1024)
        task.sizeLabel = mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`
      }
    } catch {
      return { ok: false, message: `无法读取输出文件：${resolved}` }
    }
    return { ok: true, message: '下载完成' }
  }

  private markStopped(task: DownloadTask, status: DownloadTask['status'], message: string): void {
    task.status = status
    task.message = message
    task.speed = ''
    task.eta = ''
    if (status === 'completed') {
      task.progress = 100
      task.indeterminate = false
      task.error = undefined
    }
    if (status === 'error') task.error = message
    task.updatedAt = Date.now()
    if (status === 'completed' || status === 'error' || status === 'cancelled') this.pushHistory(task)
    this.persistSoon()
    this.emit(task)
    this.pump()
  }

  private pushHistory(task: DownloadTask): void {
    this.history = [
      {
        id: task.id,
        url: task.url,
        title: task.title,
        status: task.status,
        outputFile: task.outputFile,
        outputDir: task.outputDir,
        formatLabel: task.formatLabel,
        error: task.error,
        finishedAt: Date.now()
      },
      ...this.history.filter((item) => item.id !== task.id)
    ].slice(0, 100)
    this.sendHistory()
  }

  private touch(task: DownloadTask, immediate: boolean): void {
    task.updatedAt = Date.now()
    this.persistSoon()
    if (immediate) {
      this.emit(task)
      return
    }
    const now = Date.now()
    const previous = this.lastEmit.get(task.id) || 0
    if (now - previous < 200) return
    this.lastEmit.set(task.id, now)
    this.emit(task)
  }

  private emit(task: DownloadTask): void {
    this.lastEmit.set(task.id, Date.now())
    if (this.win.isDestroyed()) return
    this.win.webContents.send('downloads:task', task)
  }

  private sendList(): void {
    if (this.win.isDestroyed()) return
    this.win.webContents.send('downloads:list', this.list())
  }

  private sendHistory(): void {
    if (this.win.isDestroyed()) return
    this.win.webContents.send('downloads:history', this.listHistory())
  }

  private must(id: string): DownloadTask {
    const task = this.tasks.find((item) => item.id === id)
    if (!task) throw new Error('找不到这个任务')
    return task
  }


  private killProcess(child: ChildProcess): void {
    if (!child.pid) {
      child.kill()
      return
    }
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true })
      return
    }
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      child.kill('SIGTERM')
    }
  }

  private queueFile(): string {
    return join(app.getPath('userData'), 'queue.json')
  }

  private historyFile(): string {
    return join(app.getPath('userData'), 'history.json')
  }

  private restore(): void {
    try {
      const tasks = JSON.parse(readFileSync(this.queueFile(), 'utf8')) as DownloadTask[]
      this.tasks = tasks.map((task) => {
        if (task.status === 'downloading' || task.status === 'queued') {
          return {
            ...task,
            status: 'paused' as const,
            speed: '',
            eta: '',
            message: task.engine === 'browser' ? '应用重启后，网页下载无法继续' : '应用已重启，可继续下载'
          }
        }
        return task
      })
    } catch {
      this.tasks = []
    }
    try {
      this.history = JSON.parse(readFileSync(this.historyFile(), 'utf8')) as HistoryItem[]
    } catch {
      this.history = []
    }
  }

  private persistSoon(): void {
    if (this.persistTimer) return
    this.persistTimer = setTimeout(() => this.flush(), 250)
  }

  private flush(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = null
    const dir = app.getPath('userData')
    mkdirSync(dir, { recursive: true })
    writeFileSync(this.queueFile(), JSON.stringify(this.tasks), 'utf8')
    writeFileSync(this.historyFile(), JSON.stringify(this.history), 'utf8')
  }
}

