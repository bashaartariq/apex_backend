# Project Structure — Mobile Shop Management System

This document provides a detailed map and architectural rationale for the monorepo codebase supporting the multi-tenant Mobile Phone Shop Inventory Management and POS web application.

```text
mobileShop/
├── BE/                                  # Node.js + Express + TypeScript Backend
│   ├── data/
│   │   └── mobile_shop.sqlite           # SQLite database file (WAL mode, ignored in git)
│   ├── dist/                            # Compiled CommonJS outputs
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.ts              # SQLite connection (WAL, foreign_keys=ON, busy_timeout)
│   │   │   └── env.ts                   # Environment variable parsing and Zod validation
│   │   ├── controllers/
│   │   │   ├── auth.controller.ts       # Registration, login, logout, me, refresh token rotation
│   │   │   ├── permissions.controller.ts# 20-permission system catalog controller
│   │   │   ├── shop.controller.ts       # Tenant shop profile & isolation controller
│   │   │   ├── system.controller.ts     # Health and version endpoint controllers
│   │   │   └── users.controller.ts      # Multi-tenant user management & permission assignment
│   │   ├── database/
│   │   │   ├── migrations/
│   │   │   │   ├── 001_init_infrastructure.ts # Metadata schema migration
│   │   │   │   └── 002_auth_and_multi_tenancy.ts # Shops, users, permissions, refresh_tokens
│   │   │   ├── seeds/
│   │   │   │   ├── 001_system_metadata.ts     # Baseline system & tenancy metadata seed
│   │   │   │   └── 002_permissions.ts        # 20 standard module permissions + demo tenants
│   │   │   ├── migrate.ts               # Migration runner with transaction support
│   │   │   ├── query.ts                 # Safe parameterized queries & immediate transactions
│   │   │   └── seed.ts                  # Seed runner
│   │   ├── middleware/
│   │   │   ├── auth.ts                  # JWT verification & DB session resolution
│   │   │   ├── authorize.ts             # Role-based & granular permission authorization
│   │   │   ├── errorHandler.ts          # Centralized error handler + custom AppError
│   │   │   ├── notFoundHandler.ts       # 404 handler for unmatched routes
│   │   │   ├── rateLimiter.ts           # In-memory sliding window auth rate limiter
│   │   │   ├── tenantContext.ts         # Multi-tenant context extraction
│   │   │   └── validateRequest.ts       # Zod-based request validation middleware
│   │   ├── routes/
│   │   │   ├── auth.routes.ts           # /api/auth (register, login, logout, me, refresh)
│   │   │   ├── health.routes.ts         # GET /api/health
│   │   │   ├── permissions.routes.ts    # GET /api/permissions
│   │   │   ├── shop.routes.ts           # GET/PUT /api/shop/profile
│   │   │   ├── users.routes.ts          # CRUD /api/users & /api/users/:id/permissions
│   │   │   ├── version.routes.ts        # GET /api/version
│   │   │   └── index.ts                 # Root /api router
│   │   ├── services/
│   │   │   └── system.service.ts        # Health check and version aggregation logic
│   │   ├── tests/
│   │   │   └── auth-tenancy.test.ts     # 18 automated integration tests for tenancy & auth
│   │   ├── utils/
│   │   │   ├── asyncHandler.ts          # Express async route wrapper
│   │   │   ├── logger.ts                # Structured JSON/console logger
│   │   │   ├── password.ts              # Bcrypt hashing & strength validation
│   │   │   └── tokens.ts                # JWT access & refresh token SHA-256 rotation
│   │   ├── app.ts                       # Express application assembly & middleware pipeline
│   │   └── server.ts                    # Server bootstrap & graceful shutdown hooks
│   ├── .env                             # Local backend environment overrides
│   ├── .env.example                     # Backend environment template
│   ├── package.json                     # Backend dependencies and scripts
│   └── tsconfig.json                    # Backend TypeScript configuration
│
├── FE/app/                              # Angular 14 Frontend Application
│   ├── src/
│   │   ├── app/
│   │   │   ├── core/                    # Singleton services, interceptors, guards, models
│   │   │   │   ├── guards/
│   │   │   │   │   ├── admin.guard.ts   # Guard restricting route to SHOP_ADMIN
│   │   │   │   │   ├── auth.guard.ts    # Guard restricting route to signed-in users
│   │   │   │   │   └── guest.guard.ts   # Redirects authenticated users from /login
│   │   │   │   ├── interceptors/
│   │   │   │   │   └── api-request.interceptor.ts # HttpOnly credentials, Bearer, 401 handling
│   │   │   │   ├── models/
│   │   │   │   │   ├── api.models.ts    # TypeScript response & error interfaces
│   │   │   │   │   ├── auth.models.ts   # User, Shop, Credentials, Staff interfaces
│   │   │   │   │   └── inventory.models.ts # Hardware and POS mock types
│   │   │   │   ├── services/
│   │   │   │   │   ├── api.service.ts   # Reusable HttpClient wrapper
│   │   │   │   │   ├── app-title.strategy.ts # Dynamic accessibility page title updater
│   │   │   │   │   ├── auth.service.ts  # Reactive session, login, register, logout
│   │   │   │   │   ├── shop.service.ts  # Tenant profile retrieval and update
│   │   │   │   │   ├── system-status.service.ts # Connectivity health state monitor
│   │   │   │   │   ├── tenant-context.service.ts # Active shop_id reactive state
│   │   │   │   │   ├── toast.service.ts # Global toast notification manager
│   │   │   │   │   └── user-management.service.ts # Staff CRUD & permission assignments
│   │   │   │   └── core.module.ts       # Core module with guard against multiple imports
│   │   │   ├── features/
│   │   │   │   ├── auth/                # Sign In & Multi-Tenant Shop Registration
│   │   │   │   │   ├── login/           # Login card with instant demo switchers
│   │   │   │   │   └── register/        # Full tenant onboarding form
│   │   │   │   ├── settings/            # Store profile & Tenant ID configuration
│   │   │   │   ├── users/               # Staff directory & granular permissions modal
│   │   │   │   ├── dashboard/           # Role-aware executive overview
│   │   │   │   ├── pos/                 # POS terminal UI
│   │   │   │   ├── inventory/           # Hardware inventory UI
│   │   │   │   ├── customers/           # Customer directory UI
│   │   │   │   ├── operations/          # Returns & warranty UI
│   │   │   │   ├── reports/             # Analytics UI
│   │   │   │   └── foundation/          # Live API & Database health monitor
│   │   │   ├── shared/                  # Reusable UI components & pipes
│   │   │   │   ├── components/
│   │   │   │   │   ├── header/          # Responsive header with tenant & user menu
│   │   │   │   │   ├── sidebar/         # Dynamic sidebar filtered by permissions
│   │   │   │   │   ├── status-badge/    # Semantic connectivity indicator pill
│   │   │   │   │   ├── toast/           # Toast notification host
│   │   │   │   │   ├── confirm-dialog/  # Modal confirmation dialog
│   │   │   │   │   └── device-detail-drawer/ # Slide-over device details drawer
│   │   │   │   └── shared.module.ts     # Exports CommonModule, forms, and shared components
│   │   │   ├── app-routing.module.ts    # Application routing definitions
│   │   │   ├── app.component.html       # Shell layout with landmarks & skip link
│   │   │   ├── app.component.scss       # Shell layout styles
│   │   │   ├── app.component.ts         # Shell state and mobile sidebar toggle
│   │   │   └── app.module.ts            # Root application bootstrap module
│   │   ├── environments/
│   │   │   ├── environment.prod.ts      # Production environment configuration
│   │   │   └── environment.ts           # Development environment configuration
│   │   ├── index.html                   # HTML5 doctype, viewport, and title
│   │   ├── main.ts                      # Angular platform bootstrap
│   │   ├── polyfills.ts                 # Standard browser polyfills
│   │   └── styles.scss                  # Global CSS, variables, and WCAG focus states
│   ├── angular.json                     # Angular build and asset configuration
│   ├── package.json                     # Frontend dependencies and scripts
│   ├── proxy.conf.json                  # Dev-server proxy mapping /api to backend
│   └── tsconfig.json                    # Frontend TypeScript configuration
│
├── docs/
│   └── project-structure.md             # This document
├── .env.example                         # Root environment template
├── .gitignore                           # Git ignore rules for node_modules, DBs, logs
├── package.json                         # Monorepo root convenience scripts
└── README.md                            # Complete setup, verification, and run guide
```

---

## Architectural Rationale

### 1. Multi-Tenant Segregation
- **Model:** Shared database with discriminator column (`shop_id`).
- **Enforcement:** All future business entities (inventory, sales, customers, receipts) reference a valid `shop_id`.
- **Backend Guard:** `attachTenantContext` middleware checks incoming `X-Shop-Id` request headers; future auth tokens will bind tenant permissions authoritatively.
- **Frontend Interceptor:** `ApiRequestInterceptor` automatically appends `X-Shop-Id` to all outgoing requests from `TenantContextService`.

### 2. Database Integrity & Performance
- **SQLite Engine:** `better-sqlite3` is chosen for synchronous Node.js bindings, zero latency overhead, and robust transaction mechanics.
- **Pragmas:**
  - `journal_mode = WAL`: Allows concurrent readers without blocking writes.
  - `foreign_keys = ON`: Strict foreign key validation prevents orphaned records.
  - `busy_timeout = 5000`: Eliminates SQLite database locking timeouts.
- **Migration & Seed Engine:** Transactional migration and seed system records execution history in `_migrations` and `_seeds`.

### 3. Frontend Accessibility & UX
- **WCAG 2.2 Level AA Standard:** High-contrast focus rings (`:focus-visible`), skip-to-content bypass link, standard landmark semantics (`<header>`, `<nav>`, `<aside>`, `<main>`), and responsive layout that accommodates 320px mobile screens to large desktop monitors.
