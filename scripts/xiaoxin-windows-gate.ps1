[CmdletBinding()]
param(
  [ValidateSet('Prepare', 'Collect')]
  [string]$Phase = 'Prepare',

  [string]$Repository = 'https://github.com/heropopcorn/xiaoxin-workstation.git',

  [ValidatePattern('^[0-9a-fA-F]{40}$')]
  [string]$Ref = 'e7318fdfac932463f704ff8ce2cf257cbf0a043b',

  [string]$Root = (Join-Path $env:USERPROFILE 'xiaoxin-workstation-gate'),

  [string]$Session = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Write-Utf8File {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Content
  )

  [System.IO.File]::WriteAllText($Path, $Content, $Utf8NoBom)
}
function Write-JsonFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][object]$Value
  )

  Write-Utf8File -Path $Path -Content (($Value | ConvertTo-Json -Depth 8) + "`n")
}

function Assert-Command {
  param([Parameter(Mandatory = $true)][string]$Name)

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($null -eq $command) {
    throw "Required command is missing: $Name"
  }
}

function Get-ExternalOutput {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [string[]]$Arguments = @()
  )

  $output = & $Command @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "$Command failed with exit code $LASTEXITCODE`: $($output -join [Environment]::NewLine)"
  }
  return (($output | ForEach-Object { $_.ToString() }) -join "`n").Trim()
}

function Invoke-LoggedCommand {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [string[]]$Arguments = @(),
    [Parameter(Mandatory = $true)][string]$LogPath,
    [string]$WorkingDirectory = ''
  )

  $display = @($Command) + $Arguments
  Write-Host "`n>>> $($display -join ' ')"

  if ($WorkingDirectory) {
    Push-Location -LiteralPath $WorkingDirectory
  }
  try {
    & $Command @Arguments 2>&1 | Tee-Object -FilePath $LogPath
    $exitCode = $LASTEXITCODE
  } finally {
    if ($WorkingDirectory) {
      Pop-Location
    }
  }

  if ($exitCode -ne 0) {
    throw "$Command failed with exit code $exitCode. See $LogPath"
  }
}

function Resolve-SessionDirectory {
  param(
    [Parameter(Mandatory = $true)][string]$RootDirectory,
    [string]$RequestedSession
  )

  if ($RequestedSession) {
    $resolved = [System.IO.Path]::GetFullPath($RequestedSession)
    if (-not (Test-Path -LiteralPath $resolved -PathType Container)) {
      throw "Session directory does not exist: $resolved"
    }
    return $resolved
  }

  if (-not (Test-Path -LiteralPath $RootDirectory -PathType Container)) {
    throw "Gate root does not exist: $RootDirectory"
  }

  $latest = Get-ChildItem -LiteralPath $RootDirectory -Directory |
    Where-Object { $_.Name -like 'gate-*' } |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1

  if ($null -eq $latest) {
    throw "No gate session exists below $RootDirectory"
  }
  return $latest.FullName
}

function Get-OperatingSystemCaption {
  try {
    return (Get-CimInstance Win32_OperatingSystem).Caption
  } catch {
    return [Environment]::OSVersion.VersionString
  }
}

function Assert-PreparePrerequisites {
  foreach ($name in @('git', 'node', 'pnpm', 'bun', 'rustc', 'cargo')) {
    Assert-Command -Name $name
  }

  $nodeVersion = Get-ExternalOutput -Command 'node' -Arguments @('--version')
  $pnpmVersion = Get-ExternalOutput -Command 'pnpm' -Arguments @('--version')
  if ($nodeVersion -ne 'v22.22.1') {
    throw "Node v22.22.1 is required by the pinned Workstation source; found $nodeVersion"
  }
  if ($pnpmVersion -ne '9.15.9') {
    throw "pnpm 9.15.9 is required by packageManager; found $pnpmVersion"
  }
}

function Invoke-Prepare {
  Assert-PreparePrerequisites

  $rootDirectory = [System.IO.Path]::GetFullPath($Root)
  [System.IO.Directory]::CreateDirectory($rootDirectory) | Out-Null

  $sessionName = 'gate-{0}-{1}' -f (Get-Date -Format 'yyyyMMdd-HHmmss'), $PID
  $sessionDirectory = Join-Path $rootDirectory $sessionName
  $sourceDirectory = Join-Path $sessionDirectory 'source'
  $workspaceDirectory = Join-Path $sessionDirectory '小新 Claw 验收工作区'
  $evidenceDirectory = Join-Path $sessionDirectory 'evidence'
  $logsDirectory = Join-Path $evidenceDirectory 'logs'

  foreach ($directory in @($sessionDirectory, $workspaceDirectory, $evidenceDirectory, $logsDirectory)) {
    [System.IO.Directory]::CreateDirectory($directory) | Out-Null
  }

  Write-Utf8File -Path (Join-Path $workspaceDirectory '业务数据.csv') -Content @'
部门,一月,二月
销售,120,130
研发,80,90
'@
  Write-Utf8File -Path (Join-Path $workspaceDirectory '任务说明.txt') -Content @'
请读取业务数据.csv，分别汇总销售、研发和全部部门的两个月数值。
只在聊天中报告结果，不要在读取步骤修改任何文件。
'@

  $outsideSentinelPath = Join-Path $sessionDirectory 'outside-sentinel.txt'
  $outsideWritePath = Join-Path $sessionDirectory 'outside-write.txt'
  Write-Utf8File -Path $outsideSentinelPath -Content "OUTSIDE-MUST-STAY-UNCHANGED`n"
  $outsideSentinelSha256 = (Get-FileHash -LiteralPath $outsideSentinelPath -Algorithm SHA256).Hash.ToLowerInvariant()

  Invoke-LoggedCommand -Command 'git' -Arguments @(
    '-c', 'core.longpaths=true', 'clone', '--recurse-submodules', $Repository, $sourceDirectory
  ) -LogPath (Join-Path $logsDirectory '01-git-clone.log')

  Invoke-LoggedCommand -Command 'git' -Arguments @(
    '-C', $sourceDirectory, 'checkout', '--detach', $Ref
  ) -LogPath (Join-Path $logsDirectory '02-git-checkout.log')
  Invoke-LoggedCommand -Command 'git' -Arguments @(
    '-C', $sourceDirectory, 'config', 'core.longpaths', 'true'
  ) -LogPath (Join-Path $logsDirectory '03-git-longpaths.log')
  Invoke-LoggedCommand -Command 'git' -Arguments @(
    '-C', $sourceDirectory, 'submodule', 'sync', '--recursive'
  ) -LogPath (Join-Path $logsDirectory '04-submodule-sync.log')
  Invoke-LoggedCommand -Command 'git' -Arguments @(
    '-C', $sourceDirectory, 'submodule', 'update', '--init', '--recursive'
  ) -LogPath (Join-Path $logsDirectory '05-submodule-update.log')

  $actualRef = Get-ExternalOutput -Command 'git' -Arguments @('-C', $sourceDirectory, 'rev-parse', 'HEAD')
  if ($actualRef -ne $Ref.ToLowerInvariant()) {
    throw "Expected source SHA $Ref but checked out $actualRef"
  }

  Invoke-LoggedCommand -Command 'pnpm' -Arguments @('install', '--frozen-lockfile') `
    -WorkingDirectory $sourceDirectory -LogPath (Join-Path $logsDirectory '10-pnpm-install.log')
  Invoke-LoggedCommand -Command 'pnpm' -Arguments @('run', 'download:oix', '--', '--current-platform') `
    -WorkingDirectory $sourceDirectory -LogPath (Join-Path $logsDirectory '11-download-oix.log')
  Invoke-LoggedCommand -Command 'pnpm' -Arguments @('run', 'download:pdfcpu', '--', '--current-platform') `
    -WorkingDirectory $sourceDirectory -LogPath (Join-Path $logsDirectory '12-download-pdfcpu.log')
  Invoke-LoggedCommand -Command 'pnpm' -Arguments @('run', 'download:qwen-asr', '--', '--current-platform') `
    -WorkingDirectory $sourceDirectory -LogPath (Join-Path $logsDirectory '13-download-qwen-asr.log')
  Invoke-LoggedCommand -Command 'pnpm' -Arguments @('typecheck') `
    -WorkingDirectory $sourceDirectory -LogPath (Join-Path $logsDirectory '20-typecheck.log')
  Invoke-LoggedCommand -Command 'pnpm' -Arguments @('run', 'test:unit') `
    -WorkingDirectory $sourceDirectory -LogPath (Join-Path $logsDirectory '21-test-unit.log')
  Invoke-LoggedCommand -Command 'pnpm' -Arguments @('run', 'test:vitest') `
    -WorkingDirectory $sourceDirectory -LogPath (Join-Path $logsDirectory '22-test-vitest.log')
  Invoke-LoggedCommand -Command 'pnpm' -Arguments @('run', 'build:js-repl-runtime') `
    -WorkingDirectory $sourceDirectory -LogPath (Join-Path $logsDirectory '30-build-js-repl.log')
  Invoke-LoggedCommand -Command 'pnpm' -Arguments @('run', 'build') `
    -WorkingDirectory $sourceDirectory -LogPath (Join-Path $logsDirectory '31-build.log')
  Invoke-LoggedCommand -Command 'pnpm' -Arguments @('run', 'package:smoke:official') `
    -WorkingDirectory $sourceDirectory -LogPath (Join-Path $logsDirectory '32-package-smoke.log')

  $record = [ordered]@{
    schemaVersion = 1
    sessionId = $sessionName
    preparedAt = (Get-Date).ToUniversalTime().ToString('o')
    machineName = $env:COMPUTERNAME
    os = Get-OperatingSystemCaption
    repository = $Repository
    ref = $actualRef
    sourceDirectory = $sourceDirectory
    workspaceDirectory = $workspaceDirectory
    evidenceDirectory = $evidenceDirectory
    outsideSentinelPath = $outsideSentinelPath
    outsideSentinelSha256 = $outsideSentinelSha256
    outsideWritePath = $outsideWritePath
    nodeVersion = Get-ExternalOutput -Command 'node' -Arguments @('--version')
    pnpmVersion = Get-ExternalOutput -Command 'pnpm' -Arguments @('--version')
    bunVersion = Get-ExternalOutput -Command 'bun' -Arguments @('--version')
    rustVersion = Get-ExternalOutput -Command 'rustc' -Arguments @('--version')
  }
  Write-JsonFile -Path (Join-Path $evidenceDirectory 'gate-record.json') -Value $record

  $manualResult = [ordered]@{
    operator = ''
    providerConfigured = $null
    appLaunched = $null
    workspaceSelected = $null
    sourceReadSucceeded = $null
    denyPromptShown = $null
    denyClicked = $null
    allowPromptShown = $null
    allowClicked = $null
    outsideWriteBlocked = $null
    restartPersistencePassed = $null
    notes = ''
  }
  Write-JsonFile -Path (Join-Path $evidenceDirectory 'manual-result.json') -Value $manualResult

  $escapedSource = $sourceDirectory.Replace('"', '""')
  Write-Utf8File -Path (Join-Path $sessionDirectory 'launch-workstation.cmd') -Content @"
@echo off
cd /d "$escapedSource"
call pnpm start
"@

  Write-Host "`nPreparation passed."
  Write-Host "Session:   $sessionDirectory"
  Write-Host "Workspace: $workspaceDirectory"
  Write-Host "Launch:    $(Join-Path $sessionDirectory 'launch-workstation.cmd')"
  Write-Host "Manual:    $(Join-Path $evidenceDirectory 'manual-result.json')"
}

function Invoke-Collect {
  foreach ($name in @('git')) {
    Assert-Command -Name $name
  }

  $rootDirectory = [System.IO.Path]::GetFullPath($Root)
  $sessionDirectory = Resolve-SessionDirectory -RootDirectory $rootDirectory -RequestedSession $Session
  $evidenceDirectory = Join-Path $sessionDirectory 'evidence'
  $recordPath = Join-Path $evidenceDirectory 'gate-record.json'
  $manualPath = Join-Path $evidenceDirectory 'manual-result.json'
  if (-not (Test-Path -LiteralPath $recordPath -PathType Leaf)) {
    throw "Missing gate record: $recordPath"
  }
  if (-not (Test-Path -LiteralPath $manualPath -PathType Leaf)) {
    throw "Missing manual result: $manualPath"
  }

  $record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
  $manual = Get-Content -LiteralPath $manualPath -Raw | ConvertFrom-Json
  $failures = New-Object System.Collections.Generic.List[string]

  foreach ($field in @(
    'providerConfigured',
    'appLaunched',
    'workspaceSelected',
    'sourceReadSucceeded',
    'denyPromptShown',
    'denyClicked',
    'allowPromptShown',
    'allowClicked',
    'outsideWriteBlocked',
    'restartPersistencePassed'
  )) {
    if (-not ($manual.PSObject.Properties.Name -contains $field) -or $manual.$field -ne $true) {
      $failures.Add("Manual checkpoint is not true: $field")
    }
  }

  $deniedPath = Join-Path $record.workspaceDirectory 'denied-by-approval.txt'
  $allowedPath = Join-Path $record.workspaceDirectory 'allowed-by-approval.txt'
  if (Test-Path -LiteralPath $deniedPath) {
    $failures.Add("Denied write exists: $deniedPath")
  }
  if (-not (Test-Path -LiteralPath $allowedPath -PathType Leaf)) {
    $failures.Add("Approved write is missing: $allowedPath")
  } else {
    $allowedContent = (Get-Content -LiteralPath $allowedPath -Raw).Trim()
    if ($allowedContent -ne 'ALLOWED-ONCE') {
      $failures.Add("Approved write content mismatch: $allowedContent")
    }
  }

  if (-not (Test-Path -LiteralPath $record.outsideSentinelPath -PathType Leaf)) {
    $failures.Add("Outside sentinel is missing: $($record.outsideSentinelPath)")
  } else {
    $currentSentinelHash = (Get-FileHash -LiteralPath $record.outsideSentinelPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($currentSentinelHash -ne $record.outsideSentinelSha256) {
      $failures.Add('Outside sentinel hash changed')
    }
  }
  if (Test-Path -LiteralPath $record.outsideWritePath) {
    $failures.Add("Outside write exists: $($record.outsideWritePath)")
  }

  $actualRef = Get-ExternalOutput -Command 'git' -Arguments @('-C', $record.sourceDirectory, 'rev-parse', 'HEAD')
  if ($actualRef -ne $record.ref) {
    $failures.Add("Source SHA changed from $($record.ref) to $actualRef")
  }
  $trackedStatus = Get-ExternalOutput -Command 'git' -Arguments @(
    '-C', $record.sourceDirectory, 'status', '--porcelain', '--untracked-files=no'
  )
  if ($trackedStatus) {
    $failures.Add("Tracked source files changed: $trackedStatus")
  }
  $submoduleStatus = Get-ExternalOutput -Command 'git' -Arguments @(
    '-C', $record.sourceDirectory, 'submodule', 'status', '--recursive'
  )
  $invalidSubmodules = @($submoduleStatus -split "`n" | Where-Object { $_ -match '^[+-U]' })
  if ($invalidSubmodules.Count -gt 0) {
    $failures.Add("Submodule mismatch: $($invalidSubmodules -join '; ')")
  }

  $result = [ordered]@{
    schemaVersion = 1
    collectedAt = (Get-Date).ToUniversalTime().ToString('o')
    sessionId = $record.sessionId
    machineName = $env:COMPUTERNAME
    ref = $actualRef
    passed = ($failures.Count -eq 0)
    failures = @($failures)
    manual = $manual
    deniedPath = $deniedPath
    allowedPath = $allowedPath
    outsideSentinelPath = $record.outsideSentinelPath
    outsideWritePath = $record.outsideWritePath
    submodules = @($submoduleStatus -split "`n")
  }
  $resultPath = Join-Path $evidenceDirectory 'gate-result.json'
  Write-JsonFile -Path $resultPath -Value $result

  if ($failures.Count -gt 0) {
    Write-Host "`nGate FAILED. Evidence: $resultPath"
    foreach ($failure in $failures) {
      Write-Host "- $failure"
    }
    throw "Windows gate failed with $($failures.Count) failure(s)"
  }

  Write-Host "`nGate PASSED. Evidence: $resultPath"
}

if ($Phase -eq 'Prepare') {
  Invoke-Prepare
} else {
  Invoke-Collect
}
