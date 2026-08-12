# Barracão Gourmet

Deploy completo para VPS Linux com Docker (`frontend + backend + PostgreSQL`) com um comando.

## Stack de produção

- Frontend React servido por Nginx
- Backend Node.js + Express
- PostgreSQL 16
- Prisma Migrate (`migrate deploy`) no startup do backend

## Portas expostas (não padrão)

- Frontend: `18086`
- Backend: `13347`
- PostgreSQL: `15432`

Você pode trocar em `.env`:

```env
FRONTEND_PORT=18086
BACKEND_PORT=13347
POSTGRES_PORT=15432
```

## Variáveis principais

`.env` (raiz):

```env
POSTGRES_DB=barracao_gourmet
POSTGRES_USER=barracao_user
POSTGRES_PASSWORD=BarracaoGourmet_2026
DOCKER_VITE_API_URL=
PUBLIC_BASE_URL=http://localhost:18086
CORS_ORIGINS=http://localhost:18086,http://localhost:8080,http://localhost:5173,http://localhost:3000
```

`backend/.env`:

```env
DATABASE_URL="postgresql://barracao_user:BarracaoGourmet_2026@localhost:15432/barracao_gourmet?schema=public"
JWT_SECRET="barracao-gourmet-jwt-secret-2024"
```

## Primeiro deploy na VPS

1. Instale Docker + Docker Compose plugin.
2. Clone o repositório na VPS.
3. Rode:

```bash
chmod +x deploy/first-deploy.sh deploy/update.sh
./deploy/first-deploy.sh
```

Isso faz:

- build das imagens
- sobe `postgres`, `backend`, `frontend`
- aplica migrations Prisma

## Atualização com git pull + rebuild + migrations

```bash
./deploy/update.sh
```

Fluxo do script:

- `git fetch` + `git pull --ff-only`
- se houve commit novo: `docker compose up -d --build --remove-orphans`
- se não houve: garante containers em pé
- roda `docker compose run --rm backend npm run db:migrate:deploy`

## Comandos úteis

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres
docker compose down
```

## Observações

- Frontend em produção usa proxy do Nginx para `/api` e `/uploads`.
- Para domínio real, ajuste `PUBLIC_BASE_URL` e `CORS_ORIGINS` no `.env`.
- O banco antigo SQLite foi substituído por PostgreSQL no Prisma.
