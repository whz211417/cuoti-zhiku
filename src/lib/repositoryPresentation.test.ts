import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = process.cwd()

describe('public repository presentation', () => {
  it('keeps the README pointed at the current, verifiable release', () => {
    const readme = readFileSync(resolve(repositoryRoot, 'README.md'), 'utf8')
    const installationGuide = readFileSync(
      resolve(repositoryRoot, 'docs/release/windows-installation.md'),
      'utf8',
    )

    expect(readme).toContain('releases/latest')
    expect(readme).toContain('首次安装完成后，日常直接从桌面或开始菜单打开')
    expect(installationGuide).toContain('同一 Release 附带的 `.sha256` 文件')
    expect(installationGuide).not.toContain('v0.4.0')
  })

  it('provides an honest path for feedback, contribution, security reports, and CI', () => {
    expect(existsSync(resolve(repositoryRoot, 'CONTRIBUTING.md'))).toBe(true)
    expect(existsSync(resolve(repositoryRoot, 'SECURITY.md'))).toBe(true)
    expect(existsSync(resolve(repositoryRoot, '.github/ISSUE_TEMPLATE/bug_report.yml'))).toBe(true)
    expect(existsSync(resolve(repositoryRoot, '.github/ISSUE_TEMPLATE/feature_request.yml'))).toBe(true)
    expect(existsSync(resolve(repositoryRoot, '.github/workflows/verify.yml'))).toBe(true)
  })
})
