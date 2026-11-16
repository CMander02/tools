$ErrorActionPreference = 'Stop'
if ($args.Count -ne 1 -or $args[0] -cnotmatch '\A[a-z][a-z0-9]*(?:-[a-z0-9]+)*\z') {
    [Console]::Error.WriteLine('Usage: pwsh -File setup-service/install.ps1 <plugin-name>')
    exit 2
}
$Plugin = $args[0]
$Codex = Get-Command codex -ErrorAction SilentlyContinue
if (-not $Codex) {
    [Console]::Error.WriteLine('Codex CLI was not found on PATH.')
    exit 1
}

$Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$Manifest = Join-Path $Root "plugins/$Plugin/plugin.json"
if (-not (Test-Path -LiteralPath $Manifest -PathType Leaf)) {
    [Console]::Error.WriteLine("Unknown plugin: $Plugin")
    exit 2
}

& $Codex plugin marketplace add $Root
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
& $Codex plugin add "${Plugin}@cmander-skills"
exit $LASTEXITCODE
