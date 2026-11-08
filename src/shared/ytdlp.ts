import type { FormatChoice, MediaFormat, PresetId } from './types'

export interface BuildArgsInput {
  url: string
  choice: FormatChoice
  outputDir: string
  filenameTemplate: string
  ffmpegPath?: string
  proxy?: string
  cookiesPath?: string
  noPlaylist: boolean
}

const PRESET_LABELS: Record<PresetId, string> = {
  '2160': '4K',
  '1440': '2K',
  '1080': '1080p',
  '720': '720p',
  '480': '480p',
  'audio-mp3': '仅音频 MP3',
  'audio-m4a': '仅音频 M4A',
  'audio-best': '原音质'
}

const HEIGHT_PRESETS: { id: PresetId; height: number }[] = [
  { id: '2160', height: 2160 },
  { id: '1440', height: 1440 },
  { id: '1080', height: 1080 },
  { id: '720', height: 720 },
  { id: '480', height: 480 }
]

const PRESET_HEIGHT: Partial<Record<PresetId, number>> = Object.fromEntries(
  HEIGHT_PRESETS.map((item) => [item.id, item.height])
)

export function maxVideoHeight(formats: MediaFormat[]): number {
  let max = 0
  for (const item of formats) {
    if (item.kind === 'audio') continue
    if (item.height && item.height > max) max = item.height
  }
  return max
}

export const AUDIO_PRESETS: PresetId[] = ['audio-mp3', 'audio-m4a', 'audio-best']

/** Recommended picker presets: height tiers at or below source max (video only). */
export function recommendedPresets(formats: MediaFormat[]): PresetId[] {
  const max = maxVideoHeight(formats)
  return HEIGHT_PRESETS.filter((tier) => max >= tier.height).map((tier) => tier.id)
}

export function presetLabel(preset: PresetId): string {
  return PRESET_LABELS[preset]
}

export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const withScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (!url.hostname) return null
  return url.toString()
}

export function outputTemplate(dir: string, template: string): string {
  const trimmedDir = dir.replace(/[\\/]+$/, '')
  const sep = trimmedDir.includes('\\') ? '\\' : '/'
  const name = (template || '%(title)s [%(id)s].%(ext)s').replace(/[\r\n]/g, '').slice(0, 300)
  return `${trimmedDir}${sep}${name}`
}

/** Prefer H.264/AAC mp4 for PotPlayer and system players; fall back if unavailable. */
export function videoFormatSelector(height: number | null): string {
  const h = height ? `[height<=${height}]` : ''
  return [
    `bv*${h}[vcodec^=avc][ext=mp4]+ba[acodec^=mp4a]/b[ext=mp4][vcodec^=avc]`,
    `bv*${h}[ext=mp4]+ba[ext=m4a]/b[ext=mp4]`,
    `bv*${h}+ba/b`
  ].join('/')
}

function appendPreset(args: string[], preset: PresetId): void {
  if (preset === 'audio-mp3') {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0')
    return
  }
  if (preset === 'audio-m4a') {
    args.push('-x', '--audio-format', 'm4a', '--audio-quality', '0')
    return
  }
  if (preset === 'audio-best') {
    args.push('-f', 'ba/b')
    return
  }
  const height = PRESET_HEIGHT[preset] ?? null
  args.push(
    '-f',
    videoFormatSelector(height),
    '-S',
    'res,vcodec:h264,acodec:aac,ext:mp4:m4a',
    '--merge-output-format',
    'mp4'
  )
}

export function buildYtDlpArgs(input: BuildArgsInput): string[] {
  const url = normalizeUrl(input.url)
  if (!url) throw new Error('只接受 http 或 https 链接')

  const args = [
    '--newline',
    '--no-mtime',
    '--windows-filenames',
    '--retries',
    '10',
    '--fragment-retries',
    '10',
    '--continue'
  ]

  args.push(input.noPlaylist ? '--no-playlist' : '--yes-playlist')

  if (input.ffmpegPath) args.push('--ffmpeg-location', input.ffmpegPath)
  const proxy = input.proxy?.trim()
  if (proxy) {
    if (!/^(https?|socks5h?):\/\//i.test(proxy)) {
      throw new Error('代理需要以 http://、https:// 或 socks5:// 开头')
    }
    args.push('--proxy', proxy)
  }
  if (input.cookiesPath) args.push('--cookies', input.cookiesPath)

  args.push('-o', outputTemplate(input.outputDir, input.filenameTemplate))
  // Final path on its own line (more reliable than parsing Merger/Destination banners).
  // 注意：--print 会隐式打开 --quiet，把进度和状态行全部吞掉，所以必须显式关掉。
  args.push('--print', 'after_move:filepath', '--no-quiet', '--progress')

  if (input.choice.kind === 'preset') {
    appendPreset(args, input.choice.preset || '1080')
  } else {
    const formatId = input.choice.formatId || ''
    if (!/^[A-Za-z0-9._+-]+$/.test(formatId)) throw new Error('格式编号无效')
    if (input.choice.mergeAudio) {
      args.push('-f', `${formatId}+ba[ext=m4a]/ba`, '--merge-output-format', 'mp4')
    } else {
      args.push('-f', formatId)
    }
  }

  args.push(url)
  return args
}

export function quoteArg(arg: string): string {
  if (arg === '') return '""'
  if (/[\s"\\]/.test(arg)) return `"${arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  return arg
}

export function formatCommand(bin: string, args: string[]): string {
  return [bin, ...args].map(quoteArg).join(' ')
}

/** Command line shown to the user. Cookie files stay on disk and are not printed. */
export function previewCommand(bin: string, input: BuildArgsInput & { useCookies?: boolean }): string {
  const args = buildYtDlpArgs({ ...input, cookiesPath: undefined })
  if (input.useCookies) {
    const insertAt = args.findIndex((arg) => arg === '-o')
    args.splice(insertAt === -1 ? args.length - 1 : insertAt, 0, '--cookies', '<当前页面 Cookie>')
  }
  return formatCommand(bin || 'yt-dlp', args)
}

export interface ProgressUpdate {
  percent?: number
  speed?: string
  eta?: string
  sizeLabel?: string
  message?: string
  outputFile?: string
  indeterminate?: boolean
  error?: string
}

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')

export function parseYtDlpLine(raw: string): ProgressUpdate | null {
  const line = raw.replace(ANSI, '').replace(/\r/g, '').trim()
  if (!line) return null

  if (line.startsWith('ERROR:')) {
    return { error: line.replace(/^ERROR:\s*/, '') }
  }

  // Bilibili 等站点：所选清晰度需要登录 / 会员，引擎会自动降级。
  if (/^\[[^\]]+\] Format\(s\) .* are missing/.test(line)) {
    return { message: '该清晰度需要登录或会员，已自动改用可下载的清晰度' }
  }

  // [BiliBili] Extracting URL: … / [youtube] Extracting URL: …
  if (/^\[[^\]]+\] Extracting URL:/.test(line)) {
    return { message: '正在解析页面…', indeterminate: true }
  }

  const playlist = line.match(/^\[download\] Downloading item (\d+) of (\d+)/)
  if (playlist) {
    return { message: `正在下载第 ${playlist[1]} / ${playlist[2]} 项`, indeterminate: true }
  }

  const withEta = line.match(
    /^\[download\]\s+([\d.]+)%\s+of\s+(~?\s*[\d.]+\s*[A-Za-z]+|Unknown(?:\s+size)?)\s+at\s+(.+?)\s+ETA\s+(\S+)/
  )
  if (withEta) {
    const percent = Number(withEta[1])
    const speed = withEta[3].trim()
    return {
      percent,
      sizeLabel: withEta[2].replace(/\s+/g, ''),
      speed: /unknown/i.test(speed) ? '' : speed,
      eta: /unknown/i.test(withEta[4]) ? '' : withEta[4],
      message: `正在下载 ${percent.toFixed(1)}%`,
      indeterminate: false
    }
  }

  const bytesOnly = line.match(/^\[download\]\s+([\d.]+\s*[A-Za-z]+)\s+at\s+(.+?)\s+ETA\s+(\S+)/)
  if (bytesOnly && !line.includes('%')) {
    const speed = bytesOnly[2].trim()
    return {
      sizeLabel: bytesOnly[1].replace(/\s+/g, ''),
      speed: /unknown/i.test(speed) ? '' : speed,
      eta: /unknown/i.test(bytesOnly[3]) ? '' : bytesOnly[3],
      message: '正在下载',
      indeterminate: true
    }
  }

  const finished = line.match(/^\[download\]\s+100% of\s+(.+?)\s+in\s+/)
  if (finished) {
    return {
      percent: 100,
      sizeLabel: finished[1].replace(/\s+/g, ''),
      message: '片段已完成',
      indeterminate: false
    }
  }

  const destination = line.match(/^\[download\] Destination: (.+)$/)
  if (destination) return { outputFile: destination[1].trim(), message: '正在写入文件' }

  const already = line.match(/^\[download\] (.+) has already been downloaded/)
  if (already) {
    return { outputFile: already[1].trim(), percent: 100, message: '文件已存在，已跳过' }
  }

  const merger = line.match(/^\[Merger\] Merging formats into "(.+)"/)
  if (merger) {
    return { outputFile: merger[1], message: '正在合并音视频…', percent: 99, indeterminate: false }
  }

  const extract = line.match(/^\[ExtractAudio\] Destination: (.+)$/)
  if (extract) {
    return { outputFile: extract[1].trim(), message: '正在提取音频…', percent: 99 }
  }

  if (/^\[(Merger|ExtractAudio|Fixup|EmbedSubtitle|Metadata)\]/.test(line)) {
    return { message: '正在后期处理…', percent: 99 }
  }

  // yt-dlp --print after_move:filepath (and similar) emits a bare path.
  if (isFinalFilepathLine(line)) {
    return { outputFile: line, message: '已写入文件', percent: 100 }
  }

  return null
}

function isFinalFilepathLine(line: string): boolean {
  if (!line || line.startsWith('[')) return false
  if (/^(ERROR:|WARNING:|Deleting|\[)/i.test(line)) return false
  const media = /\.(mp4|m4a|mp3|mkv|webm|mov|flac|opus|ogg|wav|aac)$/i
  if (!media.test(line)) return false
  // Windows drive path or POSIX absolute / home-relative
  if (/^[A-Za-z]:[\\/]/.test(line)) return true
  if (line.startsWith('/') || line.startsWith('~/')) return true
  return false
}

interface RawFormat {
  format_id?: string
  ext?: string
  vcodec?: string
  acodec?: string
  height?: number | null
  width?: number | null
  fps?: number | null
  tbr?: number | null
  abr?: number | null
  filesize?: number | null
  filesize_approx?: number | null
  format_note?: string
  protocol?: string
  resolution?: string
}

interface RawInfo {
  title?: string
  thumbnail?: string
  duration?: number
  extractor?: string
  extractor_key?: string
  webpage_url?: string
  _type?: string
  formats?: RawFormat[]
  entries?: unknown[]
}

function codecFamily(codec?: string): string {
  if (!codec || codec === 'none') return 'none'
  const head = codec.split('.')[0].toLowerCase()
  if (head.startsWith('avc')) return 'avc'
  if (head.startsWith('hev') || head.startsWith('hvc')) return 'hevc'
  if (head.startsWith('av01') || head === 'av1') return 'av1'
  if (head.startsWith('vp9') || head === 'vp09') return 'vp9'
  if (head.startsWith('mp4a')) return 'aac'
  if (head.startsWith('opus')) return 'opus'
  return head
}

function isStoryboard(format: RawFormat): boolean {
  const note = (format.format_note || '').toLowerCase()
  const id = format.format_id || ''
  return (
    note.includes('storyboard') ||
    id.startsWith('sb') ||
    (format.ext || '') === 'mhtml' ||
    (format.protocol || '').includes('mhtml')
  )
}

export function formatBytes(size?: number | null): string {
  if (!size || size <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let value = size
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  const digits = value >= 10 || index === 0 ? 0 : 1
  return `${value.toFixed(digits)} ${units[index]}`
}

export function formatDuration(seconds?: number | null): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return ''
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

function mapOne(format: RawFormat): MediaFormat | null {
  if (!format.format_id || isStoryboard(format)) return null
  const vcodec = format.vcodec || 'none'
  const acodec = format.acodec || 'none'
  const ext = (format.ext || '').toLowerCase()
  let hasVideo = vcodec !== 'none'
  let hasAudio = acodec !== 'none'
  // Direct files often omit codecs. Keep them so the picker still offers the file.
  if (!hasVideo && !hasAudio) {
    if (['mp4', 'webm', 'mkv', 'mov', 'flv', 'avi'].includes(ext)) {
      hasVideo = true
      hasAudio = true
    } else if (['m4a', 'mp3', 'aac', 'opus', 'ogg', 'flac', 'wav'].includes(ext)) {
      hasAudio = true
    } else {
      return null
    }
  }
  const kind: MediaFormat['kind'] = hasVideo && hasAudio ? 'combined' : hasVideo ? 'video' : 'audio'
  const height = format.height || null
  const fps = format.fps ? Math.round(format.fps) : null
  const size = format.filesize || format.filesize_approx || null
  const rate = kind === 'audio' ? format.abr || format.tbr : format.tbr
  const bits: string[] = []
  if (kind === 'audio') {
    bits.push((format.ext || 'audio').toUpperCase())
    if (rate) bits.push(`${Math.round(rate)} kbps`)
  } else {
    bits.push(height ? `${height}p${fps && fps > 30 ? fps : ''}` : format.resolution || '视频')
    bits.push(format.ext || 'mp4')
    const family = codecFamily(vcodec)
    if (family !== 'none') bits.push(family)
    if (!hasAudio) bits.push('无声，将合并音轨')
  }
  const sizeLabel = formatBytes(size)
  if (sizeLabel) bits.push(sizeLabel)
  return {
    formatId: format.format_id,
    ext: format.ext || '',
    kind,
    label: bits.slice(0, 3).join(' · '),
    detail: bits.join(' · '),
    height,
    fps,
    vcodec,
    acodec,
    filesize: size,
    tbr: rate || null,
    mergeAudio: kind === 'video'
  }
}

export function mapFormats(formats: RawFormat[] | undefined): MediaFormat[] {
  const mapped = (formats || []).map(mapOne).filter((item): item is MediaFormat => !!item)
  const best = new Map<string, MediaFormat>()
  for (const item of mapped) {
    const key = [
      item.kind,
      item.height || 0,
      item.ext,
      item.fps || 0,
      codecFamily(item.vcodec),
      codecFamily(item.acodec),
      item.mergeAudio ? 'm' : 's'
    ].join('|')
    const prev = best.get(key)
    if (!prev || (item.tbr || 0) > (prev.tbr || 0)) best.set(key, item)
  }
  const list = [...best.values()]
  const videos = list
    .filter((item) => item.kind !== 'audio')
    .sort((a, b) => (b.height || 0) - (a.height || 0) || (b.tbr || 0) - (a.tbr || 0))
  const audios = list
    .filter((item) => item.kind === 'audio')
    .sort((a, b) => (b.tbr || 0) - (a.tbr || 0))
  return [...videos.slice(0, 24), ...audios.slice(0, 12)]
}

export interface MappedProbe {
  title: string
  thumbnail?: string
  duration?: number
  extractor?: string
  webpageUrl: string
  formats: MediaFormat[]
  isPlaylist: boolean
}

export function mapProbeJson(raw: unknown, fallbackUrl: string): MappedProbe {
  const info = (raw && typeof raw === 'object' ? raw : {}) as RawInfo
  const isPlaylist = info._type === 'playlist' || Array.isArray(info.entries)
  return {
    title: info.title || fallbackUrl,
    thumbnail: typeof info.thumbnail === 'string' ? info.thumbnail : undefined,
    duration: typeof info.duration === 'number' ? info.duration : undefined,
    extractor: info.extractor_key || info.extractor,
    webpageUrl: info.webpage_url || fallbackUrl,
    formats: mapFormats(info.formats),
    isPlaylist
  }
}

export function defaultChoice(
  preference: PresetId | 'ask' | 'source-max',
  formats: MediaFormat[] = []
): FormatChoice {
  const recommended = recommendedPresets(formats)
  let preset: PresetId
  if (preference === 'ask' || preference === 'source-max') {
    // Highest available height tier for this source (片源最高).
    preset = recommended[0] || AUDIO_PRESETS[0]
  } else if (formats.length === 0) {
    // Probe not ready yet — keep the saved preference until formats arrive.
    preset = preference
  } else if (recommended.includes(preference) || AUDIO_PRESETS.includes(preference)) {
    preset = preference
  } else {
    preset = recommended[0] || AUDIO_PRESETS[0]
  }
  return { kind: 'preset', preset, label: presetLabel(preset) }
}

export function choiceNeedsFfmpeg(choice: FormatChoice): boolean {
  if (choice.kind === 'preset') {
    return choice.preset !== 'audio-best'
  }
  return !!choice.mergeAudio
}
