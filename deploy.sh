#!/bin/bash
set -e

APP_DIR="/opt/zeiterfassung"
cd "$APP_DIR"

# .env laden (ohne Zeilen mit Sonderzeichen wie <>)
if [ -f "$APP_DIR/.env" ]; then
  export $(grep -v '^#' "$APP_DIR/.env" | grep -v '<' | grep -v '>' | xargs)
  # DOMAIN separat laden
  DOMAIN=$(grep '^DOMAIN=' "$APP_DIR/.env" | cut -d'=' -f2)
fi

DOMAIN="${DOMAIN:-zeit.kurtech.shop}"

echo "🚀 Zeiterfassung Deployment startet..."
echo "Domain: $DOMAIN"

# Repo updaten
echo "📥 Repository updaten..."
git pull origin main

# Domain in nginx.conf eintragen
echo "🔧 Nginx für Domain $DOMAIN konfigurieren..."
sed -i "s/DEINE_DOMAIN\.de/$DOMAIN/g" docker/nginx/nginx.conf 2>/dev/null || true

# SSL Zertifikat holen (einmalig)
if [ ! -d "$APP_DIR/docker/certbot/conf/live/$DOMAIN" ]; then
  echo "🔒 SSL Zertifikat anfordern..."
  mkdir -p docker/certbot/conf docker/certbot/www

  docker compose --env-file "$APP_DIR/.env" -f docker/docker-compose.prod.yml up -d nginx
  sleep 5

  docker compose --env-file "$APP_DIR/.env" -f docker/docker-compose.prod.yml run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "admin@$DOMAIN" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN" || echo "⚠️  SSL übersprungen - DNS noch nicht bereit?"
fi

# App bauen (Cache leeren wegen vorheriger Fehler)
echo "🏗️  Docker Images bauen..."
docker compose --env-file "$APP_DIR/.env" -f docker/docker-compose.prod.yml build --no-cache

echo "🔄 Container starten..."
docker compose --env-file "$APP_DIR/.env" -f docker/docker-compose.prod.yml up -d

echo "⏳ Warte auf Start..."
sleep 15

echo ""
echo "✅ Deployment abgeschlossen!"
echo "🌐 App: https://$DOMAIN"
echo ""
docker compose --env-file "$APP_DIR/.env" -f docker/docker-compose.prod.yml ps
