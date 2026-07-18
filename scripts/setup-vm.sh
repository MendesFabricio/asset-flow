#!/usr/bin/env bash
# =============================================================
# setup-vm.sh — Configuração inicial da VM Oracle Always-Free
# Execute UMA VEZ após criar a instância:
#   curl -fsSL https://raw.githubusercontent.com/MendesFabricio/asset-flow/main/scripts/setup-vm.sh | bash
# =============================================================
set -e

REPO_URL="https://github.com/MendesFabricio/asset-flow.git"
APP_DIR="/opt/assetflow"

echo "========================================"
echo " AssetFlow Pro — Oracle VM Initial Setup"
echo "========================================"

# --- 1. Docker ---
echo "📦 Installing Docker..."
sudo apt-get update -qq
sudo apt-get install -y -qq docker.io docker-compose-plugin curl git
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"

# --- 2. Clone do repositório ---
echo "📥 Cloning repository to $APP_DIR..."
if [ -d "$APP_DIR" ]; then
  echo "   Diretório já existe, atualizando..."
  cd "$APP_DIR" && git pull origin main
else
  sudo git clone "$REPO_URL" "$APP_DIR"
  sudo chown -R "$USER:$USER" "$APP_DIR"
fi

cd "$APP_DIR"

# --- 3. .env.production ---
if [ ! -f .env.production ]; then
  cp .env.production .env.production.bak 2>/dev/null || true
  echo ""
  echo "⚠️  ATENÇÃO: preencha o arquivo .env.production antes de subir os containers!"
  echo "   nano $APP_DIR/.env.production"
fi

# --- 4. Cria a estrutura de volumes persistentes ---
mkdir -p backups

# --- 5. DuckDNS cron (atualiza IP a cada 5 min) ---
echo ""
read -p "🌐 Informe o subdomínio DuckDNS (ex: assetflow): " DUCKDNS_SUBDOMAIN
read -p "🔑 Informe o token DuckDNS: " DUCKDNS_TOKEN

if [ -n "$DUCKDNS_TOKEN" ]; then
  CRON_JOB="*/5 * * * * curl -s 'https://www.duckdns.org/update?domains=$DUCKDNS_SUBDOMAIN&token=$DUCKDNS_TOKEN&ip=' > /dev/null 2>&1"
  (crontab -l 2>/dev/null | grep -v duckdns; echo "$CRON_JOB") | crontab -
  echo "✅ Cron DuckDNS configurado: atualiza a cada 5 minutos"
fi

# --- 6. Firewall (Oracle usa iptables por padrão no free tier) ---
echo "🔥 Configuring firewall rules (80, 443)..."
sudo iptables -I INPUT 6 -p tcp --dport 80 -j ACCEPT  || true
sudo iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT || true
sudo netfilter-persistent save 2>/dev/null || true

echo ""
echo "========================================"
echo "✅ Setup concluído!"
echo ""
echo "Próximos passos:"
echo "  1. Edite o .env.production: nano $APP_DIR/.env.production"
echo "  2. Suba os containers: bash $APP_DIR/scripts/deploy.sh"
echo "  3. Baixe o modelo Ollama (1x): docker compose -f $APP_DIR/docker-compose.prod.yml exec ollama ollama pull llama3.2:3b"
echo "  4. Acesse: https://\$DUCKDNS_SUBDOMAIN.duckdns.org"
echo "========================================"

echo ""
echo "⚠️  IMPORTANTE: Faça logout e login novamente para aplicar as permissões do grupo docker."
