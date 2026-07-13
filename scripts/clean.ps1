Write-Host "Limpando sistema Docker..." -ForegroundColor Yellow
docker system prune -f
docker volume prune -f
Write-Host "Limpeza concluída." -ForegroundColor Green
