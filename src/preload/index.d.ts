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

export interface NetShadowApi {
  bootstrap: () => Promise<Bootstrap>
  browser: {
    navigate: (url: string) => Promise<void>
    back: () => Promise<void>
    forward: () => Promise<void>
    reload: () => Promise<void>
    home: () => Promise<void>
    getState: () => Promise<BrowserState>
    setBounds: (bounds: BrowserBounds) => Promise<void>
    onState: (callback: (state: BrowserState) => void) => () => void
  }
  downloads: {
    probe: (url: string) => Promise<ProbeResult>
    cancelProbe: () => Promise<void>
    start: (request: StartRequest) => Promise<DownloadTask>
    pause: (id: string) => Promise<void>
    resume: (id: string) => Promise<void>
    cancel: (id: string) => Promise<void>
    remove: (id: string) => Promise<void>
    clearFinished: () => Promise<void>
    openFile: (id: string) => Promise<void>
    showFolder: (id: string) => Promise<void>
    list: () => Promise<DownloadTask[]>
    history: () => Promise<HistoryItem[]>
    clearHistory: () => Promise<void>
    removeHistory: (id: string) => Promise<void>
    onTask: (callback: (task: DownloadTask) => void) => () => void
    onList: (callback: (tasks: DownloadTask[]) => void) => () => void
    onHistory: (callback: (items: HistoryItem[]) => void) => () => void
  }
  settings: {
    get: () => Promise<Settings>
    set: (patch: Partial<Settings>) => Promise<Settings>
    chooseDirectory: () => Promise<string | null>
    openPath: (target: string) => Promise<void>
    onChanged: (callback: (settings: Settings) => void) => () => void
  }
  binaries: {
    info: () => Promise<BinaryInfo>
    installYtdlp: () => Promise<BinaryInfo>
    onInfo: (callback: (info: BinaryInfo) => void) => () => void
    onInstall: (callback: (progress: InstallProgress) => void) => () => void
  }
  shell: {
    openExternal: (url: string) => Promise<void>
    copy: (text: string) => Promise<void>
  }
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<boolean>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
    onMaximized: (callback: (maximized: boolean) => void) => () => void
  }
}

declare global {
  interface Window {
    api?: NetShadowApi
  }
}

export {}
