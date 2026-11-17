param(
  [Parameter(Mandatory)] [string] $InstallerPath,
  [Parameter(Mandatory)] [string] $ExpectedVersion
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $IsWindows -or $env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_ENVIRONMENT -cne 'github-hosted') {
  throw 'Windows upgrade verification requires a disposable GitHub-hosted Windows runner.'
}

$releaseConfig = Get-Content -Raw -LiteralPath 'src-tauri/tauri.conf.json' | ConvertFrom-Json
$localData = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
$dataDirectory = Join-Path $localData $releaseConfig.identifier
$uninstallKey = "HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/$($releaseConfig.productName)"
$database = Join-Path $dataDirectory 'library.sqlite3'
if ((Test-Path -LiteralPath $dataDirectory) -or (Test-Path -LiteralPath $uninstallKey)) {
  throw 'An existing library or installation was found. A clean runner is required.'
}

function Install-Package([string] $path) {
  $setup = Start-Process -FilePath $path -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru -Environment @{
    GH_TOKEN = $null
    GITHUB_TOKEN = $null
  }
  if ($setup.ExitCode -ne 0) { throw "NSIS installer exited with code $($setup.ExitCode)." }
}

function Start-And-CheckApp([string] $version) {
  $registration = Get-ItemProperty -LiteralPath $uninstallKey
  if ($registration.DisplayVersion -ne $version) {
    throw "Expected registered version $version, found $($registration.DisplayVersion)."
  }
  $programDirectory = (Resolve-Path -LiteralPath $registration.InstallLocation.Trim('"')).ProviderPath
  if (-not $programDirectory.StartsWith("$localData\", [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The installation was not registered under the current Windows user.'
  }
  $executable = Join-Path $programDirectory 'cuoti-zhiku.exe'
  $versionInfo = (Get-Item -LiteralPath $executable).VersionInfo
  $installedVersion = "$($versionInfo.ProductMajorPart).$($versionInfo.ProductMinorPart).$($versionInfo.ProductBuildPart)"
  if ($installedVersion -ne $version) { throw "Expected installed version $version, found $installedVersion." }
  if (-not (Test-Path -LiteralPath (Join-Path $programDirectory 'WebView2Loader.dll') -PathType Leaf)) {
    throw 'The setup did not install WebView2Loader.dll beside the app.'
  }

  $startInfo = [Diagnostics.ProcessStartInfo]::new($executable)
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.WorkingDirectory = $programDirectory
  [void]$startInfo.Environment.Remove('GH_TOKEN')
  [void]$startInfo.Environment.Remove('GITHUB_TOKEN')
  $process = [Diagnostics.Process]::Start($startInfo)
  try {
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds(60)
    do {
      $process.Refresh()
      if ($process.HasExited) { throw "App $version exited during launch (code $($process.ExitCode))." }
      if ($process.MainWindowHandle -ne [IntPtr]::Zero -and (Test-Path -LiteralPath $database -PathType Leaf)) {
        Write-Output "App $version opened a main window and initialized its library."
        return
      }
      Start-Sleep -Milliseconds 500
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    throw "App $version did not open a main window and local database within 60 seconds."
  } finally {
    if (-not $process.HasExited -and $process.CloseMainWindow()) { [void]$process.WaitForExit(10000) }
    if (-not $process.HasExited) { $process.Kill(); $process.WaitForExit() }
    $process.Dispose()
  }
}

function Test-Library([string] $mode, [int] $schemaVersion) {
  $fixtureScript = @'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { DatabaseSync } = require('node:sqlite')

const [dbPath, mode, expectVersion] = process.argv.slice(2)
const db = new DatabaseSync(dbPath, { readOnly: mode === 'verify' })
const title = 'Synthetic release smoke test'
const timestamp = '2026-01-01T00:00:00Z'
const filename = 'fixture.txt'
const original = 'originals/' + filename
const contents = 'fictional study attachment'
const originalFile = path.join(path.dirname(dbPath), original)
const digest = createHash('sha256').update(contents).digest('hex')

try {
  assert.equal(db.prepare('SELECT version FROM schema_meta').get().version, Number(expectVersion))

  if (mode === 'seed') {
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM problems').get().count, 0)
    fs.mkdirSync(path.dirname(originalFile), { recursive: true })
    fs.writeFileSync(originalFile, contents, { flag: 'wx' })
    db.exec('BEGIN')
    db.prepare('INSERT INTO courses (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('fixture-course', title, timestamp, timestamp)
    db.prepare("INSERT INTO problems (id, course_id, status, title, next_review_at, created_at, updated_at) VALUES (?, ?, 'active', ?, '2026-01-02', ?, ?)").run('fixture-problem', 'fixture-course', title, timestamp, timestamp)
    db.prepare("INSERT INTO problem_fields (problem_id, kind, value, updated_at) VALUES (?, 'standard_answer', ?, ?)").run('fixture-problem', 'fixture answer', timestamp)
    db.prepare("INSERT INTO attachments (id, sha256, relative_path, mime_type, byte_size, created_at) VALUES (?, ?, ?, 'text/plain', ?, ?)").run('fixture-original', digest, original, Buffer.byteLength(contents), timestamp)
    db.prepare('INSERT INTO inbox_items (id, problem_id, attachment_id, filename, created_at) VALUES (?, ?, ?, ?, ?)').run('fixture-link', 'fixture-problem', 'fixture-original', filename, timestamp)
    db.exec('COMMIT')
  } else {
    assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok')
    const saved = db.prepare(`
      SELECT p.title, p.status, p.next_review_at, c.name, f.value, a.sha256, a.relative_path
      FROM problems p JOIN courses c ON c.id = p.course_id
      JOIN problem_fields f ON f.problem_id = p.id AND f.kind = 'standard_answer'
      JOIN inbox_items i ON i.problem_id = p.id JOIN attachments a ON a.id = i.attachment_id
      WHERE p.id = ?
    `).get('fixture-problem')
    assert.deepEqual({ ...saved }, {
      title, status: 'active', next_review_at: '2026-01-02', name: title,
      value: 'fixture answer', sha256: digest, relative_path: original,
    })
    assert.equal(fs.readFileSync(originalFile, 'utf8'), contents)
    console.log('Database integrity, course, question, answer, review date, and original all survived the upgrade.')
  }
} finally {
  db.close()
}
'@
  $fixtureScript | node --input-type=commonjs - $database $mode "$schemaVersion"
  if ($LASTEXITCODE -ne 0) { throw "SQLite upgrade smoke test failed at $mode." }
}

$baselineTag = 'v0.5.2'
$baselineAsset = 'cuoti-zhiku_0.5.2_x64-setup.exe'
$baselineDir = Join-Path $env:RUNNER_TEMP 'cuoti-upgrade-baseline'
gh release download $baselineTag -R $env:GITHUB_REPOSITORY -D $baselineDir -p $baselineAsset -p "$baselineAsset.sha256"
if ($LASTEXITCODE -ne 0) { throw "Could not download the $baselineTag baseline." }
$baselineInstaller = Join-Path $baselineDir $baselineAsset
$baselineSha = ((Get-Content -LiteralPath "$baselineInstaller.sha256" -TotalCount 1).Trim() -split '\s+')[0]
if ((Get-FileHash -LiteralPath $baselineInstaller -Algorithm SHA256).Hash -ne $baselineSha) {
  throw 'Baseline setup checksum mismatch.'
}

Install-Package $baselineInstaller
Start-And-CheckApp '0.5.2'
Test-Library 'seed' 7
Install-Package (Resolve-Path -LiteralPath $InstallerPath).ProviderPath
Start-And-CheckApp $ExpectedVersion
$schemaLine = Select-String -LiteralPath 'src-tauri/src/db/database.rs' -Pattern '^const CURRENT_SCHEMA_VERSION: i64 = (\d+);$'
Test-Library 'verify' ([int]$schemaLine.Matches[0].Groups[1].Value)
