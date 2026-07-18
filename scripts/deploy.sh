#!/usr/bin/env bash
# =============================================================
# deploy.sh — Script de deploy/update do AssetFlow Pro na VM
# Uso: bash deploy.sh
# Local na VM: ~/deploy.sh (ou /opt/assetflow/deploy.sh)
# =============================================================
set -e

APP_DIR="/opt/assetflow"
COMPOSE_FILE="docker-compose.prod.yml"

echo "🚀 [$(date '+%Y-%m-%d %H:%M:%S')] Iniciando deploy..."

if [ ! -d "$APP_DIR" ]; then
  echo "❌ Diretório $APP_DIR não encontrado."
  echo "   Execute o setup inicial primeiro: bash scripts/setup-vm.sh"
  exit 1
fi

cd "$APP_DIR"

# Carrega variáveis de produção
if [ -f .env.production ]; then
  set -a && source .env.production && set +a
fi

# Marca a versão
export APP_RELEASE=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

echo "📥 Pulling latest changes (branch main)..."
git fetch origin main
git reset --hard origin/main

echo "🐳 Building and restarting containers..."
docker compose -f "$COMPOSE_FILE" pull
docker compose -f "$COMPOSE_FILE" up -d --build

echo "🧹 Pruning old images to free disk space..."
docker image prune -f

echo "⏳ Waiting 20s for containers to stabilize..."
sleep 20

echo "🏥 Health check..."
if curl -sf http://localhost/api/health > /dev/null; then
  echo "✅ Deploy concluído com sucesso! Release: $APP_RELEASE"
else
  echo "⚠️  Backend não respondeu ainda (pode estar subindo). Verifique:"
  echo "   docker compose -f $COMPOSE_FILE logs backend --tail=50"
fi
