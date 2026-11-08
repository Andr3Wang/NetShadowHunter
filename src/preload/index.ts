import { contextBridge, ipcRenderer } from 'electron'
import type {
  BinaryInfo,
  Bootstrap,
  BrowserBounds,
  BrowserState,
  DownloadTask,
  HistoryItem,
  InstallProgress,
  ProbeResult,
  Settings,
  StartRequest
} from '@shared/types'

function serialize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: unknown, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  bootstrap: (): Promise<Bootstrap> => ipcRenderer.invoke('app:bootstrap'),
  browser: {
    navigate: (url: string): Promise<void> => ipcRenderer.invoke('browser:navigate', url),
    back: (): Promise<void> => ipcRenderer.invoke('browser:back'),
    forward: (): Promise<void> => ipcRenderer.invoke('browser:forward'),
    reload: (): Promise<void> => ipcRenderer.invoke('browser:reload'),
    home: (): Promise<void> => ipcRenderer.invoke('browser:home'),
    getState: (): Promise<BrowserState> => ipcRenderer.invoke('browser:get-state'),
    setBounds: (bounds: BrowserBounds): Promise<void> => ipcRenderer.invoke('browser:set-bounds', bounds),
    onState: (callback: (state: BrowserState) => void): (() => void) => subscribe('browser:state', callback)
  },
  downloads: {
    probe: (url: string): Promise<ProbeResult> => ipcRenderer.invoke('downloads:probe', url),
    cancelProbe: (): Promise<void> => ipcRenderer.invoke('downloads:probe-cancel'),
    start: (request: StartRequest): Promise<DownloadTask> =>
      ipcRenderer.invoke('downloads:start', serialize(request)),
    pause: (id: string): Promise<void> => ipcRenderer.invoke('downloads:pause', id),
    resume: (id: string): Promise<void> => ipcRenderer.invoke('downloads:resume', id),
    cancel: (id: string): Promise<void> => ipcRenderer.invoke('downloads:cancel', id),
    remove: (id: string): Promise<void> => ipcRenderer.invoke('downloads:remove', id),
    clearFinished: (): Promise<void> => ipcRenderer.invoke('downloads:clear-finished'),
    openFile: (id: string): Promise<void> => ipcRenderer.invoke('downloads:open-file', id),
    showFolder: (id: string): Promise<void> => ipcRenderer.invoke('downloads:show-folder', id),
    list: (): Promise<DownloadTask[]> => ipcRenderer.invoke('downloads:list'),
    history: (): Promise<HistoryItem[]> => ipcRenderer.invoke('downloads:history'),
    clearHistory: (): Promise<void> => ipcRenderer.invoke('downloads:clear-history'),
    removeHistory: (id: string): Promise<void> => ipcRenderer.invoke('downloads:remove-history', id),
    onTask: (callback: (task: DownloadTask) => void): (() => void) => subscribe('downloads:task', callback),
    onList: (callback: (tasks: DownloadTask[]) => void): (() => void) => subscribe('downloads:list', callback),
    onHistory: (callback: (items: HistoryItem[]) => void): (() => void) =>
      subscribe('downloads:history', callback)
  },
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
    set: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke('settings:set', patch),
    chooseDirectory: (): Promise<string | null> => ipcRenderer.invoke('settings:choose-dir'),
    openPath: (target: string): Promise<void> => ipcRenderer.invoke('settings:open-path', target),
    onChanged: (callback: (settings: Settings) => void): (() => void) => subscribe('settings:changed', callback)
  },
  binaries: {
    info: (): Promise<BinaryInfo> => ipcRenderer.invoke('binaries:info'),
    installYtdlp: (): Promise<BinaryInfo> => ipcRenderer.invoke('binaries:install-ytdlp'),
    onInfo: (callback: (info: BinaryInfo) => void): (() => void) => subscribe('binaries:info', callback),
    onInstall: (callback: (progress: InstallProgress) => void): (() => void) =>
      subscribe('binaries:install-progress', callback)
  },
  shell: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:open-external', url),
    copy: (text: string): Promise<void> => ipcRenderer.invoke('shell:copy', text)
  },
  window: {
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    maximize: (): Promise<boolean> => ipcRenderer.invoke('window:maximize'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
    onMaximized: (callback: (maximized: boolean) => void): (() => void) =>
      subscribe('window:maximized', callback)
  }
}

export type NetShadowApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error preload fallback when isolation is off
  window.api = api
}
