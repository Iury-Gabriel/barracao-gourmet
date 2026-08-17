# Barracão Gourmet

Deploy completo para VPS Linux com Docker (`frontend + backend + PostgreSQL`) com um comando.

## Stack de produção

- Frontend React servido por Nginx
- Backend Node.js + Express
- PostgreSQL 16
- Prisma Migrate (`migrate deploy`) no startup do backend

## Portas expostas (não padrão)

- Frontend: `18091`
- Backend: `13352`
- PostgreSQL: `15437`
- Redis: `16384`

Escolhidas para não colidir com os outros sistemas que rodam na mesma VPS
(que ocupam 13347-13351, 15432-15436, 16379-16383 e 18086-18090).

Você pode trocar em `.env`:

```env
FRONTEND_PORT=18091
BACKEND_PORT=13352
POSTGRES_PORT=15437
REDIS_PORT=16384
```

## Variáveis principais

> Este repositório é público. **Nunca** comite valores reais de senha, `JWT_SECRET`
> ou tokens de API. Os exemplos abaixo são placeholders; os valores de produção
> ficam apenas no `.env` da VPS (veja "Auto-deploy").

`.env` (raiz):

```env
POSTGRES_DB=barracao_gourmet
POSTGRES_USER=barracao_user
POSTGRES_PASSWORD=<defina-uma-senha-forte>
DOCKER_VITE_API_URL=
PUBLIC_BASE_URL=http://localhost:18091
CORS_ORIGINS=http://localhost:18091,http://localhost:8080,http://localhost:5173,http://localhost:3000
```

`backend/.env` (use `backend/.env.example` como base):

```env
DATABASE_URL="postgresql://barracao_user:<senha>@localhost:15437/barracao_gourmet?schema=public"
JWT_SECRET="<gere-com-openssl-rand-hex-32>"
```

## Auto-deploy (produção)

Produção roda na VPS `86.48.19.98`, no mesmo padrão dos outros sistemas dela:
um **self-hosted runner do GitHub Actions** por repositório.

- Workflow: `.github/workflows/deploy.yml`, dispara em `push` na `main`
- Runner: serviço systemd `actions.runner.Iury-Gabriel-barracao-gourmet.barracao-vps`,
  instalado em `/root/actions-runner-barracao`, label **`barracao-vps`**
- O deploy roda no work dir do runner, não em `/root/barracao-gourmet`

Como `actions/checkout` faz `git clean` e apaga arquivos não versionados, os segredos
**não** ficam no repositório. Eles moram em `/root/barracao-secrets/` na VPS e o
workflow copia antes do `docker compose up`:

```
/root/barracao-secrets/root.env     ->  .env
/root/barracao-secrets/backend.env  ->  backend/.env
```

Para mudar um segredo em produção, edite o arquivo na VPS e redispare o workflow
(`Actions > deploy > Run workflow`). Nada de segredo entra em commit.

## Primeiro deploy manual (outra máquina)

1. Instale Docker + Docker Compose plugin.
2. Clone o repositório.
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
- Para domínio real, ajuste `PUBLIC_BASE_URL` e `CORS_ORIGINS` no `.env` da VPS.
- O banco antigo SQLite foi substituído por PostgreSQL no Prisma.
- O domínio `barracaogourmet.com.br` ainda **não existe** (NXDOMAIN). Enquanto isso,
  o acesso é por `http://86.48.19.98:18091`. Quando o domínio for registrado e
  apontado para a VPS, criar o vhost em `/etc/nginx/sites-available/` e emitir o
  certificado com `certbot --nginx`, como nos outros projetos.
