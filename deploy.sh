#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Zeiterfassung – Deployment Skript
# Auf dem Server ausführen: bash deploy.sh
# ═══════════════════════════════════════════════════════════════

set -e

DOMAIN="${DOMAIN:-zeiterfassung.deine-domain.de}"
REPO="https://github.com/support-star/zeiterfassung.git"
APP_DIR="/opt/zeiterfassung"

echo "🚀 Zeiterfassung Deployment startet..."
echo "Domain: $DOMAIN"

# ── 1. Repo klonen oder updaten ───────────────────────────────
if [ -d "$APP_DIR" ]; then
  echo "📥 Repository updaten..."
  cd "$APP_DIR"
  git pull origin main
else
  echo "📥 Repository klonen..."
  git clone "$REPO" "$APP_DIR"
  cd "$APP_DIR"
fi

# ── 2. .env prüfen ────────────────────────────────────────────
if [ ! -f "$APP_DIR/.env" ]; then
  echo ""
  echo "⚠️  Keine .env Datei gefunden!"
  echo "Bitte erstellen:"
  echo "  cp $APP_DIR/.env.example $APP_DIR/.env"
  echo "  nano $APP_DIR/.env"
  echo ""
  exit 1
fi

# ── 3. Domain in nginx.conf eintragen ─────────────────────────
echo "🔧 Nginx für Domain $DOMAIN konfigurieren..."
sed -i "s/DEINE_DOMAIN.de/$DOMAIN/g" docker/nginx/nginx.conf

# ── 4. SSL Zertifikat holen (einmalig) ────────────────────────
if [ ! -d "docker/certbot/conf/live/$DOMAIN" ]; then
  echo "🔒 SSL Zertifikat anfordern..."

  # Nginx temporär nur auf Port 80 starten für ACME Challenge
  docker compose -f docker/docker-compose.prod.yml up -d nginx

  docker compose -f docker/docker-compose.prod.yml run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email admin@$DOMAIN \
    --agree-tos \
    --no-eff-email \
    -d $DOMAIN

  echo "✅ SSL Zertifikat erhalten!"
fi

# ── 5. App bauen und starten ───────────────────────────────────
echo "🏗️  Docker Images bauen..."
docker compose -f docker/docker-compose.prod.yml build --no-cache

echo "🔄 Container starten..."
docker compose -f docker/docker-compose.prod.yml up -d

# ── 6. Health Check ───────────────────────────────────────────
echo "⏳ Warte auf API..."
sleep 10

if curl -sf "https://$DOMAIN/api/health" > /dev/null 2>&1; then
  echo ""
  echo "✅ Deployment erfolgreich!"
  echo "🌐 App erreichbar unter: https://$DOMAIN"
else
  echo ""
  echo "⚠️  Health Check fehlgeschlagen. Logs:"
  docker compose -f docker/docker-compose.prod.yml logs api --tail=30
fi
