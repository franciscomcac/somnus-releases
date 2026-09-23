// Somnus auto-update: installed copies update themselves from GitHub Releases on
// franciscomcac/somnus-releases (the release script uploads the signed installer
// plus latest.yml there). New versions download quietly in the background and
// install the next time Somnus restarts, or right away when the customer clicks
// "Restart now". Nothing is rebuilt on the customer's computer.
//
// The upstream Hermes updater (git pull + local rebuild) is switched off for
// installed Somnus builds; see SOMNUS_AUTO_UPDATE in main.ts.

import type { BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'

import { SOMNUS } from './somnus-brand'

const { autoUpdater } = electronUpdater

const FIRST_CHECK_DELAY_MS = 20_000
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

export interface SomnusUpdateState {
  status: 'idle' | 'checking' | 'downloading' | 'ready' | 'error'
  currentVersion: string
  version: null | string
  percent: null | number
  message: null | string
}

type Log = (line: string) => void

let started = false
let state: SomnusUpdateState = { status: 'idle', currentVersion: '', version: null, percent: null, message: null }
let getWindows: () => BrowserWindow[] = () => []

function broadcast() {
  for (const win of getWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('somnus:update-state', state)
    }
  }
}

function setState(patch: Partial<SomnusUpdateState>) {
  state = { ...state, ...patch }
  broadcast()
}

export function somnusUpdateState(): SomnusUpdateState {
  return state
}

export function startSomnusAutoUpdate(opts: {
  currentVersion: string
  log: Log
  windows: () => BrowserWindow[]
}): void {
  if (started) {
    return
  }

  started = true
  getWindows = opts.windows
  state = { ...state, currentVersion: opts.currentVersion }

  const [owner, repo] = SOMNUS.releasesRepo.split('/')
  autoUpdater.setFeedURL({ provider: 'github', owner, repo, releaseType: 'release' })
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false
  autoUpdater.logger = {
    debug: () => {},
    error: (m: unknown) => opts.log(`[somnus-update] ${String(m)}`),
    info: (m: unknown) => opts.log(`[somnus-update] ${String(m)}`),
    warn: (m: unknown) => opts.log(`[somnus-update] ${String(m)}`)
  }

  autoUpdater.on('checking-for-update', () => {
    if (state.status !== 'ready') {
      setState({ status: 'checking', message: null })
    }
  })
  autoUpdater.on('update-available', info => setState({ status: 'downloading', version: info.version, percent: 0 }))
  autoUpdater.on('update-not-available', () => {
    if (state.status !== 'ready') {
      setState({ status: 'idle', percent: null })
    }
  })
  autoUpdater.on('download-progress', p => setState({ status: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', info => setState({ status: 'ready', version: info.version, percent: 100 }))
  autoUpdater.on('error', error => {
    opts.log(`[somnus-update] error: ${error?.message || String(error)}`)

    if (state.status !== 'ready') {
      setState({ status: 'error', message: error?.message || String(error) })
    }
  })

  const check = () => {
    if (state.status === 'ready' || state.status === 'downloading') {
      return
    }

    autoUpdater.checkForUpdates().catch(error => {
      opts.log(`[somnus-update] check failed: ${error?.message || String(error)}`)
    })
  }

  setTimeout(check, FIRST_CHECK_DELAY_MS)
  setInterval(check, CHECK_INTERVAL_MS).unref?.()
}

export function checkSomnusUpdateNow(): SomnusUpdateState {
  if (started && state.status !== 'ready' && state.status !== 'downloading') {
    autoUpdater.checkForUpdates().catch(() => {})
  }

  return state
}

/** Quit and run the downloaded installer silently, then relaunch Somnus. */
export function installSomnusUpdateNow(): boolean {
  if (state.status !== 'ready') {
    return false
  }

  setImmediate(() => autoUpdater.quitAndInstall(true, true))

  return true
}
