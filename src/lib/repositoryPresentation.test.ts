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

  it('presents the product and a truthful promotion path before developer detail', () => {
    const readme = readFileSync(resolve(repositoryRoot, 'README.md'), 'utf8')
    const launchPlaybookPath = resolve(repositoryRoot, 'docs/marketing/launch-playbook.md')
    const socialPreviewPath = resolve(
      repositoryRoot,
      'docs/assets/social/github-social-preview.png',
    )

    expect(readme).toContain('docs/assets/readme/local-materials.png')
    expect(readme).toContain('拖进来，先保存')
    expect(readme).toContain('AI 只做建议')
    expect(readme).toContain('releases/latest')
    expect(readme).toContain('docs/marketing/launch-playbook.md')
    expect(existsSync(launchPlaybookPath)).toBe(true)

    const launchPlaybook = readFileSync(launchPlaybookPath, 'utf8')
    expect(launchPlaybook).toContain('小红书')
    expect(launchPlaybook).toContain('B 站')
    expect(launchPlaybook).toContain('V2EX')
    expect(launchPlaybook).toContain('校园种子用户')
    expect(launchPlaybook).toContain('Release 下载量')
    expect(existsSync(socialPreviewPath)).toBe(true)

    const socialPreview = readFileSync(socialPreviewPath)
    expect(socialPreview.readUInt32BE(16)).toBe(1280)
    expect(socialPreview.readUInt32BE(20)).toBe(640)
  })
})
