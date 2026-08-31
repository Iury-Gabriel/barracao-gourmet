# AGENTS.md

Agent ramp-up guide — Barracão Gourmet. Every item here is something an agent would likely miss without it.

---

## Stack

### Frontend
- React 18.3 + TypeScript 5.8 + Vite 5.4 (`@vitejs/plugin-react-swc`)
- Routing: React Router DOM v6
- Data fetching: TanStack Query v5
- UI: shadcn/ui (slate base, CSS variables) + Radix UI primitives
- Styling: Tailwind CSS v3.4, dark mode via `class`
- Animation: Motion for React v12 (`motion` package)
- Forms: react-hook-form + zod
- Auth: JWT stored in `localStorage`, consumed via `AuthContext`

### Backend (`backend/`)
- Node.js + Express 4 + TypeScript
- ORM: Prisma 5 with PostgreSQL (`DATABASE_URL`)
- Auth: bcryptjs + jsonwebtoken
- Dev server: ts-node-dev

---

## Developer commands

### Frontend
```bash
npm run dev          # Vite dev server on port 8080
npm run build        # production build
npm run lint         # ESLint
npm run test         # Vitest single run
```

### Backend
```bash
cd backend
npm run dev          # ts-node-dev on port 3333
npm run db:migrate   # prisma migrate dev
npm run db:seed      # seed users + products
npm run db:studio    # Prisma Studio
```

### Environment
- Frontend: `.env` → `VITE_API_URL=http://localhost:3333`
- Backend: `backend/.env` → `DATABASE_URL`, `JWT_SECRET`, `PORT`

---

## TypeScript strictness

`strict`, `noImplicitAny`, and `strictNullChecks` are all **false** in `tsconfig.json`. Do not tighten these without broad testing.

---

## Path alias

`@/` → `./src/`

---

## Source layout

```
src/
  main.tsx
  App.tsx                         # Router root, all routes, providers
  contexts/
    AuthContext.tsx                # JWT auth — NO Supabase
    SidebarContext.tsx
  data/
    usersData.ts                  # TabPermissionKey + perfilPermissoes (ADMIN/GERENTE/OPERADOR)
  hooks/
    useApi.ts                     # Authenticated fetch wrapper → api.get/post/put/patch/delete
  pages/
    auth/LoginPage.tsx
    cardapio/CardapioPage.tsx      # PUBLIC — no login required
    pedidos/
      PedidosPage.tsx             # Kanban pipeline
      PedidoDetailPage.tsx
      NovoPedidoPage.tsx
      HistoricoPedidosPage.tsx
    estoque/
      ProdutosPage.tsx
      MovimentacoesPage.tsx
      AlertasEstoquePage.tsx
    clientes/
      ClientesPage.tsx
      ClienteDetailPage.tsx
    financeiro/
      FinanceiroPage.tsx
    OperacionalPage.tsx
    DashboardPage.tsx
    AutomacoesPage.tsx            # Placeholder — fase 2
    ConfiguracoesPage.tsx
    NotFound.tsx
  components/
    layout/                       # AppLayout, AppSidebar, ProtectedRoute
    ui/                           # shadcn/ui — do not hand-edit
    shared/
  lib/
    utils.ts

backend/
  src/
    server.ts                     # Express entry point — port 3333
    config/env.ts
    middleware/
      auth.ts                     # JWT verification, requireAdmin, requireGerente
      errorHandler.ts
      logger.ts
    routes/                       # auth, cardapio, pedidos, estoque, clientes, financeiro, usuarios
    controllers/                  # thin — delegates to services
    services/                     # business logic
    lib/
      prisma.ts                   # singleton PrismaClient
      jwt.ts                      # signToken / verifyToken
  prisma/
    schema.prisma                 # PostgreSQL models
    migrations/                   # SQL migrations
    seed.ts                       # default users + sample products
```

---

## Auth & permissions

- `AuthContext` does `POST /api/auth/login` → receives `{ token, user }` → stores token in `localStorage`
- `canAccess(permission: TabPermissionKey)` and `hasModule(module)` derive from `perfilPermissoes[user.perfil]`
- `ProtectedRoute` wraps routes with a `permission` prop
- Three profiles: `ADMIN` (all), `GERENTE` (dashboard + financeiro + clientes + pedidos + estoque + operacional), `OPERADOR` (pedidos + estoque alertas + operacional)
- `globalThis.__barracaoAuthContext` singleton survives HMR — do not refactor

---

## Backend API

Base URL: `http://localhost:3333`

| Public | `GET /api/cardapio` | `POST /api/cardapio/pedido` |
|--------|---------------------|-----------------------------|
| Auth required | All `/api/pedidos`, `/api/estoque`, `/api/clientes`, `/api/financeiro`, `/api/usuarios` |
| Gerente+ only | `/api/financeiro` |
| Admin only | `GET/POST/PUT /api/usuarios` |

---

## Modules / Sidebar

| Module | Routes | Permission module |
|--------|--------|-------------------|
| Pedidos | `/pedidos`, `/pedidos/novo`, `/pedidos/historico`, `/pedidos/:id` | `pedidos` |
| Estoque | `/estoque/produtos`, `/estoque/movimentacoes`, `/estoque/alertas` | `estoque` |
| Clientes | `/clientes`, `/clientes/:id` | `clientes` |
| Financeiro | `/financeiro`, `/financeiro/lancamentos` | `financeiro` |
| Operacional | `/operacional` | `operacional` |
| Dashboard | `/dashboard` | `dashboard` |
| Automações | `/automacoes` | `automacoes` |
| Configurações | `/configuracoes?aba=perfil|usuarios|cardapio` | always visible |

---

## Public routes

- `/cardapio` — no login, no `RequireAuth`, no `AppLayout`. Fetches `GET /api/cardapio` directly without JWT.
- `/site` — landing page institucional (`src/pages/site/LandingPage.tsx`). Estática, sem chamadas de API.
  Todo o conteúdo (textos, prato do dia por dia da semana, preços, horários, contatos) vive em
  `src/pages/site/siteContent.ts` — edite só esse arquivo para atualizar o site. Usa o tema escuro da
  marca inline (`siteThemeVars`, marrom + amarelo da logo), sem seguir o toggle do painel. `/` continua
  redirecionando para `/login`.

---

## UI components

- Add shadcn components with the CLI, not by hand:
  ```bash
  npx shadcn@latest add <component>
  ```
- All colors are CSS custom properties defined in `src/index.css`.

---

## Theme (Barracão Gourmet — vermelho, marrom, branco)

- **Dark is the default.** `src/components/ThemeProvider.tsx` wraps the app with
  `next-themes` (`attribute="class"`, `defaultTheme="dark"`, `enableSystem={false}`,
  `storageKey="barracao-tema"`). `index.html` also ships `class="dark"` on `<html>`
  so there is no light flash before hydration.
- `enableSystem` is **off on purpose**: with it on, an operator whose Windows is in
  light mode would open the panel in light, contradicting the "dark by default" rule.
- The toggle (`ThemeToggle`) lives in the sidebar footer next to the settings button.
- Brand palette (`:root` and `.dark` in `src/index.css`): primary = vermelho
  `hsl(358 80% 43%)` (#C4161C, from the logo), surfaces/sidebar = marrom, text = branco quente.
- The public menu (`/cardapio`) does **not** follow the panel toggle — it is always
  the dark brand theme, set inline via `cardapioThemeVars` plus the `marrom-*` /
  `vermelho-*` Tailwind scales declared in `tailwind.config.ts`.
- Semantic status colors (green = paid/ready, amber = preparing, rose = cancelled)
  were deliberately **not** repainted to brand red — red must keep meaning "brand/CTA",
  not "error", inside the menu.
- Logo: `public/logo.svg` (referenced by `index.html`, `AppSidebar`, `LoginPage`, `CardapioPage`).

---

## Quirks

- **Language**: UI is in Brazilian Portuguese.
- **`lovable-tagger`**: `componentTagger` Vite plugin active in dev — do not remove.
- **Deduplication**: `react`, `react-dom`, `motion`, `motion/react` deduped in `vite.config.ts`.
- **No CI**: No `.github/workflows/`.
- **Font**: Inter (sans-serif), loaded globally.
- **Supabase**: Completely removed. No `src/integrations/supabase/` folder exists.
- **Pedido numero**: a `Contador` model generates sequential order numbers atomically via `upsert` (kept from the SQLite era, still the source of truth).
- **Entrega grátis por cliente**: `Cliente.entregaGratis` (boolean). `clienteTemEntregaGratis()` lives in
  `clientes.service.ts` — **not** in `cardapio.service.ts`, because `pedidos.service.ts` also needs it and
  `cardapio.service.ts` already imports from `pedidos.service.ts` (putting it there would create a cycle).
  Both order paths (digital menu and manual) zero the frete on the **backend**, so the admin UI cannot
  charge shipping to an exempt customer by mistake. The exemption zeroes the frete but does **not** widen
  the delivery radius — an out-of-area address is still refused.
- **Endereço da loja**: origin of every frete/distance calculation, configured via
  `LOJA_ENDERECO_BASE`, `LOJA_LAT`, `LOJA_LON`, `LOJA_ENDERECO_RETIRADA` (`backend/src/config/env.ts`,
  consumed by `backend/src/lib/frete.ts`). The defaults are still the old shop's address — set the real
  one in `backend/.env` before going to production.
- **Pedido status**: `RECEBIDO` → `EM_PREPARO` → `PRONTO` → `EM_ENTREGA` → `ENTREGUE` (+ `CANCELADO`).
  The DB values stayed the same; only the UI labels are "Recebido / Em preparação / Pronto / Para entrega".
- **Stock deduction**: Happens automatically in `pedidos.service.ts` and `cardapio.service.ts` when a pedido is created.
- **Financial entry**: Created automatically in `pedidos.service.ts` when status changes to `ENTREGUE`.
- **Stock return**: Happens automatically when a pedido is `CANCELADO`.

---

## Default seed credentials

```
admin@barracaogourmet.com.br    / admin123    (ADMIN)
gerente@barracaogourmet.com.br  / gerente123  (GERENTE)
operador@barracaogourmet.com.br / operador123 (OPERADOR)
```
