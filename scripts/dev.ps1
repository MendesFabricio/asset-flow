docker compose -f docker-compose.dev.yml up -d
Write-Host "Ambiente de Desenvolvimento iniciado!" -ForegroundColor Green
Write-Host "Iniciando túnel Ngrok (janela separada)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "ngrok http 3000 --url=jorge-craftless-questionably.ngrok-free.dev"
