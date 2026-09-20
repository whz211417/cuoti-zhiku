import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const tauriConfigPath = resolve(process.cwd(), 'src-tauri/tauri.conf.json')
const tauriMainPath = resolve(process.cwd(), 'src-tauri/src/main.rs')
const capabilityPath = resolve(process.cwd(), 'src-tauri/capabilities/main.json')
const cargoManifestPath = resolve(process.cwd(), 'src-tauri/Cargo.toml')
const packageManifestPath = resolve(process.cwd(), 'package.json')
const releaseWorkflowPath = resolve(process.cwd(), '.github/workflows/release.yml')

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

  it('pins a signed HTTPS updater trust boundary', () => {
    const config = JSON.parse(readFileSync(tauriConfigPath, 'utf8')) as {
      bundle?: { createUpdaterArtifacts?: boolean }
      plugins?: { updater?: { endpoints?: string[]; pubkey?: string } }
    }
    const capability = JSON.parse(readFileSync(capabilityPath, 'utf8')) as { permissions?: string[] }
    const cargo = readFileSync(cargoManifestPath, 'utf8')
    const pkg = JSON.parse(readFileSync(packageManifestPath, 'utf8')) as {
      dependencies?: Record<string, string>
    }

    expect(config.bundle?.createUpdaterArtifacts).toBe(true)
    expect(config.plugins?.updater?.endpoints).toEqual([
      'https://github.com/whz211417/cuoti-zhiku/releases/latest/download/latest.json',
    ])
    const decodedPublicKey = Buffer.from(config.plugins?.updater?.pubkey ?? '', 'base64').toString('utf8')
    expect(decodedPublicKey).toMatch(/^untrusted comment: minisign public key:/)
    expect(capability.permissions).toContain('updater:default')
    expect(cargo).toContain('tauri-plugin-updater')
    expect(pkg.dependencies?.['@tauri-apps/plugin-updater']).toBe('2.12.0')
  })

  it('publishes signed updater artifacts only from version tags into a draft release', () => {
    const workflow = readFileSync(releaseWorkflowPath, 'utf8')

    expect(workflow).toMatch(/push:\s*\n\s+tags:\s*\['v\*'\]/)
    expect(workflow).toMatch(/permissions:\s*\n\s+contents:\s+write/)
    expect(workflow).toContain('pnpm verify:release-version')
    expect(workflow).toContain('pnpm lint')
    expect(workflow).toContain('pnpm test')
    expect(workflow).toContain('pnpm typecheck')
    expect(workflow).toContain('cargo test --manifest-path src-tauri/Cargo.toml')
    expect(workflow).toContain('tauri-apps/tauri-action@v0')
    expect(workflow).toContain('releaseDraft: true')
    expect(workflow).toContain('TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}')
    expect(workflow).toContain('TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}')
  })
})
