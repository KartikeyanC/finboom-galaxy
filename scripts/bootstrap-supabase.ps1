<#
.SYNOPSIS
  Bring a NEW, EMPTY Supabase project up to the current schema.

.DESCRIPTION
  Applies every migration in supabase/migrations in order, regenerates the
  typed client, and optionally deploys the edge functions.

  Written for the 2026-08-04 rebuild: the old dev project was deleted and the
  old "live" project only ever had the 5 pre-tenancy tables, so the whole
  Phase 1-7 chain has to be replayed onto a fresh project.

  Safe to re-run: `db push` skips migrations already recorded as applied.

.PARAMETER ProjectRef
  The new project's reference id (Dashboard > Project Settings > General).

.PARAMETER DbPassword
  The database password chosen when the project was created.
  Special characters are URL-encoded automatically.

.PARAMETER PoolerHost
  Session-pooler hostname. Get the exact value (the aws-N prefix varies per
  project, it is NOT always aws-0) from:
    GET https://api.supabase.com/v1/projects/<ref>/config/database/pooler
  or Dashboard > Project Settings > Database > Connection pooling.
  Use port 5432 (session mode) for migrations — the 6543 transaction-mode port
  reported by that endpoint cannot run all DDL.

.PARAMETER DeployFunctions
  Also deploy the edge functions.

.EXAMPLE
  $env:SUPABASE_ACCESS_TOKEN = 'sbp_...'
  .\scripts\bootstrap-supabase.ps1 -ProjectRef ludbntvhagefadfkhrjj -DbPassword 'p@ss&word' `
      -PoolerHost aws-0-ap-northeast-2.pooler.supabase.com
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ProjectRef,
  [Parameter(Mandatory = $true)][string]$DbPassword,
  [Parameter(Mandatory = $true)][string]$PoolerHost,
  [switch]$DeployFunctions
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Supabase = Join-Path (Split-Path -Parent $RepoRoot) ".tools\supabase\supabase.exe"

if (-not (Test-Path $Supabase)) {
  throw "Supabase CLI not found at $Supabase"
}
if (-not $env:SUPABASE_ACCESS_TOKEN) {
  throw "Set `$env:SUPABASE_ACCESS_TOKEN first (Dashboard > Account > Access Tokens)."
}

Write-Host "CLI      : $(& $Supabase --version)"
Write-Host "Project  : $ProjectRef"
Write-Host "Repo     : $RepoRoot`n"

# The direct db.<ref>.supabase.co host has no IPv4 record on the free tier,
# so the session pooler is the only route that resolves from Windows.
Add-Type -AssemblyName System.Web
$encoded = [System.Web.HttpUtility]::UrlEncode($DbPassword)
$DbUrl = "postgresql://postgres.$ProjectRef`:$encoded@${PoolerHost}:5432/postgres"

Write-Host "== 1/3  Applying migrations ==" -ForegroundColor Cyan
'y' | & $Supabase db push --db-url $DbUrl --workdir $RepoRoot
if ($LASTEXITCODE -ne 0) { throw "db push failed (exit $LASTEXITCODE)" }

Write-Host "`n== 2/3  Regenerating types ==" -ForegroundColor Cyan
# --db-url would need Docker; --project-id goes over the API and does not.
$typesPath = Join-Path $RepoRoot "src\integrations\supabase\types.ts"
& $Supabase gen types typescript --project-id $ProjectRef | Set-Content -Path $typesPath -Encoding utf8
if ($LASTEXITCODE -ne 0) { throw "gen types failed (exit $LASTEXITCODE)" }
Write-Host "Wrote $typesPath"

if ($DeployFunctions) {
  Write-Host "`n== 3/3  Deploying edge functions ==" -ForegroundColor Cyan
  # po-auth and payments-webhook are called without a user JWT.
  $fns = @(
    @{ name = "po-auth";          noVerify = $true  },
    @{ name = "payments-webhook"; noVerify = $true  },
    @{ name = "billing-api";      noVerify = $false },
    @{ name = "live-price";       noVerify = $true  }
    # send-email is deliberately NOT deployed: it is an authenticated open mail
    # relay (BUG-005) and must be rebuilt with server-resolved recipients first.
  )
  foreach ($f in $fns) {
    Write-Host "-- $($f.name)"
    if ($f.noVerify) {
      & $Supabase functions deploy $f.name --project-ref $ProjectRef --no-verify-jwt --workdir $RepoRoot
    } else {
      & $Supabase functions deploy $f.name --project-ref $ProjectRef --workdir $RepoRoot
    }
  }
} else {
  Write-Host "`n== 3/3  Skipping edge functions (pass -DeployFunctions) ==" -ForegroundColor DarkGray
}

Write-Host "`nDone." -ForegroundColor Green
Write-Host @"

Next:
  1. Update .env.development with the new URL + anon key:
       & '$Supabase' projects api-keys --project-ref $ProjectRef
  2. Remove the three temporary untyped shims now that types.ts is current:
       src/pages/po/PoSecurity.tsx      (rpcUntyped)
       src/hooks/useIncomeStreams.ts    (db handle)
       src/hooks/useDematAccounts.ts    (supabase as any)
  3. Verify: npm run typecheck; npx vitest run; node_modules/.bin/vite build
  4. Seed a platform admin to reach /po:
       INSERT INTO public.platform_admins (user_id) VALUES ('<your-auth-user-id>');
"@
