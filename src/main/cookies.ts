import { Session } from 'electron'
import { chmod, mkdir, rm, writeFile } from 'fs/promises'
import { dirname } from 'path'

/**
 * Writes the embedded browser's cookies for one URL into a Netscape file
 * that yt-dlp can read. The file is local, mode 0600, and deleted by the caller.
 * Values are never logged.
 */
export async function writeCookieJar(ses: Session, url: string, dest: string): Promise<number> {
  const cookies = await ses.cookies.get({ url })
  const lines = [
    '# Netscape HTTP Cookie File',
    '# Local export for yt-dlp. Not uploaded.',
    ''
  ]
  for (const cookie of cookies) {
    const domain = cookie.domain || ''
    const includeSubdomains = domain.startsWith('.') ? 'TRUE' : 'FALSE'
    const secure = cookie.secure ? 'TRUE' : 'FALSE'
    const expiry = cookie.expirationDate ? String(Math.floor(cookie.expirationDate)) : '0'
    const name = cookie.name.replace(/[\t\r\n]/g, '')
    const value = (cookie.value || '').replace(/[\t\r\n]/g, '')
    lines.push([domain, includeSubdomains, cookie.path || '/', secure, expiry, name, value].join('\t'))
  }
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(dest, `${lines.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 })
  await chmod(dest, 0o600)
  return cookies.length
}

export async function removeCookieJar(dest: string | null): Promise<void> {
  if (!dest) return
  await rm(dest, { force: true })
}
