# verificar-design.ps1 — métricas do design system (Windows/PowerShell)
# Uso: pwsh -File .agents/scripts/verificar-design.ps1
# Deve ser rodado antes e depois de cada fase do REDESIGN.md.

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

$ui = Get-ChildItem app -Recurse -Include *.tsx, *.ts | Where-Object { $_.Name -notlike "*.test.*" }
$txs = Get-ChildItem app -Recurse -Include *.tsx | Where-Object { $_.Name -notlike "*.test.*" }

function Count-All($files, $pattern) {
    ($files | Select-String -Pattern $pattern -AllMatches |
        ForEach-Object { $_.Matches } | Measure-Object).Count
}

$rows = [ordered]@{
    "text-[Npx] arbitrario"  = (Count-All $ui  'text-\[[0-9.]*px\]')
    "cor slate-* hardcoded"  = (Count-All $ui  'bg-slate-|text-slate-|border-slate-|divide-slate-')
    "hex cru no JSX"         = (Count-All $txs '#[0-9a-fA-F]{6}')
    "rounded-2xl/3xl"        = (Count-All $ui  'rounded-2xl|rounded-3xl')
    "font-extrabold/black"   = (Count-All $ui  'font-extrabold|font-black')
    "font-bold"              = (Count-All $ui  '\bfont-bold\b')
    "tabular-nums (>= 60)"   = (Count-All $ui  'tabular-nums')
    "backdrop-blur"          = (Count-All $ui  'backdrop-blur')
    "shadow-*"               = (Count-All $ui  '\bshadow-')
}

Write-Host ""
Write-Host "=== Design system: contagens ===" -ForegroundColor Cyan
foreach ($k in $rows.Keys) { Write-Host ("  {0,-24} {1,5}" -f $k, $rows[$k]) }

# Metas da Fase 1
$metas = @{
    "text-[Npx] arbitrario" = 0
    "cor slate-* hardcoded" = 0
    "hex cru no JSX"        = 0
    "rounded-2xl/3xl"       = 0
    "font-extrabold/black"  = 0
}
$falhas = 0
Write-Host ""
Write-Host "=== Metas da Fase 1 ===" -ForegroundColor Cyan
foreach ($k in $metas.Keys) {
    $ok = $rows[$k] -le $metas[$k]
    if (-not $ok) { $falhas++ }
    $marca = if ($ok) { "OK" } else { "PENDENTE" }
    Write-Host ("  {0,-24} esperado <= {1,-3} atual {2,-5} {3}" -f $k, $metas[$k], $rows[$k], $marca)
}
if ($rows["tabular-nums (>= 60)"] -lt 60) {
    Write-Host ("  {0,-24} esperado >= 60  atual {1,-5} PENDENTE" -f "tabular-nums", $rows["tabular-nums (>= 60)"])
    $falhas++
} else {
    Write-Host ("  {0,-24} esperado >= 60  atual {1,-5} OK" -f "tabular-nums", $rows["tabular-nums (>= 60)"])
}

# Skill unslop-ui (tells)
$counter = ".agents/skills/unslop-ui/scripts/count_tells.py"
if (Test-Path $counter) {
    $py = if (Test-Path ".venv\Scripts\python.exe") { ".venv\Scripts\python.exe" } else { "python" }
    Write-Host ""
    Write-Host "=== Tells (unslop-ui) ===" -ForegroundColor Cyan
    $json = & $py $counter --surface app 2>$null | ConvertFrom-Json
    if ($json) {
        Write-Host ("  TOTAL de tells: {0}  (linha de base: 709)" -f $json.total)
    }
}

Write-Host ""
if ($falhas -gt 0) {
    Write-Host "RESULTADO: $falhas pendencia(s) na Fase 1." -ForegroundColor Yellow
    exit 1
}
Write-Host "RESULTADO: Fase 1 concluida." -ForegroundColor Green
exit 0
