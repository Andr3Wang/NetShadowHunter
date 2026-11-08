import { spawn } from 'child_process'
import { app, session } from 'electron'
import { access, chmod, constants, mkdir, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { BinaryInfo, BinarySlot } from '@shared/types'

const missing = (): BinarySlot => ({ path: '', version: null, source: 'missing' })

function binFileName(base: string): string {
  if (process.platform !== 'win32') return base
  return base.toLowerCase().endsWith('.exe') ? base : `${base}.exe`
}

/** Prefer project resources/bin (dev + packaged extraResources). */
export function projectBinPath(base: string): string {
  const name = binFileName(base)
  if (app.isPackaged) {
    return join(process.resourcesPath, 'bin', name)
  }
  return join(process.cwd(), 'resources', 'bin', name)
}

export function bundledYtdlpPath(): string {
  return join(app.getPath('userData'), 'bin', binFileName('yt-dlp'))
}

function ytdlpDownloadUrl(): string {
  if (process.platform === 'win32') {
    return 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
  }
  if (process.platform === 'darwin') {
    return 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos'
  }
  return 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp'
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function which(command: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (!command || command.includes('/') || command.includes('\\')) {
      resolve(null)
      return
    }
    const locator = process.platform === 'win32' ? 'where' : 'which'
    const child = spawn(locator, [command], { windowsHide: true })
    let output = ''
    const timer = setTimeout(() => {
      child.kill()
      resolve(null)
    }, 4000)
    child.stdout.on('data', (chunk) => {
      output += String(chunk)
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve(null)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        resolve(null)
        return
      }
      const line = output
        .split(/\r?\n/)
        .map((item) => item.trim())
        .find(Boolean)
      resolve(line || null)
    })
  })
}

function runVersion(filePath: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(filePath, args, { windowsHide: true })
    let output = ''
    const timer = setTimeout(() => {
      child.kill()
      resolve(null)
    }, 8000)
    const collect = (chunk: unknown): void => {
      output += String(chunk)
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.on('error', () => {
      clearTimeout(timer)
      resolve(null)
    })
    child.on('close', () => {
      clearTimeout(timer)
      const line = output
        .split(/\r?\n/)
        .map((item) => item.trim())
        .find(Boolean)
      if (!line) {
        resolve(null)
        return
      }
      const dated = line.match(/\d{4}\.\d{2}\.\d{2}/)
      if (dated && args.includes('--version')) {
        resolve(dated[0])
        return
      }
      const ffmpeg = line.match(/ffmpeg version\s+(\S+)/i)
      if (ffmpeg) {
        resolve(ffmpeg[1])
        return
      }
      resolve(line.slice(0, 80))
    })
  })
}

async function resolveSlot(
  explicit: string,
  names: string[],
  versionArgs: string[],
  extras: { path: string; source: BinarySlot['source'] }[] = []
): Promise<BinarySlot> {
  const candidates: { path: string; source: BinarySlot['source'] }[] = []
  const trimmed = (explicit || '').trim()
  const custom = Boolean(trimmed) && !names.includes(trimmed)
  if (custom) candidates.push({ path: trimmed, source: 'settings' })
  if (!custom) {
    for (const extra of extras) candidates.push(extra)
    for (const name of names) {
      const found = await which(name)
      if (found) candidates.push({ path: found, source: 'path' })
    }
  }

  const seen = new Set<string>()
  for (const candidate of candidates) {
    if (!candidate.path || seen.has(candidate.path)) continue
    seen.add(candidate.path)
    if (!(await exists(candidate.path))) continue
    const version = await runVersion(candidate.path, versionArgs)
    if (!version) continue
    return { path: candidate.path, version, source: candidate.source }
  }
  return missing()
}

export async function detectBinaries(ytdlpPath: string, ffmpegPath: string): Promise<BinaryInfo> {
  const [ytdlp, ffmpeg] = await Promise.all([
    resolveSlot(ytdlpPath, ['yt-dlp', 'yt-dlp.exe', 'yt-dlp.cmd'], ['--version'], [
      { path: projectBinPath('yt-dlp'), source: 'bundled' }
    ]),
    resolveSlot(ffmpegPath, ['ffmpeg', 'ffmpeg.exe'], ['-version'], [
      { path: projectBinPath('ffmpeg'), source: 'bundled' }
    ])
  ])
  return { ytdlp, ffmpeg }
}

export async function installYtdlp(
  proxy: string,
  onProgress: (progress: number, message: string) => void
): Promise<BinarySlot> {
  const dest = bundledYtdlpPath()
  await mkdir(dirname(dest), { recursive: true })
  onProgress(0, '正在从 GitHub 下载引擎…')
  const ses = session.fromPartition('netshadow:bin-download')
  if (proxy.trim()) {
    await ses.setProxy({ proxyRules: proxy.trim() })
  } else {
    await ses.setProxy({ mode: 'direct' })
  }
  const response = await ses.fetch(ytdlpDownloadUrl(), {
    redirect: 'follow',
    headers: { 'User-Agent': 'netshadow-hunter' }
  })
  if (!response.ok || !response.body) {
    throw new Error(`下载引擎失败（HTTP ${response.status}）。可手动放入 resources\\bin 后重试。`)
  }
  const total = Number(response.headers.get('content-length') || 0)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  while (true) {
    const step = await reader.read()
    if (step.done) break
    if (!step.value) continue
    chunks.push(step.value)
    received += step.value.byteLength
    const ratio = total > 0 ? received / total : 0
    onProgress(ratio, total > 0 ? `正在下载引擎 ${Math.round(ratio * 100)}%` : '正在下载引擎…')
  }
  const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
  if (buffer.length < 100_000) {
    throw new Error('下载到的文件过小，可能不是有效的引擎文件。')
  }
  await writeFile(dest, buffer)
  if (process.platform !== 'win32') await chmod(dest, 0o755)
  onProgress(1, '正在检查引擎…')
  const version = await runVersion(dest, ['--version'])
  if (!version) throw new Error('引擎已保存，但无法运行。请检查系统是否允许执行该文件。')
  return { path: dest, version, source: 'bundled' }
}
