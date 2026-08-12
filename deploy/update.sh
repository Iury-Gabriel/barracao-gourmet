#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"

echo "[update] branch atual: ${BRANCH}"
echo "[update] buscando atualizações no remoto..."
git fetch origin "${BRANCH}"
git pull --ff-only origin "${BRANCH}"

# Sempre rebuilda ao deployar. O gate de "ha commit novo?" e feito por quem chama
# este script (o cron so chama quando detecta push novo). Importante: o wrapper do
# cron faz 'git pull' antes de chamar aqui, entao nao da pra detectar OLD vs NEW
# dentro deste script — por isso rebuildamos sempre.
echo "[update] rebuildando e subindo containers..."
docker compose up -d --build --remove-orphans

echo "[update] aguardando backend ficar pronto..."
sleep 5

echo "[update] aplicando migrations..."
docker compose exec -T backend npx prisma migrate deploy

echo "[update] finalizado."
docker compose ps
