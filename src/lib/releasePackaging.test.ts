import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const tauriConfigPath = resolve(process.cwd(), 'src-tauri/tauri.conf.json')

describe('Windows release packaging', () => {
  it('installs the GNU WebView2 loader beside the executable', () => {
    const config = JSON.parse(readFileSync(tauriConfigPath, 'utf8')) as {
      bundle?: { resources?: Record<string, string> }
    }

    expect(config.bundle?.resources).toMatchObject({
      'resources/windows-x64/WebView2Loader.dll': 'WebView2Loader.dll',
    })
  })
})
