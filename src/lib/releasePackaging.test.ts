import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const tauriConfigPath = resolve(process.cwd(), 'src-tauri/tauri.conf.json')
const tauriMainPath = resolve(process.cwd(), 'src-tauri/src/main.rs')

describe('Windows release packaging', () => {
  it('uses the Windows GUI subsystem so the installed app does not open a console window', () => {
    const entrypoint = readFileSync(tauriMainPath, 'utf8')

    expect(entrypoint).toContain('#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]')
  })

  it('installs the GNU WebView2 loader beside the executable', () => {
    const config = JSON.parse(readFileSync(tauriConfigPath, 'utf8')) as {
      bundle?: { resources?: Record<string, string> }
    }

    expect(config.bundle?.resources).toMatchObject({
      'resources/windows-x64/WebView2Loader.dll': 'WebView2Loader.dll',
    })
  })

  it('fits the desktop window within compact and scaled Windows work areas', () => {
    const config = JSON.parse(readFileSync(tauriConfigPath, 'utf8')) as {
      app?: { windows?: Array<{ minWidth?: number; minHeight?: number }> }
    }
    const mainWindow = config.app?.windows?.[0]

    expect(mainWindow?.minWidth).toBeLessThanOrEqual(760)
    expect(mainWindow?.minHeight).toBeLessThanOrEqual(520)
  })
})
