#!/bin/bash
set -e

APP_DIR="/opt/zeiterfassung"

# .env laden
if [ -f "$APP_DIR/.env" ]; then
  export $(grep -v '^#' "$APP_DIR/.env" | xargs)
fi

DOMAIN="${DOMAIN:-zeit.kurtech.shop}"

echo "🚀 Zeiterfassung Deployment startet..."
echo "Domain: $DOMAIN"

cd "$APP_DIR"

# Repo updaten
echo "📥 Repository updaten..."
git pull origin main

# Domain in nginx.conf eintragen
echo "🔧 Nginx für Domain $DOMAIN konfigurieren..."
sed -i "s/DEINE_DOMAIN\.de/$DOMAIN/g" docker/nginx/nginx.conf 2>/dev/null || true

# SSL Zertifikat holen (einmalig)
if [ ! -d "docker/certbot/conf/live/$DOMAIN" ]; then
  echo "🔒 SSL Zertifikat anfordern..."
  mkdir -p docker/certbot/conf docker/certbot/www

  # Temporär nur HTTP-Nginx starten
  docker compose --env-file "$APP_DIR/.env" -f docker/docker-compose.prod.yml up -d nginx

  sleep 3

  docker compose --env-file "$APP_DIR/.env" -f docker/docker-compose.prod.yml run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "admin@$DOMAIN" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN"

  echo "✅ SSL Zertifikat erhalten!"
fi

# App bauen und starten
echo "🏗️  Docker Images bauen..."
docker compose --env-file "$APP_DIR/.env" -f docker/docker-compose.prod.yml build

echo "🔄 Container starten..."
docker compose --env-file "$APP_DIR/.env" -f docker/docker-compose.prod.yml up -d

echo "⏳ Warte auf Start..."
sleep 15

echo ""
echo "✅ Deployment abgeschlossen!"
echo "🌐 App: https://$DOMAIN"
echo ""
echo "Status der Container:"
docker compose --env-file "$APP_DIR/.env" -f docker/docker-compose.prod.yml ps
