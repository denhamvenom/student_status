[CmdletBinding()]
param([ValidateSet('Review', 'Dev', 'Check', 'Build')][string]$Mode = 'Review')
$ErrorActionPreference = 'Stop'
$appDirectory = $PSScriptRoot
if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  throw 'Bun is required. Install Bun from https://bun.sh, then run this command again.'
}
Push-Location -LiteralPath $appDirectory
try {
  & bun install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
  switch ($Mode) {
    'Review' {
      Write-Host 'Starting local UI. Open http://localhost:5173/?review=student for synthetic data.'
      & bun run dev
    }
    'Dev' {
      if ($env:CONVEX_DEPLOY_KEY -or $env:CONVEX_SELF_HOSTED_URL -or $env:CONVEX_SELF_HOSTED_ADMIN_KEY) {
        throw 'Remove deployment-key/self-hosted overrides before development.'
      }
      $localEnvPath = Join-Path $appDirectory '.env.local'
      if (-not (Test-Path -LiteralPath $localEnvPath)) { throw 'Connect the existing development project first; see docs/DEVELOPMENT.md.' }
      $localEnvText = Get-Content -LiteralPath $localEnvPath -Raw
      $deploymentMatch = [regex]::Match($localEnvText, '(?m)^CONVEX_DEPLOYMENT\s*=\s*["'']?((?:dev|local):[^\s"''#]+)')
      if (-not $deploymentMatch.Success) { throw 'Only an explicit dev: or local: deployment is allowed.' }
      if ($env:CONVEX_DEPLOYMENT -and $env:CONVEX_DEPLOYMENT -ne $deploymentMatch.Groups[1].Value) { throw 'Environment deployment override differs from .env.local.' }
      if ($localEnvText -match '(?m)^CONVEX_DEPLOY_KEY\s*=\s*\S+' -or $localEnvText -match '(?m)^CONVEX_SELF_HOSTED_') { throw 'Deployment-key/self-hosted overrides are not allowed by this launcher.' }
      Write-Host "Target: $($deploymentMatch.Groups[1].Value). Starting Convex development sync and frontend."
      & bunx convex dev --env-file .env.local --tail-logs disable --start 'bun run dev'
    }
    'Check' { & bun run check }
    'Build' { & bun run build }
  }
  if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE." }
} finally { Pop-Location }
