#!/usr/bin/env pwsh
# ============================================================
# pre-push-check.ps1
# Script de validacao local antes do git push
# Rode: .\pre-push-check.ps1
# ============================================================

$ErrorActionPreference = "Continue"
$failures = @()

function Write-Check($msg) { Write-Host "  🔍 $msg" -ForegroundColor Cyan }
function Write-Pass($msg)  { Write-Host "  ✅ $msg" -ForegroundColor Green }
function Write-Fail($msg)  {
    Write-Host "  ❌ $msg" -ForegroundColor Red
    $script:failures += $msg
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host "  AssetFlow — Pre-Push Validation" -ForegroundColor Magenta
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host ""

# ----------------------------------------------------------
# 1. TypeScript — sem erros de tipo
# ----------------------------------------------------------
Write-Check "TypeScript type check (npx tsc --noEmit)..."
$tscOut = npx tsc --noEmit --exclude .next 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Pass "TypeScript: sem erros"
} else {
    Write-Fail "TypeScript: erros encontrados"
    $tscOut | ForEach-Object { Write-Host "     $_" -ForegroundColor DarkRed }
}

# ----------------------------------------------------------
# 2. ESLint — sem erros (warnings sao aceitos)
# ----------------------------------------------------------
Write-Check "ESLint (npm run lint)..."
$lintOut = npm run lint 2>&1
$errorLines = $lintOut | Where-Object { $_ -match "\s+error\s+" }
if ($errorLines.Count -eq 0) {
    Write-Pass "ESLint: sem erros bloqueantes"
} else {
    Write-Fail "ESLint: $($errorLines.Count) erro(s) encontrado(s)"
    $errorLines | Select-Object -First 10 | ForEach-Object { Write-Host "     $_" -ForegroundColor DarkRed }
}

# ----------------------------------------------------------
# 3. public/ precisa estar rastreada pelo git
# ----------------------------------------------------------
Write-Check "Pasta public/ rastreada pelo git..."
$publicGit = git ls-files public
if ($publicGit) {
    Write-Pass "public/: rastreada pelo git"
} else {
    Write-Fail "public/ nao rastreada — public/.gitkeep nao comitado!"
}

# ----------------------------------------------------------
# 4. Segredos — garante que .env* nao esta no stage
# ----------------------------------------------------------
Write-Check "Verificando arquivos .env no stage..."
$stagedEnv = git diff --cached --name-only | Where-Object { $_ -match "\.env" }
if ($stagedEnv) {
    Write-Fail "ATENCAO: Arquivo(s) .env no stage: $($stagedEnv -join ', ')"
} else {
    Write-Pass "Nenhum arquivo .env no stage"
}

# ----------------------------------------------------------
# Resultado Final
# ----------------------------------------------------------
Write-Host ""
Write-Host "==========================================" -ForegroundColor Magenta
if ($failures.Count -eq 0) {
    Write-Host "  🚀 TUDO OK! Pode dar git push com seguranca." -ForegroundColor Green
    exit 0
} else {
    Write-Host "  🚫 $($failures.Count) verificacao(oes) FALHARAM:" -ForegroundColor Red
    $failures | ForEach-Object { Write-Host "     - $_" -ForegroundColor Red }
    Write-Host ""
    Write-Host "  Corrija os problemas acima antes de dar push." -ForegroundColor Yellow
    exit 1
}
