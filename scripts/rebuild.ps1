docker compose -f docker-compose.dev.yml down
docker compose -f docker-compose.dev.yml build --no-cache
docker compose -f docker-compose.dev.yml up -d
Write-Host "Rebuild de desenvolvimento concluído!" -ForegroundColor Green
