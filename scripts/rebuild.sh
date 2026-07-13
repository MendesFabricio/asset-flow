#!/bin/bash
docker compose -f docker-compose.dev.yml down
docker compose -f docker-compose.dev.yml build --no-cache
docker compose -f docker-compose.dev.yml up -d
echo -e "\e[32mRebuild de desenvolvimento concluído!\e[0m"
