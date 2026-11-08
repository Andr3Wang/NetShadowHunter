import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildYtDlpArgs,
  defaultChoice,
  formatCommand,
  mapFormats,
  mapProbeJson,
  normalizeUrl,
  parseYtDlpLine,
  previewCommand,
  recommendedPresets
} from '../src/shared/ytdlp'

describe('normalizeUrl', () => {
  it('adds https and rejects other protocols', () => {
    assert.equal(normalizeUrl('example.com/watch'), 'https://example.com/watch')
    assert.equal(normalizeUrl('https://example.com/a b'), 'https://example.com/a%20b')
    assert.equal(normalizeUrl('javascript:alert(1)'), null)
    assert.equal(normalizeUrl('file:///etc/passwd'), null)
    assert.equal(normalizeUrl(''), null)
  })
})

describe('buildYtDlpArgs', () => {
  const base = {
    url: 'https://example.com/watch?v=1',
    outputDir: 'C:\\Users\\Ada\\Videos',
    filenameTemplate: '%(title).200s [%(id)s].%(ext)s',
    noPlaylist: true
  }

  it('builds a video preset without a shell', () => {
    const args = buildYtDlpArgs({ ...base, choice: defaultChoice('1080') })
    assert.equal(args.includes('--newline'), true)
    assert.equal(args.includes('--no-playlist'), true)
    // --print implies --quiet; progress output must be re-enabled explicitly.
    assert.equal(args.includes('--no-quiet'), true)
    assert.equal(args.includes('--progress'), true)
    assert.ok(args.indexOf('--no-quiet') > args.indexOf('--print'))
    assert.equal(args.includes('--merge-output-format'), true)
    assert.ok(args.some((arg) => arg.includes('vcodec^=avc') && arg.includes('height<=1080')))
    assert.ok(args.includes('-S'))
    assert.ok(args.includes('res,vcodec:h264,acodec:aac,ext:mp4:m4a'))
    assert.equal(args.at(-1), 'https://example.com/watch?v=1')
    assert.equal(args.includes('C:\\Users\\Ada\\Videos\\%(title).200s [%(id)s].%(ext)s'), true)
  })

  it('builds mp3 and m4a extract commands', () => {
    const mp3 = buildYtDlpArgs({ ...base, choice: { kind: 'preset', preset: 'audio-mp3', label: 'mp3' } })
    assert.deepEqual(mp3.filter((arg) => ['-x', '--audio-format', 'mp3'].includes(arg)).length, 3)
    const m4a = buildYtDlpArgs({ ...base, choice: { kind: 'preset', preset: 'audio-m4a', label: 'm4a' } })
    assert.ok(m4a.includes('m4a'))
  })

  it('merges video-only formats and keeps the id as one argument', () => {
    const args = buildYtDlpArgs({
      ...base,
      choice: { kind: 'id', formatId: '137', mergeAudio: true, label: '1080p' },
      ffmpegPath: 'D:\\ffmpeg\\bin\\ffmpeg.exe',
      proxy: 'http://127.0.0.1:7890',
      cookiesPath: 'C:\\cookie.txt'
    })
    assert.ok(args.includes('137+ba[ext=m4a]/ba'))
    assert.ok(args.includes('--ffmpeg-location'))
    assert.ok(args.includes('--cookies'))
    assert.equal(args.includes('C:\\cookie.txt'), true)
    assert.equal(args.some((arg) => arg.includes('&&') || arg.includes(';')), false)
  })

  it('rejects format ids and proxies that could be extra switches', () => {
    assert.throws(() =>
      buildYtDlpArgs({
        ...base,
        choice: { kind: 'id', formatId: '137 && calc', mergeAudio: false, label: 'bad' }
      })
    )
    assert.throws(() => buildYtDlpArgs({ ...base, choice: defaultChoice('1080'), proxy: 'not a proxy' }))
    assert.throws(() => buildYtDlpArgs({ ...base, url: 'not a url', choice: defaultChoice('1080') }))
  })

  it('redacts cookies in the preview', () => {
    const preview = previewCommand('yt-dlp', {
      ...base,
      choice: defaultChoice('1080'),
      useCookies: true,
      cookiesPath: 'C:\\secret.txt'
    })
    assert.match(preview, /--cookies "<当前页面 Cookie>"/)
    assert.equal(preview.includes('secret'), false)
    assert.match(formatCommand('yt-dlp', ['-o', 'a b.mp4']), /"a b\.mp4"/)
  })
})

describe('parseYtDlpLine', () => {
  it('reads percent, speed and eta', () => {
    const update = parseYtDlpLine('[download]  15.2% of   10.50MiB at    1.25MiB/s ETA 00:07')
    assert.equal(update?.percent, 15.2)
    assert.equal(update?.speed, '1.25MiB/s')
    assert.equal(update?.eta, '00:07')
    assert.equal(update?.sizeLabel, '10.50MiB')
  })

  it('reads approximate sizes, destinations, merge and errors', () => {
    const approx = parseYtDlpLine('[download]   3.0% of ~  20.00MiB at  500.00KiB/s ETA 00:40 (frag 1/20)')
    assert.equal(approx?.percent, 3)
    assert.equal(approx?.speed, '500.00KiB/s')
    assert.equal(parseYtDlpLine('[download]   0.0% of    1.00MiB at  Unknown B/s ETA Unknown')?.speed, '')
    assert.equal(parseYtDlpLine('[download] Destination: /tmp/foo.mp4')?.outputFile, '/tmp/foo.mp4')
    assert.equal(parseYtDlpLine('[Merger] Merging formats into "/tmp/foo.mp4"')?.message, '正在合并音视频…')
    assert.equal(parseYtDlpLine('[ExtractAudio] Destination: /tmp/foo.mp3')?.outputFile, '/tmp/foo.mp3')
    assert.equal(parseYtDlpLine('[download] /tmp/foo.mp4 has already been downloaded')?.percent, 100)
    assert.equal(parseYtDlpLine('ERROR: Unsupported URL: https://example.com')?.error, 'Unsupported URL: https://example.com')
    assert.match(parseYtDlpLine('[download] Downloading item 2 of 5')?.message || '', /2 \/ 5/)
    assert.match(parseYtDlpLine('[BiliBili] Extracting URL: https://www.bilibili.com/video/BV1')?.message || '', /解析/)
  })
})

describe('mapProbeJson', () => {
  it('drops storyboards and labels silent video for merging', () => {
    const mapped = mapProbeJson(
      {
        title: 'Sample',
        duration: 65,
        extractor_key: 'generic',
        formats: [
          { format_id: 'sb0', ext: 'mhtml', format_note: 'storyboard', vcodec: 'none', acodec: 'none' },
          { format_id: '137', ext: 'mp4', height: 1080, fps: 30, vcodec: 'avc1.640028', acodec: 'none', tbr: 2000 },
          { format_id: '140', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2', abr: 128 }
        ]
      },
      'https://example.com/v'
    )
    assert.equal(mapped.title, 'Sample')
    assert.equal(mapped.formats.length, 2)
    const video = mapped.formats.find((item) => item.formatId === '137')
    assert.equal(video?.mergeAudio, true)
    assert.match(video?.detail || '', /无声/)
    assert.equal(mapFormats(undefined).length, 0)
    const direct = mapFormats([{ format_id: 'mp4', ext: 'mp4' }])
    assert.equal(direct[0]?.kind, 'combined')
    assert.equal(direct[0]?.mergeAudio, false)
  })
})


describe('recommendedPresets', () => {
  it('shows only height tiers at or below source max', () => {
    const fourK = recommendedPresets([
      { formatId: '1', ext: 'mp4', kind: 'video' as const, label: '', detail: '', height: 2160, fps: 30, vcodec: 'avc1', acodec: 'none', filesize: null, tbr: 8000, mergeAudio: true }
    ])
    assert.deepEqual(fourK, ['2160', '1440', '1080', '720', '480'])

    const hd = recommendedPresets([
      { formatId: '1', ext: 'mp4', kind: 'video' as const, label: '', detail: '', height: 1080, fps: 30, vcodec: 'avc1', acodec: 'none', filesize: null, tbr: 2000, mergeAudio: true }
    ])
    assert.deepEqual(hd, ['1080', '720', '480'])

    const sd = recommendedPresets([
      { formatId: '1', ext: 'mp4', kind: 'video' as const, label: '', detail: '', height: 720, fps: 30, vcodec: 'avc1', acodec: 'none', filesize: null, tbr: 1000, mergeAudio: true }
    ])
    assert.deepEqual(sd, ['720', '480'])
  })

  it('caps 4K / 2K selectors with height filters', () => {
    const uhd = buildYtDlpArgs({
      url: 'https://example.com/watch?v=1',
      outputDir: 'C:\\Videos',
      filenameTemplate: '%(title)s.%(ext)s',
      noPlaylist: true,
      choice: defaultChoice('2160')
    })
    assert.ok(uhd.some((arg) => arg.includes('height<=2160')))
    const qhd = buildYtDlpArgs({
      url: 'https://example.com/watch?v=1',
      outputDir: 'C:\\Videos',
      filenameTemplate: '%(title)s.%(ext)s',
      noPlaylist: true,
      choice: defaultChoice('1440')
    })
    assert.ok(qhd.some((arg) => arg.includes('height<=1440')))
  })

  it('parses after_move filepath lines', () => {
    const update = parseYtDlpLine('D:\\Video\\100人 [BV1Cpxj6QEMn].mp4')
    assert.equal(update?.outputFile, 'D:\\Video\\100人 [BV1Cpxj6QEMn].mp4')
    assert.equal(parseYtDlpLine('[download] Destination: D:\\a.mp4')?.outputFile, 'D:\\a.mp4')
  })

  it('defaultChoice picks the top available video tier', () => {
    const formats = [
      { formatId: '1', ext: 'mp4', kind: 'video' as const, label: '', detail: '', height: 1080, fps: 30, vcodec: 'avc1', acodec: 'none', filesize: null, tbr: 2000, mergeAudio: true }
    ]
    assert.equal(defaultChoice('ask', formats).preset, '1080')
    assert.equal(defaultChoice('2160', formats).preset, '1080')
    assert.equal(defaultChoice('720', formats).preset, '720')
    assert.equal(defaultChoice('source-max', formats).preset, '1080')
  })
})
