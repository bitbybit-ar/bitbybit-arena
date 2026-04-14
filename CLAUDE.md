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
- **Auth**: Nostr solamente (NIP-07 browser extension, NIP-42 challenge-response)
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
      (app)/                   <- App principal (2 tabs)
        explore/               <- Explorar + crear desafios
        my-challenges/         <- Desafios del usuario
      layout.tsx               <- Layout con providers
      page.tsx                 <- Landing page
    api/                       <- API routes (NO dentro de [locale])
      auth/                    <- Nostr auth (challenge-response)
    layout.tsx                 <- Root layout
  components/
    common/                    <- Bubble, Block, BlockTower (design system)
    icons/                     <- SVG icons como React components
    landing/                   <- Hero, HowItWorks, About, Partners, Support
    layout/                    <- Navbar, Footer, NostrLoginModal
  i18n/                        <- Configuracion next-intl
  lib/
    api/                       <- apiHandler wrapper, errores
    db/                        <- Drizzle ORM schema y conexion
    hooks/                     <- useNostr, useScrollReveal
    nostr/                     <- types, verify, relays, metadata
    auth.ts                    <- Sesiones JWT
    types.ts                   <- Interfaces TypeScript compartidas
    theme-context.tsx          <- Theme provider (light/dark)
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
- Cards solidas: usar inline styles con `$color-surface`, `$color-border`, `$border-radius-lg` (no card mixins)
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
- Nostr solamente (NIP-07 extension)
- NIP-42 challenge-response flow
- Sesion via cookie httpOnly (`session`)
- JWT con jose (HS256, 7 dias)
- Auto-create user on first Nostr login

### Base de datos
- Drizzle ORM con Neon DB
- Conexion lazy via `getDb()` en `lib/db/index.ts`
- Schema Drizzle en `lib/db/schema.ts` (source of truth)
- 6 tablas: users, challenges, participants, completions, badges, notifications
- NO usar string interpolation en queries (SQL injection)

### Nostr NIPs usados
- **NIP-01**: Protocolo basico
- **NIP-07**: Login con extension del browser
- **NIP-42**: Challenge-response auth
- **NIP-57**: Zaps (client-side zap requests, read zap receipts from relays)
- **NIP-58**: Badges (logros por completar desafios)
- **NIP-75**: Zap Goals (funding de premio para desafios)
- **Blossom (BUD-01/BUD-02)**: content-addressed image uploads for completion photos and badge images. Default server is `NEXT_PUBLIC_BLOSSOM_SERVER` (fallback `https://blossom.primal.net`). Upload auth is a short-lived kind 24242 event signed by the active signer.

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
