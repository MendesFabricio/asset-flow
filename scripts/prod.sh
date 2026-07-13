#!/bin/bash
docker compose -f docker-compose.prod.yml up -d --build
echo -e "\e[32mAmbiente de Produção iniciado!\e[0m"
