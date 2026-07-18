#!/usr/bin/env pwsh
# ============================================================
# pre-push-check.ps1
# Script de validação local antes do git push
# Rode:
#   .\scripts\pre-push-check.ps1
# ============================================================

$ErrorActionPreference = "Continue"
$failures = @()

function Write-Check($msg) {
    Write-Host "  🔍 $msg" -ForegroundColor Cyan
}

function Write-Pass($msg) {
    Write-Host "  ✅ $msg" -ForegroundColor Green
}

function Write-Fail($msg) {
    Write-Host "  ❌ $msg" -ForegroundColor Red
    $script:failures += $msg
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host "  AssetFlow — Pre-Push Validation" -ForegroundColor Magenta
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host ""

# ----------------------------------------------------------
# Verifica Node
# ----------------------------------------------------------
Write-Check "Verificando Node.js..."

$node = Get-Command node -ErrorAction SilentlyContinue

if (-not $node) {
    Write-Fail "Node.js não encontrado."
}
else {
    Write-Pass "Node.js encontrado"
}

# ----------------------------------------------------------
# Verifica npm
# ----------------------------------------------------------
Write-Check "Verificando npm..."

$npm = Get-Command npm -ErrorAction SilentlyContinue

if (-not $npm) {
    Write-Fail "npm não encontrado."
}
else {
    Write-Pass "npm encontrado"
}

# ----------------------------------------------------------
# Verifica npx
# ----------------------------------------------------------
Write-Check "Verificando npx..."

$npx = Get-Command npx -ErrorAction SilentlyContinue

if (-not $npx) {
    Write-Fail "npx não encontrado."
}
else {
    Write-Pass "npx encontrado"
}

# ----------------------------------------------------------
# TypeScript
# ----------------------------------------------------------
Write-Check "TypeScript type check (tsc --noEmit)..."

$tscOut = npx tsc --noEmit 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Pass "TypeScript: sem erros"
}
else {
    Write-Fail "TypeScript: erros encontrados"

    $tscOut |
    Select-Object -First 30 |
    ForEach-Object {
        Write-Host "     $_" -ForegroundColor DarkRed
    }
}

# ----------------------------------------------------------
# ESLint
# ----------------------------------------------------------
Write-Check "ESLint (npm run lint)..."

$lintOut = npm run lint 2>&1

$errorLines = $lintOut | Where-Object {
    $_ -match "\berror\b"
}

if (($LASTEXITCODE -eq 0) -or ($errorLines.Count -eq 0)) {
    Write-Pass "ESLint: sem erros bloqueantes"
}
else {
    Write-Fail "ESLint: $($errorLines.Count) erro(s)"

    $errorLines |
    Select-Object -First 20 |
    ForEach-Object {
        Write-Host "     $_" -ForegroundColor DarkRed
    }
}

# ----------------------------------------------------------
# public/
# ----------------------------------------------------------
Write-Check "Pasta public/ rastreada pelo git..."

$publicGit = git ls-files public

if ($publicGit) {
    Write-Pass "public/: rastreada pelo git"
}
else {
    Write-Fail "public/ não rastreada pelo git."
}

# ----------------------------------------------------------
# Arquivos .env no stage
# ----------------------------------------------------------
Write-Check "Verificando arquivos .env no stage..."

$stagedEnv = git diff --cached --name-only |
Where-Object { $_ -match '(^|/)\.env' }

if ($stagedEnv) {
    Write-Fail "Arquivos .env encontrados no stage:"
    $stagedEnv | ForEach-Object {
        Write-Host "     $_" -ForegroundColor DarkRed
    }
}
else {
    Write-Pass "Nenhum arquivo .env no stage"
}

# ----------------------------------------------------------
# Git Status
# ----------------------------------------------------------
Write-Check "Verificando repositório Git..."

$gitStatus = git status --porcelain

if ($LASTEXITCODE -eq 0) {
    Write-Pass "Repositório Git OK"
}
else {
    Write-Fail "Erro ao verificar o repositório Git."
}

# ----------------------------------------------------------
# Resultado Final
# ----------------------------------------------------------

Write-Host ""
Write-Host "==========================================" -ForegroundColor Magenta

if ($failures.Count -eq 0) {

    Write-Host ""
    Write-Host "  🚀 TUDO OK!" -ForegroundColor Green
    Write-Host "  Pode executar o git push com segurança." -ForegroundColor Green
    Write-Host ""

    exit 0
}
else {

    Write-Host ""
    Write-Host "  🚫 $($failures.Count) verificação(ões) falharam:" -ForegroundColor Red

    $failures | ForEach-Object {
        Write-Host "     • $_" -ForegroundColor Red
    }

    Write-Host ""
    Write-Host "Corrija os problemas antes de executar o git push." -ForegroundColor Yellow
    Write-Host ""

    exit 1
}
