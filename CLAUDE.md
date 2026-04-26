# CLAUDE.md - BitByBit Arena

## Proyecto

**BitByBit Arena** (arena.bitbybit.com.ar) es un cliente Nostr donde cualquier usuario puede crear desafios, competir con otros y ganar badges en su identidad Nostr. Es el segundo proyecto de la organizacion BitByBit, despues del habit tracker.

## Hackathon

- **Nombre**: Hackathon #2 de La Crypta
- **Tema**: Nostr
- **Entrega**: PR al repo de la hackathon
- **Pitch**: 3 minutos maximo
- **Jurado**: Evaluacion por IA

## Stack tecnologico

- **Framework**: Next.js (latest), React 19, TypeScript strict
- **Estilos**: SCSS modules (NO Tailwind, NO CSS-in-JS)
- **Iconos**: SVG custom en `components/icons/` (NO lucide-react, NO icon libraries)
- **i18n**: next-intl con `[locale]` routing (espanol default, ingles segundo idioma)
- **Base de datos**: Neon DB (PostgreSQL serverless) via `@neondatabase/serverless`
- **ORM**: Drizzle ORM
- **Auth**: Nostr solamente (NIP-07 extension, NIP-46 bunker, o nsec pegado; todos firman un evento NIP-98 HTTP Auth kind 27235)
- **Zaps**: NIP-57 (client-side only, no server-side Lightning/invoices)
- **Media**: Photo uploads via Blossom (BUD-01/BUD-02) — text + optional image proofs, badge images
- **Badges**: NIP-58
- **Fuente**: Nunito / Nunito Sans (Google Fonts)

## Estructura del proyecto

```
bitbybit-arena/
  app/
    [locale]/                  <- Rutas con i18n (es, en)
      (auth)/                  <- Login con Nostr
      (app)/                   <- App principal (Explore + My Challenges como bottom-tabs;
                                  Create y Settings via boton/menu)
        explore/               <- Listado + filtros + sort, mas [id] detail
        my-challenges/         <- Tabs Joined / Created / Achievements
        create/                <- Formulario de creacion de desafio
        settings/              <- Perfil + preferencias + notificaciones + danger zone
      about/                   <- Pagina publica About
      layout.tsx               <- Layout con providers
      page.tsx                 <- Landing page
    api/                       <- API routes (NO dentro de [locale])
      auth/                    <- nostr (NIP-98 HTTP Auth), session, signout
      challenges/              <- list+create, [id] CRUD, join, completions,
                                  checkpoints, award, reward, zap-goal-progress,
                                  pending-checkpoint-submissions, participants
      completions/[id]/verify  <- Creator approve/reject (no-checkpoints)
      checkpoint-completions/[id]/verify
      badges/[id]              <- Accept-on-Nostr (stamp accepted_at)
      profile/                 <- GET/PUT/DELETE + sync subroute
      my-badges/, my-challenges/
      notifications/, tags/popular/, zap/status/
    layout.tsx                 <- Root layout
  components/
    common/                    <- Bubble, Block, BlockTower, PixelIcon,
                                  PixelDissolve, Avatar, ImageUpload, etc.
    icons/                     <- SVG icons como React components
    landing/                   <- Hero, HowItWorks, About, Partners, Support, ZapModal
    layout/                    <- Navbar, Footer, ReSignInModal,
                                  SignerProviderClient, NotificationBell
    auth/                      <- ExtensionSignerButton, NostrConnectPanel,
                                  NsecSignerForm, SignerMethodButtons
    challenges/                <- ChallengeCard, CreateChallengeForm,
                                  CheckpointItem, FundPotModal, ZapGoalProgress, etc.
    about/                     <- Story, Projects, Team, LaCrypta, OpenSource
    onboarding/                <- OnboardingGate, WelcomeModal
    share/, ui/
  i18n/                        <- Configuracion next-intl
  lib/
    api/                       <- apiHandler wrapper, errores, rate-limit,
                                  verification-methods helper
    db/                        <- Drizzle ORM schema, conexion, checkpoints helper
    hooks/                     <- useScrollReveal, useFollowList,
                                  useZapGoalProgress, etc.
    nostr/                     <- events, verify, signers, fetch-events,
                                  verify-like, verify-hashtag-post, lnurl,
                                  blossom, nip46-login, relays, metadata
    schemas/                   <- Zod request/response schemas
    contexts/theme-context.tsx <- Theme provider (light/dark/system)
    auth.ts, auth-constants.ts <- Sesiones JWT + SESSION_COOKIE_NAME
    signer-context.tsx         <- Signer activo + completeLoginWithSigner
    types.ts                   <- Interfaces TypeScript compartidas
    lightning.ts, seo.ts, env.ts, notifications.ts, utils.ts
  messages/                    <- es.json, en.json
  styles/                      <- SCSS foundation
    _colors.scss               <- Color aliases + alpha() helper
    _theme.scss                <- Light/dark theme definitions
    _spacing.scss              <- Spacing scale + container
    _typography.scss           <- Font families, sizes, weights
    _common-mixins.scss        <- container, gradient-text, card-base, section-padding
    _media-mixins.scss         <- Responsive breakpoints
    globals.scss               <- Global resets, scroll reveal
  tests/
  docs/                        <- Design docs, Nostr event specs
  drizzle/                     <- Migrations
```

### Reglas de estructura

- **NO usar carpeta `src/`** - Todo en root
- **Componentes**: un directorio por componente con `index.tsx` + `nombre.module.scss`
- **Paginas**: usar route groups `(auth)`, `(app)` para organizar
- **API routes**: siempre en `app/api/`, nunca dentro de `[locale]`
- **Tipos**: centralizar en `lib/types.ts`

## Convenciones de codigo

### TypeScript
- Strict mode habilitado
- Usar `interface` para objetos, `type` para unions/intersections
- NO usar `any` - usar `unknown` con type guards
- Imports con alias `@/` (mapea a root)

### React
- `"use client"` solo cuando se necesite (hooks, eventos, browser APIs)
- Server Components por defecto
- Props interface antes del componente

### SCSS
- Usar SCSS modules (`.module.scss`) para cada componente
- Importar modulos de estilos con `@use`:
  ```scss
  @use "@/styles/colors" as *;
  @use "@/styles/spacing" as *;
  @use "@/styles/typography" as *;
  @use "@/styles/common-mixins" as *;
  @use "@/styles/media-mixins" as *;
  ```

#### Variables obligatorias (NO hardcodear valores)
- **Colores**: Siempre usar variables `$color-*` de `_colors.scss`
- **Transparencia**: Usar `alpha($color, amount)`
- **Spacing**: `$spacing-4` a `$spacing-100` (NO usar px sueltos)
- **Border radius**: `$border-radius-sm` a `$border-radius-full`
- **Font sizes**: `$font-size-xs` a `$font-size-hero`
- **Font weights**: `$font-weight-normal` a `$font-weight-extrabold`

#### Design System: NO Glassmorphism
- Cards solidas: usar el mixin `ceramic-card` de `_common-mixins.scss` para superficies elevadas. El mixin ya aplica `$color-surface`, `$color-border`, sombras suaves y `$border-radius-lg`, y las 26 modulos del proyecto lo consumen consistentemente. La guia anterior ("no card mixins") quedo obsoleta cuando el design system se consolido en torno a `ceramic-card`.
- Elementos decorativos: **Bubbles** (circulos flotantes) y **Blocks** (del loader BitByBit) — como componentes en `components/common/`
- Los Bubbles rompen la estructura de secciones y agregan movimiento organico
- Los Blocks representan progreso y la marca "bit by bit"
- Dark mode y light mode con paleta de colores limpia (purple, gold, green, red)

#### Responsive (mobile-first)
- `@include mobile`, `@include tablet`, `@include desktop`

### Paleta de colores
| Rol | Light | Dark |
|-----|-------|------|
| Background | White #FFFFFF | Navy #0F0F1A |
| Surface | Warm Gray #F7F7F8 | Dark Navy #1A1A2E |
| Primary (Purple) | #8B5CF6 | #A78BFA |
| Secondary (Gold) | #F7A825 | #F7A825 |
| Accent (Red) | #EF4444 | #F87171 |
| Accent Alt (Green) | #22C55E | #34D399 |

### Iconos
- Crear SVG icons como React components en `components/icons/index.tsx`
- Props estandar: `size`, `className`, `color`
- NO instalar librerias de iconos externas

### i18n
- Usar `useTranslations()` en client components
- Usar `getTranslations()` en server components
- Todas las strings visibles deben estar en `messages/es.json` y `messages/en.json`
- Espanol es el idioma por defecto

### Auth
- Nostr solamente: NIP-07 extension, NIP-46 bunker, o nsec pegado (signer en memoria)
- NIP-98 HTTP Auth (kind 27235). Evento firmado viaja en `Authorization: Nostr <base64(evento)>`; validacion en `lib/nostr/verify.ts:validateNip98AuthEvent`
- signer_type viaja dentro del evento firmado como tag custom `["arena_signer", ...]` — MITM no puede reescribirlo
- Replay window: ±30s sobre `created_at` (`CLOCK_SKEW_SECONDS` en `lib/nostr/verify.ts`); `u` tag matchea URL, `method` tag matchea POST
- Cookie de sesion: `__Host-session` en produccion (Secure + Path=/ + sin Domain, enforced por el browser), `session` en dev. Constante: `SESSION_COOKIE_NAME` en `lib/auth.ts`
- JWT con jose (HS256, 7 dias). `AUTH_SECRET` es REQUERIDO en produccion (el modulo tira al cargar si falta)
- Auto-create user on first Nostr login

### Base de datos
- Drizzle ORM con Neon DB
- Conexion lazy via `getDb()` en `lib/db/index.ts`
- Schema Drizzle en `lib/db/schema.ts` (source of truth)
- 8 tablas: users, challenges, challenge_checkpoints, participants, completions, checkpoint_completions, badges, notifications
- NO usar string interpolation en queries (SQL injection)

### Nostr NIPs usados
- **NIP-01**: Protocolo basico (estructura de eventos, relays)
- **NIP-02**: Follow list (kind 3) — usado para boost de creadores/participantes seguidos en Explore (`lib/hooks/useFollowList.ts`)
- **NIP-07**: Login con extension del browser (`window.nostr`)
- **NIP-19**: nsec/hex decoding para el signer local
- **NIP-25**: Reacciones (kind 7) — path de verificacion "nostr_action" (`lib/nostr/verify-like.ts`)
- **NIP-46**: Nostr Connect / Bunker para firma remota desde mobile (`lib/nostr/nip46-login.ts`)
- **NIP-57**: Zaps (kind 9734 zap request client-side, kind 9735 zap receipt leido desde relays). El payout a ganadores va por WebLN o QR con polling a `/api/zap/status`
- **NIP-58**: Badges — kind 30009 (definition), kind 8 (award), kind 30008 (profile badges con merge)
- **NIP-75**: Zap Goals (kind 9041) para funding del premio
- **NIP-92**: `imeta` tags en eventos de completion y badge cuando la imagen viene de Blossom
- **NIP-98**: HTTP Auth (kind 27235) para `POST /api/auth/nostr`. Binding por `u`/`method`/`created_at`
- **Blossom (BUD-01/BUD-02)**: content-addressed image uploads. Default server `NEXT_PUBLIC_BLOSSOM_SERVER` (fallback `https://blossom.primal.net`). Upload auth es un evento kind 24242 corto firmado por el signer activo.

## Modelo de datos clave

- **User**: identidad Nostr (pubkey), perfil sincronizado de relays
- **Challenge**: creado por un usuario, con reglas, duracion, tipo
- **Participant**: usuario que se unio a un desafio, con progreso y puntos
- **Completion**: prueba de completacion (foto, texto) con status de verificacion
- **Badge**: badge NIP-58 otorgado al completar un desafio
- **Notification**: notificaciones in-app

## Comandos

```bash
npm run dev          # Servidor de desarrollo
npm run build        # Build de produccion
npm run lint         # ESLint
npm test             # Correr tests (Vitest)
npm run test:watch   # Tests en modo watch
npm run test:coverage # Tests con cobertura
npx tsc --noEmit     # Type-check sin compilar
```

### Testing

- Unit y component tests corren bajo `jsdom` (default global en `vitest.config.ts`)
- Integration tests (`tests/integration/**`) deben declarar `@vitest-environment node` en un docblock al inicio del archivo. Razon: `@neondatabase/serverless` detecta `window` y tira un warning de "SQL from the browser" si corre bajo jsdom
- `tests/integration/setup.ts` centraliza la conexion a la DB de tests (`.env.test`) y expone `cleanDb()` y `testDb`

## Git workflow

- **Never push directly to `main`**. Always create a feature branch and open a PR.
- Branch naming: `fix/<description>` or `feat/<description>`
- Use `gh pr create` to open the PR with a clear title and description.
- Git author for commits: `Analia Acosta <analia.a.acosta@gmail.com>`

## Proyecto relacionado

- [bitbybit-habits](https://github.com/bitbybit-ar/bitbybit-habits): Habit tracker con Lightning rewards (Hackathon #1 FOUNDATIONS)
- Misma organizacion, mismo stack, mismas convenciones de codigo
- Dominio: https://bitbybit.com.ar

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"` to keep the graph current
