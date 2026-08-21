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
    expect(readme).toContain('Cuoti-Zhiku-0.4.0-x64-setup.exe')
    expect(installationGuide).toContain('09B0EE82B23A94CBD08AC5D168F8202B62CD1FB63CB6EB3F7E8BC9B1CE18C772')
  })

  it('provides an honest path for feedback, contribution, security reports, and CI', () => {
    expect(existsSync(resolve(repositoryRoot, 'CONTRIBUTING.md'))).toBe(true)
    expect(existsSync(resolve(repositoryRoot, 'SECURITY.md'))).toBe(true)
    expect(existsSync(resolve(repositoryRoot, '.github/ISSUE_TEMPLATE/bug_report.yml'))).toBe(true)
    expect(existsSync(resolve(repositoryRoot, '.github/ISSUE_TEMPLATE/feature_request.yml'))).toBe(true)
    expect(existsSync(resolve(repositoryRoot, '.github/workflows/verify.yml'))).toBe(true)
  })
})
