# Requer execução como Administrador
Write-Host "1. Limpando containers parados, redes e imagens sem uso..." -ForegroundColor Yellow
docker system prune -a -f

Write-Host "2. Limpando volumes órfãos..." -ForegroundColor Yellow
docker volume prune -f

Write-Host "3. Limpando cache de compilação (BuildKit)..." -ForegroundColor Yellow
docker builder prune -a -f

Write-Host "4. Encerrando o WSL para liberar o arquivo de disco..." -ForegroundColor Yellow
wsl --shutdown

Write-Host "5. Compactando o disco virtual no drive E:..." -ForegroundColor Yellow
$vhdxPath = "E:\DockerDesktopWSL\disk\docker_data.vhdx"

$diskpartScript = @"
select vdisk file="$vhdxPath"
compact vdisk
exit
"@

$diskpartScript | diskpart

Write-Host "Limpeza e compactação concluídas com sucesso!" -ForegroundColor Green
