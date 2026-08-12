#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[deploy] buildando imagens e iniciando stack..."
docker compose up -d --build --remove-orphans

echo "[deploy] aplicando migrations..."
docker compose run --rm backend npm run db:migrate:deploy

echo "[deploy] stack pronta."
docker compose ps
