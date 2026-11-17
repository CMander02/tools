$ErrorActionPreference = 'Stop'

function Exit-Usage {
    [Console]::Error.WriteLine('Usage: pwsh -File setup-service/install.ps1 [--target all|codex|antigravity] <plugin-name>')
    exit 2
}

$Target = 'all'
$Plugin = ''
for ($idx = 0; $idx -lt $args.Count; $idx++) {
    $arg = [string]$args[$idx]
    if ($arg -eq '--target') {
        if ($idx + 1 -ge $args.Count) { Exit-Usage }
        $Target = [string]$args[++$idx]
    } elseif ($arg.StartsWith('--target=')) {
        $Target = $arg.Substring('--target='.Length)
    } elseif ($arg -eq '-h' -or $arg -eq '--help') {
        Exit-Usage
    } elseif ($arg.StartsWith('-')) {
        Exit-Usage
    } elseif ([string]::IsNullOrEmpty($Plugin)) {
        $Plugin = $arg
    } else {
        Exit-Usage
    }
}

if ($Target -notin @('all', 'codex', 'antigravity')) {
    Exit-Usage
}
if ([string]::IsNullOrEmpty($Plugin) -or $Plugin -cnotmatch '\A[a-z][a-z0-9]*(?:-[a-z0-9]+)*\z') {
    Exit-Usage
}

$Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$PluginSrc = Join-Path $Root "plugins/$Plugin"
$Manifest = Join-Path $PluginSrc 'plugin.json'
if (-not (Test-Path -LiteralPath $Manifest -PathType Leaf)) {
    [Console]::Error.WriteLine("Unknown plugin: $Plugin")
    exit 2
}

$EnvAgy = $env:ANTIGRAVITY_CONFIG_DIR
if (-not [string]::IsNullOrEmpty($EnvAgy)) {
    $AgyConfig = $EnvAgy
    $HasAgy = $true
} else {
    $GeminiRoot = Join-Path $HOME '.gemini'
    $AgyConfig = Join-Path $GeminiRoot 'config'
    $HasAgy = (Test-Path -LiteralPath $AgyConfig) -or (Test-Path -LiteralPath $GeminiRoot)
}

$RanAny = $false
$Codex = Get-Command codex -ErrorAction SilentlyContinue

if ($Target -in @('all', 'codex')) {
    if ($null -ne $Codex) {
        & $Codex plugin marketplace add $Root
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        & $Codex plugin add "${Plugin}@cmander-skills"
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        $RanAny = $true
    } elseif ($Target -eq 'codex') {
        [Console]::Error.WriteLine('Codex CLI was not found on PATH.')
        exit 1
    }
}

if ($Target -eq 'antigravity' -or ($Target -eq 'all' -and $HasAgy)) {
    $PluginsRoot = Join-Path $AgyConfig 'plugins'
    New-Item -ItemType Directory -Force -Path $PluginsRoot | Out-Null
    $Dest = Join-Path $PluginsRoot $Plugin
    if (Test-Path -LiteralPath $Dest) {
        Remove-Item -LiteralPath $Dest -Recurse -Force
    }
    $Excluded = @('node_modules', 'dist', 'zhihu_profile', 'cookies.json', '.DS_Store', '__pycache__')
    New-Item -ItemType Directory -Force -Path $Dest | Out-Null
    Get-ChildItem -LiteralPath $PluginSrc -Force | Where-Object {
        ($_.Name -notin $Excluded) -and (-not $_.Name.EndsWith('.log'))
    } | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $Dest -Recurse -Force
    }
    Get-ChildItem -LiteralPath $Dest -Recurse -Force | Where-Object {
        ($_.Name -in $Excluded) -or ($_.Name.EndsWith('.log'))
    } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Write-Output "Installed Antigravity plugin ``$Plugin`` to $Dest"
    $RanAny = $true
}

if (-not $RanAny) {
    [Console]::Error.WriteLine('Neither Codex CLI on PATH nor Antigravity (~/.gemini) was found.')
    exit 1
}
exit 0
